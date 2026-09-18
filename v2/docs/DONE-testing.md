# TODO: Test suite

**Status:** implemented 2026-09-16 (first cut).  Vitest suite under
`tests/` with synthetic fixtures, pipeline/helper unit tests, generator
golden snapshot, VBA-merge integration test (toolchain-gated), and CLI
smoke tests — 75 tests, `make test` wired.  Deferred by decision: the
CI workflow (tests only for now) and coverage tooling.  The refresh
machinery tests are implemented alongside `DONE-reprice.md`.

Companion to `DONE-switch-to-dnames.md` and `DONE-gen-t-tab.md`: the
verification checklists in those docs become executable tests.

## Goal

Give the generator pipeline a regression net.  Much of this project's
correctness lives in *generated file layout* — the VBA macros and the
upcoming refresh feature depend on exact sheet names, coordinates,
formula shapes, and defined names — and past bugs have lived in the
pure data transforms (pricing fixes, backup pricing).  Tests validate
**structure**, not semantics.

**Hard constraint:** no real Excel in this environment.  Tests assert
sheet names, cell values, formula strings, defined names, and zip
parts via ExcelJS round-trips.  Formula *semantics* remain a manual
Excel/LibreOffice recalc smoke test (as today's `DONE-*` docs already
do for the Finder).

## Decisions

- **Framework: Vitest** — natural fit for a Vite + TypeScript project;
  snapshots built in; plain Node environment (no jsdom needed).
  Alternatives considered: `node:test` (clunky TS story, no snapshots),
  Jest (heavier, redundant with Vite).
- **Layout: everything under `tests/`** (no colocated `*.test.ts`).
- **Scripts:** `npm run test` (watch) and `npm run test:run` (CI);
  Makefile `test:` target runs `vitest run` (replacing the
  "no tests currently available" placeholder).
- **Fixtures:** tiny synthetic pricing JSON + CSVs committed under
  `tests/fixtures/` — a handful of records including at least one
  tiered SKU with a backup link, an include with region `*`, and
  reserved-price columns.  Realistic shape, minimal size.

## Layout

```
tests/
├── fixtures/
│   ├── prices.json          # synthetic PricesData (small)
│   ├── components.csv
│   ├── assumptions.csv
│   └── includes/
│       └── oracle.csv
├── unit/
│   ├── prices/              # normalize, enrich, patching, includes
│   ├── xlsx/                # xlu helpers, classify, formats
│   └── staleness/           # fingerprint/compare (when it lands)
├── integration/
│   ├── generator.test.ts    # golden-snapshot workbook layout
│   ├── vba-merge.test.ts    # mergeIntoMacroWorkbook
│   ├── libreoffice.test.ts  # headless recalc smoke (gated on soffice)
│   └── refresh.test.ts      # full reprice round-trip (implemented)
└── cli/
    └── smoke.test.ts        # exit codes + status JSON via local HTTP server
```

## What gets tested, in priority order

1. **Pure pricing pipeline** (`src/prices/`) — normalize, enrich,
   patching as pure transforms over `PricesData`: include defaults,
   region `*` expansion (eu-de/eu-nl), patch application, natural sort.
   Where the historical bugs lived.
2. **Generator layout — golden snapshots** (`src/xlsx/`).  Generate a
   workbook from the fixtures and:
   - load it back with ExcelJS; assert sheet order/names, Prices
     header `(key)` markers, autofilter, BOM data validations,
     `_BOMTemplate` veryHidden state, T rows;
   - dump cells + formulas to a **checked-in snapshot** so any
     accidental layout/formula drift shows up as a reviewable diff —
     layout stability is a feature (VBA and refresh depend on it);
   - assert the defined-names set — turns the TODO docs' checklists
     (three range names, no per-cell bloat) into executable tests;
   - assert `modernizeWorkbookMetadata` output (calcId markers,
     `xda:dynamicArrayProperties` on every sheet).
3. **VBA merge** (`vba.ts`) — see fixture decision below.
4. **Refresh machinery** (as it lands):
   - `compareSourceMeta` matrix: unchanged / changed / missing keys /
     dropped includes;
   - `extractSourceMeta` round-trip canary (generate → extract +
     fingerprint → "unchanged");
   - Volumes formula parsing for BOM discovery: quoted/unquoted tab
     names, apostrophes (`'Mike''s Data'!`);
   - full refresh integration: old-style fixture → refresh → BOM data
     cells byte-identical, new Prices/Volumes/Finder, T baseline
     updated, tab order, xlsm macros preserved.
5. **CLI smoke** — local HTTP server serving fixture JSON; run the real
   CLI; assert exit codes/status (`unchanged` → 0, `forced` → 0,
   error → 2).
6. **LibreOffice recalc smoke** (gated on `soffice`) — headless
   recalculation via an `OOXMLRecalcMode=0` profile injection; asserts
   cached results: BOM `f_sku`/`f_price` resolve against the Prices
   rows, the BOM → Volumes → Prices tier link computes, Overview
   total-tabs sums agree with the BOM monthly totals, and the Finder's
   dynamic arrays evaluate.  Also LO-converts the merged xlsm as a
   loadability check.  VBA does not run in LO (TrimWB stays manual);
   LO ≠ Excel (treat results as a strong smoke).

## xlsm fixture: build vs commit

The merge tests need a macro-enabled template with `vbaProject.bin`.
The repo already treats the template as a build artifact
(`public/vba/`, `vba/.venv/`, `vba/project.xlsm` are gitignored), and
`make dev`/`build` already depend on the `vba/` toolchain (pure Python:
venv + `pyOpenVBA` from PyPI — no Excel/COM).

|                       | Commit fixture                     | Build via toolchain                 |
|-----------------------|------------------------------------|-------------------------------------|
| Hermetic `npm test`   | yes (no Python, offline, fast)     | no (needs python3 + venv + PyPI)    |
| Drift vs VBA sources  | **risk** — fixture goes stale, merge tests validate the wrong template | none by construction — tests always run against what `make vba` ships |
| Git policy            | breaks "generated artifact" convention; binary, unreviewable | consistent with existing `.gitignore` |
| Failure modes         | forgotten manual refresh          | toolchain drift (accepted — deliberately unpinned, see below) |
| CI cost               | trivial                             | venv bootstrap, cacheable in Actions |

**Decision: build via the toolchain**, with `describe.skipIf` when
Python/pyOpenVBA is unavailable locally; CI always provides it (venv
cached).  `pyOpenVBA` stays **deliberately unpinned**: the project is
active and new releases should be exercised — a toolchain breakage
surfaces as a test failure and gets triaged as such.  Escape hatch if
hermeticity ever wins: commit one minimal fixture *plus* a drift-check
test comparing it to a freshly built template when the toolchain
exists.

## Coverage tooling

Coverage measures which lines/branches/functions of source code
execute during a test run, reported per file.  Two Vitest providers:

- `@vitest/coverage-v8` — Node's native V8 counters: no
  transformation, fast, branch coverage approximate.
- `@vitest/coverage-istanbul` — instruments the code first: slower,
  exact statement/branch/function metrics.

Output: terminal summary, per-file tables, HTML annotated source,
LCOV/JSON for CI inline annotations.  Vitest thresholds can fail a
build when coverage drops (e.g. `src/prices/**` < 85% lines).

Caveats: line coverage measures *execution*, not *assertion quality*;
100% targets invite meaningless tests; UI/glue code skews numbers.

**Decision:** `@vitest/coverage-v8`, `coverage.include` limited to the
pure modules (`src/prices/**`, `src/xlsx/**` helpers, and later
`staleness.ts`/`reprice.ts` — excluding the React UI).  Start
**advisory** (report in CI, no thresholds); once the suite matures,
add thresholds on the highest-risk modules — pipeline + refresh logic —
so regressions in untested branches get caught.

**Deferred (2026-09-16 decision):** coverage tooling not installed yet —
tests first; add `@vitest/coverage-v8` + the advisory report when CI
lands.

## CI

A workflow job: `npm ci` → lint → build → `make vba` (venv cached) →
`vitest run --coverage`.  Slots alongside the existing deploy
workflows.

**Deferred (2026-09-16 decision):** GitHub Actions skipped for now —
the suite runs locally via `make test`; add the workflow when wanted.

## Non-goals (for now)

- **React UI component tests** — jsdom + Testing Library deferred; the
  UI is the least regression-prone part of the project.
- **Excel-exact recalculation** — stays a manual matrix: the
  LibreOffice recalc smoke (gated test) is a close approximation, not
  a guarantee of identical Excel results, and VBA (TrimWB) never runs
  outside real Excel.

## Notes / open questions

- `pyOpenVBA` deliberately unpinned — see the xlsm-fixture decision
  above.
- Coverage thresholds: decide per-module values once the initial suite
  exists; keep the first cut advisory.
- Snapshot files are generated; review their diffs like code changes.
- Binary fixture fallback (committed template + drift check) remains
  documented as the escape hatch if hermetic local runs become a
  requirement.

***
* VBA toolchain: `vba/pys.sh`, `vba/vbabb` (pyOpenVBA, no Excel/COM)
* Ignored artifacts: `.gitignore` (`public/vba/`, `vba/.venv/`,
  `vba/project.xlsm`)
* Makefile placeholder to replace: `test:` ("no tests currently
  available")
