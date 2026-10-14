# TODO: vbabb provenance header (VBA source identity)

**Status:** provenance header implemented 2026-09-17.  `vba/vbabb`
now prepends git/mtime provenance headers; `vba/test_vbabb.py` (14
tests) and a `make test` target cover the logic, `make build` produces
a valid `public/vba/template.xlsm`, and the TS suite (92 tests) stays
green.  The TrimWB performance notes at the bottom remain open.

## Goal

When `vba/vbabb` includes a VBA source file, it should prepend a
REM-comment header recording where the code came from:

- **Source file** — always.
- **Version identity**:
  - tracked git file → `git describe` of the last commit touching the
    file, or the short commit hash when describe has nothing to say;
  - untracked / non-git file → no version line (mtime is the only
    identity).
- **Timestamp**:
  - clean tracked file → the commit timestamp;
  - dirty tracked file → the **file's filesystem mtime**, and the
    header marks the file as dirty;
  - non-git file → the file's filesystem mtime.

This makes every generated workbook's VBA modules traceable to the
exact source they were built from, without Excel or the build system
having to know anything about git.

## Proposed header format

All lines are VBA `REM` comments, CRLF-normalised with the rest of the
module.  Times are UTC ISO-8601 with second precision.

Tracked, clean:

```vb
' Source: prep.vba
' Version: v1.2.3-4-gabc1234
' Timestamp: 2026-09-17T12:00:00+00:00 (commit)
```

Tracked, dirty:

```vb
' Source: prep.vba
' Version: v1.2.3-4-gabc1234 (dirty)
' Timestamp: 2026-09-17T14:00:00+00:00 (file mtime)
```

No tag / describe fails (clean):

```vb
' Source: prep.vba
' Version: abc1234f
' Timestamp: 2026-09-17T12:00:00+00:00 (commit)
```

Not tracked by git (or not in a repo):

```vb
' Source: prep.vba
' Timestamp: 2026-09-17T14:00:00+00:00 (file mtime)
```

- `Source:` is the path **exactly as passed on the command line**
  (decided); git queries use the repo-relative path internally.
- `Version:` uses `git describe --tags <commit>`; on failure, the
  short hash from the last-commit query (git default abbreviation).
- Dirty means **tracked and modified** (staged or unstaged).  The
  dirty marker is the literal `(dirty)` on the Version line.

## Algorithm

For each input file:

1. `git -C <file-parent> rev-parse --show-toplevel` → repo root, or
   **non-git**.
2. Relative path from the root; check it is tracked:
   `git -C <root> ls-files --error-unmatch -- <rel>`.
   - Not tracked → treat as **non-git** (even inside a repo).
3. Last commit touching the file (one process call):
   `git -C <root> log -1 --format=%H%x00%h%x00%ct -- <rel>`
   → full hash, short hash, committer epoch (converted to UTC
   ISO-8601 in Python, avoiding local-timezone surprises in `%cI`).
4. Describe the commit: `git -C <root> describe --tags <full-hash>`.
   Empty/failure → use the short hash.
5. Dirty check: `git -C <root> status --porcelain --untracked-files=no -- <rel>`.
   Non-empty → dirty.
6. Build the header:
   - version = describe-or-short-hash, plus ` (dirty)` when dirty,
   - timestamp = commit epoch (as UTC ISO-8601) when clean, file mtime
     when dirty/non-git.
7. Insert the header **after any leading `Attribute ...` lines**
   (VBE-exported modules put attributes first); when the source has
   no leading attribute block, put the header at the very top.

Git commands run via `subprocess.run(..., capture_output=True, text=True,
timeout=5, cwd=root)`.  Any git failure (git missing, repo corruption,
command failure) degrades to the **non-git** header rather than
aborting the build.

## Implementation (in `vba/vbabb`, keep single-file)

- New `Provenance` dataclass: `source_path`, `version`, `timestamp`,
  `timestamp_source` (`'commit'` / `'file mtime'`), `dirty`.
- New helpers:
  - `run_git(args, cwd) -> tuple[bool, str]`
  - `git_root_for(path) -> Path | None`
  - `is_tracked(root, rel) -> bool`
  - `last_commit_info(root, rel) -> dict | None`
  - `describe_commit(root, commit) -> str | None`
  - `has_uncommitted_changes(root, rel) -> bool`
  - `mtime_iso(path) -> str`
  - `build_provenance(path) -> Provenance`
  - `format_provenance_header(prov) -> str`
  - `insert_header_after_attributes(source, header) -> str`
- Integrate in `main()` **after** module planning/kind detection, so
  the header cannot change how a source is classified:

  ```python
  source = normalize_line_endings(read_source(path, args.encoding))
  name, is_new, reason = plan_module(path, source, explicit, existing)
  kind = determine_kind(path, source, args.kind)

  header = normalize_line_endings(format_provenance_header(build_provenance(path)))
  source = insert_header_after_attributes(source, header)
  ```

- No new CLI flag (decided): the header is always added.
- Git pathspecs use the repo-relative path with `/` separators
  (`rel.as_posix()`), while the `Source:` line keeps the path exactly
  as passed.
- Add `vba/test_vbabb.py` (stdlib `unittest`) for the pure helpers:
  fake `subprocess.run` outputs for clean/dirty/no-tags/untracked, and
  temp git repos for integration; add a `vba/Makefile` `test` target
  that runs `./pys.sh test_vbabb.py`.

## Edge cases & decisions

| Case | Behaviour |
|---|---|
| File inside repo but **untracked** | non-git header (mtime only) |
| Dirty tracked file | `(dirty)` + file mtime |
| Staged-only change | dirty (status porcelain reports staged) |
| Describe fails (no tags) | short commit hash |
| Detached HEAD with tags | describe still resolves by commit, if reachable |
| Git not installed / repo unreadable | non-git header |
| File outside any repo | non-git header |
| Source path / separators | used exactly as passed (no rewriting) |
| Source begins with `Attribute VB_Name = ...` | header inserted **after** the leading Attribute lines |
| `.cls` / `.bas` class exports (attributes at the end, `VERSION 1.0 CLASS` first) | plan/kind computed **before** insertion, so the comment at the top cannot flip auto-kind detection; pyOpenVBA accepts a comment before `VERSION` (verified) |

## Verification checklist

- [x] `vba/test_vbabb.py` unit tests cover clean / dirty / no-tags /
      untracked / non-git headers.
- [x] `make test` in `vba/` runs those tests.
- [x] `vba/pys.sh vbabb` on clean tracked sources: generated module
      contains Source + Version + commit Timestamp.
- [x] Same file in a throwaway git repo with an uncommitted edit:
      `(dirty)` + file-mtime Timestamp.
- [x] A file outside git: Source + file-mtime Timestamp only.
- [x] Describe fallback: repo with no tags → short hash.
- [x] A `.bas` file containing a `VERSION 1.0 CLASS` export is still
      added as a class module (header insertion must not flip kind).
- [x] `make build` in `vba/` still produces a valid
      `public/vba/template.xlsm`; TS tests (92) stay green.
- [x] A generated xlsm opens/validates via `wb.validate()`.

## Decisions (2026-09-17)

1. **No CLI flag** — the header is always added.
2. **Header placement** — after any leading `Attribute ...` lines,
   otherwise at the top.
3. **Commit timestamp** — committer date, taken as `%ct` epoch and
   formatted as UTC ISO-8601 in Python.
4. **Short hash** — git default abbreviation (`%h` from the `log` call).
5. **Timestamps** — UTC ISO-8601 with second precision.
6. **Source path** — exactly as passed on the command line.

