import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import Papa from 'papaparse'

import { classifyAssumptions, classifyComponents } from '../src/editorTab/classify'
import { processPricingData } from '../src/prices/index'
import type { PricesData } from '../src/prices/types'
import type { PricingData } from '../src/xlsx/writer'

function parseCsv(file: string): Record<string, string>[] {
  const raw = readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf-8')
  return Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => v.trim(),
  }).data
}

/** Pipelines the fixtures exactly the way the CLI/SPA do. */
export function buildInput(): PricingData {
  const pricingData = JSON.parse(
    readFileSync(new URL('fixtures/prices.json', import.meta.url), 'utf-8'),
  ) as PricesData
  processPricingData(pricingData, {
    includes: {
      oracle: {
        version: 'test-version',
        records: parseCsv('includes/oracle.csv') as unknown as Record<string, unknown>[],
      },
    },
  })
  return {
    assumptions: parseCsv('assumptions.csv').map(classifyAssumptions),
    components: { Components: parseCsv('components.csv').map(classifyComponents) },
    pricingData,
    appMeta: {
      version: 'test',
      spaUrl: 'http://spa/',
      sourceUrl: 'https://example.com/prices.json',
    },
  }
}

/** Sheet order of a macro-enabled build (template sheet included). */
export const EXPECTED_SHEETS = [
  'Overview', 'Components', '_BOMTemplate', 'Volumes', 'Prices', 'Finder',
  'Assumptions', 'ESA', 'T',
]

/* ── LibreOffice headless helpers ─────────── */

/** Absolute path to soffice, or null when LibreOffice is unavailable. */
export function sofficePath(): string | null {
  try {
    const out = execFileSync('which', ['soffice'], { encoding: 'utf-8' }).trim()
    if (out) return out
  } catch { /* not on PATH */ }
  for (const p of ['/usr/bin/soffice', '/usr/bin/libreoffice', '/opt/libreoffice/program/soffice']) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Force "always recalculate on load" in a LibreOffice profile by
 * injecting OOXMLRecalcMode=0 into its registrymodifications.xcu.
 */
export function injectRecalc(profileDir: string): void {
  const xcu = join(profileDir, 'user', 'registrymodifications.xcu')
  const text = readFileSync(xcu, 'utf-8')
  if (text.includes('OOXMLRecalcMode')) return
  const item = '<item oor:path="/org.openoffice.Office.Calc/Formula/Load">'
    + '<prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>'
  writeFileSync(xcu, text.replace('</oor:items>', item + '</oor:items>'))
}

/**
 * Recalculate an xlsx/xlsm headlessly: a fresh profile forces
 * recalculation on load, then the file is saved as xlsx with cached
 * results that ExcelJS can read back.  Returns the output path.
 */
export function recalcConvert(
  soffice: string,
  profileDir: string,
  inputPath: string,
  outDir: string,
): string {
  mkdirSync(outDir, { recursive: true })
  try {
    execFileSync(soffice, [
      `-env:UserInstallation=file://${profileDir}`,
      '--headless', '--convert-to', 'xlsx', '--outdir', outDir, inputPath,
    ], { timeout: 120_000, stdio: 'pipe' })
  } catch (err) {
    const e = err as { stderr?: Buffer | string }
    throw new Error(`soffice convert failed: ${String(e.stderr)}`)
  }
  const outPath = join(outDir, basename(inputPath).replace(/\.xlsm?$/i, '.xlsx'))
  if (!existsSync(outPath)) throw new Error(`soffice produced no output: ${outPath}`)
  return outPath
}

/** Cached numeric result of a formula cell, when present. */
export function cachedNumber(
  cell: { value: unknown },
): number | undefined {
  const v = cell.value as { result?: unknown } | null
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result
  return undefined
}

/** Cached text result of a formula cell, when present. */
export function cachedText(
  cell: { value: unknown },
): string | undefined {
  const v = cell.value as { result?: unknown } | null
  if (v && typeof v === 'object' && v.result !== undefined) return String(v.result)
  return undefined
}

export function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}
