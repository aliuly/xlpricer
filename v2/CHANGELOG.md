# Versions

- 2.0.1 (WIP):
  - Price Finder reworked into a static, VBA-free filter sheet (works
    in both xlsx and xlsm; needs Excel 2021/365): cascading dropdowns
    for productFamily, region, productId, osUnit, storageType,
    serviceType and description (the description list is scoped to all
    the other criteria), plus vCpu/RAM min/max boxes where the max
    mirrors the min (= exact match unless overridden).  Results show
    Description (BOM-style formatting), Region, vCpu, RAM,
    priceAmount, unit and R12/R24/R36.  One shared FILTER/SORTBY
    resolves the matches into a row-index column that the visible
    columns INDEX into.  Blank and "(all)" dropdown values are
    equivalent.
  - Workbook mode (new Conversion tab in the SPA): upload a workbook
    and inspect it (XLPricer detection, macros, trimmed/_Frozen
    state) plus a staleness check against the live pipeline.
    Operations: Convert (XLSX ↔ XLSM via the macro template),
    Update/Force repricing (rebuilds Prices/Volumes/Finder from the
    pipeline; trimmed workbooks revive their frozen formulas), and
    Trim (the offline TrimWB equivalent).  The Custom pricing
    checkbox gates the Includes tab; repricing always applies the
    standard include payload (same as Basic mode).
  - Staleness framework: the T sheet records the pricing source
    (schema, pricing data date, params, includes, patches); the
    comparison is pipeline-only — custom-pricing includes never flag
    a workbook stale.  Shared by the CLI (--check-only) and the SPA
    upload check.
  - Offline Trim: freezes every formula referencing Prices to its
    cached result, records LiveRef/OriginalAddress/FormulaText in a
    veryHidden _Frozen sheet so a later refresh can revive them,
    drops the PriceList* names/validations and deletes the pricing
    and macro sheets.  Two-pass snapshot freeze (safe for Excel's
    shared formulas) and the Finder/BOM-template sheets are skipped
    (the slow part in the VBA version).
  - Fixed: trimming an Excel-saved workbook crashed on shared
    formulas (a master was frozen before its slaves were read); the
    upload staleness check flipped with the Custom pricing checkbox;
    repricing without Custom pricing dropped the standard includes;
    dropdown blank values now equal "(all)".
  - VBA: TrimWB one-pass freeze scan (accurate counter) and
    status-bar progress feedback; measurement and batching phases
    still open (docs/TODO-vba2.md).
  - Generator: format options (XLSX/XLSM, ESA toggle) plus a Custom
    pricing checkbox shared by Basic/Custom/Conversion (on: the
    Includes-tab configuration; off: the default standard includes),
    consolidated generator UI, build info recorded in generated
    projects, naming conventions refresh, preload tweaks.
  - Tests: 111 tests — unit, generator-layout snapshots, CLI smoke,
    and LibreOffice headless recalc integration (BOM lookups, Finder
    arrays, trim/refresh chains).
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
