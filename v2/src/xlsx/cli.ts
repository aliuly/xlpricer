/* ── XLSX generation CLI entry point ─────── */

import { execSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'fs'
import Papa from 'papaparse'

import { generatePricingXlsx } from './writer.ts'
import type { AppMeta, PricingData } from './writer.ts'
import { processPricingData } from '../prices/index.ts'
import type { PricesData, PipelineOptions } from '../prices/types.ts'
import { classifyAssumptions, classifyComponents } from '../editorTab/classify.ts'

/* ── Defaults ──────────────────────────────── */

function gitVersion(): string {
  try {
    return execSync('git describe --always', { encoding: 'utf8' }).trim()
  } catch { /* no git available */ }
  return 'unknown'
}

const DEFAULT_SPA_URL = 'http://localhost:5173/'

/* ── Argument parsing ──────────────────────── */

interface ParsedArgs {
  verbose: boolean
  outputFile: string
  version: string
  spaUrl: string
  assumptionsFile: string | null
  componentFiles: string[]
  enableEsa: boolean
  posArgs: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)

  const verbose = args.includes('--verbose') || args.includes('-v')

  // --output / -o
  let outputFile = 'pricing.xlsx'
  const outputIdx = args.findIndex(a => a === '--output' || a === '-o')
  if (outputIdx !== -1 && outputIdx + 1 < args.length) {
    outputFile = args[outputIdx + 1]
  }

  // --version
  let version = gitVersion()
  const verIdx = args.findIndex(a => a === '--version')
  if (verIdx !== -1 && verIdx + 1 < args.length) {
    version = args[verIdx + 1]
  }

  // --spa-url
  let spaUrl = DEFAULT_SPA_URL
  const spaIdx = args.findIndex(a => a === '--spa-url')
  if (spaIdx !== -1 && spaIdx + 1 < args.length) {
    spaUrl = args[spaIdx + 1]
  }

  // --assumptions
  let assumptionsFile: string | null = null
  const assIdx = args.findIndex(a => a === '--assumptions')
  if (assIdx !== -1 && assIdx + 1 < args.length) {
    assumptionsFile = args[assIdx + 1]
  }

  // --esa / --no-esa
  let enableEsa = true
  if (args.includes('--no-esa')) {
    enableEsa = false
  } else if (args.includes('--esa')) {
    enableEsa = true
  }

  // --components (repeatable: each value is a CSV file)
  const componentFiles: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--components' && i + 1 < args.length) {
      componentFiles.push(args[i + 1])
    }
  }

  // Indices consumed by option values
  const consumed = new Set<number>()
  for (const idx of [outputIdx, verIdx, spaIdx, assIdx]) {
    if (idx !== -1) { consumed.add(idx); consumed.add(idx + 1) }
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--components' && i + 1 < args.length) {
      consumed.add(i)
      consumed.add(i + 1)
    }
    if (args[i] === '--esa' || args[i] === '--no-esa') {
      consumed.add(i)
    }
  }

  const posArgs = args.filter((a, i) => {
    if (consumed.has(i)) return false
    if (a.startsWith('-')) return false
    return true
  })

  return { verbose, outputFile, version, spaUrl, assumptionsFile, componentFiles, enableEsa, posArgs }
}

/* ── Main ──────────────────────────────────── */

async function main(): Promise<void> {
  const opts = parseArgs(process.argv)

  if (opts.posArgs.length === 0) {
    console.error('Usage: npx tsx src/xlsx/cli.ts <url> [include.csv ...] [options]')
    console.error('')
    console.error('  Fetches pricing data from the given URL, applies include CSV files,')
    console.error('  and generates an XLSX workbook.')
    console.error('')
    console.error('  Positional:')
    console.error('    <url>                   URL of the pricing JSON data')
    console.error('    [include.csv ...]       Local CSV files to include')
    console.error('')
    console.error('  Options:')
    console.error('    -v, --verbose           Log progress to stderr')
    console.error('    -o, --output <file>     Write XLSX to <file> (default: pricing.xlsx)')
    console.error('    --version <ver>         App version for the meta sheet')
    console.error(`                            (default: git describe, currently "${opts.version}")`)
    console.error(`    --spa-url <url>          SPA URL for the meta sheet (default: ${DEFAULT_SPA_URL})`)
    console.error('    --assumptions <file>    CSV file with assumptions data')
    console.error('    --components <file>     CSV file with components data (repeatable)')
    console.error('                            Use LABEL=path to override the tab name')
    console.error('    --esa / --no-esa        Enable/disable ESA section (default: enabled)')
    console.error('')
    console.error('  Example:')
    console.error('    npx tsx src/xlsx/cli.ts https://example.com/prices-latest.json \\')
    console.error('      data/oracle.csv \\')
    console.error('      -o pricing.xlsx \\')
    console.error('      --assumptions public/assumptions.csv \\')
    console.error('      --components "My Cloud=public/preload.csv"')
    process.exit(1)
  }

  const [url, ...includeFiles] = opts.posArgs
  const start = performance.now()

  try {
    /* ── Fetch pricing JSON ── */
    if (opts.verbose) console.error(`Fetching pricing data from: ${url}`)
    const pricingRes = await fetch(url)
    if (!pricingRes.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${pricingRes.status}`)
    }
    const pricingData: PricesData = await pricingRes.json()

    /* ── Parse include CSV files ── */
    const includes: PipelineOptions['includes'] = {}
    for (const file of includeFiles) {
      if (opts.verbose) console.error(`Loading include CSV: ${file}`)
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
      if (opts.verbose) {
        console.error(`  → ${parsed.data.length} records (key: ${stem}, mtime: ${mtime.toISOString()})`)
      }
    }

    /* ── Run pipeline ── */
    processPricingData(pricingData, { includes, verbose: opts.verbose })

    /* ── Load & classify assumptions CSV ── */
    let assumptions: unknown = []
    if (opts.assumptionsFile) {
      if (opts.verbose) console.error(`Loading assumptions from: ${opts.assumptionsFile}`)
      const raw = readFileSync(opts.assumptionsFile, 'utf-8')
      const parsed = Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        transform: (v: string) => v.trim(),
      })
      assumptions = parsed.data.map(classifyAssumptions)
      if (opts.verbose) console.error(`  → ${parsed.data.length} assumption rows`)
    }

    /* ── Load & classify components CSV(s) ── */
    const components: Record<string, unknown> = {}
    for (const arg of opts.componentFiles) {
      const eqIdx = arg.indexOf('=')
      const label = eqIdx !== -1 ? arg.slice(0, eqIdx) : arg.replace(/\.csv$/i, '').split('/').pop()!
      const file  = eqIdx !== -1 ? arg.slice(eqIdx + 1) : arg
      if (opts.verbose) console.error(`Loading components "${label}" from: ${file}`)
      const raw = readFileSync(file, 'utf-8')
      const parsed = Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        transform: (v: string) => v.trim(),
      })
      components[label] = parsed.data.map(classifyComponents)
      if (opts.verbose) console.error(`  → ${parsed.data.length} component rows (label: ${label})`)
    }

    /* ── App meta ── */
    const appMeta: AppMeta = {
      version: opts.version,
      spaUrl: opts.spaUrl,
      enableEsa: opts.enableEsa,
    }

    const xlsxInput: PricingData = { assumptions, components, pricingData, appMeta }

    if (opts.verbose) {
      console.error(`Generating XLSX → ${opts.outputFile}`)
    }

    const buffer = await generatePricingXlsx(xlsxInput)
    writeFileSync(opts.outputFile, Buffer.from(buffer))

    const elapsed = (performance.now() - start).toFixed(0)
    console.log(JSON.stringify({
      status: 'ok',
      output: opts.outputFile,
      url,
      includes: includeFiles.length,
      records: pricingData.count ?? pricingData.records[0]?.length ?? 0,
      elapsed_ms: Number(elapsed),
    }, null, 2))
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

/* ── Direct invocation guard ───────────────── */
const isMain = process.argv[1]?.includes('cli.ts') || process.argv[1]?.includes('cli.js')
if (isMain) {
  await main()
}
