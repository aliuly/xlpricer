# TODO: YEARS MAX refactor (configurable projection years)

**Status:** planned 2026-09-17 — **on hold: may not be needed.**
No code changes yet; do not start this until the year-count feature is
confirmed.  This is the implementation plan for the **whole
year-count feature**: core generator, CLI, and SPA.  (Year options
were removed from `docs/TODO-gen-options.md` so everything stays in
one place here.)

## Goal

Make the number of projection years a runtime option instead of a
module constant.  Today every generated workbook projects a fixed
`YEAR_MAX = 6` years; after the refactor, callers (CLI **and** SPA)
can pass `years` and the Overview / BOM sheets rebuild their year
columns for that count.  The default stays **6**, so every existing
caller and test is byte-for-byte unchanged when no option is given.

## Current state (reference)

- `src/xlsx/constants.ts`: `export const YEAR_MAX = 6`.
- `src/xlsx/overview.ts` imports `YEAR_MAX` and uses it for column
  maths in `wsEsaSection`, `wsOVYheading`, `wsYearlyGroup`,
  `wsOVYfooter`, `wsOVMheading`, `wsMonthlyGroup`, `wsOVMfooter`, and
  `genOverviewSheet` (roughly 60 sites).  `RS_ADJ = 7` stays fixed —
  it is independent of the year count.
- `src/xlsx/bom.ts` imports `YEAR_MAX` **only** inside `genBOMSheet`,
  where it is passed to helpers that already take a `years` parameter
  (`wsInflationHdr` / `wsInflationRow` / `wsInflationTotal` and the
  inflation column group).  The helpers themselves are ready.
- `src/xlsx/writer.ts` calls `genBOMSheet`, `genBomTemplateSheet`, and
  `genOverviewSheet` with no year argument.
- `src/xlsx/reprice.ts` `ensureBomTemplate()` calls
  `genBomTemplateSheet(ws, refMap)` with no year argument.
- `src/xlsx/cli.ts` has no `--years` flag.

## Recommended changes

### 1. Constants

In `src/xlsx/constants.ts`:

```ts
/** Default number of years to project. */
export const DEFAULT_YEARS = 6;

/** Allowed range for a user-selected year count (decided: 3–14). */
export const MIN_YEARS = 3;
export const MAX_YEARS = 14;
```

- Rename the import sites (`YEAR_MAX` → `DEFAULT_YEARS`).
- Keep `export const YEAR_MAX = DEFAULT_YEARS` as a deprecated alias
  only if any out-of-tree caller still needs it; nothing inside
  `src/` or `tests/` does.

### 2. Overview sheet

Add a `years: number = DEFAULT_YEARS` parameter to every year-maths
function listed above and replace `YEAR_MAX` with `years` inside them.
Suggested signatures:

```ts
function wsEsaSection(ws, r, years, myMap, refMap): number
function wsOVYheading(ws, r, year, months, years, myMap): number
function wsYearlyGroup(ws, r, label, years, myMap, refMap): void
function wsOVYfooter(ws, r, years, myMap, refMap): void
function wsOVMheading(ws, r, tabs, years, myMap, refMap): number
function wsMonthlyGroup(ws, r, tab, key, years, myMap, refMap): void
function wsOVMfooter(ws, r, years, myMap, refMap): void
export function genOverviewSheet(
  ws, refMap, components, enableEsa = true, years = DEFAULT_YEARS,
): void
```

`genOverviewSheet` threads `years` to each helper and to the
`setColumnWidth` / `groupColumns` ranges.  `RS_ADJ` is unchanged.

### 3. BOM sheet

Only `genBOMSheet` needs a parameter — its inflation helpers already
accept one:

```ts
export function genBOMSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  componentsRaw: unknown,
  years: number = DEFAULT_YEARS,
): void
```

Replace the four `YEAR_MAX` arguments with `years`.

`genBomTemplateSheet` must accept and forward `years` too, so the
hidden `_BOMTemplate` (used by the VBA `AddTab` macro) matches the
year count of the workbook's visible BOM tabs:

```ts
export function genBomTemplateSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  years: number = DEFAULT_YEARS,
): void
```

### 4. Writer

`src/xlsx/writer.ts`:

```ts
export interface GenerateOptions {
  vbaTemplate?: boolean;
  /** Number of projection years; defaults to DEFAULT_YEARS. */
  years?: number;
}
```

Inside `generatePricingXlsx`:

```ts
const years = opts.years ?? DEFAULT_YEARS;
```

and pass `years` to `genBOMSheet`, `genBomTemplateSheet`, and
`genOverviewSheet`.

Validation decision: the writer stays permissive (positive integer
callers have already validated); CLI/SPA validate the allowed range.
At minimum, guard `years < 1` with a clear error.

### 5. CLI

`src/xlsx/cli.ts`:

- Parse `--years <n>` into `ParsedArgs.years?: number`.
- Validate `MIN_YEARS ≤ n ≤ MAX_YEARS`, fail with usage text on
  invalid values.
- Generation mode: pass `years: opts.years` into `generatePricingXlsx`
  (`GenerateOptions`).
- Conversion/refresh modes: decide whether `--years` is rejected or
  ignored (recommend: reject in `--to-*` / `--trim` modes, since no
  fresh sheets are generated; refresh is covered below).

### 6. Refresh / conversion template consistency (important)

`ensureBomTemplate()` currently generates a default-6 template.  If a
workbook was generated with `years ≠ 6` and is later refreshed or
converted to XLSM, the freshly added `_BOMTemplate` must match the
existing BOM columns, or AddBOM clones the wrong layout.

**Decided (2026-09-17): infer.** Infer the existing year count from a
BOM tab (count the `YEAR_n` refs / inflation columns before
`coloffs`), then pass it to `genBomTemplateSheet`.  Add `years?:
number` to `RefreshOptions` and `ensureBomTemplate`; absent →
inferred value, fallback `DEFAULT_YEARS`.  Refresh mode does not
honour `--years` — the file's own layout wins.

### 7. SPA (part of this TODO)

Recommended order: implement `docs/TODO-gen-options.md` first, then
its `WorkerGenerateOptions` already exists and only needs a
`years?: number` field.  Otherwise define the minimal options shape
here.

- `src/homeTab/xlsxWorkerProtocol.ts`: add `years?: number` to the
  worker generate options.
- `src/homeTab/xlsxWorker.ts`: pass `years: req.options?.years` into
  `generatePricingXlsx(..., { vbaTemplate, years })`.
- `src/mainApp/useXlsxGenerator.ts`: `GenerateRequest` forwards
  `options.years` unchanged.
- `src/mainApp/GenerateView.tsx` / `GenOptions.tsx`: add the Years
  input to the Options card (create the card here if
  `TODO-gen-options.md` has not landed):
  - **dropdown** (decided), range `MIN_YEARS..MAX_YEARS`,
  - default `DEFAULT_YEARS`,
  - persisted with the other options in `xlpricer-gen-options`,
  - shown in both basic and custom modes (shared `GenerateView`).
- Years affects layout only — no filename, MIME, or T-metadata change.

## Out of scope

- Making the start year/month configurable (still derived from the
  current date).
- Changing inflation/ramp-up assumptions per year.
- Recording the year count in the T metadata sheet (open question —
  it does not affect the pricing fingerprint).

## Decisions & open questions (2026-09-17)

Decided:

1. **Allowed range** — 3–14, default 6.
2. **Years UI** — dropdown.
3. **Refresh/conversion** — infer from existing BOM; refresh does not
   honour `--years`.
4. **Writer validation** — permissive (`years < 1` guard only);
   range validation lives in CLI/SPA.
5. **Order** — `docs/TODO-gen-options.md` first.

Still open:

1. **Rename** — is `DEFAULT_YEARS` the right name, and keep a
   `YEAR_MAX` alias or delete it outright?
2. **Do we need the feature at all** — currently on hold; confirm
   before starting work.

## File list

- Modified: `src/xlsx/constants.ts` — `DEFAULT_YEARS` (+ range).
- Modified: `src/xlsx/overview.ts` — parameter threading.
- Modified: `src/xlsx/bom.ts` — `genBOMSheet` /
  `genBomTemplateSheet` parameters.
- Modified: `src/xlsx/writer.ts` — `GenerateOptions.years` + call
  sites.
- Modified: `src/xlsx/reprice.ts` — `ensureBomTemplate` years
  (inference or option), `RefreshOptions.years?`.
- Modified: `src/xlsx/cli.ts` — `--years` flag + validation.
- Modified: `src/homeTab/xlsxWorkerProtocol.ts` — `years` in worker
  options.
- Modified: `src/homeTab/xlsxWorker.ts` — pass `years` to the writer.
- Modified: `src/mainApp/useXlsxGenerator.ts` — forward the option.
- Modified: `src/mainApp/GenerateView.tsx` / `GenOptions.tsx` — Years
  input in the Options card.
- Maybe: `src/xlsx/convert.ts` — if `toXlsm` needs to accept/ infer
  years for `ensureBomTemplate`.

## Verification checklist

- [ ] `npm run build` / `npm run lint` / `npm run test:run`.
- [ ] Default generation (no `years`) produces identical sheet layout
      to the current 6-year output (regression).
- [ ] `generatePricingXlsx(input, { years: 3 })` builds 3 year columns
      in Overview and 3 inflation columns + `YEAR_1..YEAR_3` names on
      each BOM tab.
- [ ] `years: 3` and `years: 14` generate without broken formulas
      (open in LibreOffice / Excel and recalc).
- [ ] XLSM generation with `vbaTemplate: true, years: n` produces a
      `_BOMTemplate` with `n` years.
- [ ] CLI: `--years 4` generates 4-year workbook; `--years 2` /
      `--years 15` fail with a clear error.
- [ ] SPA: Options card shows Years dropdown (default 6, range 3–14)
      in both modes.
- [ ] SPA: selecting a different year count generates a workbook with
      that many Overview/BOM year columns.
- [ ] SPA: year choice persists across reload and basic↔custom
      switching.
- [ ] Refresh xlsx → xlsm on a non-default-year workbook infers the
      existing BOM year count and adds a matching `_BOMTemplate`.

## Notes

- The layout arithmetic is already parameterised in the BOM inflation
  helpers; the Overview sheet is where most of the mechanical work
  lives.
- `RS_ADJ = 7` and the overview column offsets are year-independent
  offsets — do not "parameterise" them.
- Keep the default path byte-stable: no change should alter the
  6-year output (the existing 92 tests are the regression net).

***
* Constant: `src/xlsx/constants.ts`
* Year maths: `src/xlsx/overview.ts`, `src/xlsx/bom.ts`
* Core callers: `src/xlsx/writer.ts`, `src/xlsx/reprice.ts`,
  `src/xlsx/convert.ts`, `src/xlsx/cli.ts`
* SPA: `src/mainApp/GenerateView.tsx`, `src/mainApp/useXlsxGenerator.ts`,
  `src/homeTab/xlsxWorker.ts`, `src/homeTab/xlsxWorkerProtocol.ts`
