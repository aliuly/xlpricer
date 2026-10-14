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

/* ── Synthetic v1 workbook fixture ───────────────────────── */

/**
 * A minimal v1-format workbook (round-tripped like a real file):
 * Overview referencing `Components!`, a v1-shaped Assumptions sheet
 * (Format version 1.8.1 + trailing plain-text notes), a Components
 * tab exercising the extraction rules (group/data/total/empty rows,
 * formula cells with cached results, a per-row Region override), and
 * a `Deal Summary` sheet that is neither referenced nor generated.
 */
export async function buildV1Workbook(): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()

  const ov = wb.addWorksheet('Overview')
  ov.getCell('R11').value = { formula: "SUMIFS('Components'!B:B)" }

  const ass = wb.addWorksheet('Assumptions')
  ass.getCell('B2').value = '#'
  ass.getCell('C2').value = 'Assumption'
  ass.getCell('D2').value = 'Value'
  ass.getCell('C3').value = 'Format version'
  ass.getCell('D3').value = '1.8.1'
  ass.getCell('B4').value = 'Include files'
  ass.getCell('C5').value = 'dctemp'
  ass.getCell('D5').value = '2026-08-31'
  ass.getCell('B6').value = 'Hours'
  ass.getCell('C7').value = 'Full Time (24x7)'
  ass.getCell('D7').value = 730
  ass.getCell('C8').value = 'Trailing note one'
  ass.getCell('C9').value = 'Trailing note two'

  wb.addWorksheet('Deal Summary')

  const comp = wb.addWorksheet('Components')
  comp.getCell(5, 2).value = 'Qty'
  comp.getCell(5, 3).value = 'Function'
  comp.getCell(5, 4).value = 'Cloud Desc'
  comp.getCell(5, 6).value = 'Storage (GiB)'
  comp.getCell(5, 7).value = 'H/R'
  comp.getCell(5, 9).value = 'Group'
  comp.getCell(5, 11).value = 'Region'
  comp.getCell(5, 12).value = 'EVS Class'

  // Group row: label in Qty, key in Group.
  comp.getCell(6, 2).value = 'Base Infrastructure'
  comp.getCell(6, 9).value = 'base'
  // Data row: default H/R formula (dropped), plain values.
  comp.getCell(7, 2).value = 1
  comp.getCell(7, 4).value = 'Essentials: VPC'
  comp.getCell(7, 7).value = { formula: 'IF($C$3="R36M",1,2)', result: 730 }
  comp.getCell(7, 9).value = 'base'
  // Data row: literal H/R override + per-row Region override.
  comp.getCell(8, 2).value = 2
  comp.getCell(8, 3).value = 'ADFS Servers'
  comp.getCell(8, 4).value = 'Compute: General Purpose'
  comp.getCell(8, 6).value = 100
  comp.getCell(8, 7).value = 500
  comp.getCell(8, 9).value = { formula: 'I6', result: 'base' }
  comp.getCell(8, 11).value = 'eu-nl'
  // Data row: other-sheet qty formula → frozen to cached value.
  comp.getCell(9, 2).value = { formula: 'Assumptions!$D$36', result: 100 }
  comp.getCell(9, 4).value = 'Network: Internet Traffic'
  comp.getCell(9, 9).value = 'base'
  // Total row (skipped) and an empty spacer row (skipped).
  comp.getCell(10, 2).value = { formula: '="Total "&IF($I10="","N/A",$I10)', result: 'Total base' }
  comp.getCell(10, 9).value = { formula: 'I6', result: 'base' }
  // Second group + a data row with a local qty formula (kept).
  comp.getCell(12, 2).value = 'Compute'
  comp.getCell(12, 9).value = 'com'
  comp.getCell(13, 2).value = { formula: 'B7+B8', result: 3 }
  comp.getCell(13, 4).value = 'Anti-virus'
  comp.getCell(13, 9).value = 'com'

  const raw = await wb.xlsx.writeBuffer()
  return Buffer.from(raw as unknown as ArrayBuffer)
}

/** Like buildV1Workbook but Assumptions carries Format version 2.0.1. */
export async function buildV2FormatWorkbook(): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Overview')
  const ass = wb.addWorksheet('Assumptions')
  ass.getCell('B2').value = '#'
  ass.getCell('C2').value = 'Assumption'
  ass.getCell('D2').value = 'Value'
  ass.getCell('C3').value = 'Format version'
  ass.getCell('D3').value = '2.0.1'
  const raw = await wb.xlsx.writeBuffer()
  return Buffer.from(raw as unknown as ArrayBuffer)
}

/** Load workbook bytes through ExcelJS. */
export async function loadWorkbookBytes(bytes: Buffer): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await (wb.xlsx.load as unknown as (data: Uint8Array) => Promise<import('exceljs').Workbook>)(
    new Uint8Array(bytes),
  )
  return wb
}
