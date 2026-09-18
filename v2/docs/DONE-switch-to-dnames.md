# TODO: Switch Prices ranges to defined names

**Status:** implemented 2026-09-16.  `genPriceSheet` defines the three
`PriceList*` range names and emits them in BOM formulas; the per-cell
`PriceListDescs` stamping is gone; `FORMAT_VERSION` bumped to `2.0.1`;
TrimWB rewritten prefix-driven; tests extended (names/ranges, formula
emission, round-trip, xlsm merge) — 52 passing.  Real-Excel items
(repair prompts, recalc timing, TrimWB execution) remain manual — see
the checklist.

## Goal

Decouple the BOM (Components) tabs' pricing lookups from the Prices
sheet's physical row bounds, so the upcoming refresh feature can
regenerate the Prices sheet without editing any BOM formula cell.

Today `genPriceSheet` bakes literal `Prices!$col$1:$col$NNN` ranges
into every BOM lookup formula; the refresh would have to rewrite
those ranges on user-owned tabs every time the record count changes.
Replacing the literals with workbook-scoped defined names moves the
one thing that changes — the bounds — into the name definitions in
`workbook.xml`.

## Why not full-column references (`Prices!$B:$B`)

The BOM lookups are array-form `INDEX/MATCH`:

```
MATCH(1, INDEX((Prices!$B$1:$B$5369 = desc) * (Prices!$X$1:$X$5369 = region), 0), 0)
```

That pattern materialises a comparison array over the whole referenced
range.  Bounded at ~5.4k rows today it is trivial; pointed at `$B:$B`
it becomes a 1,048,576-row array per lookup, and each BOM row carries
~10 Prices-referencing formulas (`f_sku`, `f_evs_id`, `f_backup_idx`,
vCPU/RAM, prices, reserved prices…).  A 100-row BOM would mean hundreds
of millions of comparisons per recalculation — the classic "works, but
why is my sheet slow" trap.  Bounded names keep today's performance.

## Design

Three workbook-scoped names, defined by `genPriceSheet` on the fresh
bounds:

| Name              | Range                                        | Notes                              |
|-------------------|----------------------------------------------|------------------------------------|
| `PriceListDescs`  | `Prices!$B$1:$B$<bottom>`                    | reuses the existing DV list name   |
| `PriceListRegions`| `Prices!$<region>$1:$<region>$<bottom>`      | live region column via `pricesLayout()` |
| `PriceListTable`  | `Prices!$B$1:$<lastCol>$<bottom>`            | B .. last data column              |

**Invariant — all three ranges must start at the same row (1).**
`MATCH` returns positions within the desc/region ranges that `INDEX`
then uses as row indices into the table, so the three starts must stay
aligned.  The current literal defs already start at row 1; keep it that
way (do not "optimise" to the first data row, 4).

**Naming rule — every defined name referring into the Prices sheet
starts with `PriceList`.**  Tooling (TrimWB freeze/delete, DV cleanup,
future features) matches the prefix by enumerating `ThisWorkbook.Names`
(`Name Like "PriceList*"`) instead of hardcoding a list, so additional
Prices names (e.g. a backup-index range) are picked up automatically.

### Changes

1. `src/xlsx/prices.ts` — after `pricesLayout()` computes `bottom` /
   `lastCol`, define the names through
   `workbook.definedNames.add('Prices!$B$1:$B$' + bottom, 'PriceListDescs')`
   (likewise regions/table), and **drop** the per-row
   `cell.name = 'PriceListDescs'` stamping in the record loop.  The
   `refMap` defs (`prices_desc` / `prices_region` / `prices_table`) now
   resolve to the bare name strings (locked — see Notes).
2. `src/xlsx/bom.ts` — the `{PRICES_DESC}` / `{PRICES_REGION}` /
   `{PRICES_TABLE}` placeholders resolve to the three names instead of
   literal ranges.  The formula templates themselves do not change.
3. `src/xlsx/constants.ts` — bump `FORMAT_VERSION` `2.0.0` → `2.0.1`
   (generated formula shape changed; the refresh feature's format
   warning fires appropriately for pre-change workbooks).
4. `src/xlsx/finder.ts` — unchanged.  The Finder is regenerated in
   lockstep with Prices on every refresh, so names buy nothing there;
   its literal bounded ranges are fine.
5. BOM `f_desc` data validation (`val: 'PriceListDescs'`) — unchanged.
   A range name is a valid list source, so the Description dropdown
   keeps working.

### Side benefit: definedNames bloat

`genPriceSheet` currently stamps `PriceListDescs` as a per-cell name on
every Prices data row (~5.4k cells), which ExcelJS emits as one
multi-area `<definedName>` with thousands of refs, purely so the BOM
Description dropdown can reference it.  Defining it once as a range
name keeps the DV working and shrinks the definedNames block to a
handful of entries (smaller file, faster open).

## Refresh-side migration — obsolete

Originally planned for pre-2.0.1 workbooks; dropped 2026-09-16 by
decision: everything is unreleased and no legacy spreadsheets exist,
so no literal-range migration is needed.  (The `PriceList*` names were
adopted directly in the generator; `T_ONE_TIME` followed the same
route as a defined name.)

## ExcelJS notes (verified against 4.4.x)

- API: `workbook.definedNames.add(locStr, name)` where `locStr` may be
  `Sheet!$c$r` or a range `Sheet!$c1$r1:$c2$r2`.  Contiguous cells
  collapse to a single range on write (`getRanges` mark-and-sweep in
  `lib/doc/defined-names.js`).
- Round-trip: `workbook.xlsx.load` reads `<definedNames>` into
  `workbook.definedNames.model` (`lib/xlsx/xlsx.js`), and
  `workbook-xform` renders them on write — names survive an ExcelJS
  round-trip.
- `cell.name` is what creates the current per-cell multi-area name;
  removing the stamping removes the bloat.
- `mergeIntoMacroWorkbook` (`src/xlsx/vba.ts`) already splices
  `<definedNames>` from the generated content into the macro host's
  `workbook.xml` when absent — names should survive the xlsm merge;
  smoke-test regardless.

## Impact on TrimWB (`vba/prep.vba`)

TrimWB freezes formulas referencing the Prices sheet by searching for
the literal text `Prices!` / `'Prices'!` in formulas, then deletes
Tools/Prices/Volumes/Finder/_BOMTemplate.  The switch changes what the
BOM formulas contain, so:

- **The freeze step becomes prefix-driven.**  After the switch the BOM
  pricing formulas contain `PriceListTable` / `PriceListDescs` /
  `PriceListRegions` instead of `Prices!` literals — the existing
  search would match nothing, and deleting Prices would turn the names
  into #REF! across every BOM compute column.  Instead of three
  hardcoded patterns: enumerate `ThisWorkbook.Names`, and for each
  name where `nm.Name Like "PriceList*"` run the existing Find/freeze
  loop (`Find What:=nm.Name`, `xlFormulas`, `xlPart`) on every sheet
  except Prices/Volumes.  Keep the two literal `Prices!` patterns as
  belt-and-braces.  (VBA `Like` is case-sensitive under
  the default `Option Compare Binary` — keep the `PriceList` casing
  consistent, or compare via `UCase$()`.)
- **Delete every `PriceList*` name in the trimmed copy** (same
  enumeration, `nm.Delete` under `On Error Resume Next`), otherwise the
  trimmed file ships #REF! name definitions.
- **The `PriceListDescs` DV:** the BOM Description dropdown's list name
  references Prices cells and already goes #REF! in trimmed workbooks
  today.  Apply the same prefix rule to data validations — remove (or
  replace) any DV whose formula1 starts with `PriceList` during trim.
- **Macro drift across refreshes (settled in `DONE-reprice.md`):**
  the macro host is input-driven — the CLI uses the `--xlsm` template
  when provided, else the original file's own project; the SPA uses
  the template served by the web server.  Refreshing without a
  template keeps the file's own macros, whatever vintage they are.
- **AddBOM is unaffected** (clones `_BOMTemplate`; touches Volumes and
  Overview only, never Prices).
- The reference-map comment at the top of `prep.vba` needs updating
  ("everything else references neither" is no longer true — the BOM
  tabs reach Prices through the names).

## Verification checklist

- [x] `make xlsx` and `make xlsm` build; both open without repair
      prompts — builds verified via tests + CLI smoke; the real-Excel
      "opens without repair" pass is manual.
- [x] BOM formulas reference the `PriceList*` names (generator test +
      live CLI smoke).
- [x] BOM formulas recalculate — LibreOffice recalc smoke resolves
      `f_sku` / `f_price` / the tier link / Overview / Finder
      end-to-end (LO ≠ Excel: smoke, not proof).
- [x] Description dropdown on a BOM tab still lists price descriptions
      (DV name unchanged — test).
- [x] Name Manager shows the three range names as single ranges
      (definedNames model test).
- [x] xlsm: names present after the macro merge (vba-merge test).
- [x] ExcelJS round-trip test: load generated file, save, load again →
      names intact.
- [ ] Full-recalc timing comparable to the pre-change build (no
      full-column regression) — manual, real Excel.
- [x] No legacy-migration code carried — unreleased, no pre-change
      workbooks exist (decided 2026-09-16); the names were adopted
      directly.
- [ ] TrimWB on a 2.0.1 workbook: BOM pricing formulas freeze to
      values; trimmed file has no #REF! names; no repair prompt —
      manual, real Excel.
- [ ] TrimWB is prefix-driven: a dummy extra `PriceList*` name is
      frozen and deleted automatically (extensibility canary) —
      manual, real Excel.

## Notes

- **Name convention:** plain `PriceList*` names chosen, consistent with
  the existing `PriceListDescs`.  Collision with user-created names is
  theoretical; documented here as the accepted risk.
- The names must be **workbook-scoped** (BOM tabs reference them from
  other sheets).
- **refMap convention (locked):** `refMap` values are plain strings
  spliced by `resolveFormula`, and three styles coexist by convention:
  1. **literal A1 refs** in formulas (`'T'!$C$10`, `Assumptions!$D$5`,
     `Prices!$B$1:$B$5308`, `Components!$J:$J`);
  2. **bare defined-name strings** in validation lists (`BACKUP`,
     `RXM`, `REGIONS`, `EVS`, `PriceListDescs` — string `vlist` args
     emit unquoted name references; arrays emit quoted inline lists
     like `"Y,N"`);
  3. **bare names inside formulas** — the `#KEY` assumption convention
     (`def(refMap, name, name)` in `params.ts`) and formula fragments
     (`esa.ts` `def(refMap, 'ESA_UPLIFT', formula)`).
  This switch resolves `refMap['prices_desc'/'prices_region'/
  'prices_table']` to style 3: the bare name strings `PriceListDescs` /
  `PriceListRegions` / `PriceListTable`, so BOM formulas emit
  `INDEX(PriceListTable, …)` etc.  `genPriceSheet` still computes the
  literal bounds — the names are defined *from* them, and the Finder
  keeps its literal ranges (regenerated in lockstep).
- Future: the parked "revive trimmed workbooks" feature can also
  redefine these names once the frozen BOM formulas are recreated.
- Parent plan: `DONE-reprice.md` — the refresh feature this switch is
  a prerequisite for.

***
* ExcelJS defined names: `node_modules/exceljs/lib/doc/defined-names.js`
* Workbook rendering: `node_modules/exceljs/lib/xlsx/xform/book/workbook-xform.js`
* Current literal defs: `src/xlsx/prices.ts` (`genPriceSheet`, `refMap` defs)
* BOM consumers: `src/xlsx/bom.ts` (`COMPUTE_COLS` formulas, `f_desc` DV)
