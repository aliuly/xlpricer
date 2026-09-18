# TODO: Price Finder (static, no VBA)

**Status:** implemented (see `src/xlsx/finder.ts`).  A searchable filter
interface over the Prices sheet, generated statically by the TypeScript
writer.  No VBA involved; `TrimWB` simply deletes it from trimmed
workbooks.

## Goal

Let a user browse the 5,000+ row Prices sheet interactively.  Filters are
cascading:

- `productFamily` — static dropdown, defaults to `Compute`, **always
  applied** (no `(all)` option; a different family can be selected)
- `description` — dynamic dropdown listing the distinct descriptions
  of the rows matching **all the other criteria** (family, productId,
  osUnit, storageType, serviceType, region, vCpu/RAM ranges), defaults
  to `Virtuelle Maschine`.  Blank or `(all)` bypasses it; anything
  else must equal the description exactly (case-sensitive).
- `productId`, `osUnit`, `storageType`, `serviceType` — dynamic dropdowns
  whose options are restricted to the selected productFamily
- `region` — static dropdown: build-time list of all distinct regions
  with an `(all)` sentinel; not restricted by the other filters
- Range filters: min/max `vCpu`, min/max `ram`
- Results show: `_XlTitle_` (Prices column B, headed **Description** in
  line with the Components tabs, formatted like the BOM Description
  columns), `region` (headed **Region**, right after Description),
  `vCpu`, `ram`, `priceAmount`, `unit` (right of priceAmount),
  `R12`, `R24`, `R36`

Every dropdown sentinel is the plain string `(all)` — one uniform
pattern, no per-field special cases.  Clearing a dropdown (leaving it
blank) is equivalent to selecting `(all)`.

**`productIdParameter` is deliberately omitted** — it is redundant with
`productId`.  Verified against the live prices data: 6,024 rows, 102
distinct `productId` values mapping 1:1 onto 102 distinct
`productIdParameter` values (no blanks, no multi-valued pairs), so
filtering by either selects exactly the same rows.  `productId` is kept
because it is the identifier the EAP pricing CSV carries.  Re-add the
second field only if the mapping ever stops being 1:1.

**Sheet name: `Finder` (visible).**

## Decision

Generate the Finder as a **normal sheet in the writer** (static), so it
works in **every output** (plain `pricing.xlsx`, the macro-enabled
`pricing.xlsm`, and the future SPA output) with zero VBA.  The VBA-based
alternatives were considered and rejected — see below.

Requires **Excel 2021/365** (dynamic arrays).  Acceptable: the target
environment is Microsoft 365 (SharePoint/AutoSave).

## Considered alternatives (VBA)

**VBA-driven sheet UI.**  A `Finder` sheet created at open time by a macro
(same pattern as the Tools sheet): filter cells with data-validation
dropdowns populated by VBA from the Prices columns, a form-control Search
button, and a results block written by a VBA loop over the ~5,400 Prices
rows.  This was the original plan ("Option A").

- Pros: works in any Excel version (no dynamic arrays needed); results are
  plain cells the user can sort and copy.
- Cons: the feature exists only in macro-enabled workbooks — the plain
  `pricing.xlsx` output and trimmed deliverables lose it, and the future
  SPA output would need the same logic ported yet again.  It adds a module
  plus a Tools button and a few hundred lines of filter/loop VBA to
  maintain, and TrimWB must remember to delete the sheet.
- Rejected in favour of the static version once it became clear the whole
  UI can be expressed with validation lists + dynamic-array formulas.

**UserForm dialog.**  A real modal dialog authored at build time via
pyOpenVBA (`ExcelFile.add_form` + controls), with ComboBoxes, min/max
textboxes, a multi-column ListBox for results, and code-behind event
handlers ("Option B").

- Pros: app-like dialog feel; results contained in the form; a
  double-click could jump to the matching Prices row.
- Cons: adds a Python form-authoring step to `make vba` (designer storage,
  control geometry, event wiring); the form's code-behind lives outside
  the regular modules; and it still only exists in macro-enabled files.
- Rejected: the dialog polish does not justify the extra build machinery
  when the sheet version fits how the workbook is already used.

## Results format — deliberately NOT Components-tab shaped

We considered making the results row match the Components (BOM) tab row
format so a user could copy a row and insert it into a Components tab.
Rejected: the only piece of data that actually needs to be transferred into
a BOM tab is the `_XlTitle_` value (the BOM pricing formulas look the rest
up from the title), so a full BOM-shaped row buys nothing and makes the
output ugly.  Results are the slim column set listed above.

## Prices sheet reference (src/xlsx/prices.ts, genPriceSheet)

- Row 2: title "Price List"
- Row 3: header row, cells formatted `"<label>\n(<key>)"` — columns are
  located by the `(<key>)` marker at runtime, never by hard-coded letters
- Data rows from row 4 (~5,364 records), autofilter applied, panes frozen
- Column B = `_XlTitle_`, then one column per key in `prices.keys` order
  (keys with null labels are skipped: `_XlTitle_`, `_apiGrp`, `_idGroup`),
  final column = Backup Index (`_backup_idx_`)

Keys in order: `id, idGroupTiered, productId, opiFlavour, productName,
osUnit, currency, priceAmount, unit, description, vCpu, ram, additionalText,
storageType, storageVolume, serviceType, productIdParameter, productSection,
productType, productFamily, productCategory, fromOn, upTo, minAmount,
maxAmount, region, isMRC, R12, R24, R36, RU12, RU24, RU36`

**First implementation step:** re-verify the header row and column mapping
against a fresh `make xlsm` build (an earlier inspection of a stale build
showed the header row missing — confirm before writing formulas).

**Verification result (2026-09):** the header row **is** present in fresh
builds (Prices row 3; data rows 4–5366 for the current 5,363 records).
Real column map: B=`_XlTitle_`, then one column per key in `prices.keys`
order skipping null-label keys — `id`=C … `RU36`=AI, `_backup_`=AJ,
Backup Index=AK.  Of interest to the finder: productFamily=**V(22)**,
description=**L(12)**, vCpu=**M(13)**, ram=**N(14)**, priceAmount=**J(10)**,
productId=**E(5)**, osUnit=**H(8)**, storageType=**P(16)**,
serviceType=**R(18)**, region=**AB(28)**, R12/R24/R36=**AD/AE/AF(30–32)**.
The letter examples in this doc are from a stale build and are superseded:
the finder computes every column at generation time via a shared
`pricesLayout()` helper (also used by `genPriceSheet`), so schema changes
flow through automatically.

## Finder sheet design

```
 B                 C..F (merged)           G           H     I    J     K
 Product Family   [Compute           v ]  vCpu   min  [ 2 ]  max  [ =I3 ]
 Region           [(all)             v ]  RAM    min  [ 8 ]  max  [ =I4 ]
 productId        [(all)             v ]
 storageType      [(all)             v ]  Description [ Virtuelle…     v ]
 serviceType      [(all)             v ]
 osUnit           [(all)             v ]
 ...

 Results (247 matches)
 Description  Region  vCpu  RAM  priceAmount  unit  R12  R24  R36  Row
 <spill> ...                                                <spill>
```

(Column widths are sized for the RESULTS columns.  The left dropdowns
merge C..F on their rows; the Description dropdown merges H..K on the
storageType row.  The **Row** column is the shared index: it resolves
the criteria once into sorted Prices row numbers, and every other
results column INDEXes its Prices column with those numbers.  L and M
are spacer columns before the dropdown helper lists in N–R.)

- **`productFamily`** — build-time list of distinct values, defaults to
  `Compute`, no `(all)` option: the family filter is always applied.
- **`region`** — build-time list of all distinct regions (snapshot at
  generation time), sentinel `(all)`; not restricted by the other
  filters.  Sits in the second filter row (C4), where Description used
  to be.
- **`description`** — dynamic dropdown in H6:K6 (merged), next to
  storageType, with its label in G6.  Its options are the distinct
  descriptions of the rows matching **all the OTHER criteria** —
  family, productId, osUnit, storageType, serviceType, region and the
  vCpu/RAM ranges — so the list always reflects the rest of the filter
  state (the dropdown narrows as the other filters narrow).  Same
  helper-block machinery as the other dynamic dropdowns: `(all)` plus
  sorted unique values plus `(blank)` when the scope has blanks,
  pre-selected to `Virtuelle Maschine`:

```
=VSTACK("(all)", SORT(UNIQUE(FILTER(IF(Prices!$L$4:$L$5369="","",
    Prices!$L$4:$L$5369),
    <other criteria>))), <"(blank)" when the scope has blanks>)
```

  Matching is a case-sensitive **equality** (the case-insensitive
  contains scan was too slow), guarded so blank or `(all)` passes
  everything:

```
($H$6="") + ($H$6="(all)")
  + (Prices!$L$4:$L$5369=$H$6)
```
- **`productId`, `osUnit`, `storageType`, `serviceType`** — dynamic
  dropdowns restricted to the selected productFamily only.  All four
  inputs sit in the merged C..F cells of their rows
  (C5, C8, C6, C7); osUnit is the last left-side row, below
  serviceType, so the right side holds only typed inputs (Description
  plus the vCpu/RAM min/max boxes):

```
=VSTACK("(all)", SORT(UNIQUE(FILTER(Prices!$E$4:$E$5369,
    Prices!$V$4:$V$5369=$C$3))))
```

  All of these refresh automatically when the Prices data or a parent
  filter changes — no regeneration needed.  Spill references as
  validation sources require Excel 365, which the finder already requires.
- **Number boxes** for `vCpu`/`ram` min/max: the min inputs are I3
  (vCpu) and I4 (RAM); the max cells K3/K4 mirror the min with
  `=IF(I3="","",I3)` / `=IF(I4="","",I4)` — typing just a min gives
  an exact match, and typing a max directly overwrites the formula to
  set a range.  Empty bound = no bound.
- **Results** — the criteria are resolved **once** into sorted Prices
  row numbers (column K, right of R36):

```
=IFERROR(VSTACK(SORTBY(FILTER(ROW(Prices!$B$4:$B$5369),
        <criteria>),
      FILTER(Prices!$J$4:$J$5369, <criteria>)),
    <"" padding to the fixed size>), "")
```

  and each visible column is a cheap read against that index:

```
=IFERROR(INDEX(Prices!$L$4:$L$5369, $K$11:$K$5369-3), "")
```

  (position = Prices row − `firstRow` + 1).  One FILTER/SORTBY pair
  instead of one FILTER/SORT per column.  Match count via
  `ROWS(FILTER(<title col>, <criteria>))`.
  Only R12/R24/R36 are shown (RU12/RU24/RU36 are deliberately omitted).

## Implementation

Implemented as:

- `src/xlsx/finder.ts` — `genFinderSheet()` writes a "Price Finder"
  title in row 1 (same style as the other sheets; column A is a thin
  empty spacer), the filter grid
  (rows 3–8: family/region/productId/storageType/serviceType/osUnit
  labels in B3–B8 with their dropdown inputs merged across C..F;
  vCpu/RAM labels in G3/G4 with min/input/max/input at H/I/J/K —
  the max cells mirror the min cells via `=IF(I3="","",I3)` /
  `=IF(I4="","",I4)`; description label in G6 with its input merged
  across H6:K6 and guarded exact match — blank or `(all)` bypasses).
  Column widths are sized for the results columns.  Then the
  dropdown helper lists (N4–R4; columns left visible for now with
  labels in row 3; L and M are spacer columns between the
  interface/results and the helpers), and the results
  block
  (count in B9, headers in row 10; column K holds the shared
  match-row index — `SORTBY(FILTER(ROW(…)), FILTER(priceAmount))`
  resolves the criteria once, padded to the fixed size — and each
  visible column B–J is a cheap `INDEX(<prices column>, K-block −
  firstRow + 1)` array formula; the first results column is headed
  "Description" like the Components tabs and carries the BOM
  Description column format — light-grey fill + wrap text — with
  "Region" right after it and "unit" right after priceAmount).
  Column letters and offsets are all derived from `pricesLayout()` —
  nothing is hard-coded.
- Wired into `writer.ts` after `Prices`; included in **both** xlsx and
  xlsm outputs, sheet name `Finder`, visible.
- The static dropdowns (`productFamily`, `region`) reuse
  `dataValidationList`; their lists come from the prices records at
  generation time.  The five dynamic dropdowns (description +
  productId + osUnit + storageType + serviceType) reference the helper
  blocks as plain ranges (`$N$4:$N$131` … `$R$4:$R$38`); DV lists
  skip blank cells, so the
  blocks' empty padding never shows in the dropdowns.
- Formulas use the OOXML `_xlfn.`/`_xlfn._xlws.` function spellings
  (`VSTACK`, `SORTBY`, `FILTER`/`SORT`/`UNIQUE`) — the only
  spellings the file format accepts (plain names get repaired out of
  the file).  Note: `UNIQUE` and `SORTBY` are plain `_xlfn.` names,
  only `FILTER`/`SORT` use the `_xlws.` namespace (LibreOffice does
  not map `_xlfn._xlws.SORTBY`, so the shared index uses
  `_xlfn.SORTBY`).
- **Array storage** (empirically required — the target Excel loads
  generated dynamic-array formulas as legacy, inserting `@` into
  plain `<f>` formulas and treating `t="array"` formulas as fixed
  CSE arrays): every finder formula is written as `<f t="array"
  ref="…">` with the ref spanning the **maximum** possible output
  (computed at generation time: 5363 rows for the results block,
  per-key distinct-count maxima for the helper lists).  Each formula
  pads its result with `""` up to the fixed size (hidden count cells
  S3/S4:S8 and blank-flag cells T4:T8 drive the padding via a
  legacy-safe `ROW(INDEX(…):INDEX(…))` expression), so unused slots
  are blank and filter changes re-fill the fixed block.  All rows of
  the fixed results arrays carry the column number formats, not just
  the anchor row.
- Dropdown lists append a `(blank)` sentinel when the current scope
  has empty values; selecting it matches blank cells (the criteria
  treat `(blank)` as "value is empty"), restoring blank-selectable
  filtering.
- ExcelJS stamps the workbook with ancient engine markers
  (`rupBuild=9303`, `calcId=171027`); the generated zip is
  post-processed by `modernizeWorkbookMetadata()` to stamp the
  current markers (`lastEdited=7`, `rupBuild=30228`,
  `calcId=191029`, the calcFeatures block, and per-sheet
  `xda:dynamicArrayProperties`).
- Defaults: productFamily = `Compute` (first family if absent),
  description = `Virtuelle Maschine` (pre-selected), every other
  filter = `(all)`, min/max empty (= no bound).
- `vba/prep.vba` TrimWB: `"ECS finder"` added to the sheet-deletion list
  (its `Prices!` formulas are frozen to values by the existing freeze
  step before deletion, then the sheet is deleted with Prices).

## Notes / open questions

- Default filter values: decided — family `Compute`, description
  input pre-set to `Virtuelle Maschine` (applied as an exact-match
  filter), everything else `(all)`.
- Performance: the description filter is a plain case-sensitive
  equality — the case-insensitive contains scan was too slow — and
  the results block resolves the criteria only once into the shared
  match-row index (column K), with the visible columns INDEXing from
  it: one FILTER/SORTBY pair instead of one FILTER/SORT per column.
  The Description dropdown is its own dynamic helper list scoped to
  all the OTHER criteria (one more FILTER/UNIQUE/SORT chain).
  A LibreOffice recalc smoke test over the full data set evaluates
  instantly and the fixed arrays re-fill correctly when the filters
  change.
- The match count lives in a hidden cell (S3) as its own
  `IFERROR(ROWS(FILTER(…)),0)` formula; B9 renders it as
  `="Results ("&$S$3&" matches)"` (a plain formula, so no `@`
  upgrade applies).  The helper padding is driven by hidden per-list
  count cells (S4:S8) and blank-flag cells (T4:T8).
- Results are sorted by `priceAmount` ascending (cheapest first): the
  shared index sorts the matched row numbers with
  `SORTBY(FILTER(ROW(…), criteria), FILTER(<priceAmount>, criteria))`
  — `SORTBY` uses the plain `_xlfn.SORTBY` spelling (LibreOffice does
  not map `_xlfn._xlws.SORTBY`).  (Flip to descending by appending a
  `,-1` sort-order argument if ever wanted.)
- Helper lists wrap their source range in `IF(col="","",col)` before
  `UNIQUE` — `UNIQUE` coerces blank cells to `0`, which would put a
  spurious `0` in the dropdowns (most visible in `storageType`).
- All finder formulas are fixed-size CSE-style arrays: cells inside
  the array blocks are read-only ("You can't change part of an
  array" is expected there — edit the anchor cell only, or use the
  filter cells).  Rows beyond the current match count are blanked by
  the padding.
- **EAP pricing CSV**: Recommended finder compatible changes:
  * productFamily = Compute/Dedicated Host
  * ADD: description = Virtuelle Maschine/Dedicated Host
  * ADD: serviceType = same as opiFlavour
  
