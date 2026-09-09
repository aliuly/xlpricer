/* ── Pricing pipeline CLI entry point ─────── */

import { readFileSync, statSync, writeFileSync } from 'fs';
import Papa from 'papaparse';

import type { PricesData, PipelineOptions } from './types.ts';
import { processPricingData } from './index.ts';

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
    console.error('Usage: npx tsx src/prices/cli.ts <url> [include.csv ...] [--verbose] [-o <output.json>]')
    console.error('')
    console.error('  Fetches pricing data from the given URL, applies include CSV files,')
    console.error('  runs the pipeline, and prints a summary.')
    console.error('')
    console.error('  Options:')
    console.error('    -v, --verbose        Log progress to stderr')
    console.error('    -o, --output <file>  Write processed data as JSON to <file>')
    console.error('')
    console.error('  Example:')
    console.error('    npx tsx src/prices/cli.ts https://example.com/prices-latest.json included.csv oracle.csv -o out.json')
    process.exit(1)
  }

  const [url, ...includeFiles] = posArgs
  const start = performance.now()

  try {
    if (verbose) {
      console.error(`Fetching pricing data from: ${url}`)
    }
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
    }
    const data: PricesData = await res.json()

    // Parse include CSV files
    const includes: PipelineOptions['includes'] = {}
    for (const file of includeFiles) {
      const raw = readFileSync(file, 'utf-8')
      const { mtime } = statSync(file)
      const parsed = Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        transform: (v: string) => v.trim(),
      })
      const stem = file.replace(/\.csv$/i, '').split('/').pop()!
      includes[stem] = {
        version: mtime.toISOString(),
        records: parsed.data as unknown as Record<string, unknown>[],
      }
      if (verbose) {
        console.error(`Loaded ${parsed.data.length} includes from ${file} (key: ${stem}, mtime: ${mtime.toISOString()})`)
      }
    }

    const opts: PipelineOptions = { verbose }
    if (includeFiles.length > 0) {
      opts.includes = includes
    }
    await processPricingData(data, opts)

    const rows = data.count ?? data.records[0]?.length ?? 0
    const elapsed = (performance.now() - start).toFixed(0)

    console.log(JSON.stringify({
      status: 'ok',
      url,
      schema: data.schema ?? '(none)',
      records: rows,
      columns: data.keys.length,
      keys: data.keys.slice(0, 10),
      ...(data.keys.length > 10 ? { 'keys_truncated': data.keys.length - 10 } : {}),
      metadata: {
        timestamp: data.timestamp ?? null,
        generatedBy: data.generatedBy ?? null,
        cksum: data.cksum ?? null,
      },
      elapsed_ms: Number(elapsed),
    }, null, 2))
    console.log(data.includes);
    console.log(data.patches);

    // Write output file
    if (outputFile) {
      writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8')
      if (verbose) {
        console.error(`Wrote ${data.records.length} records to ${outputFile}`)
      }
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
const isMain = process.argv[1]?.includes('cli.ts') || process.argv[1]?.includes('cli.js')
if (isMain) {
  await main()
}
