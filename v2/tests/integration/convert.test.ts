import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { generatePricingXlsx } from '../../src/xlsx/writer'
import { mergeIntoMacroWorkbook } from '../../src/xlsx/vba'
import { FROZEN_SHEET_NAME } from '../../src/xlsx/constants'
import {
  toXlsm,
  toXlsx,
  trimWorkbook,
} from '../../src/xlsx/convert'
import { refreshWorkbook } from '../../src/xlsx/reprice'
import type { PricesData } from '../../src/prices/types'
import {
  buildInput,
  cachedNumber,
  injectRecalc,
  makeTmpDir,
  recalcConvert,
  sofficePath,
} from '../helpers'

const root = fileURLToPath(new URL('../..', import.meta.url))
const soffice = sofficePath()

function hasVbaToolchain(): boolean {
  if (existsSync(`${root}/vba/.venv/bin/python`)) return true
  try {
    execFileSync('python3', ['-c', 'import pyOpenVBA'], { stdio: 'ignore' })
    return true
  } catch { return false }
}

function buildTemplate(): Uint8Array {
  execSync('make -C vba build', { cwd: root, stdio: 'pipe' })
  return new Uint8Array(readFileSync(`${root}/public/vba/template.xlsm`))
}

async function load(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await (wb.xlsx.load as unknown as (d: Uint8Array) => Promise<ExcelJS.Workbook>)(bytes)
  return wb
}

let tmp = ''
let profile = ''

beforeAll(() => {
  tmp = makeTmpDir('convert-')
  if (soffice) {
    profile = join(tmp, 'lo-profile')
    execFileSync(soffice, [
      `-env:UserInstallation=file://${profile}`, '--headless', '--terminate_after_init',
    ], { timeout: 60_000, stdio: 'ignore' })
    injectRecalc(profile)
  }
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('toXlsx', () => {
  it.skipIf(!hasVbaToolchain())('strips the VBA project and macro-only sheets', async () => {
    const template = buildTemplate()
    const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
    const merged = await mergeIntoMacroWorkbook(template, content)
    const out = await toXlsx(new Uint8Array(merged))

    const zip = await JSZip.loadAsync(out)
    expect(zip.file('xl/vbaProject.bin')).toBeNull()
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).not.toContain('macroEnabled')
    expect(ct).not.toContain('vbaProject')
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
    expect(rels).not.toContain('vbaProject')

    const wb = await load(new Uint8Array(out))
    expect(wb.worksheets.map(w => w.name))
      .toEqual(['Overview', 'Components', 'Volumes', 'Prices', 'Finder', 'Assumptions', 'ESA', 'T'])
    const names = wb.definedNames.model.map(n => n.name)
    for (const n of ['PriceListDescs', 'PriceListRegions', 'PriceListTable', 'T_ONE_TIME']) {
      expect(names).toContain(n)
    }
  }, 180_000)
})

describe('toXlsm', () => {
  it.skipIf(!hasVbaToolchain())('adds the VBA project and the BOM template', async () => {
    const template = buildTemplate()
    const xlsx = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const out = await toXlsm(new Uint8Array(xlsx), template)

    const zip = await JSZip.loadAsync(out)
    expect(zip.file('xl/vbaProject.bin')).toBeTruthy()

    const wb = await load(new Uint8Array(out))
    expect(wb.worksheets.map(w => w.name))
      .toEqual(['Overview', 'Components', '_BOMTemplate', 'Volumes', 'Prices', 'Finder', 'Assumptions', 'ESA', 'T'])
    expect(wb.getWorksheet('_BOMTemplate')?.state).toBe('veryHidden')
  }, 180_000)

  it.skipIf(!hasVbaToolchain())('round-trips xlsm → xlsx → xlsm', async () => {
    const template = buildTemplate()
    const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
    const merged = await mergeIntoMacroWorkbook(template, content)
    const plain = await toXlsx(new Uint8Array(merged))
    const back = await toXlsm(new Uint8Array(plain), template)
    const zip = await JSZip.loadAsync(back)
    expect(zip.file('xl/vbaProject.bin')).toBeTruthy()
    const wb = await load(new Uint8Array(back))
    expect(wb.getWorksheet('_BOMTemplate')?.state).toBe('veryHidden')
  }, 180_000)
})

describe('trimWorkbook', () => {
  it('fails clearly when formulas have no cached results', async () => {
    const xlsx = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    await expect(trimWorkbook(new Uint8Array(xlsx)))
      .rejects.toThrow(/no cached results — open and save the workbook in Excel first/)
  })

  it('reports the offending cell instead of crashing on an unreadable shared formula', async () => {
    // A shared-formula slave whose master has no formula text: ExcelJS's
    // slideFormula throws a TypeError (`replace` of undefined) when the
    // formula getter is read.  trimWorkbook must surface the sheet/cell
    // as a TrimError instead of letting the TypeError escape.
    const zip = new JSZip()
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`)
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`)
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="B1"><f t="shared" si="0" ref="B1:B2"></f><v>1</v></c>
    </row>
    <row r="2">
      <c r="B2"><f t="shared" si="0"/><v>2</v></c>
    </row>
  </sheetData>
</worksheet>`)
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
    // The shared-formula translation throws a TypeError inside ExcelJS
    // (slideFormula calls .replace on undefined); trimWorkbook must
    // convert that into an actionable TrimError naming the cell and
    // its unresolvable master.
    await expect(trimWorkbook(bytes))
      .rejects.toThrowError(/Sheet1!B2 — its shared-formula master \(B1\)/)
  })

  it('freezes shared-formula slaves whose master is itself frozen', async () => {
    // Regression: the freeze pass runs cells in order — the master B1
    // (references PriceListTable) is frozen before its slave B2 is
    // read.  ExcelJS resolves slave formulas by translating the
    // master's text, so a single-pass freeze would crash at B2.  The
    // two-pass snapshot must read (and translate) every formula before
    // anything is frozen.
    const zip = new JSZip()
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`)
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`)
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="B1"><f t="shared" si="0" ref="B1:B2">INDEX(PriceListTable,$A1,1)</f><v>11</v></c>
    </row>
    <row r="2">
      <c r="B2"><f t="shared" si="0"/><v>22</v></c>
    </row>
  </sheetData>
</worksheet>`)
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
    const out = await trimWorkbook(bytes)

    const wb = await load(new Uint8Array(out))
    expect(wb.worksheets.map(w => w.name)).toEqual(['Sheet1', FROZEN_SHEET_NAME])
    const ws = wb.getWorksheet('Sheet1')!
    expect(ws.getCell('B1').formula).toBeUndefined()
    expect(ws.getCell('B1').value).toBe(11)
    expect(ws.getCell('B2').formula).toBeUndefined()
    expect(ws.getCell('B2').value).toBe(22)

    // Both the master and its slave were recorded; the slave's formula
    // text was translated (relative ref slid to row 2) before the
    // master was frozen.
    const frozen = wb.getWorksheet(FROZEN_SHEET_NAME)!
    expect(frozen.lastRow?.number).toBe(3)
    expect(String(frozen.getCell(2, 2).value)).toBe('Sheet1!$B$1')
    expect(String(frozen.getCell(2, 3).value)).toBe('INDEX(PriceListTable,$A1,1)')
    expect(String(frozen.getCell(3, 2).value)).toBe('Sheet1!$B$2')
    expect(String(frozen.getCell(3, 3).value)).toBe('INDEX(PriceListTable,$A2,1)')
  })

  it.skipIf(!soffice)('freezes to cached results and strips the pricing sheets', async () => {
    // LibreOffice fills the cached results (a saved-by-Excel file's
    // equivalent), then the offline trim freezes from them.
    const generated = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const inPath = join(tmp, 'calc.xlsx')
    writeFileSync(inPath, Buffer.from(generated))
    const calcPath = recalcConvert(soffice!, profile, inPath, join(tmp, 'calc-out'))
    const calc = await load(new Uint8Array(readFileSync(calcPath)))

    // Collect the expected frozen values from the calculated file
    // (`cell.result`, not `cell.value` — the latter drops falsy
    // cached values like 0, which must survive the freeze).
    const expected = new Map<string, unknown>()
    const comp = calc.getWorksheet('Components')!
    comp.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const formula = cell.formula
        if (formula
          && (formula.includes('PriceList') || formula.includes('Prices!'))) {
          expected.set(cell.address, cell.result ?? null)
        }
      })
    })
    expect(expected.size).toBeGreaterThan(0)

    const out = await trimWorkbook(new Uint8Array(readFileSync(calcPath)))
    const wb = await load(new Uint8Array(out))

    // Pricing + macro-support sheets gone; _Frozen present and hidden
    expect(wb.worksheets.map(w => w.name))
      .toEqual(['Overview', 'Components', 'Assumptions', 'ESA', 'T', FROZEN_SHEET_NAME])
    expect(wb.getWorksheet(FROZEN_SHEET_NAME)?.state).toBe('veryHidden')
    // T is machinery (identity + provenance + T_ONE_TIME anchor):
    // hidden like _Frozen, restored to visible by a later refresh.
    expect(wb.getWorksheet('T')?.state).toBe('veryHidden')

    // Formulas frozen to their cached values
    const trimmedComp = wb.getWorksheet('Components')!
    for (const [addr, result] of expected) {
      const cell = trimmedComp.getCell(addr)
      expect(cell.formula, addr).toBeUndefined()
      expect(cell.value, addr).toEqual(result ?? null)
    }

    // PriceList* names dropped, T_ONE_TIME kept
    const names = wb.definedNames.model.map(n => n.name)
    expect(names.some(n => n.startsWith('PriceList'))).toBe(false)
    expect(names).toContain('T_ONE_TIME')

    // PriceList* data validations removed
    const dvs = (trimmedComp as unknown as {
      dataValidations: { model: Record<string, { formulae?: unknown[] }> };
    }).dataValidations.model
    expect(Object.values(dvs).some(dv => String(dv?.formulae?.[0] ?? '').startsWith('PriceList'))).toBe(false)

    // _Frozen records: LiveRef formula, original address, formula text
    // (row 1 carries the headers; records start at row 2)
    const frozen = wb.getWorksheet(FROZEN_SHEET_NAME)!
    expect(String(frozen.getCell(1, 1).value)).toBe('LiveRef')
    const first = frozen.getRow(2)
    const live = first.getCell(1).value as { formula?: string } | null
    expect(live?.formula).toContain('Components!$')
    expect(String(first.getCell(2).value)).toMatch(/^Components!\$[A-Z]+\$\d+$/)
    expect(String(first.getCell(3).value)).toMatch(/^(IF|INDEX|MATCH)\(/)
    expect(first.getCell(3).value).not.toBe('=')
    expect(String(first.getCell(3).value).startsWith('=')).toBe(false)

    // Only user-owned sheets are frozen: the Finder, the BOM template,
    // and the deleted pricing sheets must never appear as records.
    for (let r = 2; r <= (frozen.lastRow?.number ?? 1); r++) {
      expect(String(frozen.getCell(r, 2).value)).toMatch(/^Components!\$[A-Z]+\$\d+$/)
    }

    // The trimmed deliverable still loads in LibreOffice
    const trimmedPath = join(tmp, 'trimmed.xlsx')
    writeFileSync(trimmedPath, Buffer.from(out))
    const reOut = recalcConvert(soffice!, profile, trimmedPath, join(tmp, 'trimmed-out'))
    expect(existsSync(reOut)).toBe(true)
  }, 180_000)

  it.skipIf(!soffice || !hasVbaToolchain())(
    'trims a macro workbook, dropping _BOMTemplate',
    async () => {
      // LO recalculates the merged xlsm (dropping only the VBA project)
      // and saves cached results as xlsx — the saved-by-Excel shape
      // trimWorkbook targets.
      const template = buildTemplate()
      const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
      const merged = await mergeIntoMacroWorkbook(template, content)
      const inPath = join(tmp, 'macro-trim.xlsm')
      writeFileSync(inPath, Buffer.from(merged))
      const calcPath = recalcConvert(soffice!, profile, inPath, join(tmp, 'macro-trim-out'))
      const calc = await load(new Uint8Array(readFileSync(calcPath)))
      expect(calc.getWorksheet('_BOMTemplate')).toBeTruthy() // LO kept it

      const out = await trimWorkbook(new Uint8Array(readFileSync(calcPath)))
      const trimmed = await load(new Uint8Array(out))
      expect(trimmed.getWorksheet('_BOMTemplate')).toBeUndefined()
      expect(trimmed.worksheets.map(w => w.name))
        .toEqual(['Overview', 'Components', 'Assumptions', 'ESA', 'T', FROZEN_SHEET_NAME])
    },
    180_000,
  )
})

  it.skipIf(!soffice)('trim → refresh revival → LibreOffice recalc agrees', async () => {
    // LO fills the cached results; trimWorkbook freezes + records;
    // refreshWorkbook revives the formulas and reprices; LO recalcs
    // the revived workbook to the same values.
    const generated = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const inPath = join(tmp, 'chain.xlsx')
    writeFileSync(inPath, Buffer.from(generated))
    const calcPath = recalcConvert(soffice!, profile, inPath, join(tmp, 'chain-calc'))
    const trimmed = await trimWorkbook(new Uint8Array(readFileSync(calcPath)))

    const data: PricesData = buildInput().pricingData
    const changed: PricesData = { ...data, timestamp: (data.timestamp ?? 0) + 86400 }
    const res = await refreshWorkbook(new Uint8Array(trimmed), changed, {
      appMeta: { version: 'test', spaUrl: 'http://spa/', sourceUrl: 'https://example.com/prices.json' },
    })
    expect(res.buffer).not.toBeNull()
    expect(res.warnings.some(w => w.includes('restored'))).toBe(true)

    const revivedPath = join(tmp, 'revived.xlsx')
    writeFileSync(revivedPath, Buffer.from(res.buffer!))
    const outPath = recalcConvert(soffice!, profile, revivedPath, join(tmp, 'revived-out'))
    const wb = await load(new Uint8Array(readFileSync(outPath)))

    expect(wb.getWorksheet('_Frozen')).toBeUndefined()
    // The rebuild restored T's visibility (trim hides it).
    expect(wb.getWorksheet('T')?.state).toBe('visible')

    const prices = wb.getWorksheet('Prices')!
    let vmRow = 0
    prices.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(2).value === 'Compute: Virtuelle Maschine 2 vcpu 4 GiB'
        && row.getCell(28).value === 'eu-de') {
        vmRow = row.number
      }
    })
    expect(vmRow).toBeGreaterThan(0)

    const ws = wb.getWorksheet('Components')!
    let skuCol = 0
    let priceCol = 0
    let descCol = 0
    for (let rowNo = 1; rowNo <= 12; rowNo++) {
      ws.getRow(rowNo).eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value === 'Row Idx') skuCol = cell.col
        if (cell.value === 'PayG') priceCol = cell.col
        if (cell.value === 'Description') descCol = cell.col
      })
    }
    let vmDataRow = 0
    ws.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(descCol).value === 'Compute: Virtuelle Maschine 2 vcpu 4 GiB') {
        vmDataRow = row.number
      }
    })
    expect(vmDataRow).toBeGreaterThan(0)
    const sku = ws.getRow(vmDataRow).getCell(skuCol).value as { result?: unknown }
    expect(sku.result).toBe(vmRow)
    const price = ws.getRow(vmDataRow).getCell(priceCol).value as { result?: unknown }
    expect(price.result).toBeCloseTo(0.05, 5)

    expect(cachedNumber(wb.getWorksheet('Finder')!.getCell('S3'))).toBe(2)
  }, 180_000)
