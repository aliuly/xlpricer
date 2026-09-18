/* ── XLSX generation CLI entry point ─────── */

import { execSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'node:path'
import Papa from 'papaparse'

import { generatePricingXlsx } from './writer.ts'
import type { AppMeta, PricingData } from './writer.ts'
import { mergeIntoMacroWorkbook } from './vba.ts'
import { refreshWorkbook, RefreshError } from './reprice.ts'
import { toXlsx, toXlsm, trimWorkbook } from './convert.ts'
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
  outputExplicit: boolean
  version: string
  spaUrl: string
  assumptionsFile: string | null
  componentFiles: string[]
  enableEsa: boolean
  esaExplicit: boolean
  xlsmFile: string | null
  updateFile: string | null
  force: boolean
  checkOnly: boolean
  toXlsx: boolean
  toXlsm: boolean
  trim: boolean
  posArgs: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)

  const verbose = args.includes('--verbose') || args.includes('-v')

  // --output / -o
  const outputIdx = args.findIndex(a => a === '--output' || a === '-o')
  const outputExplicit = outputIdx !== -1 && outputIdx + 1 < args.length
  let outputFile = 'pricing.xlsx'
  if (outputExplicit) {
    outputFile = args[outputIdx + 1]
  }

  // --xlsm (macro-enabled template to merge the generated content into)
  let xlsmFile: string | null = null
  const xlsmIdx = args.findIndex(a => a === '--xlsm')
  if (xlsmIdx !== -1 && xlsmIdx + 1 < args.length) {
    xlsmFile = args[xlsmIdx + 1]
  }

  // Merging into a macro template makes the output macro-enabled;
  // the extension must match.
  if (xlsmFile) {
    if (!outputExplicit) {
      outputFile = 'pricing.xlsm'
    } else if (outputFile.toLowerCase().endsWith('.xlsx')) {
      const fixed = outputFile.replace(/\.xlsx$/i, '.xlsm')
      console.error(`Warning: macro-enabled output must use .xlsm; writing to ${fixed}`)
      outputFile = fixed
    }
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
  const esaExplicit = args.includes('--esa') || args.includes('--no-esa')
  if (args.includes('--no-esa')) {
    enableEsa = false
  } else if (args.includes('--esa')) {
    enableEsa = true
  }

  // --update <file> (refresh mode)
  const updateIdx = args.findIndex(a => a === '--update')
  const updateFile = updateIdx !== -1 && updateIdx + 1 < args.length ? args[updateIdx + 1] : null

  const force = args.includes('--force')
  const checkOnly = args.includes('--check-only')

  // --to-xlsx / --to-xlsm / --trim (conversion mode)
  const toXlsx = args.includes('--to-xlsx')
  const toXlsm = args.includes('--to-xlsm')
  const trim = args.includes('--trim')

  // --components (repeatable: each value is a CSV file)
  const componentFiles: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--components' && i + 1 < args.length) {
      componentFiles.push(args[i + 1])
    }
  }

  // Indices consumed by option values
  const consumed = new Set<number>()
  for (const idx of [outputIdx, verIdx, spaIdx, assIdx, xlsmIdx, updateIdx]) {
    if (idx !== -1) { consumed.add(idx); consumed.add(idx + 1) }
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--components' && i + 1 < args.length) {
      consumed.add(i)
      consumed.add(i + 1)
    }
    if (args[i] === '--esa' || args[i] === '--no-esa' || args[i] === '--force' || args[i] === '--check-only'
      || args[i] === '--to-xlsx' || args[i] === '--to-xlsm' || args[i] === '--trim') {
      consumed.add(i)
    }
  }

  const posArgs = args.filter((a, i) => {
    if (consumed.has(i)) return false
    if (a.startsWith('-')) return false
    return true
  })

  return {
    verbose, outputFile, outputExplicit, version, spaUrl, assumptionsFile,
    componentFiles, enableEsa, esaExplicit, xlsmFile, updateFile, force,
    checkOnly, toXlsx, toXlsm, trim, posArgs,
  }
}

/* ── Shared data loading ───────────────────── */

async function loadPricedData(
  url: string,
  includeFiles: string[],
  verbose: boolean,
): Promise<PricesData> {
  if (verbose) console.error(`Fetching pricing data from: ${url}`)
  const pricingRes = await fetch(url)
  if (!pricingRes.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${pricingRes.status}`)
  }
  const pricingData: PricesData = await pricingRes.json()

  const includes: PipelineOptions['includes'] = {}
  for (const file of includeFiles) {
    if (verbose) console.error(`Loading include CSV: ${file}`)
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
      console.error(`  → ${parsed.data.length} records (key: ${stem}, mtime: ${mtime.toISOString()})`)
    }
  }

  processPricingData(pricingData, { includes, verbose })
  return pricingData
}

function fail(message: string): never {
  console.error(JSON.stringify({
    status: 'error',
    error: message,
    elapsed_ms: 0,
  }, null, 2))
  process.exit(2)
}

/* ── Main ──────────────────────────────────── */

async function main(): Promise<void> {
  const opts = parseArgs(process.argv)

  if (opts.posArgs.length === 0) {
    console.error('Usage: npx tsx src/xlsx/cli.ts <url> [include.csv ...] [options]')
    console.error('')
    console.error('  Fetches pricing data from the given URL, applies include CSV files,')
    console.error('  and generates an XLSX workbook (or XLSM when merged into a macro')
    console.error('  template).')
    console.error('')
    console.error('  Positional:')
    console.error('    <url>                   URL of the pricing JSON data')
    console.error('    [include.csv ...]       Local CSV files to include')
    console.error('')
    console.error('  Options:')
    console.error('    -v, --verbose           Log progress to stderr')
    console.error('    -o, --output <file>     Write workbook to <file>')
    console.error('                            (default: pricing.xlsx, or pricing.xlsm with --xlsm)')
    console.error('    --xlsm <file>           Merge the generated workbook into this')
    console.error('                            macro-enabled template (.xlsm).  In refresh')
    console.error('                            mode: template whose vbaProject the refreshed')
    console.error('                            xlsm uses (default: the input file\'s own)')
    console.error('    --update <file>         Refresh an existing workbook: replace')
    console.error('                            Prices/Volumes/Finder and T from fresh data,')
    console.error('                            keeping the other sheets.  Writes a new file.')
    console.error('    --force                 Refresh even when nothing changed (also')
    console.error('                            bypasses the schema-identity guard)')
    console.error('    --check-only            Only run the staleness check; write nothing')
    console.error('    --version <ver>         App version for the meta sheet')
    console.error(`                            (default: git describe, currently "${opts.version}")`)
    console.error(`    --spa-url <url>          SPA URL for the meta sheet (default: ${DEFAULT_SPA_URL})`)
    console.error('    --assumptions <file>    CSV file with assumptions data')
    console.error('    --components <file>     CSV file with components data (repeatable)')
    console.error('                            Use LABEL=path to override the tab name')
    console.error('    --esa / --no-esa        Enable/disable ESA section (default: enabled)')
    console.error('')
    console.error('  Conversion mode (no URL; positional is the input file):')
    console.error('    --to-xlsx               Convert to xlsx: drop macros, Tools and')
    console.error('                            the _BOMTemplate sheet (clean strip)')
    console.error('    --to-xlsm               Convert to xlsm (requires --xlsm <template>)')
    console.error('    --trim                  TrimWB equivalent: freeze Prices formulas to')
    console.error('                            their cached values, drop pricing sheets,')
    console.error('                            record a _Frozen sheet for later revival')
    console.error('')
    console.error('  Example:')
    console.error('    npx tsx src/xlsx/cli.ts https://example.com/prices-latest.json \\')
    console.error('      data/oracle.csv \\')
    console.error('      -o pricing.xlsm \\')
    console.error('      --xlsm public/vba/template.xlsm \\')
    console.error('      --assumptions public/assumptions.csv \\')
    console.error('      --components "My Cloud=public/preload.csv"')
    process.exit(1)
  }

  const [first, ...rest] = opts.posArgs
  const start = performance.now()

  try {
    /* ── Conversion mode ── */
    if (opts.toXlsx || opts.toXlsm || opts.trim) {
      if (rest.length > 0) fail('conversion mode takes exactly one input file')
      const badFlags: string[] = []
      if (opts.updateFile) badFlags.push('--update')
      if (opts.force) badFlags.push('--force')
      if (opts.checkOnly) badFlags.push('--check-only')
      if (opts.componentFiles.length) badFlags.push('--components')
      if (opts.assumptionsFile) badFlags.push('--assumptions')
      if (opts.esaExplicit) badFlags.push('--esa/--no-esa')
      if (badFlags.length) fail(`flag(s) ${badFlags.join(', ')} are meaningless in conversion mode`)
      if (opts.toXlsm && !opts.xlsmFile) fail('--to-xlsm requires --xlsm <template>')
      if (opts.trim && opts.toXlsm) fail('--trim and --to-xlsm are mutually exclusive')

      const ext = opts.toXlsm ? '.xlsm' : '.xlsx'
      if (!opts.outputExplicit) {
        opts.outputFile = first.replace(/\.(xlsx|xlsm)$/i, '') + ext
      } else if (!opts.outputFile.toLowerCase().endsWith(ext)) {
        fail(`output must use ${ext} (got ${opts.outputFile})`)
      }
      if (resolve(opts.outputFile) === resolve(first)) {
        fail('output path must differ from the input path')
      }

      const inputBytes = new Uint8Array(readFileSync(first))
      const out = opts.trim
        ? await trimWorkbook(inputBytes)
        : opts.toXlsm
          ? await toXlsm(inputBytes, new Uint8Array(readFileSync(opts.xlsmFile!)))
          : await toXlsx(inputBytes)
      writeFileSync(opts.outputFile, Buffer.from(out))
      console.log(JSON.stringify({
        status: 'ok',
        input: first,
        output: opts.outputFile,
        mode: opts.trim ? 'trim' : (opts.toXlsm ? 'to-xlsm' : 'to-xlsx'),
        elapsed_ms: Number((performance.now() - start).toFixed(0)),
      }, null, 2))
      return
    }

    const pricingData = await loadPricedData(first, rest, opts.verbose)

    /* ── Refresh mode ── */
    if (opts.updateFile) {
      const badFlags: string[] = []
      if (opts.componentFiles.length) badFlags.push('--components')
      if (opts.assumptionsFile) badFlags.push('--assumptions')
      if (opts.esaExplicit) badFlags.push('--esa/--no-esa')
      if (badFlags.length) fail(`flag(s) ${badFlags.join(', ')} are meaningless in refresh mode`)

      // Composition: refresh may output the converted extension.
      const inputIsXlsm = /\.xlsm$/i.test(opts.updateFile)
      const defaultExt = (opts.xlsmFile || inputIsXlsm) ? '.xlsm' : '.xlsx'
      let outExt = defaultExt
      if (!opts.outputExplicit) {
        opts.outputFile = `${opts.updateFile.replace(/\.(xlsx|xlsm)$/i, '')}-reprice${defaultExt}`
      } else {
        const lower = opts.outputFile.toLowerCase()
        if (lower.endsWith('.xlsx')) outExt = '.xlsx'
        else if (lower.endsWith('.xlsm')) outExt = '.xlsm'
        else fail(`refresh output must be .xlsx or .xlsm (got ${opts.outputFile})`)
        if (outExt === '.xlsm' && !opts.xlsmFile && !inputIsXlsm) {
          fail('xlsm refresh output requires --xlsm <template> (input is xlsx)')
        }
        if (resolve(opts.outputFile) === resolve(opts.updateFile)) {
          fail('refresh output path must differ from the input path')
        }
      }

      const inputBytes = new Uint8Array(readFileSync(opts.updateFile))
      let xlsmTemplate: Uint8Array | undefined
      if (opts.xlsmFile) {
        if (opts.verbose) console.error(`Using macro template: ${opts.xlsmFile}`)
        xlsmTemplate = new Uint8Array(readFileSync(opts.xlsmFile))
      } else if (inputIsXlsm && outExt === '.xlsm') {
        xlsmTemplate = inputBytes
      }

      if (opts.verbose) console.error(`Refreshing ${opts.updateFile}`)
      const res = await refreshWorkbook(inputBytes, pricingData, {
        force: opts.force,
        checkOnly: opts.checkOnly,
        appMeta: { version: opts.version, spaUrl: opts.spaUrl, sourceUrl: first },
        xlsmTemplate,
      })

      const status = opts.checkOnly
        ? (res.check.stale ? 'stale' : 'unchanged')
        : res.buffer === null
          ? 'unchanged'
          : res.forced
            ? 'forced'
            : 'ok'
      if (res.buffer) {
        let buffer = new Uint8Array(res.buffer)
        if (outExt === '.xlsx') buffer = new Uint8Array(await toXlsx(buffer))
        writeFileSync(opts.outputFile, Buffer.from(buffer))
      }

      console.log(JSON.stringify({
        status,
        ...(res.buffer ? { output: opts.outputFile } : {}),
        url: first,
        check: {
          stale: res.check.stale,
          reason: res.check.reason,
          changedKeys: res.check.changedKeys,
          missingKeys: res.check.missingKeys,
          extraKeys: res.check.extraKeys,
        },
        warnings: res.warnings,
        elapsed_ms: Number((performance.now() - start).toFixed(0)),
      }, null, 2))
      return
    }

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
      sourceUrl: first,
      enableEsa: opts.enableEsa,
    }

    const xlsxInput: PricingData = { assumptions, components, pricingData, appMeta }

    if (opts.verbose) {
      console.error(`Generating XLSX → ${opts.outputFile}`)
    }

    let buffer = await generatePricingXlsx(xlsxInput, {
      vbaTemplate: Boolean(opts.xlsmFile),
    })

    /* ── Merge into the macro template, if requested ── */
    if (opts.xlsmFile) {
      if (opts.verbose) console.error(`Merging into macro template: ${opts.xlsmFile}`)
      buffer = await mergeIntoMacroWorkbook(new Uint8Array(readFileSync(opts.xlsmFile)), buffer)
    }

    writeFileSync(opts.outputFile, Buffer.from(buffer))

    const elapsed = (performance.now() - start).toFixed(0)
    console.log(JSON.stringify({
      status: 'ok',
      output: opts.outputFile,
      vba: Boolean(opts.xlsmFile),
      url: first,
      includes: rest.length,
      records: pricingData.count ?? pricingData.records[0]?.length ?? 0,
      elapsed_ms: Number(elapsed),
    }, null, 2))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(JSON.stringify({
      status: 'error',
      url: first,
      ...(err instanceof RefreshError ? { kind: err.kind } : {}),
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
