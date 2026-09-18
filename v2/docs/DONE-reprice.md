# TODO: Workbook refresh ("reprice")

**Status:** implemented 2026-09-16.  `src/xlsx/reprice.ts` (pure core:
formula-based BOM discovery, defined-name pruning, T regen with the
`T_ONE_TIME` defined name, `_BOMTemplate` generation for
macro-enabled output) and the CLI `--update` / `--force` /
`--check-only` modes; 73 tests green incl. xlsm host variants, CLI
smoke, and a LibreOffice recalc of a refreshed workbook.  No legacy
workbooks exist (unreleased), so there is no migration machinery.
Remaining manual items: real-Excel TrimWB/AddBOM execution and
repair-prompt checks (see the checklist).  Parent plan that ties
`DONE-switch-to-dnames.md`, `DONE-gen-t-tab.md`, and
`DONE-testing.md` together.

## Goal

Refresh a stale pricing workbook with today's pricing data: fetch and
pipeline the data, then replace `Prices`, `Volumes`, and `Finder` with
freshly generated sheets (and regenerate `T` as the new baseline),
while leaving the user-owned sheets — Components tabs, Overview,
Assumptions, ESA — untouched.  The input file is never modified: the
result is a **new file**.  CLI only for now; the pure core is written
so the SPA can reuse it later.

## Scope & non-goals

In scope: xlsx and xlsm inputs; Prices + Volumes + Finder regen; T
regen; staleness check; schema/format provenance guards.

Out of scope for now:

- **Trimmed workbooks** (no Prices/Volumes) — refused with a clear
  message.  Future improvement: recreate the frozen BOM formulas from
  the current layout (they are fixed formulas, so they can be
  re-derived).
- **SPA refresh UI** — later; it reuses `src/xlsx/reprice.ts` and
  `src/xlsx/staleness.ts` unchanged.
- **xlsx ↔ xlsm conversion** — later, SPA-candidate.  Notes: xlsm →
  xlsx strips the VBA project and drops Tools + `_BOMTemplate`.
- **VBA-side repricing** — deliberately not considered: Excel's
  Internet access is unreliable in corporate networks.

## CLI surface (same entry point)

`src/xlsx/cli.ts` gains refresh mode via `--update <file>`:

```
npx tsx src/xlsx/cli.ts --update pricing.xlsm <url> [include.csv ...] \
  -o refreshed.xlsm --verbose

npx tsx src/xlsx/cli.ts --update pricing.xlsx <url> --check-only
npx tsx src/xlsx/cli.ts --update pricing.xlsx <url> --force
npx tsx src/xlsx/cli.ts --update pricing.xlsm <url> \
  --xlsm public/vba/template.xlsm -o refreshed.xlsm
```

Refresh-mode flags: `--update <file>`, `--force`, `--check-only`,
`--verbose`, `-o <file>`, `--version`, `--spa-url`, `--xlsm <file>`.
The URL stays positional and required for now (a future refresh may
default it from T's `Source URL` row).

**Rejected in refresh mode** (clear error): `--components`,
`--assumptions`, `--esa` / `--no-esa` — refresh never rebuilds the
BOM/assumptions from CSVs.

**Macro host (`vbaProject.bin`) is input-driven:** the CLI can only
produce an xlsm when a macro template is involved, so a refresh given
`--xlsm <file>` uses that template's project; without it, the ORIGINAL
file's own project is reused.  The future SPA refresh uses the
template served by the web server (`public/vba/template.xlsm`).  See
flow step 12 for the drift implications.  (Note: xlsx input + `--xlsm`
also needs the missing `_BOMTemplate` generated — flow step 8; the
conversion is not free of that step.)

Output defaults to `<stem>-reprice.<ext>` with the **same extension as
the input** (with `--xlsm`, the output is `.xlsm`, using generate
mode's extension-fixing rule).  `-o` must match and must not resolve
to the input path — both refused otherwise.

## Modules

- `src/xlsx/staleness.ts` (new, pure, browser-safe): the standalone
  check — `extractSourceMeta(ws)`, `fingerprintSourceMeta(pricingData)`,
  `compareSourceMeta(old, fresh)`, `schemaMajor(schema)`.  No I/O; the
  CLI and SPA call it differently (see DONE-gen-t-tab.md §5).
- `src/xlsx/reprice.ts` (new, pure, browser-safe):
  `refreshWorkbook(existingBytes, pricingData, opts)` →
  `{ buffer, check, warnings }`.  ExcelJS + JSZip only, no `fs`/`fetch`
  — the future SPA worker will call this directly.
- `src/xlsx/cli.ts` (extended): arg parsing + file I/O; the existing
  fetch/include/pipeline block is factored into helpers shared by the
  generate and refresh modes.

## Flow

1. Fetch pricing JSON, load include CSVs, run `processPricingData`.
2. Load the existing workbook with `workbook.xlsx.load` — works for
   xlsm too (ExcelJS ignores `xl/vbaProject.bin` on load; verified in
   the installed lib source).
3. Provenance guards:
   - no T sheet / no `Format version` row → refuse ("not an XLPricer
     v2 workbook");
   - `Prices` or `Volumes` missing → refuse ("trimmed workbook —
     refreshing trimmed workbooks is not supported yet").
4. Staleness check (skipped by `--force`): `extractSourceMeta` on T vs
   `fingerprintSourceMeta` on the fresh data → `compareSourceMeta`.
   `includes|*` keys are excluded from the comparison (custom pricing
   is user-controlled, not pipeline staleness — see
   `DONE-gen-t-tab.md` §5), so include drift alone never flags a
   workbook stale; the refresh still warns when includes are dropped.
   **Trimmed workbooks skip the check entirely** (no pricing sheets
   to compare): the rebuild proceeds without an "unchanged" return
   or a "no change detected" warning.
   - Unchanged → print `status: "unchanged"` + reasons, exit 0, write
     nothing.
   - `--check-only` → stop here: `status: "unchanged"` or
     `status: "stale"` (with the changed keys), exit 0.
   - `--force` → proceed, printing "no change detected — forcing".
5. Schema guard: `schemaMajor(old) !== schemaMajor(fresh)` → abort
   ("pricing schema identity changed: X → Y"); `--force` bypasses with
   a note.  Later dot-segments differ → warn and proceed.  `Format
   version` mismatch → warn.  (Schema identity = first dot-segment:
   `pipeline-pricing-1.0` → `pipeline-pricing-1`; a major change is
   `pipeline-pricing-2.*`, a different implementation
   `alternate-pricing-1.*`; no dot → compare the whole string — see
   `schemaMajor` in `DONE-gen-t-tab.md` §6.)
6. **BOM tab discovery** — before deleting Volumes; the formulas are
   the ground truth (user renames/reordering can't lie to them):
   - anchor: `Tab Volumes` cell in Volumes row 1 → column offset;
   - header cells in row 3 from the anchor rightwards until empty;
   - per column, take the first formula in the rows beneath the header
     and parse its sheet references
     (`=SUMIFS('Tab'!$K:$K,'Tab'!$C:$C,…)`): first range = `f_qxh`
     column, second = `f_desc`, third = `f_reg`; the sheet name is the
     tab name.  Handle quoted/unquoted names and embedded apostrophes
     (`'Mike''s Data'!`).
   - referred sheet no longer exists → warn + skip; a column without a
     formula → warn + skip; zero tabs → abort with error.
7. ~~Capture the old Prices layout~~ — removed: no legacy workbooks
   exist (everything unreleased), so there is no literal-range
   migration to prepare for.
8. Sheet swap: delete `Tools` (if present — `BuildTools` recreates it
   on open), `Prices`, `Volumes`, `Finder`; regenerate `Volumes`,
   `Prices`, `Finder` with the shared generators (`genVolumeSheet` with
   the discovered tabs and their parsed column refs, `genPriceSheet`,
   `genFinderSheet`, then `updatePrices` for the tier cross-refs), and
   restore the original tab order (`orderNo` renumbering —
   `workbook.worksheets` sorts by `orderNo`).  Prune any stale defined
   names left behind by the deletions (verify ExcelJS `removeWorksheet`
   pruning behaviour; fall back to explicit cleanup).
   **When the output is macro-enabled and the content has no
   `_BOMTemplate`** (refreshing a plain xlsx with `--xlsm`): generate
   it — extract the writer's template-sheet block into a shared helper
   (`genBOMSheet` with the `TEMPLATE_SECTION_*` blank rows) — and
   insert it between the last BOM tab and Volumes, matching normal
   generation order.  Without it the host's AddBOM macro has nothing
   to clone.  (Tools needs no action: `BuildTools` creates it on open.
   Implemented detail: the template is generated after step 10 — it
   needs the assumption refs revived from the untouched Assumptions
   sheet plus the fresh `T_ONE_TIME` — and its tab position comes from
   the `orderNo` renumbering.)
9. ~~One-time migration~~ — removed: unreleased, no legacy workbooks;
   all generated workbooks already use the `PriceList*` names.
10. Regenerate T: delete + re-add (it is last, so the position is
    free) → `genMetaSheet` with the fresh data, `--version`/`--spa-url`
    flags, and the new `sourceUrl` (per DONE-gen-t-tab.md).  The
    cell-defined names (`BACKUP`, `RXM`, `GB_TO_GiB`, `GiB_TO_GB`) are
    re-stamped by `genMetaSheet`, but clearing/deleting cells does not
    remove their entries from ExcelJS's `definedNames` matrix — prune
    stale name entries first (verify `workbook.removeWorksheet`
    pruning behaviour; fall back to explicit
    `definedNames.removeAllNames`/model rebuild).  `Generated` = now;
    `Script version` / `SPA URL` from the CLI flags; `Source URL` from
    the refresh's URL argument.
11. Post-process: `modernizeWorkbookMetadata` on the content buffer.
12. Write output:
    - xlsx → write the buffer to the new path;
    - xlsm → `mergeIntoMacroWorkbook(hostBytes, contentBuffer)` where
      the host is the `--xlsm` template when one was provided, else the
      ORIGINAL file — the `vbaProject.bin` comes from wherever the
      template comes from: with `--xlsm` the refreshed file gets the
      template's (current) macros; without it, the original file's
      macros are kept (macro drift: a file's own macros keep their
      vintage — see DONE-switch-to-dnames.md).  The host keeps its
      `ThisWorkbook` binding and identity; the `_BOMTemplate` veryHidden
      sheet survives the ExcelJS round-trip (added in step 8 when
      absent); `<definedNames>` are
      spliced by the existing merge, so the three `PriceList*` names
      survive.  The future SPA refresh uses the template served by the
      web server.
    - Print the status JSON; exit 0.  Hard errors → exit 2.

## Includes in refresh mode

Include CSVs passed positionally are pipelined and fingerprint as
usual.  If the old T records an `Includes` section and none were
passed, warn: "old workbook was built with includes <list>; none
provided — the refreshed Prices will drop them", then proceed (the
data *will* differ, so the check passes anyway).

## Status / exit codes

| status      | meaning                             | exit |
|-------------|-------------------------------------|------|
| `ok`        | refresh written                     | 0    |
| `unchanged` | staleness check found no change     | 0    |
| `forced`    | `--force` used (note printed)       | 0    |
| `stale`     | `--check-only` found differences    | 0    |
| `error`     | hard failure                        | 2    |

The JSON blob includes `reasons`/`warnings` arrays and `output` when a
file was written, matching the existing CLI's JSON style.

## Work breakdown

**Phase 0 — prerequisite refactor.** Extract the `_BOMTemplate` block
from `writer.ts` into `bom.ts` (`genBomTemplateSheet(ws, refMap)`) so
refresh step 8 reuses it.

**Phase 1 — `src/xlsx/reprice.ts` (pure core, browser-safe).**
- `parseSheetRanges(formula)` → sheet+range list (quoted/unquoted
  names, `'Mike''s Data'!`).
- `discoverBomTabs(workbook)` → per-tab `{name, qxh, desc, reg}` from
  the Volumes SUMIFS columns; warn+skip missing/empty; error on zero.
- `pruneDefinedNames(workbook, removedSheets)` → rebuild
  `definedNames.model` filtering ranges of removed sheets (verified:
  `removeWorksheet` does not prune).
- `reorderSheets(workbook, order)` → `orderNo` renumbering.
- `refreshWorkbook(existingBytes, pricingData, opts)` → the step 2–12
  orchestration; refusals as typed errors; returns
  `{ buffer, check, warnings }`.

**Phase 2 — CLI (`src/xlsx/cli.ts`).** `--update`/`--force`/
`--check-only` parsing; refresh-mode flag rejection; `--xlsm` as the
refresh host; `<stem>-reprice.<ext>` default; same-path + extension
refusals; shared fetch/pipeline helpers; status JSON + exit codes;
includes warning.

**Phase 3 — tests.** Unit: formula parsing (quoting edges), pruning,
reordering.  Integration: current-format refresh (BOM data
byte-identical, tab order, no stale names), unchanged/forced
round-trips, refusals, xlsm hosts, xlsx+template gains
`_BOMTemplate`.  CLI smoke: refresh exit codes + same-path refusal.
The LibreOffice recalc smoke re-validates the refreshed workbook's
values.

**Phase 4 — docs.** Tick the checklist, rename to `DONE-reprice.md`.

## Verification

- Unit: fingerprint/compare matrix; `schemaMajor`; Volumes formula
  parsing (quoting edge cases); pruning; reordering.
- Integration: refresh of a current workbook → BOM data cells
  byte-identical, new Prices/Volumes/Finder, T baseline updated, tab
  order restored, xlsm macros preserved.
- CLI smoke: local HTTP fixture; exit codes per the table above;
  same-path, extension, and meaningless-flag refusals.
- Manual: fresh gen → refresh (`unchanged`, exit 0, no file written) →
  mutate the fixture (or `--force`) → refresh → open/recalc in real
  Excel.
- [x] A changed source refreshes the workbook and the new baseline
      reports *unchanged* on the next check (integration + CLI smoke;
      the missing-keys fail-open case is covered by the staleness
      unit tests).
- [x] Refreshing an xlsx with `--xlsm` yields a working xlsm: the
      `_BOMTemplate` clone sheet is generated (toolchain-gated test);
      AddBOM-clones-it / Tools-builds-on-open remain real-Excel
      manual checks.
- [x] T regen prunes stale defined names — integration asserts no
      defined-name range points at a removed sheet; the "no repair
      prompt" pass remains manual.
- [x] `--check-only` path works without writing any file (CLI smoke).
- [x] LibreOffice recalc smoke re-validates a refreshed workbook
      (lookups, totals, tier link, Finder).

## Future work (parked)

- SPA refresh: upload workbook → check → refreshed download via
  `reprice.ts` in the worker.
- xlsx ↔ xlsm conversion: xlsx → xlsm comes via refresh with `--xlsm`
  (step 8 generates the missing `_BOMTemplate`); xlsm → xlsx strips
  the VBA project, drops Tools + `_BOMTemplate`.
- Trimmed-workbook refresh: recreate the frozen BOM formulas from the
  current layout.
- More years / AddBOM-template variants.

***
* Prerequisites: `DONE-switch-to-dnames.md`, `DONE-gen-t-tab.md`,
  `DONE-testing.md`
* Loader note: `node_modules/exceljs/lib/xlsx/xlsx.js` (`vbaProject.bin`
  ignored on load; never written)
* Merge machinery: `src/xlsx/vba.ts` (`mergeIntoMacroWorkbook`)
* Sheet order: `node_modules/exceljs/lib/doc/workbook.js` (`orderNo`)
* Volumes layout: `src/xlsx/vol.ts` (row 1 anchor, row 3 headers,
  SUMIFS shape)
