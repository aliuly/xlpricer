import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { FROZEN_SHEET_NAME } from '../../../src/xlsx/constants'
import {
  hasCachedResults,
  referencesPrices,
  trimWorkbook,
} from '../../../src/xlsx/convert'

async function toBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf)
}

async function load(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await (wb.xlsx.load as unknown as (d: Uint8Array) => Promise<ExcelJS.Workbook>)(bytes)
  return wb
}

/**
 * Inject a cached `<v>` result for a formula cell.  ExcelJS cannot
 * write falsy formula results in memory (its FormulaValue constructor
 * drops them), so this patches the sheet XML directly — producing the
 * file a saved-by-Excel workbook would carry.
 */
async function injectCachedResult(
  bytes: Uint8Array,
  formula: string,
  cached: string | number,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const sheetName = Object.keys(zip.files).find(n => n.startsWith('xl/worksheets/sheet'))!
  const xml = await zip.file(sheetName)!.async('string')
  const needle = `<f>${formula}</f>`
  if (!xml.includes(needle)) throw new Error(`formula ${formula} not found in sheet XML`)
  zip.file(sheetName, xml.replace(needle, `${needle}<v>${cached}</v>`))
  const out = await zip.generateAsync({ type: 'nodebuffer' })
  return new Uint8Array(out)
}

describe('referencesPrices', () => {
  it('matches PriceList defined names', () => {
    expect(referencesPrices('INDEX(PriceListTable,1,1)')).toBe(true)
  })

  it('matches literal Prices! refs, quoted or not', () => {
    expect(referencesPrices('SUMIFS(Prices!$K:$K,Prices!$C:$C)')).toBe(true)
    expect(referencesPrices("INDEX('Prices'!$B$1,1)")).toBe(true)
  })

  it('ignores unrelated sheets and names', () => {
    expect(referencesPrices('SUM(Components!$D$7)+T!$C$11')).toBe(false)
    expect(referencesPrices('T_ONE_TIME+1')).toBe(false)
  })

  // Documents the current literal, case-sensitive matcher; loosen the
  // implementation if case-insensitivity is ever wanted.
  it('does not match lowercase sheet refs', () => {
    expect(referencesPrices('prices!$A$1')).toBe(false)
  })
})

describe('hasCachedResults', () => {
  it('is false for value-only workbooks', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Components').getCell('A1').value = 5
    expect(hasCachedResults(wb)).toBe(false)
  })

  it('is false when formulas carry no results', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Components').getCell('A1').value = { formula: 'SUM(1,2)' }
    expect(hasCachedResults(wb)).toBe(false)
  })

  it('counts falsy cached results', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Components').getCell('A1').value = { formula: 'SUM(1,2)' }
    const patched = await injectCachedResult(await toBytes(wb), 'SUM(1,2)', 0)
    expect(hasCachedResults(await load(patched))).toBe(true)
  })

  it('scans every worksheet', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Overview').getCell('A1').value = 'plain'
    wb.addWorksheet('Components').getCell('A1').value = { formula: 'SUM(1,2)', result: 3 }
    expect(hasCachedResults(wb)).toBe(true)
  })
})

describe('trimWorkbook (unit)', () => {
  it('strips the Tools sheet', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Components')
    ws.getCell('D7').value = { formula: 'INDEX(PriceListTable,1,1)', result: 5 }
    wb.addWorksheet('Tools').getCell('A1').value = 'run'

    const trimmed = await load(await trimWorkbook(await toBytes(wb)))
    expect(trimmed.getWorksheet('Tools')).toBeUndefined()
    expect(trimmed.worksheets.map(w => w.name))
      .toEqual(['Components', FROZEN_SHEET_NAME])
  })

  it('freezes a formula without a cached <v> to a blank cell', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Components')
    ws.getCell('D7').value = { formula: 'INDEX(PriceListTable,1,1)', result: 5 } // has <v>
    ws.getCell('D8').value = { formula: 'INDEX(PriceListTable,1,2)' }            // no <v>

    const trimmed = await load(await trimWorkbook(await toBytes(wb)))
    const c = trimmed.getWorksheet('Components')!
    expect(c.getCell('D7').formula).toBeUndefined()
    expect(c.getCell('D7').value).toBe(5)
    expect(c.getCell('D8').formula).toBeUndefined()
    expect(c.getCell('D8').value).toBeNull() // froze to blank

    // Both cells were recorded for revival — the blank one too.
    const frozen = trimmed.getWorksheet(FROZEN_SHEET_NAME)!
    expect(String(frozen.getCell(2, 3).value)).toBe('INDEX(PriceListTable,1,1)')
    expect(String(frozen.getCell(3, 3).value)).toBe('INDEX(PriceListTable,1,2)')
  })

  it('freezes a falsy cached result to its value', async () => {
    // A file with <v>0</v>: ExcelJS cannot construct that value
    // in-memory, but a saved-by-Excel workbook can carry it.
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Components')
    ws.getCell('D7').value = { formula: 'INDEX(PriceListTable,1,1)' }
    const patched = await injectCachedResult(
      await toBytes(wb), 'INDEX(PriceListTable,1,1)', 0,
    )
    expect(hasCachedResults(await load(patched))).toBe(true)

    const trimmed = await load(await trimWorkbook(patched))
    const c = trimmed.getWorksheet('Components')!
    expect(c.getCell('D7').formula).toBeUndefined()
    expect(c.getCell('D7').value).toBe(0)
  })
})
