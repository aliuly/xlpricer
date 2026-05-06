#!/bin/sh

DATE=$(date +%Y-%m-%d)
XLSX="prices-${DATE}.xlsx"
python -m xlpricer build \
	--lang-en \
	"${XLSX}"

SIZE=$(stat --format=%s "${XLSX}")
jq -n \
  --arg date "$DATE" \
  --arg file "$XLSX" \
  --argjson size "$SIZE" \
  --arg built "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{date:$date, file:$file, size:$size, built_at:$built}' \
  > builds.json
