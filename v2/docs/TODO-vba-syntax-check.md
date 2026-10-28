# TODO: VBA syntax checking with ViperMonkey

**Status:** planned 2026-10-28 — no code changes yet.

## Goal

Catch VBA syntax errors in the macro sources (`vba/*.vba`) before they
ship inside `public/vba/template.xlsm`.  Today nothing checks the
language: a broken statement builds cleanly and only fails at runtime
inside Excel.

## Current state (reference)

- `vba/pys.sh` bootstraps `vba/.venv` from `vba/requirements.txt`
  (currently `pyOpenVBA` only) and runs python scripts/helpers
  (`vbabb`, `strip_doc_sheets.py`, `test_vbabb.py`).
- `pyOpenVBA` manages the OLE container and module streams only — it
  does **not** parse the VBA language.  Proven 2026-10-28: a module
  with `Set newTab ThisWorkbook.Worksheets(tabName)` (missing `=`)
  parsed fine, and `make vba` exited 0 with the broken module in the
  template.
- `vba/Makefile` has `build` (template) and `test` (vbabb unit tests);
  the root `Makefile` `test` target runs `npm run test:run` only.

## Options considered

| Tool | Lang / License | Notes | Decision |
|---|---|---|---|
| **ViperMonkey** (decalage2) | Python | VBA parser + emulation engine from the oletools/malware world; pip-installable; runs headless. Grammar is tuned for malicious macros → possible false positives on legal-but-rare VBA. | **Try first** |
| uwol/proleap-vb6-parser | Java, MIT | ANTLR-based VB6/VBA 6.0 parser, purpose-built; most accurate; adds a JVM dependency. | Fallback |
| brucificus/vb6-antlr4-typescript / ayapi/antlr4-vb6-js | TS/JS | ANTLR4 VB6 grammars for the Node toolchain; less maintained, more wiring. | Only if both above fail |
| Rubberduck | C#, GPL | Best-in-class VBA inspections, but an Excel COM add-in (Windows) — not CI-friendly. | Out of scope |
| LibreOffice Basic | — | Different dialect (StarBasic ≠ VBA). | Not suitable |
| VBE "Compile VBAProject" | — | The authoritative check, but Windows/Excel-only. | Out of scope |

## Plan

1. **Dependency** — add `vipermonkey` to `vba/requirements.txt`
   (pinned).  `pys.sh` re-creates the venv automatically when the
   requirements change (state hash includes the file contents).
2. **Checker** — new `vba/check_vba.py`:
   - parse each module (`bom.vba`, `handlers.vba`, `ui.vba`,
     `prep.vba`, `hypercmp.vba`) with the ViperMonkey parser —
     **parse-only, no emulation**;
   - read sources with the same encoding vbabb uses (cp1252/ASCII);
   - print the offending file (and line/message when available) and
     exit non-zero on parse errors; exit 0 when all modules parse.
3. **Make targets** — `vba/Makefile`: add `check:` (`./pys.sh
   check_vba.py`) to `.PHONY` + `help`.  Root `Makefile`: add
   `check-vba:` (`$(MAKE) -C vba check`).
4. **Wire into tests** — decide between:
   - `test:` gains `$(MAKE) -C vba check` as a prerequisite (strict,
     runs on every `make test`), or
   - keep it as a separate `make check-vba` invoked by CI only.
5. **Negative fixture** — a deliberately broken module (e.g. the
   missing-`=` `Set` from above) must fail the checker.  Options: a
   self-test inside `check_vba.py`, or a vitest integration test that
   shells out to the make target.

## Acceptance gate

Before wiring into `make test`, run the checker against the five
current modules:

- If all five parse → good, proceed.
- If it rejects constructs the macros legitimately use (`Private
  Const`, `Do While`, `For Each`, `#If` blocks, `_` line
  continuations, …) → record the false positives and switch to
  ProLeap (`uwol/proleap-vb6-parser`) behind a tiny Java runner,
  unless the grammar can be patched cleanly.

Also verify the run takes only a few seconds — it must not slow down
`make test` noticeably.

## Open questions

- Run on every `make test`, or CI-only (`make check-vba`)?
- Pin an exact ViperMonkey version, or track latest?
- Should the checker also extract the sources embedded in
  `vba/project.xlsm`, or is checking the `.vba` files sufficient
  (they are the build inputs)?

## References

- ViperMonkey: https://github.com/decalage2/ViperMonkey
- ProLeap VB6 parser: https://github.com/uwol/proleap-vb6-parser
- Existing toolchain: `vba/pys.sh`, `vba/vbabb`, `vba/Makefile`
