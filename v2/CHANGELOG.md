# Versions

- 2.1:
  - Hypercompare export macro
  - Price Finder: new "Monthly" results column — hourly-billed rows
    (unit starting with "h") are scaled by the FT_HOURS assumption so
    every result is a full-time monthly price, comparable with the
    R12/R24/R36 columns.
  - v1 → v2 workbook conversion: `--from-v1 <file>` (and `--check`)
    extracts the user-owned Components tabs from a legacy workbook and
    regenerates it in the v2 format; `make v1 FILE=…`.  The SPA
    Conversion mode detects dropped v1 files and offers a
    "Convert to v2" operation with the same extraction rules.
  - v1 → v2 conversion: tiered group-level component descriptions
    automatically gain the price list's unit suffix (e.g. `Network:
    Internet Traffic Outbound` → `… (GiB)`) so they keep matching the
    v2 price list; tariff-level rows with `[Tn]` are preserved as-is.
  - Added data patching (fixes duplicates)
  - Duplicate checking functionality.
  - DDSOG backup enriching.
  - Add Components macro: the new tab's Volumes column now derives the
    pattern tab's name from its formulas, so adding tabs keeps working
    after a Components tab has been renamed.
- 2.0.1:
  - New Price Finder tab: search the price list with cascading
    dropdowns and vCpu/RAM min/max boxes; results show Description,
    Region, vCpu, RAM, priceAmount, unit and R12/R24/R36.
  - New Conversion mode in the SPA: upload a workbook to convert
    (XLSX ↔ XLSM), update or force-reprice it against the live
    pricing pipeline, or trim it into a compact macro-free file —
    trimmed workbooks can be rebuilt by re-uploading and
    force-repricing.
  - Generator: Custom pricing checkbox shared by Basic/Custom/
    Conversion (on: your Includes-tab configuration; off: the
    default standard includes), plus consolidated options and
    deal-info based file naming.
  - Assumption/component editors: Enter or Tab on the last row
    appends a new empty row.
  - Fixes: various miscellaneous fixes.
- 2.0.0: Rewrite to TypeScript
  - refactor application into Single Page App.
  - spin off REST API query and caching to another project:
    https://github.com/aliuly/pipeline
  - Apply naming convention rules
  - Reorganised repository: the SPA now lives in `v2/` and the GitHub Pages
    root serves a version picker linking to the current app (`/v2/`) and the
    legacy v1 wizard (`/v1/`).
  - Folded the v1 weekly price sheet build into the deploy workflow; the
    download page, build history, and docs are published under `/v1/`.
  - Added the possiblity to create XLSM files (with helpful macros)
  - Added a Price Finder to help find/compare suitable products
