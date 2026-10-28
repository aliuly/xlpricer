# XLpricer V2

**T-Cloud Public pricing spreadsheet generator**

A TypeScript/React single-page application that fetches cloud service pricing
data, processes it through a normalisation pipeline, and generates a
ready-to-use Excel workbook with multi-year cost projections, volume-based
discounts, and Enterprise Support Agreement (ESA) calculations.

## Features

- **Browser UI** — Edit assumptions and bill-of-materials components in
  interactive tabulator-based tables, then export to XLSX or macro-enabled
  XLSM.
- **Includes management** — Toggle standard pricing data includes and upload
  additional CSV files via drag-and-drop, with metadata from manifest files.
- **CLI pipeline** — Fetch, normalize, and enrich pricing data from the
  command line (`npx tsx src/prices/cli.ts`).
- **XLSX generation** — Produce a formatted workbook with Overview, Components
  (BOM), Prices, Volumes, Finder, Assumptions, ESA, and metadata sheets.
- **Price Finder** — Generated workbooks include a static, VBA-free Finder
  sheet: cascading dropdowns plus vCpu/RAM min/max filters search the full
  price list (needs Excel 2021/365).
- **Workbook mode** — Upload an existing workbook to inspect it (XLPricer
  detection, macros, trimmed/_Frozen state) and check staleness against the
  live pipeline. Convert (XLSX ↔ XLSM), update/force-reprice, or trim it
  into a compact macro-free file — trimmed workbooks can be rebuilt by
  re-uploading and force-repricing.  Dropping a legacy v1 workbook
  offers **Convert to v2**, which extracts the Components tabs and
  rebuilds the file in the v2 format.
- **Enterprise Support Agreement** — Built-in ESA cost model with fixed fees,
  optional service components, and tiered uplift bands.
- **Multi-year projections** — Inflation-adjusted forward pricing with
  support for reserved-instance terms (12/24/36 months).
- **Volume-based discounts** — Automatic tiered pricing for object storage,
  outbound traffic, and other volume-sensitive services.
- **Dark mode** — Light/dark theme support via CSS custom properties and
  localStorage persistence.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React SPA)                                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Home     │  │ Assumpt. │  │ Components (BOM)  │  │
│  │          │  │ editor   │  │ editor(s)         │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │             │                │              │
│       └─────────────┴────────────────┘              │
│                     │                               │
│              ┌──────▼──────┐                        │
│              │ XLSX Worker │  (Web Worker)          │
│              │  exceljs    │                        │
│              └─────────────┘                        │
└────────────────────┬────────────────────────────────┘
                     │ fetch pricing JSON
              ┌──────▼──────┐
              │ Pipeline    │  (aliuly/pipeline)
              │ prices.json │
              └─────────────┘
```

## Project Structure

```
src/
├── main.tsx                  # React entry point
├── mainApp/                  # App shell, mode selector, Basic view
├── homeTab/                  # Home screen and XLSX web worker
├── editorTab/                # Assumptions, Components, & Includes table editors
├── defaultTab/               # Fallback tab
├── themes/                   # Theme provider and CSS variable defs
├── prices/                   # Pricing data pipeline
│   ├── index.ts              # Pipeline orchestrator
│   ├── cli.ts                # CLI entry point
│   ├── normalize.ts          # Data type normalization
│   ├── enrich.ts             # Data enrichment
│   ├── patching.ts           # Patch/fix logic
│   └── types.ts              # Shared type definitions
└── xlsx/                     # XLSX workbook generator
    ├── cli.ts                # CLI entry point
    ├── writer.ts             # Workbook orchestrator
    ├── meta.ts               # Metadata sheet ("T")
    ├── params.ts             # Assumptions sheet
    ├── prices.ts             # Prices sheet
    ├── bom.ts                # Components/BOM sheets
    ├── vol.ts                # Volumes sheet
    ├── overview.ts           # Overview sheet
    ├── esa.ts                # ESA sheet
    ├── xlu.ts                # Excel utilities
    ├── formats.ts            # Cell formatting / styles
    └── constants.ts          # Shared constants & URLs
```

## Quick Start

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm >= 9

### Install & Run

All commands run from the `v2/` directory:

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
# -> http://localhost:5173

# Lint
npm run lint

# Build for production
npm run build -- --base=./
# (--base=./ is required when serving from the GitHub Pages /v2/ subpath)

# Preview production build
npm run preview
```

### CLI Usage

**Run the pricing pipeline** (fetch, normalize, enrich, patch pricing data):

```bash
npx tsx src/prices/cli.ts https://aliuly.github.io/pipeline/prices-latest.json \
  public/includes/included.csv public/includes/oracle.csv \
  -o out.json --verbose
```

**Generate an XLSX workbook** from the CLI:

```bash
npx tsx src/xlsx/cli.ts https://aliuly.github.io/pipeline/prices-latest.json \
  public/includes/included.csv public/includes/oracle.csv \
  -o pricing.xlsx \
  --assumptions public/assumptions.csv \
  --components "Components=public/preload.csv" \
  --verbose
```

**Generate a macro-enabled XLSM workbook** — the generated content is merged
into the VBA host workbook (built from `vba/handlers.vba` and `vba/ui.vba`):

```bash
npx tsx src/xlsx/cli.ts https://aliuly.github.io/pipeline/prices-latest.json \
  public/includes/included.csv public/includes/oracle.csv \
  -o pricing.xlsm \
  --xlsm public/vba/template.xlsm \
  --assumptions public/assumptions.csv \
  --components "Components=public/preload.csv" \
  --verbose
```

Or use the Makefile (from the `v2/` directory, or `make -C v2` from the repo root):

```bash
make pipeline       # run pricing pipeline -> out.json
make xlsx           # generate XLSX -> pricing.xlsx
make vba            # build the VBA host workbook -> public/vba/template.xlsm
make xlsm           # generate macro-enabled XLSM -> pricing.xlsm
```

## Configuration

The browser app reads `public/config.json` on startup:

| Key | Description |
|-----|-------------|
| `tabs` | Ordered list of tab IDs: `"home"`, `"includes"`, `"assumptions"`, `"components"` |
| `home.pricesUrl` | URL to fetch pricing JSON from |
| `includes.files` | Array of standard include CSV file URLs (shown in the Includes tab) |
| `assumptions.dataUrl` | CSV file for preloaded assumptions |
| `components.dataUrl` | CSV file for preloaded components |

### App Modes

The UI supports three modes, persisted in `localStorage` (`xlpricer-mode`):

- **Basic** — One-click workbook generation from server-side data. Loads
  assumptions and components directly from configured CSV URLs.
- **Custom** — Tabbed editor for assumptions, components, includes, and
  workbook export. The Includes tab lets you toggle standard pricing data
  includes and upload additional CSV files via drag-and-drop.
- **Conversion** — Upload an existing workbook to inspect it (XLPricer
  detection, macros, trimmed/_Frozen state) and check staleness against the
  live pipeline. Operations: convert (XLSX ↔ XLSM via the macro template),
  update/force reprice (rebuilds Prices/Volumes/Finder from the pipeline;
  trimmed workbooks revive their frozen formulas), and trim (the offline
  TrimWB equivalent).  Legacy v1 workbooks are detected too and offer
  **Convert to v2**: Components tabs are extracted and regenerated in
  the v2 format, with tiered group-level descriptions adapted to the
  current price list.

The generator offers format options (XLSX/XLSM and an ESA toggle) plus a
Custom pricing checkbox shared by all modes: on uses your Includes-tab
configuration, off uses the default standard includes. Generated files are
named from deal info.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 |
| Build tool | Vite 8 |
| Language | TypeScript 6 |
| CSS framework | UnoCSS |
| Table component | Tabulator Tables 6 |
| Excel generation | ExcelJS 4 |
| CSV parsing | PapaParse 5 |
| Linting | oxlint |

## Generated Spreadsheet Tabs

| Tab | Description |
|-----|-------------|
| **Overview** | Multi-year cost summary with per-group subtotals, a Reserve% column showing reserved-term share, inflation projections, hyperlinks to documentation, and optional ESA section |
| **Components** | Bill of materials — quantities, service descriptions, storage, hours, region, and pricing model overrides |
| **Volumes** | Tiered/volume-based pricing adjustments for services like OBS and outbound traffic |
| **Prices** | Normalized price list with data validation for lookup in Components |
| **Finder** | Search the price list via cascading dropdowns and vCpu/RAM min/max filters. Static and VBA-free — works in both XLSX and XLSM (needs Excel 2021/365) |
| **Assumptions** | Default values for hours, region, EVS class, backup settings, and storage utilisation |
| **ESA** | Enterprise Support Agreement model (base fee, optional extras, tiered uplift) |
| **T** | Metadata — version, generation timestamp, data sources |

## Related Repositories

- **[aliuly/pipeline](https://github.com/aliuly/pipeline)** — Backend service that queries the T-Cloud Public pricing API, caches results, and serves the `prices-latest.json` used by XLPricer.
- **[Open Telekom Cloud Price Calculator API](https://docs.otc.t-systems.com/price-calculator/api-ref/)** — Upstream pricing API documentation.

## License

See [LICENSE](../LICENSE)

