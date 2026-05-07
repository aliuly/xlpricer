#!/bin/sh

export WHOAMI='github-bot'
DATE=$(date +%Y-%m-%d)
XLSX="prices-${DATE}.xlsx"

# Record the version of xlpricer that generated this build.
VERSION=$(python -c "from xlpricer.version import VERSION; print(VERSION)")

MAX_VERSIONS=12

# Determine the GitHub Pages base URL from the repository context.
if [ -n "$GITHUB_REPOSITORY" ]; then
    OWNER="${GITHUB_REPOSITORY%/*}"
    REPO="${GITHUB_REPOSITORY#*/}"
    if [ "$REPO" = "${OWNER}.github.io" ]; then
        BASE_URL="https://${OWNER}.github.io"
    else
        BASE_URL="https://${OWNER}.github.io/${REPO}"
    fi
else
    BASE_URL="."
fi

# Download previous builds.json from the published site (if it exists).
PREV_BUILDS='[]'
if curl -sfL "${BASE_URL}/builds.json" -o /tmp/prev_builds_raw.json 2>/dev/null; then
    echo "Found previous builds.json"
    # Handle both old single-object format and new array format.
    if jq -e 'type == "object"' /tmp/prev_builds_raw.json >/dev/null 2>&1; then
        PREV_BUILDS=$(jq '[.]' /tmp/prev_builds_raw.json)
    elif jq -e 'type == "array"' /tmp/prev_builds_raw.json >/dev/null 2>&1; then
        PREV_BUILDS=$(cat /tmp/prev_builds_raw.json)
    else
        echo "Warning: unknown builds.json format, starting fresh"
        PREV_BUILDS='[]'
    fi
else
    echo "No previous builds.json found at ${BASE_URL}/builds.json"
fi

# Trim previous builds to make room for the new one (keep MAX_VERSIONS-1).
# Also remove any stale entry for today's date in case this build re-runs.
KEEP=$((MAX_VERSIONS - 1))
PREV_BUILDS=$(echo "$PREV_BUILDS" | jq "del(.[] | select(.date == \"$DATE\")) | .[:${KEEP}]")

# Download XLSX files for the previous builds we are keeping.
for f in $(echo "$PREV_BUILDS" | jq -r '.[].file // empty'); do
    if [ ! -f "$f" ]; then
        echo "Downloading previous file: $f"
        curl -sfL "${BASE_URL}/${f}" -o "$f" || echo "Warning: could not download $f"
    fi
done

# Build the new XLSX.
python -m xlpricer -V
python -m xlpricer build \
        --include pages/dctemp.json \
        --include pages/oracle.json \
        --lang-en \
        "${XLSX}"

SIZE=$(stat --format=%s "${XLSX}")

# Create a new build entry.
NEW_ENTRY=$(jq -n \
  --arg date "$DATE" \
  --arg file "$XLSX" \
  --argjson size "$SIZE" \
  --arg built "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg version "$VERSION" \
  '{date:$date, file:$file, size:$size, built_at:$built, version:$version}')

# Combine and write builds.json: [new, ...previous]
echo "$PREV_BUILDS" | jq --argjson new "$NEW_ENTRY" '[$new] + .' > builds.json

# Remove XLSX files that are no longer referenced.
jq -r '.[].file' builds.json | sort > /tmp/needed.txt
for f in prices-*.xlsx; do
    [ -f "$f" ] || continue
    if ! grep -qxF "$f" /tmp/needed.txt; then
        echo "Removing old file: $f"
        rm -f "$f"
    fi
done
