/* ── Duplicate _XlTitle_/region report ───────────────
 *
 * Fetches pricing data (with optional include CSVs), runs the
 * pipeline, and reports every (_XlTitle_, region) pair that occurs
 * more than once — the lookup key the workbook uses across the BOM
 * SKU formulas, the Backup Index and the Finder rows, where a
 * duplicate pair would make lookups ambiguous.
 */

import { writeFileSync } from 'fs';

import { loadPipelineData } from './load.ts';
import type { PricesData } from './types.ts';

/* ── Scan ─────────────────────────────────────────── */

export interface DuplicateRow {
  /** 1-based position in data.records (report-friendly). */
  row: number;
  id: string;
  productId: string;
  priceAmount: string;
  unit: string;
}

export interface DuplicatePair {
  title: string;
  region: string;
  rows: DuplicateRow[];
}

/**
 * All (_XlTitle_, region) pairs appearing in 2+ records, sorted by
 * title then region.  Each pair lists every colliding record.
 */
export function findDuplicatePairs(data: PricesData): DuplicatePair[] {
  const x: Record<string, number> = {}
  data.keys.forEach((k, i) => { x[k] = i })

  const byPair = new Map<string, DuplicateRow[]>()
  data.records.forEach((record, i) => {
    const title = String(record[x._XlTitle_] ?? '')
    const region = String(record[x.region] ?? '')
    const key = `${title}\u0000${region}`
    const rows = byPair.get(key)
    const entry: DuplicateRow = {
      row: i + 1,
      id: String(record[x.id] ?? ''),
      productId: String(record[x.productId] ?? ''),
      priceAmount: String(record[x.priceAmount] ?? ''),
      unit: String(record[x.unit] ?? ''),
    }
    if (rows) rows.push(entry)
    else byPair.set(key, [entry])
  })

  return [...byPair.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const sep = key.indexOf('\u0000')
      return { title: key.slice(0, sep), region: key.slice(sep + 1), rows }
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.region.localeCompare(b.region))
}

/* ── Report ───────────────────────────────────────── */

function renderReport(data: PricesData, pairs: DuplicatePair[], url: string): string {
  const duplicateRows = pairs.reduce((n, p) => n + p.rows.length, 0)
  const lines: string[] = [
    'XLPricer duplicate _XlTitle_/region report',
    `Source: ${url}`,
    `Schema: ${data.schema ?? '(none)'}`,
    `Pipeline timestamp: ${data.timestamp ?? '(none)'}`,
    `Generated: ${new Date().toISOString()}`,
    `Records: ${data.records.length}`,
    `Duplicate pairs: ${pairs.length} (${duplicateRows} records)`,
    '',
  ]
  if (pairs.length === 0) {
    lines.push('No duplicate _XlTitle_/region pairs found.')
    return lines.join('\n')
  }
  pairs.forEach((pair, i) => {
    lines.push(`[${i + 1}] "${pair.title}" / ${pair.region} — ${pair.rows.length} records`)
    for (const r of pair.rows) {
      lines.push(`      row ${r.row}: id=${r.id}  productId=${r.productId}  price=${r.priceAmount}  unit=${r.unit}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

/* ── CLI ─────────────────────────────────────────── */

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')

  // Extract --output/-o <file>
  let outputFile: string | null = null
  const outputIdx = args.findIndex(a => a === '--output' || a === '-o')
  if (outputIdx !== -1 && outputIdx + 1 < args.length) {
    outputFile = args[outputIdx + 1]
  }

  const posArgs = args.filter((a, i) => {
    if (a.startsWith('-')) return false
    if (i === outputIdx + 1) return false // the value after -o
    return true
  })

  if (posArgs.length === 0) {
    console.error('Usage: npx tsx src/prices/duplicates.ts <url> [include.csv ...] [-o <report.txt>] [--verbose]')
    console.error('')
    console.error('  Fetches pricing data from the given URL, applies include CSV files,')
    console.error('  runs the pipeline, and reports duplicate (_XlTitle_, region) pairs.')
    console.error('')
    console.error('  Options:')
    console.error('    -v, --verbose        Log progress to stderr')
    console.error('    -o, --output <file>  Write the report to <file> (default: print to stdout)')
    console.error('')
    console.error('  Example:')
    console.error('    npx tsx src/prices/duplicates.ts https://example.com/prices-latest.json included.csv -o duplicates.txt')
    process.exit(1)
  }

  const [url, ...includeFiles] = posArgs
  const start = performance.now()

  try {
    const data = await loadPipelineData(url, includeFiles, verbose)
    const pairs = findDuplicatePairs(data)
    const report = renderReport(data, pairs, url)
    const elapsed = (performance.now() - start).toFixed(0)

    const duplicateRows = pairs.reduce((n, p) => n + p.rows.length, 0)
    console.log(JSON.stringify({
      status: 'ok',
      url,
      schema: data.schema ?? '(none)',
      records: data.records.length,
      duplicate_pairs: pairs.length,
      duplicate_rows: duplicateRows,
      report: outputFile ?? null,
      elapsed_ms: Number(elapsed),
    }, null, 2))

    if (outputFile) {
      writeFileSync(outputFile, report, 'utf-8')
      if (verbose) {
        console.error(`Wrote duplicate report to ${outputFile}`)
      }
    } else {
      // No output file: append the report itself after the summary.
      console.log(report)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(JSON.stringify({
      status: 'error',
      url,
      error: message,
      stack,
      elapsed_ms: Number((performance.now() - start).toFixed(0)),
    }, null, 2))
    process.exit(2)
  }
}

// Detect direct invocation (ESM equivalent of `if __name__ == '__main__'`)
const isMain = process.argv[1]?.includes('duplicates.ts') || process.argv[1]?.includes('duplicates.js')
if (isMain) {
  await main()
}
