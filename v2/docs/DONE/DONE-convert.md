# TODO: Workbook conversion (xlsx ↔ xlsm) + trimmed-workbook revival

**Status:** implemented 2026-09-17.  Conversion core + CLI (Part 1)
and trimmed-workbook revival (Part 2): `src/xlsx/convert.ts`
(`toXlsm`, `toXlsx`, `trimWorkbook` with `_Frozen` recording), the
`--to-xlsx` / `--to-xlsm` / `--trim` CLI modes with refresh
composition, TrimWB's `_Frozen` recording in `vba/prep.vba`, and the
refresh revival (`reviveFrozenFormulas`, discovery fallback); 92
tests green incl. the LO trim → revival → recalc chain.  Remaining
manual items: real-Excel TrimWB execution and the Excel/LO reference
auto-adjustment smokes (see the checklist).  Two parts:

- **Part 1** — conversion core (`src/xlsx/convert.ts`) and CLI flags;
  implemented in two phases (core + tests, then CLI) — done.
- **Part 2** — trimmed-workbook revival: TrimWB records frozen
  formulas in a veryHidden `_Frozen` sheet with **live references**, so
  Excel/LibreOffice maintain the address mapping through structural
  edits; the refresh restores the formulas and reprices.

No legacy workbooks exist (everything unreleased), so both parts ship
with no migration baggage.

## Part 1 — Conversion

### Scope & non-goals

- `toXlsm(existingBytes, templateBytes)` — add macros: load the xlsx,
  ensure `_BOMTemplate` exists, merge into the macro host.
- `toXlsx(existingBytes)` — strip macros: load the xlsm (ExcelJS
  silently ignores `vbaProject.bin` — verified), drop the macro-only
  sheets, write a plain xlsx.  **Clean-strip flavour**: Prices /
  Volumes / Finder stay; the TrimWB-style *trim* (freeze + delete
  pricing sheets) remains the real-Excel macro's job, deliberately
  out of scope here.
- SPA UI: later (`TODO-spa.md`); the core stays browser-safe so the
  SPA reuses it (its xlsx → xlsm template is the web-served
  `public/vba/template.xlsm`, per the input-driven host rule).

### Core (`src/xlsx/convert.ts`, pure)

`toXlsm`:
1. Load the content (ExcelJS).
2. If `_BOMTemplate` is missing: generate it via `genBomTemplateSheet`
   with a refMap of revived assumption refs (`reviveAssumptionRefs`)
   plus the name constants — `PriceListTable` / `PriceListDescs` /
   `PriceListRegions` / `T_ONE_TIME`.  (The all-names convention means
   no Prices-sheet reading is needed.)
3. `modernizeWorkbookMetadata` on the content, then
   `mergeIntoMacroWorkbook(templateBytes, content)`.
4. Tools: nothing — `BuildTools` creates it on open.

`toXlsx`:
1. Load the xlsm content (ExcelJS ignores the VBA project; writing
   back therefore drops it — no zip surgery needed for the strip).
2. `removeWorksheet` `Tools` and `_BOMTemplate`; `pruneDefinedNames`
   for hygiene (no names point at them today, but the invariant is
   kept).
3. `modernizeWorkbookMetadata` on the write.

### Offline trim (`trimWorkbook`) — the TrimWB equivalent in TS

Doable **without Excel or LibreOffice** because a file saved by Excel
already carries calculated results as cached `<v>` values; ExcelJS
exposes them as `cell.value = { formula, result }`.  Freezing = copy
the cache over the formula — no calculation engine involved.

Mirrors TrimWB step-for-step:

1. Load (xlsm or xlsx; the VBA project is dropped on write — the
   macro-strip is free).
2. **Freeze** every formula cell referencing the `PriceList*` names
   (plus the literal `Prices!` / `'Prices'!` patterns, belt-and-braces)
   on all sheets except Prices/Volumes: `cell.value =
   cell.value.result`.  `CellErrorValue`s (`#N/A`, …) are legitimate
   frozen values.
   - **No cached result** → the assumption failed (file never
     calculated) → fail with a clear error ("open and save the
     workbook in Excel first"); never write a half-frozen file.
3. **DV cleanup** — remove validations whose formula1 starts with
   `PriceList` (same prefix rule as TrimWB).
4. **Delete** Tools, Prices, Volumes, Finder, `_BOMTemplate`; delete
   every `PriceList*` defined name.
5. Write xlsx → `modernizeWorkbookMetadata`.
6. **Write the `_Frozen` sheet too** (LiveRef / OriginalAddress /
   FormulaText) — so TS-trimmed files are revivable by Part 2 exactly
   like VBA-trimmed ones.

Caveats:

- **Cache vs. fresh recalc**: VBA's `cell.Value = cell.Value`
  re-evaluates at trim time; the TS version uses the last-saved
  cache.  Identical for a saved, non-dirty file (documented).
- **ExcelJS round-trip fidelity**: same caveat as refresh (user-added
  drawings may be lost; our generated sheets have none, and Tools —
  where form controls would live — is deleted).
- Real-Excel TrimWB remains the in-Excel workflow; this is the
  CLI/SPA equivalent, not a replacement.

### CLI surface (same entry point)

Conversion mode — triggered by `--to-xlsx` or `--to-xlsm`; **the URL
becomes optional only in this mode** (positional = the input file):

```
npx tsx src/xlsx/cli.ts pricing.xlsm --to-xlsx [-o pricing.xlsx]
npx tsx src/xlsx/cli.ts pricing.xlsx --to-xlsm \
  --xlsm public/vba/template.xlsm [-o pricing.xlsm]
npx tsx src/xlsx/cli.ts pricing.xlsm --trim [-o pricing-trimmed.xlsx]
```

- `--to-xlsm` requires `--xlsm <template>`.
- `--trim` = the offline TrimWB equivalent; implies xlsx output.
- Default output mirrors the input stem: `<stem>.xlsx` / `<stem>.xlsm`.
- Same-path / extension refusals as in refresh mode; status JSON
  (`ok` / `error`), exit 0 / 2.

### Composition with refresh (accepted)

Refresh mode may output the **converted** extension — reprice +
convert in one command:

- xlsm input → xlsx output: run `refreshWorkbook` *without* a host
  (content-only path) then `toXlsx` (drops Tools + `_BOMTemplate`).
- xlsx input → xlsm output: the existing `--xlsm` refresh path already
  produces it (host merge + generated `_BOMTemplate`).

The refresh extension rule becomes: `-o` must be `.xlsx` or `.xlsm`;
`.xlsm` requires `--xlsm` or an xlsm input host.

### Work breakdown (two phases)

- **Phase 1 — core + tests**: `src/xlsx/convert.ts` (`toXlsm`,
  `toXlsx`, `trimWorkbook`, plus a shared `ensureBomTemplate` factored
  out of `reprice.ts`); integration tests: xlsm → xlsx (no
  `vbaProject.bin` part, content type not macroEnabled,
  Tools/`_BOMTemplate` gone, Prices/BOM/names/T intact, LibreOffice
  loads it), xlsx → xlsm (`vbaProject.bin` present, `_BOMTemplate`
  veryHidden, LO loads), round-trip xlsm → xlsx → xlsm, and the trim
  chain: LO-recalc → `trimWorkbook` → formulas frozen to cached
  values, pricing sheets/names/DVs gone, `_Frozen` written → Part 2
  revival → LO-recalc agrees.
- **Phase 2 — CLI**: conversion + `--trim` flags, optional-URL
  parsing, default names, refusals, refresh-composition extension
  rule; CLI smoke tests for the directions and the refusals.

## Part 2 — Trimmed-workbook revival (`_Frozen`)

### The address-drift trick

TrimWB records each frozen cell in a veryHidden `_Frozen` sheet whose
**LiveRef column is a real formula** (`=Components!W24`).  Excel (and
LibreOffice, for plain references) then maintain the mapping through
structural edits for free:

| User edit                 | `_Frozen` LiveRef becomes |
|---------------------------|---------------------------|
| insert row above W24      | `=Components!W25`         |
| delete row above W24      | `=Components!W23`         |
| delete the W24 row        | `#REF!` (skip + warn)     |
| insert column before W    | `=Components!X24`         |
| rename the sheet          | `=MyTab!W24`              |

### `_Frozen` layout

```
_Frozen (veryHidden):
  A: LiveRef          =Components!W25          (formula — self-adjusting;
                                                 also evaluates to the
                                                 frozen value)
  B: OriginalAddress  Components!W24           (static text, trim-time)
  C: FormulaText      IF(OR($D7="",$K7=""),…   (stored WITHOUT the
                                                 leading '=' — a VBA
                                                 string starting with '='
                                                 would become a formula)
```

Written by TrimWB during the freeze loop, before `cell.Value =
cell.Value`; the sheet is excluded from the freeze search, the DV
cleanup, and the deletion list.  The delivered trimmed file carries it
(harmless — its formulas evaluate to the frozen values).

### Revival (in `reprice.ts`)

1. `reviveFrozenFormulas(wb)`: for each `_Frozen` row, read `LiveRef`;
   `#REF!` → warn + skip (row deleted).
2. Parse the new address from `LiveRef`, the old address from
   `OriginalAddress` → **Δrow / Δcol**.
3. Shift every *unqualified* reference in `FormulaText` by the deltas
   (`$D7` → `$D8` / `$E7`); sheet-qualified refs and defined names are
   untouched.  All BOM compute formulas are relative to their own row,
   so a uniform shift is exact (including `={prev}`-style refs).
4. Restore into the new address (prepend `=`).

### Refresh integration

- The `trimmed` refusal becomes: no Prices/Volumes **and** no
  `_Frozen` → refuse (unchanged error).  With `_Frozen` → revive, warn
  ("restored N frozen formulas"), then refresh as usual.
- **BOM discovery fallback**: trimmed files have no Volumes, so
  `discoverBomTabs` gains a fallback — when Volumes is absent,
  enumerate `Components*` sheets (excluding `_BOMTemplate`) and use
  the current-layout column letters (exported from `bom.ts`).
- **Desired tab order**: when the original order lacks the
  Volumes/Prices/Finder block, insert it after the last `Components*`
  sheet (before Assumptions/ESA/T).
- Overview is untouched and keeps working — its formulas reference the
  BOM tabs, whose formulas are now restored.

### Caveats

- `_Frozen` must remain veryHidden (no macros in the trimmed file to
  rebuild it).
- Deleted rows → `#REF!` entries are skipped with warnings; those
  cells keep their frozen values.
- The reference auto-adjustment is Excel/LO behaviour — one manual
  smoke test each (insert/delete row, rename sheet, LO edit).
- Non-structural edits (qty/description changes) are fine: the
  address stays valid and the formula still belongs to that row.

## Verification checklist

- [x] Phase 1 core: xlsm → xlsx / xlsx → xlsm / round-trip /
      trim-chain tests; LibreOffice loads all outputs.
- [x] Phase 2 CLI: conversion + `--trim` smoke tests +
      refresh-composition (xlsm → xlsx in one command).
- [x] `trimWorkbook` fails clearly when cached results are absent
      (never writes a half-frozen file).
- [x] TrimWB writes `_Frozen` (LiveRef/OriginalAddress/FormulaText) —
      implemented in `vba/prep.vba`; the real-Excel execution pass
      (clean trims, veryHidden sheet) remains manual.
- [x] Revival: marked trimmed workbook → refresh restores formulas,
      reprices; LibreOffice recalc of the revived workbook agrees
      (BOM lookups, totals, Finder) — trim → revival → recalc chain
      test.
- [x] Drift: re-anchoring covered by unit tests (row/column shifts,
      whole-column ranges, qualified refs and names untouched) and the
      simulated-LiveRef revival test; the real-Excel/LO
      auto-adjustment smoke remains manual.
- [x] Unmarked trimmed workbook still refused with the clear message.

## Notes

- Both parts reuse existing machinery: `genBomTemplateSheet`,
  `reviveAssumptionRefs`, `pruneDefinedNames`, `mergeIntoMacroWorkbook`,
  `modernizeWorkbookMetadata`, and the `PriceList*`/`T_ONE_TIME` name
  conventions.
- The template-regeneration alternative (no recording; re-emit
  `bom.ts` column templates by header) remains the documented fallback
  if a `_Frozen`-less revival is ever wanted — it trades manual
  compute-column overrides for zero VBA changes.

***
* Refresh core: `src/xlsx/reprice.ts` (`reviveAssumptionRefs`,
  `pruneDefinedNames`, `discoverBomTabs`, `refreshWorkbook`)
* Merge machinery: `src/xlsx/vba.ts` (`mergeIntoMacroWorkbook`)
* Template sheet: `src/xlsx/bom.ts` (`genBomTemplateSheet`)
* TrimWB: `vba/prep.vba` (freeze loop + sheet deletions)
* SPA notes: `TODO-spa.md`
