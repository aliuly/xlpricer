#!/bin/sh
# Test that pages/filter_builds.jq keeps only v1 builds: entries whose
# version starts with "1." (plus version-less pre-versioning legacy
# entries).  Wrongly-tagged 2.x.x entries — and any other non-1.x
# version — must be discarded.
#
# Usage: sh pages/test_filter_builds.sh   (from the repository root)

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FILTER="$ROOT/pages/filter_builds.jq"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

jq -n '[
  {date:"2026-10-14", file:"prices-2026-10-14.xlsx", version:"2.0.1-3-gca25794"},
  {date:"2026-09-22", file:"prices-2026-09-22.xlsx", version:"2.0.1-1-gabbe6f5"},
  {date:"2026-09-21", file:"prices-2026-09-21.xlsx", version:"2.0.1"},
  {date:"2026-09-16", file:"prices-2026-09-16.xlsx", version:"1.8.0-5-g86a31dd"},
  {date:"2026-09-14", file:"prices-2026-09-14.xlsx", version:"1.8.0-4-g702da49"},
  {date:"2026-09-09", file:"prices-2026-09-09.xlsx", version:"1.8.0-4-g702da49"},
  {date:"2026-09-01", file:"prices-2026-09-01.xlsx"},
  {date:"2026-08-31", file:"prices-2026-08-31.xlsx", version:42}
]' > "$TMP/input.json"

fail() { echo "FAIL: $1" >&2; exit 1; }

jq -f "$FILTER" "$TMP/input.json" > "$TMP/output.json"

# 1.x entries (3) + the version-less legacy entry survive; the three
# 2.x entries and the numeric version are discarded.
COUNT=$(jq 'length' "$TMP/output.json")
[ "$COUNT" -eq 4 ] || fail "expected 4 kept entries, got $COUNT"

# No kept entry may carry a string version that does not start with "1.".
BAD=$(jq '[.[] | select((.version | type == "string") and (.version | startswith("1.") | not))] | length' "$TMP/output.json")
[ "$BAD" -eq 0 ] || fail "$BAD non-1.x entries survived the filter"

# All 1.x inputs survive, in their original order.
KEPT_DATES=$(jq -r '[.[].date] | join(",")' "$TMP/output.json")
[ "$KEPT_DATES" = "2026-09-16,2026-09-14,2026-09-09,2026-09-01" ] \
  || fail "unexpected kept order: $KEPT_DATES"

echo "PASS: only 1.x versions (and version-less legacy entries) are kept"
