# XLpricer V2

**T-Cloud Public pricing spreadsheet generator**

A TypeScript/React single-page application that fetches cloud service pricing
data, processes it through a normalisation pipeline, and generates a
ready-to-use Excel workbook with multi-year cost projections, volume-based
discounts, and Enterprise Support Agreement (ESA) calculations.

## Features

- **Browser UI** — Edit assumptions and bill-of-materials components in
  interactive tabulator-based tables, then export to XLSX.
- **Includes management** — Toggle standard pricing data includes and upload
  additional CSV files via drag-and-drop, with metadata from manifest files.
- **CLI pipeline** — Fetch, normalize, and enrich pricing data from the
  command line (`npx tsx src/prices/cli.ts`).
- **XLSX generation** — Produce a formatted workbook with Overview, Components
  (BOM), Prices, Volumes, Assumptions, ESA, and metadata sheets.
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

- Node.js >= 18
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
  includes/included.csv includes/oracle.csv \
  -o out.json --verbose
```

**Generate an XLSX workbook** from the CLI:

```bash
npx tsx src/xlsx/cli.ts https://aliuly.github.io/pipeline/prices-latest.json \
  includes/included.csv includes/oracle.csv \
  -o pricing.xlsx \
  --assumptions public/assumptions.csv \
  --components "Components=public/preload.csv" \
  --verbose
```

Or use the Makefile (from the `v2/` directory, or `make -C v2` from the repo root):

```bash
make pipeline       # run pricing pipeline -> out.json
make xlsx           # generate XLSX -> pricing.xlsx
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

The UI supports two modes, persisted in `localStorage`:

- **Basic** — One-click XLSX generation from server-side data. Loads
  assumptions and components directly from configured CSV URLs.
- **Custom** — Tabbed editor for assumptions, components, includes, and
  XLSX export. The Includes tab lets you toggle standard pricing data
  includes and upload additional CSV files via drag-and-drop.

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
| **Overview** | Multi-year cost summary with per-group subtotals, inflation projections, hyperlinks to documentation, and optional ESA section |
| **Components** | Bill of materials — quantities, service descriptions, storage, hours, region, and pricing model overrides |
| **Volumes** | Tiered/volume-based pricing adjustments for services like OBS and outbound traffic |
| **Prices** | Normalized price list with data validation for lookup in Components |
| **Assumptions** | Default values for hours, region, EVS class, backup settings, and storage utilisation |
| **ESA** | Enterprise Support Agreement model (base fee, optional extras, tiered uplift) |
| **T** | Metadata — version, generation timestamp, data sources |

## Related Repositories

- **[aliuly/pipeline](https://github.com/aliuly/pipeline)** — Backend service that queries the T-Cloud Public pricing API, caches results, and serves the `prices-latest.json` used by XLPricer.
- **[Open Telekom Cloud Price Calculator API](https://docs.otc.t-systems.com/price-calculator/api-ref/)** — Upstream pricing API documentation.

## License

See [LICENSE](../LICENSE)

