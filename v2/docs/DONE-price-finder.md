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
- `description` — dynamic dropdown listing the distinct descriptions of
  the selected productFamily
- `productId`, `osUnit`, `storageType`, `serviceType` — dynamic dropdowns
  whose options are restricted to the selected productFamily **and**
  description
- `region` — static dropdown: build-time list of all distinct regions
  with an `(all)` sentinel; not restricted by the other filters
- Range filters: min/max `vCpu`, min/max `ram`
- Results show: `_XlTitle_` (Prices column B, headed **Description** in
  line with the Components tabs), `vCpu`, `ram`,
  `priceAmount`, `R12`, `R24`, `R36`

Every dropdown sentinel is the plain string `(all)` — one uniform
pattern, no per-field special cases.

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
 A                   B                 C              D
 Product Family      [Compute      v]  vCpu  min  [   2 ]  max [   8 ]
 Description         [(all)        v]  RAM   min  [   8 ]  max [  64 ]
 productId           [(all)        v]  osUnit      [ (all) v ]
 storageType         [(all)        v]  Region      [ (all) v ]
 serviceType         [(all)        v]
 ...

 Results (247 matches)
 _XlTitle_                 vCpu  RAM   priceAmount   R12   R24   R36
 <spill> ...                                               <spill>
```

- **`productFamily`** — build-time list of distinct values, defaults to
  `Compute`, no `(all)` option: the family filter is always applied.
- **`region`** — build-time list of all distinct regions (snapshot at
  generation time), sentinel `(all)`; not restricted by the other filters.
- **`description`** — dynamic dropdown listing the distinct descriptions
  for the selected family (Excel 365 spill in a hidden helper column,
  validation source = `$<helper>2#`):

```
=VSTACK("(all)", SORT(UNIQUE(FILTER(Prices!$L$4:$L$5369,
    Prices!$V$4:$V$5369=$B$1))))
```

  Matching against the selection is **exact** (dropdown, not "contains").
- **`productId`, `osUnit`, `storageType`, `serviceType`** — dynamic
  dropdowns restricted to the selected family **and** description:

```
=VSTACK("(all)", SORT(UNIQUE(FILTER(Prices!$X$4:$X$5369,
    (Prices!$V$4:$V$5369=$B$1) *
    (($B$2="(all)") + (Prices!$L$4:$L$5369=$B$2))))))
```

  All of these refresh automatically when the Prices data or a parent
  filter changes — no regeneration needed.  Spill references as
  validation sources require Excel 365, which the finder already requires.
- **Number boxes** for `vCpu`/`ram` min/max; empty bound = no bound.
- **Results** = Excel 365 dynamic-array `FILTER` (spill), one formula per
  output column, e.g.:

```
=IFERROR(CHOOSECOLS(FILTER(Prices!$B$4:$AJ$5369,
    (Prices!$V$4:$V$5369=$B$1) *
    (($B$2="(all)") + (Prices!$L$4:$L$5369=$B$2)) *
    (($D$1="") + (Prices!$M$4:$M$5369 >= $D$1)) *
    (($E$1="") + (Prices!$M$4:$M$5369 <= $E$1)) *
    ... ),
  {1, 12, 13, 9, 28, 29, 30}), "")
```

  (indices are column positions within the FILTERed array; verify against
  the real column map).  Match count via `ROWS(<spill>#)`.
  Only R12/R24/R36 are shown (RU12/RU24/RU36 are deliberately omitted).

## Implementation

Implemented as:

- `src/xlsx/finder.ts` — `genFinderSheet()` writes a "Price Finder"
  title in row 1 (same style as the other sheets; column A is a thin
  empty spacer), the filter grid
  (rows 3–7: family/description/productId/storageType/serviceType in
  C3–C7, osUnit in E5, region in E6, vCpu/RAM min/max in
  F3/H3/F4/H4), the dropdown helper lists (J4–N4; columns left
  visible for now with labels in row 3; column I is a normal-width
  separator between the interface and the helpers), and the results
  block
  (count in B9, headers in row 10, one `CHOOSECOLS(FILTER(…))` array
  per column from row 11; the first results column is headed
  "Description" like the Components tabs).
  Column letters, the `B…AK` filter array bounds, and the CHOOSECOLS
  indices are all derived from `pricesLayout()` — nothing is
  hard-coded.
- Wired into `writer.ts` after `Prices`; included in **both** xlsx and
  xlsm outputs, sheet name `Finder`, visible.
- The static dropdowns (`productFamily`, `region`) reuse
  `dataValidationList`; their lists come from the prices records at
  generation time.  The dynamic dropdowns reference the helper blocks
  as plain ranges (`$I$4:$I$131` … `$M$4:$M$38`); DV lists skip blank
  cells, so the blocks' empty padding never shows in the dropdowns.
- Formulas use the OOXML `_xlfn.`/`_xlfn._xlws.` function spellings
  (`VSTACK`, `CHOOSECOLS`, `FILTER`/`SORT`/`UNIQUE`) — the only
  spellings the file format accepts (plain names get repaired out of
  the file).  Note: `UNIQUE` is plain `_xlfn.UNIQUE`, only
  `FILTER`/`SORT` use the `_xlws.` namespace.
- **Array storage** (empirically required — the target Excel loads
  generated dynamic-array formulas as legacy, inserting `@` into
  plain `<f>` formulas and treating `t="array"` formulas as fixed
  CSE arrays): every finder formula is written as `<f t="array"
  ref="…">` with the ref spanning the **maximum** possible output
  (computed at generation time: 5363 rows for the results block,
  per-key distinct-count maxima for the helper lists).  Each formula
  pads its result with `""` up to the fixed size (hidden count cells
  O3/O4:O8 and blank-flag cells P4:P8 drive the padding via a
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
  description = `Virtuelle Maschine` when present for that family
  (else `(all)`), every other filter = `(all)`, min/max empty
  (= no bound).
- `vba/prep.vba` TrimWB: `"ECS finder"` added to the sheet-deletion list
  (its `Prices!` formulas are frozen to values by the existing freeze
  step before deletion, then the sheet is deleted with Prices).

## Notes / open questions

- Default filter values: decided — family `Compute`, description
  `Virtuelle Maschine` (falling back to `(all)`), everything else
  `(all)`.
- Performance: not yet confirmed in the target Excel, but the full
  criteria over 5,363 rows evaluate instantly in a LibreOffice recalc
  smoke test (3,253 matches at the default state — Compute /
  Virtuelle Maschine; 3,267 with description `(all)`; 694 for the
  Virtuelle Maschine/eu-de 4–16 vcpu / 16–64 GiB scenario —
  cross-checked row-for-row against the pipeline data, and the fixed
  arrays re-fill correctly when the filters change).
- The match count lives in a hidden cell (O3) as its own
  `IFERROR(ROWS(FILTER(…)),0)` formula; B9 renders it as
  `="Results ("&$O$3&" matches)"` (a plain formula, so no `@`
  upgrade applies).  The helper padding is driven by hidden per-list
  count cells (O4:O8) and blank-flag cells (P4:P8).
- Results are sorted by `priceAmount` ascending (cheapest first):
  `SORT(FILTER(…), <priceAmount column>)` applied before the
  per-column `CHOOSECOLS` extraction; the sort index is derived from
  the live column map.  (Flip to descending by appending `,-1` to the
  SORT call if ever wanted.)
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
  
