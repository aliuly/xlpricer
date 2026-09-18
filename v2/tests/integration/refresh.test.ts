import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { generatePricingXlsx } from '../../src/xlsx/writer'
import { mergeIntoMacroWorkbook } from '../../src/xlsx/vba'
import { refreshWorkbook } from '../../src/xlsx/reprice'
import type { PricesData } from '../../src/prices/types'
import { buildInput } from '../helpers'

const root = fileURLToPath(new URL('../..', import.meta.url))

const appMeta = {
  version: 'test',
  spaUrl: 'http://spa/',
  sourceUrl: 'https://example.com/prices.json',
}

/** Freshly pipelined fixture data with a newer publish date. */
function changedData(): PricesData {
  const data = buildInput().pricingData
  return { ...data, timestamp: (data.timestamp ?? 0) + 86400 }
}

async function load(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await (wb.xlsx.load as unknown as (d: Uint8Array) => Promise<ExcelJS.Workbook>)(bytes)
  return wb
}

function hasVbaToolchain(): boolean {
  if (existsSync(`${root}/vba/.venv/bin/python`)) return true
  try {
    execFileSync('python3', ['-c', 'import pyOpenVBA'], { stdio: 'ignore' })
    return true
  } catch { return false }
}

/** Compare the user-editable (non-formula) cells of two sheets. */
function expectUserCellsEqual(a: ExcelJS.Worksheet, b: ExcelJS.Worksheet): void {
  a.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      if (cell.formula) return
      expect(b.getCell(cell.address).value, `${a.name}!${cell.address}`).toEqual(cell.value)
    })
  })
}

describe('refreshWorkbook', () => {
  it('aborts unchanged data without producing output', async () => {
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const res = await refreshWorkbook(
      new Uint8Array(bytes),
      buildInput().pricingData,
      { appMeta },
    )
    expect(res.buffer).toBeNull()
    expect(res.check.stale).toBe(false)
  })

  it('refreshes when forced, noting the force', async () => {
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const res = await refreshWorkbook(
      new Uint8Array(bytes),
      buildInput().pricingData,
      { appMeta, force: true },
    )
    expect(res.forced).toBe(true)
    expect(res.buffer).not.toBeNull()
    expect(res.warnings.some(w => w.includes('forcing'))).toBe(true)
  })

  it('refuses trimmed workbooks', async () => {
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const wb = await load(new Uint8Array(bytes))
    wb.removeWorksheet(wb.getWorksheet('Prices')!.id)
    wb.removeWorksheet(wb.getWorksheet('Volumes')!.id)
    const trimmed = await wb.xlsx.writeBuffer()
    await expect(refreshWorkbook(
      new Uint8Array(trimmed), changedData(), { appMeta },
    )).rejects.toMatchObject({ kind: 'trimmed' })
  })

  it('refuses workbooks with no discoverable BOM tabs', async () => {
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const wb = await load(new Uint8Array(bytes))
    const vols = wb.getWorksheet('Volumes')!
    vols.getRow(1).eachCell({ includeEmpty: false }, cell => {
      if (cell.value === 'Tab Volumes') cell.value = null
    })
    const stripped = await wb.xlsx.writeBuffer()
    await expect(refreshWorkbook(
      new Uint8Array(stripped), changedData(), { appMeta },
    )).rejects.toMatchObject({ kind: 'no-bom-tabs' })
  })

  it('aborts on a schema identity change, unless forced', async () => {
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const badSchema = { ...changedData(), schema: 'pipeline-pricing-2.0' }
    await expect(refreshWorkbook(
      new Uint8Array(bytes), badSchema, { appMeta },
    )).rejects.toMatchObject({ kind: 'schema-major' })
    const forced = await refreshWorkbook(
      new Uint8Array(bytes), badSchema, { appMeta, force: true },
    )
    expect(forced.buffer).not.toBeNull()
  })

  it('refreshes a workbook end-to-end, keeping user sheets untouched', async () => {
    const oldBytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const res = await refreshWorkbook(new Uint8Array(oldBytes), changedData(), { appMeta })
    expect(res.buffer).not.toBeNull()
    expect(res.check.stale).toBe(true)
    expect(res.check.changedKeys).toContain('pricing-data')

    const fresh = await load(new Uint8Array(res.buffer!))
    const old = await load(new Uint8Array(oldBytes))

    // User-owned sheets untouched (data cells byte-identical)
    expectUserCellsEqual(old.getWorksheet('Components')!, fresh.getWorksheet('Components')!)
    expectUserCellsEqual(old.getWorksheet('Overview')!, fresh.getWorksheet('Overview')!)

    // Formulas keep referencing the defined names, incl. T_ONE_TIME
    const comp = fresh.getWorksheet('Components')!
    const formulas: string[] = []
    comp.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.formula) formulas.push(cell.formula)
      })
    })
    expect(formulas.some(f => f.includes('PriceListTable'))).toBe(true)
    expect(formulas.some(f => f.includes('T_ONE_TIME'))).toBe(true)
    expect(formulas.some(f => f.includes('T!$C$'))).toBe(false)

    // New baseline recorded
    const t = fresh.getWorksheet('T')!
    let formatVer = ''
    t.eachRow((row) => {
      if (row.getCell(2).value === 'Format version') formatVer = String(row.getCell(3).value)
    })
    expect(formatVer).toBe('2.0.1')

    // Tab order restored; names are single ranges, none pointing at
    // removed sheets
    expect(fresh.worksheets.map(w => w.name))
      .toEqual(['Overview', 'Components', 'Volumes', 'Prices', 'Finder', 'Assumptions', 'ESA', 'T'])
    const byName = Object.fromEntries(fresh.definedNames.model.map(n => [n.name, n.ranges]))
    expect(byName['PriceListDescs']).toHaveLength(1)
    expect(byName['PriceListRegions']).toHaveLength(1)
    expect(byName['PriceListTable']).toHaveLength(1)
    expect(byName['T_ONE_TIME']).toHaveLength(1)
    for (const entry of fresh.definedNames.model) {
      for (const range of entry.ranges) {
        const sheet = range.startsWith("'")
          ? range.slice(1, range.indexOf("'!", 1)).replace(/''/g, "'")
          : range.slice(0, range.indexOf('!'))
        expect(fresh.getWorksheet(sheet), `range of ${entry.name}`).toBeTruthy()
      }
    }
  })

  it.skipIf(!hasVbaToolchain())(
    'gains _BOMTemplate when refreshing an xlsx with a macro template',
    async () => {
      execSync('make -C vba build', { cwd: root, stdio: 'pipe' })
      const template = readFileSync(`${root}/public/vba/template.xlsm`)
      const xlsxBytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
      const res = await refreshWorkbook(
        new Uint8Array(xlsxBytes),
        changedData(),
        { appMeta, xlsmTemplate: new Uint8Array(template) },
      )
      const zip = await JSZip.loadAsync(res.buffer as never)
      expect(zip.file('xl/vbaProject.bin')).toBeTruthy()
      const wb = await load(new Uint8Array(res.buffer!))
      expect(wb.getWorksheet('_BOMTemplate')?.state).toBe('veryHidden')
      expect(wb.worksheets.map(w => w.name))
        .toEqual(['Overview', 'Components', '_BOMTemplate', 'Volumes', 'Prices', 'Finder', 'Assumptions', 'ESA', 'T'])
    },
    180_000,
  )

  it.skipIf(!hasVbaToolchain())(
    'refreshes an xlsm keeping its own macros',
    async () => {
      execSync('make -C vba build', { cwd: root, stdio: 'pipe' })
      const template = readFileSync(`${root}/public/vba/template.xlsm`)
      const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
      const xlsmBytes = await mergeIntoMacroWorkbook(new Uint8Array(template), content)
      // CLI passes the ORIGINAL bytes as the host when no --xlsm template
      const res = await refreshWorkbook(
        new Uint8Array(xlsmBytes),
        changedData(),
        { appMeta, xlsmTemplate: new Uint8Array(xlsmBytes) },
      )
      const zip = await JSZip.loadAsync(res.buffer as never)
      expect(zip.file('xl/vbaProject.bin')).toBeTruthy()
      const wb = await load(new Uint8Array(res.buffer!))
      expect(wb.getWorksheet('_BOMTemplate')?.state).toBe('veryHidden')
    },
    180_000,
  )
})

  it('revives a marked trimmed workbook and refreshes it', async () => {
    // Simulate TrimWB: record the Prices-referencing formulas into
    // _Frozen, freeze them, delete the pricing sheets.
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const wb = await load(new Uint8Array(bytes))
    const comp = wb.getWorksheet('Components')!
    const frozen = wb.addWorksheet('_Frozen')
    frozen.state = 'veryHidden'
    frozen.getCell(1, 1).value = 'LiveRef'
    frozen.getCell(1, 2).value = 'OriginalAddress'
    frozen.getCell(1, 3).value = 'FormulaText'
    let r = 1
    let recorded = 0
    comp.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (!cell.formula) return
        if (!cell.formula.includes('PriceList') && !cell.formula.includes('Prices!')) return
        r++
        frozen.getCell(r, 1).value = { formula: `'${comp.name}'!${cell.address}` }
        frozen.getCell(r, 2).value = `'${comp.name}'!${cell.address}`
        frozen.getCell(r, 3).value = cell.formula
        recorded++
        cell.value = 0
      })
    })
    expect(recorded).toBeGreaterThan(0)
    for (const name of ['Prices', 'Volumes', 'Finder']) {
      wb.removeWorksheet(wb.getWorksheet(name)!.id)
    }
    const trimmed = await wb.xlsx.writeBuffer()

    const res = await refreshWorkbook(new Uint8Array(trimmed), changedData(), { appMeta })
    expect(res.buffer).not.toBeNull()
    expect(res.warnings.some(w => w.includes('restored'))).toBe(true)

    const fresh = await load(new Uint8Array(res.buffer!))
    expect(fresh.getWorksheet('_Frozen')).toBeUndefined()
    expect(fresh.worksheets.map(w => w.name))
      .toEqual(['Overview', 'Components', 'Volumes', 'Prices', 'Finder', 'Assumptions', 'ESA', 'T'])
    const formulas: string[] = []
    fresh.getWorksheet('Components')!.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.formula) formulas.push(cell.formula)
      })
    })
    expect(formulas.some(f => f.includes('PriceListTable'))).toBe(true)
    expect(formulas.some(f => f.includes('T_ONE_TIME'))).toBe(true)
  })
