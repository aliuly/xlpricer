import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mergeIntoMacroWorkbook } from '../../src/xlsx/vba'
import { refreshWorkbook } from '../../src/xlsx/reprice'
import { generatePricingXlsx } from '../../src/xlsx/writer'
import type { PricesData } from '../../src/prices/types'
import {
  buildInput,
  cachedNumber,
  cachedText,
  injectRecalc,
  makeTmpDir,
  recalcConvert,
  sofficePath,
} from '../helpers'

const root = fileURLToPath(new URL('../..', import.meta.url))
const soffice = sofficePath()
const maybe = soffice ? describe : describe.skip

/** Toolchain present when the vba venv exists or pyOpenVBA imports. */
function hasVbaToolchain(): boolean {
  if (existsSync(`${root}/vba/.venv/bin/python`)) return true
  try {
    execFileSync('python3', ['-c', 'import pyOpenVBA'], { stdio: 'ignore' })
    return true
  } catch { return false }
}

let tmp = ''
let profile = ''

maybe('LibreOffice recalc smoke', () => {
  beforeAll(() => {
    tmp = makeTmpDir('lo-recalc-')
    profile = join(tmp, 'profile')
    // First run materialises registrymodifications.xcu in the profile
    execFileSync(soffice!, [
      `-env:UserInstallation=file://${profile}`, '--headless', '--terminate_after_init',
    ], { timeout: 60_000, stdio: 'ignore' })
    injectRecalc(profile)
  })

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  async function recalcGenerated(): Promise<ExcelJS.Workbook> {
    const buffer = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const inPath = join(tmp, 'gen.xlsx')
    writeFileSync(inPath, Buffer.from(buffer))
    const outPath = recalcConvert(soffice!, profile, inPath, join(tmp, 'out'))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(outPath))
    return wb
  }

  /** Column of the first cell whose value equals `label` (rows 1..12). */
  function colOf(ws: ExcelJS.Worksheet, label: string): number {
    for (let r = 1; r <= 12; r++) {
      let found = 0
      ws.getRow(r).eachCell({ includeEmpty: false }, cell => {
        if (cell.value === label) found = cell.col
      })
      if (found) return found
    }
    return 0
  }

  /** Cell right of the given label in `labelCol` (rows 1..12). */
  function nextTo(ws: ExcelJS.Worksheet, labelCol: number, label: string): ExcelJS.Cell {
    for (let r = 1; r <= 12; r++) {
      if (ws.getRow(r).getCell(labelCol).value === label) {
        return ws.getRow(r).getCell(labelCol + 1)
      }
    }
    throw new Error(`label not found: ${label}`)
  }

  /** Display text of a cell: cached formula result or plain value. */
  function cellText(cell: ExcelJS.Cell): string {
    return cachedText(cell)
      ?? (typeof cell.value === 'string' ? cell.value : String(cell.value ?? ''))
  }

  it('recalculates the generated workbook: BOM lookups, Overview totals, Finder', async () => {
    const wb = await recalcGenerated()

    /* ── Prices: locate the VM title row (eu-de) ── */
    const prices = wb.getWorksheet('Prices')!
    let vmRow = 0
    prices.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(2).value === 'Compute: Virtuelle Maschine 2 vcpu 4 GiB'
        && row.getCell(28).value === 'eu-de') {
        vmRow = row.number
      }
    })
    expect(vmRow).toBeGreaterThan(0)

    /* ── Components: header row + the VM data row ── */
    const ws = wb.getWorksheet('Components')!
    const skuCol = colOf(ws, 'Row Idx')
    const priceCol = colOf(ws, 'PayG')
    const descCol = colOf(ws, 'Description')
    expect(skuCol).toBeGreaterThan(0)
    expect(priceCol).toBeGreaterThan(0)
    expect(descCol).toBeGreaterThan(0)

    let vmDataRow = 0
    ws.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(descCol).value === 'Compute: Virtuelle Maschine 2 vcpu 4 GiB') {
        vmDataRow = row.number
      }
    })
    expect(vmDataRow).toBeGreaterThan(0)

    // PriceListDescs/PriceListRegions MATCH resolves to the Prices row
    // (the name ranges start at row 1, so match position == row number)
    const sku = cachedNumber(ws.getRow(vmDataRow).getCell(skuCol))
    expect(sku).toBe(vmRow)

    const price = cachedNumber(ws.getRow(vmDataRow).getCell(priceCol))
    expect(price).toBeCloseTo(0.05, 5)

    /* ── Tier link: BOM → Volumes → Prices group price computes ── */
    let priceAmtCol = 0
    prices.getRow(3).eachCell({ includeEmpty: false }, cell => {
      if (typeof cell.value === 'string' && cell.value.includes('(priceAmount)')) {
        priceAmtCol = cell.col
      }
    })
    expect(priceAmtCol).toBeGreaterThan(0)
    let tierRow = 0
    prices.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(2).value === 'Storage: OBS Outbound Traffic (GiB)') {
        tierRow = row.number
      }
    })
    expect(tierRow).toBeGreaterThan(0)
    // qty 1 × unit GiB → tiered volume 1 → 1×0.09 / 1 = 0.09
    expect(cachedNumber(prices.getRow(tierRow).getCell(priceAmtCol))).toBeCloseTo(0.09, 5)

    /* ── Cross-sheet: Overview total-tabs sums agree with the BOM ── */
    const monthly = cachedNumber(nextTo(ws, 4, 'Monthly Total:'))
    expect(monthly).toBeGreaterThan(0)
    const ov = wb.getWorksheet('Overview')!
    const totalTabs = nextTo(ov, 13, 'total tabs')
    const monthlySum = cachedNumber(ov.getRow(totalTabs.row).getCell(15))
    expect(monthlySum).toBeCloseTo(monthly!, 5)

    /* ── Finder: dynamic arrays computed ── */
    const finder = wb.getWorksheet('Finder')!
    expect(cachedNumber(finder.getCell('S3'))).toBe(2)
    expect(cellText(finder.getCell('B9'))).toContain('Results (2 matches)')
    expect(cellText(finder.getCell('B11'))).toContain('Virtuelle Maschine')
    expect(['eu-de', 'eu-nl']).toContain(cellText(finder.getCell('C11')))
    expect(cachedNumber(finder.getCell('D11'))).toBe(2)          // vCpu
    expect(cachedNumber(finder.getCell('E11'))).toBe(4)          // RAM
    expect(cachedNumber(finder.getCell('F11'))).toBeCloseTo(0.05, 5) // priceAmount
    expect(cellText(finder.getCell('G11'))).toBe('h')            // unit
    expect(cachedNumber(finder.getCell('H11'))).toBeCloseTo(0.04, 5) // R12
    expect(cachedNumber(finder.getCell('I11'))).toBeCloseTo(0.03, 5) // R24
    expect(cachedNumber(finder.getCell('J11'))).toBeCloseTo(0.02, 5) // R36
    // K is the shared match-row index the other columns INDEX into
    // (block cells beyond the anchor carry no cached result).
    expect([4, 5]).toContain(cachedNumber(finder.getCell('K11')))
  }, 180_000)

  it('recalculates a refreshed workbook with the same values', async () => {
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const data: PricesData = buildInput().pricingData
    const changed: PricesData = { ...data, timestamp: (data.timestamp ?? 0) + 86400 }
    const res = await refreshWorkbook(new Uint8Array(bytes), changed, {
      appMeta: { version: 'test', spaUrl: 'http://spa/', sourceUrl: 'https://example.com/prices.json' },
    })
    expect(res.buffer).not.toBeNull()
    const inPath = join(tmp, 'refreshed.xlsx')
    writeFileSync(inPath, Buffer.from(res.buffer!))
    const outPath = recalcConvert(soffice!, profile, inPath, join(tmp, 'out-refreshed'))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(outPath))

    // VM lookup resolves against the PriceList* names
    const prices = wb.getWorksheet('Prices')!
    let vmRow = 0
    prices.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(2).value === 'Compute: Virtuelle Maschine 2 vcpu 4 GiB'
        && row.getCell(28).value === 'eu-de') {
        vmRow = row.number
      }
    })
    const ws = wb.getWorksheet('Components')!
    const skuCol = colOf(ws, 'Row Idx')
    const priceCol = colOf(ws, 'PayG')
    const descCol = colOf(ws, 'Description')
    let vmDataRow = 0
    ws.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(descCol).value === 'Compute: Virtuelle Maschine 2 vcpu 4 GiB') {
        vmDataRow = row.number
      }
    })
    expect(vmRow).toBeGreaterThan(0)
    expect(vmDataRow).toBeGreaterThan(0)
    expect(cachedNumber(ws.getRow(vmDataRow).getCell(skuCol))).toBe(vmRow)
    expect(cachedNumber(ws.getRow(vmDataRow).getCell(priceCol))).toBeCloseTo(0.05, 5)

    // Cross-sheet totals still agree (the T_ONE_TIME name resolves)
    const monthly = cachedNumber(nextTo(ws, 4, 'Monthly Total:'))
    expect(monthly).toBeGreaterThan(0)
    const ov = wb.getWorksheet('Overview')!
    const totalTabs = nextTo(ov, 13, 'total tabs')
    expect(cachedNumber(ov.getRow(totalTabs.row).getCell(15))).toBeCloseTo(monthly!, 5)

    // Tier link computes (the refreshed BOM still carries the OBS row)
    let priceAmtCol = 0
    prices.getRow(3).eachCell({ includeEmpty: false }, cell => {
      if (typeof cell.value === 'string' && cell.value.includes('(priceAmount)')) {
        priceAmtCol = cell.col
      }
    })
    let tierRow = 0
    prices.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(2).value === 'Storage: OBS Outbound Traffic (GiB)') {
        tierRow = row.number
      }
    })
    expect(tierRow).toBeGreaterThan(0)
    expect(cachedNumber(prices.getRow(tierRow).getCell(priceAmtCol))).toBeCloseTo(0.09, 5)

    // Finder still computes
    expect(cachedNumber(wb.getWorksheet('Finder')!.getCell('S3'))).toBe(2)
  }, 180_000)

  it.skipIf(!hasVbaToolchain())(
    'loads the merged xlsm in LibreOffice',
    async () => {
      execSync('make -C vba build', { cwd: root, stdio: 'pipe' })
      const template = readFileSync(`${root}/public/vba/template.xlsm`)
      const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
      const merged = await mergeIntoMacroWorkbook(new Uint8Array(template), content)
      const inPath = join(tmp, 'merged.xlsm')
      writeFileSync(inPath, Buffer.from(merged))
      const outPath = recalcConvert(soffice!, profile, inPath, join(tmp, 'out-merged'))
      expect(existsSync(outPath)).toBe(true)

      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(readFileSync(outPath))
      expect(wb.getWorksheet('T')).toBeTruthy()
      const names = wb.definedNames.model.map(n => n.name)
      for (const n of ['PriceListDescs', 'PriceListRegions', 'PriceListTable']) {
        expect(names).toContain(n)
      }
    },
    180_000,
  )
})
