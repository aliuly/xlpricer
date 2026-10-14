# TODO → DONE: v1 → v2 workbook conversion (`--from-v1`)

**Status:** implemented 2026-10.  The CLI gains a `--from-v1 <file>`
mode that reads a legacy v1 workbook and regenerates it in the v2
format from the live pricing pipeline; `--check` previews the
conversion without fetching.  `make v1 FILE=…` wraps the common case.

## Goal

v1 xlpricer workbooks (built by the v1 wizard: Overview,
deal-summary tabs, Components, Prices, Volumes, ESA, Assumptions) have
no Finder, no T sheet and v1-era BOM formulas.  The v2 refresh
machinery refuses them (no T provenance marker), and the v1 BOM data
is user-owned and must not be lost.  So the conversion **extracts the
user-owned BOM data and regenerates everything else** — it is not an
in-place formula migration.

## Design

### Compatibility gate (`checkV1Workbook`)

- `Overview` must exist, else `kind: not-v1`.
- `Assumptions` must be v1-shaped: a header row with
  `C = Assumption` / `D = Value` **and** a `Format version` row whose
  value starts `1.`.  A `2.x` value → `kind: v2-file` ("use --update").
  (v2 keeps Format version on the T sheet, so this cleanly tells the
  generations apart.)

### Components tabs (`findBomTabs`)

The tabs the **Overview formulas** reference, minus the known
generated tabs (`Overview/Prices/Volumes/Assumptions/ESA/Tools/T/
Finder/_Frozen/_BOMTemplate`).  Sheets that are neither referenced nor
generated (the v1 deal-summary tab) are **dropped** and recorded in
the new Assumptions sheet under a `Dropped tabs` header.

### Column extraction (`extractV1Components`)

Columns located by their DV-protected header text: `Qty`, `Function`,
`Cloud Desc`/`Description`, `Storage (GiB)`, `H/R`, `Group`.

- **Group rows** (Qty cell = non-numeric label) → v2 section rows with
  `qty` = Group key, `function` = Qty label.
- **Data rows** copy qty/function/description/storage; `H/R` is copied
  only when a **literal** (v1 default formulas are left blank so v2
  recomputes its own default from current prices).
- **Total rows** and empty template rows are skipped (v2 regenerates
  totals — and re-inserts one after every group, which the row
  remapper accounts for).

### Formula policy (qty/storage cells)

- Other-sheet references (e.g. `Assumptions!$D$36`) → freeze to the
  cached value.
- Unknown defined names (anything but `GB_TO_GiB`/`GiB_TO_GB`/
  `T_ONE_TIME`/`PriceList*`) → freeze.
- Local-only formulas are **kept**, remapped through the v1→v2 column
  map (header-text driven) and the v1-row → v2-row map; unmappable
  references freeze to the cached value.  The standard layouts are
  letter-for-letter identical (B/C/D/F/G/I, data from row 6), so e.g.
  `=B89+B90` passes through as `=B88+B89` when a spacer row was
  skipped upstream.

### Assumptions

Base assumptions CSV (default `public/assumptions.csv`) plus:

- the v1 Assumptions sheet's **trailing plain-text rows** (after the
  last valued row), and
- the **`Dropped tabs`** section (header + tab names)

both written as a new `note` row type that renders as plain text in
column C (`genAssSheet`; header styling stays on column B sections).

### Manual-review caveat

Every conversion carries a prominent caveat — in the CLI summary JSON
(`caveat`), the `--check` preview, and as a highlighted warning box in
the SPA (shown from the inspection preview onwards):

> Item descriptions may have changed between v1 and v2 and need manual
> review: the pricing pipeline renames products between builds, so some
> components may no longer match the current price list. Check the
> converted Components tab and adjust the affected descriptions.

### Warnings

Per-row `Region`/`EVS Class`/`Backup?`/`Persist?`/`Backup Factor`
overrides are deliberately not converted (v2 uses the assumption
defaults) — the summary reports how many rows carried them.

### Includes

The conversion never replays the v1 file's recorded includes (its
Assumptions "Include files" section — a historical snapshot already
baked into its Prices sheet).  Both the CLI and the SPA use the
**current** include configuration instead:

- CLI: whatever include CSVs are passed positionally.
- SPA: the shared Custom-pricing rule — the user's Includes tab when
  enabled, else the standard includes.

The v1's recorded includes are surfaced as a warning (and in the
`--check` preview / SPA inspection preview): "v1 workbook was built
with includes: dctemp (2026-08-31), … — using the current include
configuration instead".

## CLI

```
npx tsx src/xlsx/cli.ts <url> [include.csv ...] --from-v1 <file.xlsx> [options]
npx tsx src/xlsx/cli.ts --from-v1 <file.xlsx> --check        # dry-run, no network
```

- `--from-v1` conflicts with `--update`, `--to-*`, `--trim`,
  `--components`, `--force`/`--check-only`.
- Output defaults to `<input-base>-v2.xlsx` (`.xlsm` with `--xlsm`).
- `make v1 FILE=<v1-workbook>.xlsx` (variables as for `make xlsx`).
- Errors exit 2 with `kind` (`not-v1`, `v2-file`, `no-components`).

## SPA (Conversion mode)

- The workbook worker detects v1 files during inspection
  (`extractV1Workbook`; the gate runs only when the v2 T-sheet marker
  is absent) and returns the extraction preview — tabs/rows, notes,
  dropped tabs, recorded includes, warnings.
- The UI shows "legacy v1 workbook · N Components tabs · …" and a
  **Convert to v2** radio (defaults to XLSX; XLSM needs the VBA
  template URL).  Convert/Trim/Refresh are disabled for v1 files.
- The op runs the shared `convertV1Workbook()` with the SPA's
  pricing URL, include payload (Custom pricing rule) and the
  assumptions tab rows; the download is suffixed `-v2`.
- Gate failures (missing Overview, non-v1 Assumptions, v2-format
  input) surface the gate's reason in the error message.
- `convertV1Workbook()` is the shared seam: pure (no fetch/fs), takes
  `file` bytes + fetched `pricingData` + base assumptions (+ optional
  vba template bytes) and returns the buffer + summary — called by
  both the worker and the CLI.

## Verification

- Unit tests build a synthetic v1 workbook (gate matrix, extraction
  rules, formula policy, notes/dropped-tabs).
- CLI smoke tests run the real CLI against a local fixture server
  (`--check`, full conversion, error kinds).
- Real-file check: `TCP_1002088993_Thanos_1of1_28Sep26.xlsx` converts
  with 81 BOM rows, 9 notes, 1 dropped tab; a LibreOffice recalc of
  the v2 output shows 0 `#REF!`/error cells, the kept `=B88+B89`
  formula evaluates, and the Components Monthly Total is ~20,197
  (vs the v1 file's 20,208 — the delta is the current live pricing
  vs the v1 build's snapshot).
