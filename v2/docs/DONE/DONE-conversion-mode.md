# TODO: Conversion mode (upload · convert · refresh · trim)

**Status:** implemented 2026-09-17.  New `workbookTab` worker/hook/UI,
shared `loadPricing.ts`, Conversion mode + top-level tabs + custom
pricing in App/ModeSelector, upload compatibility/size checks, and
convert/trim/refresh orchestration.  `npm run build` / `npm run lint`
/ `npm run test:run` clean (92 tests); worker smoke exercised
inspect + xlsx→xlsm + forced refresh.  Remaining manual items: the
in-browser checks in the checklist.

Supersedes the last bullet of `docs/TODO-spa.md` (*reprice UI and
xlsx/lsxm conversion*): those operations get a first-class SPA mode
instead of living inside the generate flow.

## Goal

Add a third mode next to **Basic** and **Custom**, named
**Conversion**.  The mode has **two tabs**, always visible in the
top-level tab bar:

1. **Workbook** — upload an `.xlsx`/`.xlsm`, then:
   - convert between XLSX and XLSM,
   - update the pricing tables (refresh/reprice) from the latest
     pipeline data,
   - **or** trim the workbook (freeze prices, drop pricing sheets),
   - rebuild a **trimmed** workbook into a full one,
2. **Includes** — always rendered but **disabled** until the
   Workbook tab's *Custom pricing* checkbox is on; reuses the exact
   Include logic (standard includes + uploads) from custom mode.

The mode is self-contained: it does **not** generate a brand-new
workbook from assumptions/components — it operates on the uploaded
file.

**Upload compatibility (decided):** only XLPricer v2 workbooks are
accepted.  Non-XLPricer files, and trimmed files with no `_Frozen`
revival markers, are rejected at upload with a clear message.

## Current state (reference)

All core operations are already browser-safe and implemented:

- `src/xlsx/convert.ts` — `toXlsm`, `toXlsx`, `trimWorkbook`
  (ExcelJS + JSZip only).
- `src/xlsx/reprice.ts` — `refreshWorkbook` handles provenance
  guards, staleness, `_Frozen` revival for trimmed workbooks, and
  xlsx/xlsm output via `mergeIntoMacroWorkbook`.
- `src/xlsx/vba.ts` — `mergeIntoMacroWorkbook` (JSZip).
- `src/xlsx/cli.ts` — proves the same flows: `--to-xlsx`,
  `--to-xlsm`, `--trim`, and refresh (`--update`) with `--xlsm`.
- `src/editorTab/IncludesTab.tsx` — standard-include checkboxes +
  CSV uploads, persisted in localStorage.
- `src/mainApp/useXlsxGenerator.ts` `collectIncludePayload()` — the
  include selection shared by BasicView/HomeTab.
- `src/homeTab/xlsxWorker.ts` — fetches pricing JSON, fetches/parses
  include CSVs, runs `processPricingData`, then generates.
- `public/config.json` — already has `home.pricesUrl` and
  `home.vbaTemplateUrl` (from `docs/DONE-gen-options.md`).

## Proposed UX

### Mode selector

- `AppMode` gains `'conversion'` (`src/mainApp/ModeSelector.tsx`);
  label **Conversion** (decided 2026-09-17).
- Persisted in `xlpricer-mode` like the other modes.

### Top-level tabs (decided: Option B)

The Conversion tabs live in the same top bar as the settings dropdown
and the custom-mode tabs:

```text
┌──────────────────────────────────────────────────────────────┐
│ [Settings ▾] [Workbook] [Includes (disabled)]   ← one bar    │
└──────────────────────────────────────────────────────────────┘
```

- `[Includes]` is **always rendered** but disabled (greyed,
  `cursor-not-allowed`, tooltip "Enable custom pricing to use
  includes") until the Workbook tab's Custom pricing checkbox is on.
- `customPricing` state is lifted to `App` so both the Workbook tab
  (the checkbox) and the top-level Includes tab (enabled/disabled)
  react to it.  Default **off**; persisted in `localStorage`
  (`xlpricer-conversion-custom-pricing`).
- Unchecking Custom pricing while Includes is active switches the
  active tab back to Workbook.

### Workbook tab sketch

```text
┌──────────────────────────────────────────────────────────────┐
│ 📁 Workbook                                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Drop workbook here or click to upload  (.xlsx/.xlsm)  │  │
│  └────────────────────────────────────────────────────────┘  │
│  pricing.xlsm  (1.2 MB)   [Remove]                           │
│  Detected: full workbook · macro-enabled · pricing up to date │
│                                                              │
│  Operation:                                                   │
│    (●) Convert only        Format: [ XLSX ▾ ]               │
│    ( ) Force repricing      Output: [ XLSX ▾ ]              │
│    ( ) Trim workbook        (outputs XLSX)                   │
│                                                              │
│  ☐ Custom pricing (enables Includes tab)                     │
│                                                              │
│  [ Process workbook ]                                        │
│                                                              │
│  ⚠ status / warnings line                                    │
└──────────────────────────────────────────────────────────────┘
```

- Upload: drag-drop + click-to-browse, accept `.xlsx` / `.xlsm`;
  files over **3 MB** show a soft "processing may be slow" warning;
  files over **32 MB** are rejected (hard cap).
- On upload, an `inspect` message returns the sheet names and flags:
  `isXlpricer`, `hasMacros`, `hasFrozen`, `trimmed` (no
  Prices/Volumes), **and** a staleness check against the latest
  pipeline data.  The check is **pipeline-only**: it fetches just
  `prices-latest.json` (no include CSVs) and
  `compareSourceMeta` excludes `includes|*` keys, so the Custom
  pricing checkbox never affects the result — a Basic-mode workbook
  reports up to date regardless of the checkbox.  **Trimmed
  workbooks skip the check entirely** — they have no pricing sheets
  to compare — so no pricing verdict is shown and repricing stays
  available (the rebuild is always forced).  The Detected line
  shows both sets of facts.
- Upload rejection: `isXlpricer === false` → "not an XLPricer v2
  workbook"; `trimmed && !hasFrozen` → "trimmed without revival
  markers".  Nothing else proceeds on a rejected file.
- Staleness result drives the radio label:
  - **up to date** → `Force repricing` (`force: true`),
  - **stale** → `Update pricing tables` (normal refresh),
  - **trimmed** → `Rebuild full workbook`, always forced — the
    staleness check is skipped for trimmed workbooks (nothing to
    compare), so no "no change detected" warning is emitted,
  - **prices unavailable** → the update option is disabled; Convert
    and Trim remain available.
- No automatic staleness re-check after upload; the label reflects
  upload-time state (decided).
- Available operations narrow by the detected state:
  - full xlsx/xlsm → Convert, Update/Force, Trim,
  - trimmed (with `_Frozen`) → only Update/Force (Trim and Convert →
    XLSM are disabled).
- Operations are a radio group:
  - **Convert only** — format dropdown (XLSX/XLSM).  Default is the
    **opposite** of the uploaded format (decided).
  - **Update pricing tables / Force repricing** — output format
    dropdown (default XLSX); uses the pipeline URL with the include
    payload following the shared Custom pricing checkbox, exactly
    like generation: on → the Includes-tab configuration (enabled
    standard includes + uploaded CSVs); off → all standard includes,
    no uploads — so repricing never drops the standard includes.
  - **Trim workbook** — no format choice (always outputs XLSX).
- **Custom pricing** is a Gen-Options checkbox shared by Basic,
  Custom and Conversion mode (persisted under the one gen-options
  key, default **off**).  It gates the Includes tab (in Custom and
  Conversion mode) and decides which include configuration
  generation and repricing use.  Includes settings themselves use
  the same localStorage keys as custom mode, so the stored
  enabled/uploaded state survives toggling.
- Process button triggers a worker; BusyOverlay is reused.

### Includes tab

- Always rendered as the second tab, **disabled** until Custom
  pricing is on (see the top-level tab section).
- Same `IncludesTab` component, `config: { standardIncludes:
  config.includes.files }`.
- Unchecking Custom pricing keeps the stored include choices (shared
  with custom mode).

## Recommended changes

### 1. Shared pricing/include loader (DRY prerequisite)

Extract from `src/homeTab/xlsxWorker.ts` into a new worker-side module,
e.g. `src/homeTab/loadPricing.ts`:

```ts
export async function loadPricedData(
  dataUrl: string,
  includePayload?: { includeUrls?: string[]; uploadedIncludes?: UploadedInclude[] },
): Promise<PricesData>
```

- fetch pricing JSON,
- fetch manifests / include CSVs when `includePayload` is given,
- merge uploaded includes,
- `processPricingData(pricingData, { includes })`.

`xlsxWorker.ts` calls it, and the workbook worker's refresh op calls
it with the payload the shared Custom pricing checkbox selects
(on → Includes-tab configuration; off → all standard includes, no
uploads) — the same rule as generation.  (The upload inspect call
passes no payload at all — the staleness comparison is
pipeline-only.)

### 2. Workbook protocol + worker

New `src/workbookTab/workbookProtocol.ts`:

```ts
export interface WorkbookInspectRequest {
  file: ArrayBuffer
  /** Present when a staleness check should run (upload inspect).
      No include payload — the check is pipeline-only. */
  pricing?: {
    dataUrl: string
  }
}
export interface WorkbookInspectResult {
  sheets: string[]
  isXlpricer: boolean
  hasMacros: boolean
  hasFrozen: boolean
  trimmed: boolean
  /** Staleness result; absent for non-XLPricer files or fetch failures. */
  pricing?: {
    stale: boolean
    reason?: string
    warnings: string[]
  }
}

export type WorkbookOp =
  | { kind: 'convert'; format: 'xlsx' | 'xlsm'; vbaTemplateUrl?: string }
  | { kind: 'trim' }
  | {
      kind: 'refresh'
      outputFormat: 'xlsx' | 'xlsm'
      dataUrl: string
      includePayload?: { includeUrls?: string[]; uploadedIncludes?: UploadedInclude[] }
      vbaTemplateUrl?: string
      useInputAsTemplate?: boolean
      appMeta: AppMeta
      force?: boolean
    }

export interface WorkbookRequest {
  file: ArrayBuffer
  op?: WorkbookOp           // absent for inspect
}

export type WorkbookResponse =
  | { type: 'ok'; buffer?: ArrayBuffer }
  | { type: 'unchanged'; check: SourceCompare; warnings: string[] }
  | { type: 'err'; message: string; stack?: string }
```

New `src/workbookTab/workbookWorker.ts`:

- `inspect`: load with ExcelJS; `isXlpricer` = has a `T` sheet with
  `Format version`; `hasMacros` from JSZip (`xl/vbaProject.bin`);
  `hasFrozen` = `_Frozen` sheet; `trimmed` = no Prices/Volumes.
  When `pricing` is supplied **and** the file is compatible, fetch
  via `loadPricedData(dataUrl)` — no include payload, the check is
  pipeline-only — and run `refreshWorkbook(..., { checkOnly:
  true })` to get `stale`/warnings; swallow `not-xl-pricer` /
  `trimmed` / fetch failures into `pricing: undefined` (the UI
  rejects incompatible uploads separately).
- `convert`:
  - to XLSX: `toXlsx(file)`,
  - to XLSM: `toXlsm(file, templateBytes)` (fetch `vbaTemplateUrl`).
- `trim`: `trimWorkbook(file)`; pass `TrimError` messages through
  as-is — they are user-facing ("no cached results — open and save
  the workbook in Excel first", or "cannot read the formula of
  Sheet!Cell — its shared-formula master has no readable formula").
  Formula reads are defensive: ExcelJS's shared-formula translation
  (`slideFormula`) throws a TypeError when a slave's master has no
  formula text — `readFormula` converts that into the actionable
  TrimError naming the sheet and cell.  The freeze is **two-pass**:
  all formulas are snapshotted (translating shared slaves) before
  anything is frozen, because freezing a shared master first would
  break the translation of its slaves.  The Finder, the BOM
  template, and the pricing sheets are never frozen — they are
  deleted anyway, and walking the Finder's fixed-size arrays was
  the slow part of the VBA version.  The trimmed output sets T to
  **veryHidden** (it must survive: XLPricer identity marker, pricing
  provenance, and the `T_ONE_TIME` anchor); the refresh rebuild
  restores its visibility.
- `refresh`:
  - `loadPricedData(dataUrl, includePayload)`,
  - if the file is trimmed: `force = true` (required — otherwise the
    staleness check can return "unchanged" before Prices are
    regenerated),
  - template selection: output XLSM + input XLSM → use the uploaded
    file's bytes as the macro host (`useInputAsTemplate`); output
    XLSM + input XLSX → fetch `vbaTemplateUrl`,
  - `refreshWorkbook(file, pricingData, { appMeta, force, xlsmTemplate })`,
  - post `ok`/`unchanged` with warnings.

### 3. Hook + components

- `src/workbookTab/useWorkbookOps.ts` — owns the worker, busy flag,
  `inspect(file)`, `process(file, op)`, download handling:
  - keeps the uploaded bytes as a `Uint8Array` in state and posts a
    **copy** (`bytes.slice(0)`) to the worker, so inspect + process
    can each use the same file,
  - filenames: `<stem>-converted.<ext>` / `<stem>-trimmed.xlsx` /
    `<stem>-reprice.<ext>`, with the stem sanitised by the same
    helper `dealInfoFilename` uses (export it from `useDealInfo.ts`),
  - MIME: xlsx standard / xlsm macro-enabled,
  - surfaces `unchanged`, errors, and warnings.
- `src/workbookTab/WorkbookTab.tsx` — upload zone, detected-info
  card, operation radios, Custom pricing checkbox, process button,
  status panel.
- `src/workbookTab/WorkbookMode.tsx` — renders the active Conversion
  tab content; the **tab bar itself lives in App** (decided:
  Option B, top-level tabs).

### 4. App wiring

- `src/mainApp/App.tsx`:
  - validate/persist `'conversion'` mode,
  - when active, render the top-level `[Workbook] [Includes]` tabs
    (Includes disabled unless `customPricing`),
  - own `customPricing` state, default **off**, persisted in
    `xlpricer-conversion-custom-pricing`,
  - switch active tab back to Workbook when custom pricing is
    unchecked,
  - **lift the uploaded file + inspect/operation state to App** so
    switching between Workbook/Includes does not lose it; clear the
    upload when the user switches away from Conversion mode,
  - pass config props through:
    - `pricesUrl` (`config.home.pricesUrl`),
    - `standardIncludes` (`config.includes.files`),
    - `vbaTemplateUrl` (`config.home.vbaTemplateUrl`).
- `src/mainApp/ModeSelector.tsx`: add the **Conversion** entry.

### 5. Includes reuse

- The Includes tab is the existing `IncludesTab`; no new logic.
- `collectIncludePayload(includes)` feeds the worker payload exactly
  as HomeTab does today.
- Custom pricing off → pass no `includePayload` to the worker
  (plain pipeline data, like no includes).

## Behaviour matrix

| Uploaded file | Operation | Output | Notes |
|---|---|---|---|
| non-XLPricer | upload | rejected | "not an XLPricer v2 workbook" |
| trimmed, no `_Frozen` | upload | rejected | "trimmed without revival markers" |
| xlsx (full) | Convert → XLSM | `.xlsm` | `toXlsm` + config template (default: opposite format) |
| xlsm (full) | Convert → XLSX | `.xlsx` | `toXlsx` clean strip |
| xlsx/xlsm (full) | Update pricing | `.xlsx`/`.xlsm` | stale → normal `refreshWorkbook`; up to date → radio is **Force repricing** (`force: true`) |
| xlsx/xlsm (full, cached) | Trim | `.xlsx` | `trimWorkbook`; uncached → clear error |
| trimmed (has `_Frozen`) | Update pricing only | `.xlsx`/`.xlsm` | `refreshWorkbook` revives frozen formulas + regenerates Prices/Volumes/Finder/T; force=true |

## Out of scope

- Generating a new workbook from scratch (that's Basic/Custom).
- Editing assumptions/components on the uploaded workbook.
- Batch processing or drag-drop of multiple files.
- A separate `--check-only` UI (the upload-time staleness check and
  Force repricing cover the user-facing need).
- Number-of-years option (`docs/TODO-years-max.md`, on hold).

## Decisions (2026-09-17)

Decided:

1. **Mode label** — **Conversion**.
2. **Tab layout** — Option B: top-level tab bar; `[Includes]` always
   rendered but disabled until Custom pricing is on.
3. **Default output format** — **XLSX** for Update pricing; Convert
   defaults to the **opposite** of the uploaded format.
4. **Custom pricing checkbox** — default **off**, persisted in
   localStorage.
5. **Includes state** — shared with custom mode (same localStorage
   keys).
6. **Operation UI** — Option A: radio group + one Process button;
   auto-select **Update pricing tables** for a trimmed upload,
   **Convert only** otherwise.
7. **Trimmed → full** — Option A: *Update pricing tables* handles it,
   with auto-`force: true` when the upload is trimmed; no dedicated
   fourth operation.
8. **Up-to-date handling** — the upload inspect runs the staleness
   check and shows it on the Detected line; when up to date, the
   reprice radio becomes **Force repricing** (`force: true`).
9. **Upload compatibility** — reject non-XLPricer files and trimmed
   files without `_Frozen` markers.
10. **Operation narrowing** — trimmed (with `_Frozen`) uploads offer
    only Update/Force; Trim and Convert → XLSM are disabled.
11. **File size** — over **3 MB**: soft warning; over **32 MB**:
    rejected.
12. **Filename scheme** — `<stem>-converted.<ext>`,
    `<stem>-trimmed.xlsx`, `<stem>-reprice.<ext>`; reuse the
    `dealInfoFilename` sanitizer for the stem.
13. **Shared loader** — Option A: extract `src/homeTab/loadPricing.ts`;
    both `xlsxWorker.ts` and `workbookWorker.ts` use it.
14. **No automatic staleness re-check** after upload (no Includes
    change mechanism); the label reflects upload-time state.
15. **Upload state** — lifted to App; survives Workbook ↔ Includes
    tab switches; **cleared when leaving Conversion mode**.

## File list

- New: `src/workbookTab/workbookProtocol.ts`
- New: `src/workbookTab/workbookWorker.ts`
- New: `src/workbookTab/useWorkbookOps.ts`
- New: `src/workbookTab/WorkbookTab.tsx`
- New: `src/workbookTab/WorkbookMode.tsx`
- New: `src/homeTab/loadPricing.ts` (extracted shared loader)
- Modified: `src/homeTab/xlsxWorker.ts` — use shared loader
- Modified: `src/mainApp/ModeSelector.tsx` — Conversion mode
- Modified: `src/mainApp/App.tsx` — mode wiring + top-level tabs +
  custom-pricing + lifted upload state
- Modified: `src/mainApp/useDealInfo.ts` — export the filename
  sanitizer for reuse
- Unchanged: `IncludesTab.tsx`, core `convert.ts` / `reprice.ts` /
  `vba.ts`

## Verification checklist

- [x] `npm run build` / `npm run lint` / `npm run test:run` (92 green).
- [x] Worker smoke: inspect reports compatibility/staleness; xlsx →
      xlsm conversion produces `_BOMTemplate`; forced refresh returns
      an updated workbook with warnings.
- [ ] Browser: Conversion mode appears in the mode selector and
      persists.
- [ ] Browser: top-level tabs `[Workbook] [Includes]`; Includes is
      disabled until Custom pricing is on, and unchecking it returns
      to the Workbook tab.
- [ ] Browser: upload + inspect reports macros / `_Frozen` / trimmed
      correctly.
- [ ] Browser: non-XLPricer uploads and trimmed-without-`_Frozen`
      uploads are rejected with clear messages.
- [ ] Browser: files > 3 MB warn; files > 32 MB are rejected.
- [ ] Browser: upload survives switching Workbook ↔ Includes.
- [ ] Browser: xlsx → xlsm conversion downloads a macro-enabled
      workbook with `_BOMTemplate`; Convert defaults to the opposite
      format.
- [ ] Browser: xlsm → xlsx conversion downloads a clean workbook
      without macros/Tools.
- [ ] Browser: trim on an Excel-saved workbook freezes formulas,
      removes pricing sheets, records `_Frozen`; uncached file shows a
      clear error.
- [ ] Browser: trimmed upload offers only Update/Force; processing
      revives formulas and rebuilds Prices/Volumes/Finder/T.
- [ ] Browser: update pricing with custom pricing off uses plain
      pipeline data.
- [ ] Browser: custom pricing on enables the Includes tab; enabled
      standard includes and uploads reach the refresh exactly as in
      custom mode.
- [ ] Browser: up-to-date workbook shows "pricing up to date" on the
      Detected line and relabels the radio to Force repricing;
      selecting it downloads the forced rebuild.
- [ ] Browser: busy overlay + worker errors behave like the generate
      flow.

## Notes

- The mode operates only on the uploaded file; the generate views are
  untouched.
- Core functions are already tested (92 tests); this work is mostly
  SPA UI + worker orchestration plus the shared-loader extraction.
- `TODO-spa.md`'s *reprice UI and xlsx/lsxm conversion* bullet is
  superseded by this doc.

***
* Core ops: `src/xlsx/convert.ts`, `src/xlsx/reprice.ts`,
  `src/xlsx/vba.ts`
* Includes UI: `src/editorTab/IncludesTab.tsx`
* Include payload: `src/mainApp/useXlsxGenerator.ts`
* Existing worker: `src/homeTab/xlsxWorker.ts`
* Config: `public/config.json`
