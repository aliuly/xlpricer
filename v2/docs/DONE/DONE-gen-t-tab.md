# TODO: T tab changes to support repricing

**Status:** implemented 2026-09-16.  `meta.ts` (Source URL row, display
helpers, `META_*` constants), `staleness.ts` (`extractSourceMeta` /
`fingerprintSourceMeta` / `compareSourceMeta` / `schemaMajor`) with
unit + round-trip tests, and xlsm merge coverage verifying the T
content and defined names in macro-enabled output.  The refresh-side
consumers (full T regen mechanics, provenance-guard wiring) moved to
`DONE-reprice.md` (flow steps 3, 5, 10 and its verification list).

Companion to `DONE-switch-to-dnames.md`: that one makes the BOM
formulas refresh-stable, this one makes the T tab the
provenance/identity anchor the refresh checks against and rewrites.

## Goal

The T tab (the `Meta Data` sheet, last in the workbook) becomes the
single source of truth about *what pricing data is in the workbook*.
That gives the refresh feature three things:

1. a **staleness check** — compare the T-recorded source metadata with
   freshly pipelined data; unchanged ⇒ abort,
2. **safety guards** — schema (major identity) and format provenance
   checks before touching the workbook,
3. a **rewrite target** — refresh regenerates T wholesale, recording
   the new baseline for the next check.

## Current T layout (reference map)

Verified against `src/xlsx/meta.ts`:

- Sheet name is the hard-coded string `'T'` in `writer.ts`; it is added
  last, so a delete+re-add lands at the same position for free.
- Column A is a thin spacer; **B = Key, C = Value, D = Comment**
  (`C_KEY=2`, `C_VAL=3`, `C_COMMENT=4`).
- Row 2 `Meta Data` title; row 3 header; row 4 `System` section header;
  then key/value/comment rows; then the `Params`, `Includes`, `Patches`,
  `Choices`, `Units` section headers and their rows.
- Cell-defined names: `BACKUP`, `RXM` (choice lists), `GB_TO_GiB`,
  `GiB_TO_GB` (unit conversions) — stamped per cell via `cell.name`.
- System rows today: `Generated`, `Script version`, `SPA URL`, `Schema`,
  `Format version`, `Pricing Data`, `Non-recurrent items`.

```
 A  B               C                D
    Meta Data
    Key             Value            Comment
    System
    Generated       dd-mm-yyyy       by XLpricer SPA
    Script version  <git describe>   TypeScript
    SPA URL         http://.../      ...
    Schema          pipeline-pricing-1.0 ...
    Format version  2.0.1            ...
    Pricing Data    dd-mm-yyyy       ...
    Source URL      https://...json  ← new
    Non-recurrent items  Item/ot     ...
    Params ...
    Includes ...
    Patches ...
    Choices ...
    Units ...
```

## Recommended changes

### 1. New System rows

| Key              | Source field            | Written when        | Fingerprint? |
|------------------|-------------------------|---------------------|--------------|
| `Source URL`     | caller-supplied URL     | always              | **no** — default-URL hint only |

- `genMetaSheet` gains a `sourceUrl: string` parameter; callers pass it:
  CLI `src/xlsx/cli.ts` (the URL argument), SPA worker
  `src/homeTab/xlsxWorker.ts` (`req.dataUrl`), via a new
  `AppMeta.sourceUrl` field in `src/xlsx/writer.ts`.
- `Source URL` sits after `SPA URL`; any pricing-identity rows sit next
  to `Pricing Data`.
- `generatedBy` is deliberately **not** recorded: the generator doesn't
  matter, only the formatted contents do.

Timestamp granularity: the upstream job publishes at most once a day
and only re-publishes when its own checksum changed, so a new
`Pricing Data` date is stamped **iff the content actually changed** —
the date is a complete signal, not a proxy.  Intraday precision
(`datetime`) and the content hash (`cksum`) are therefore deliberately
**not** recorded.  Old files lacking any fingerprint keys read as
"changed" by construction (fail-open) and re-baseline after refresh.

### 2. `META_SHEET_NAME` constant

`constants.ts` exports `META_SHEET_NAME = 'T'`; `writer.ts` uses it to
create the sheet and the future `src/xlsx/staleness.ts` uses it to find
the sheet to read.  (Name stays `'T'` — compatibility with existing
workbooks is the whole point of reading it.)

### 3. Shared value-display helpers

The staleness fingerprint must byte-match what `genMetaSheet` writes,
or every comparison reads as "changed".  Extract the display rules into
small helpers exported from `meta.ts` and used by both writers/readers:

- params: array → `join(',')`; object → flatten `key=value` pairs
  joined with `,` (locked; today an object would stringify to
  `[object Object]` via `writeCell`),
- includes: `string` → itself, object → `.version` (comment carries
  sha/message),
- patches: value = `count`, comment = description,
- timestamps: `fmtEpoch` for epoch numbers — date only, per the
  granularity decision above,

### 4. Full T regeneration on refresh

**Moved to `DONE-reprice.md`** (flow step 10): the refresh deletes +
re-adds T and reruns `genMetaSheet` with the fresh data; stale
defined-name entries must be pruned first.

### 5. Staleness contract (read side)

The future `src/xlsx/staleness.ts` module (standalone, no I/O, shared
by CLI and SPA) consumes exactly this layout:

- `extractSourceMeta(ws)` walks B/C/D rows, tracks the section headers,
  and emits normalised keys:
  `schema`, `pricing-data`, `params|<key>`, `includes|<group>`,
  `patches|<label>`.
- `fingerprintSourceMeta(pricingData)` builds the same key shape from
  fresh data (sharing the §3 helpers).
- `compareSourceMeta(old, fresh)` — **changed** when:
  - any shared key's value differs, or
  - fresh has keys the old file lacks, or
  - the old file has keys fresh data lacks.
  **Unchanged only when key sets are equal and all values match**
  (fail-open for older files, which lack some fingerprint keys).
  `includes|*` keys are **excluded from the comparison on both
  sides**: custom pricing is user-controlled, not pipeline state —
  include drift (standard or custom) never flags a workbook stale.
  The keys are still recorded on T and in the fingerprint for
  display and refresh-time warnings.
- Deliberately **excluded** from the fingerprint: `Generated`, `Script
  version`, `SPA URL`, `Source URL`, `Format version`,
  `Non-recurrent items`, `Choices`, `Units`.

### 6. Provenance guards consumed from T (refresh side)

**Moved to `DONE-reprice.md`** (flow steps 3 and 5): no-T/Format-version
refusal, the first-dot-segment schema identity abort (`--force`
bypasses), and the Format-version warning.  `schemaMajor()` itself is
implemented and tested here.

## Verification checklist

- [x] `make xlsx`: T shows the new `Source URL` row (generator tests +
      CLI smoke against a live HTTP fixture).
- [x] Round-trip: generate → extract + fingerprint → compare reports
      *unchanged* (unit canary + live-workbook smoke).
- [x] `make xlsm`: merged output keeps the T `Source URL` row and the
      `BACKUP`/`RXM`/`GB_TO_GiB`/`GiB_TO_GB` defined names (vba-merge
      test).

The refresh-side items (old-workbook fail-open, defined-name pruning,
`--check-only`) live in `DONE-reprice.md`'s verification list.

## Notes

- **Param object display rule (locked):** flatten `key=value` pairs
  joined with `,` — implemented in the shared helper so the fingerprint
  byte-matches the sheet.
- **No audit trail (decided):** no `Refreshed` row in T — the
  `Generated` / `Pricing Data` rows already tell the story; revisit
  only if requested.
- Parent plan: `DONE-reprice.md` — this and
  `DONE-switch-to-dnames.md` are its prerequisites.

***
* Current generator: `src/xlsx/meta.ts` (`genMetaSheet`, `FixedPricesMeta`)
* Sheet creation: `src/xlsx/writer.ts` (hard-coded `'T'`)
* Data shape: `src/prices/types.ts` (`PricesData.timestamp`)
* Defined names: `node_modules/exceljs/lib/doc/defined-names.js`
