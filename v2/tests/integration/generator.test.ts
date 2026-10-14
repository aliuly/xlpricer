import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { META_SHEET_NAME } from '../../src/xlsx/constants'
import { generatePricingXlsx } from '../../src/xlsx/writer'
import { EXPECTED_SHEETS, buildInput } from '../helpers'

async function loadGenerated(vbaTemplate: boolean): Promise<ExcelJS.Workbook> {
  const buffer = await generatePricingXlsx(buildInput(), { vbaTemplate })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

function dumpValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if (value instanceof Date) return value.toISOString()
  const obj = value as Record<string, unknown>
  if (Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text?: unknown }>).map(r => String(r.text ?? '')).join('')
  }
  if ('result' in obj) return String(obj.result)
  if ('formula' in obj) return `=${String(obj.formula)}`
  return JSON.stringify(value)
}

describe('generated workbook layout', () => {
  it('produces the expected sheet order and hidden template state', async () => {
    const wb = await loadGenerated(true)
    expect(wb.worksheets.map(w => w.name)).toEqual(EXPECTED_SHEETS)
    expect(wb.getWorksheet('_BOMTemplate')?.state).toBe('veryHidden')
  })

  it('omits the template sheet for plain xlsx output', async () => {
    const wb = await loadGenerated(false)
    expect(wb.worksheets.map(w => w.name)).not.toContain('_BOMTemplate')
  })

  it('writes Prices headers with (key) markers and an autofilter', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Prices')!
    const headers = new Set<string>()
    ws.getRow(3).eachCell({ includeEmpty: false }, cell => {
      if (typeof cell.value === 'string') headers.add(cell.value)
    })
    expect([...headers].some(h => h.includes('\n(region)'))).toBe(true)
    expect([...headers].some(h => h.includes('\n(_backup_idx_)'))).toBe(true)
    expect(ws.autoFilter).toBeTruthy()
  })

  it('links tiered SKU prices to the Volumes tier cells', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Prices')!
    let priceCol = 0
    ws.getRow(3).eachCell({ includeEmpty: false }, cell => {
      if (typeof cell.value === 'string' && cell.value.includes('(priceAmount)')) {
        priceCol = cell.col
      }
    })
    expect(priceCol).toBeGreaterThan(0)
    let groupRow = 0
    ws.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(2).value === 'Storage: OBS Outbound Traffic (GiB)') {
        groupRow = row.number
      }
    })
    expect(groupRow).toBeGreaterThan(0)
    expect(ws.getCell(groupRow, priceCol).formula.startsWith('Volumes!$')).toBe(true)
  })

  it('gives the BOM Description column a PriceListDescs dropdown', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Components')!
    const dvs = Object.values(ws.dataValidations.model)
    expect(dvs.some(dv => dv.formulae?.includes('PriceListDescs'))).toBe(true)
  })

  it('trades the Region and Description filter inputs', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Finder')!
    // Region takes the old Description slot (row 4, merged C:F) …
    expect(ws.getCell('B4').value).toBe('Region')
    expect(ws.getCell('C4').value).toBe('(all)')
    expect(ws.model.merges).toContain('C4:F4')
    // … and Description stays next to storageType (label G6, merged H6:K6).
    expect(ws.getCell('G6').value).toBe('Description')
    expect(ws.getCell('H6').value).toBe('Virtuelle Maschine')
    expect(ws.model.merges).toContain('H6:K6')
  })

  it('scopes the Description dropdown to the other criteria and exact-matches', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Finder')!

    // H6: dynamic list dropdown (strict), pre-selected default.
    const dv = ws.dataValidations.model['H6']
    expect(dv).toBeTruthy()
    expect(dv.formulae?.[0]).toMatch(/^\$N4:/)
    expect(dv.showErrorMessage).toBe(true)
    expect(ws.getCell('H6').value).toBe('Virtuelle Maschine')

    // The description helper (N4) is scoped to ALL the other criteria…
    const descList = ws.getCell('N4').formula
    expect(descList).toContain('$C$3')     // productFamily
    expect(descList).toContain('$C$5')     // productId
    expect(descList).toContain('$C$8')     // osUnit
    expect(descList).not.toContain('$H$6') // …but not its own filter

    // …the other helpers stay family-scoped…
    expect(ws.getCell('O4').formula).not.toContain('$C$5')

    // …and the criteria exact-match the description, guarded on
    // blank/(all).  The other dropdowns treat blank like "(all)" too.
    const formula = ws.getCell('L11').formula
    expect(formula).toContain('($H$6="")+($H$6="(all)")')
    expect(formula).toContain('=$H$6)')
    expect(formula).not.toContain('FIND(')
    expect(formula).toContain('($C$5="")')     // productId: blank = (all)
    expect(formula).toContain('($C$4="")')     // region: blank = (all)
  })

  it('moves osUnit below serviceType and adds unit to the results', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Finder')!

    // All dropdowns are on the left; osUnit is the last one (row 8).
    expect(ws.getCell('B8').value).toBe('osUnit')
    expect(ws.getCell('C8').value).toBe('(all)')
    expect(ws.model.merges).toContain('C8:F8')

    // vCpu/RAM min/max live at H..K of rows 3-4; the max cells mirror
    // the min cells so a lone min gives an exact match.
    expect(ws.getCell('G3').value).toBe('vCpu')
    expect(ws.getCell('H3').value).toBe('min')
    expect(ws.getCell('J3').value).toBe('max')
    expect(ws.getCell('K3').formula).toContain('IF($I$3="","",$I$3)')
    expect(ws.getCell('G4').value).toBe('RAM')
    expect(ws.getCell('K4').formula).toContain('IF($I$4="","",$I$4)')

    // Results: unit sits right of priceAmount; the Monthly column
    // right of unit scales hourly units by FT_HOURS; L is the shared
    // match-row index the other columns INDEX into.
    expect(ws.getCell('F10').value).toBe('priceAmount')
    expect(ws.getCell('G10').value).toBe('unit')
    expect(ws.getCell('H10').value).toBe('Monthly')
    expect(ws.getCell('I10').value).toBe('R12')
    expect(ws.getCell('J10').value).toBe('R24')
    expect(ws.getCell('K10').value).toBe('R36')
    expect(ws.getCell('L10').value).toBe('Row')
    expect(ws.getCell('L11').formula).toContain('SORTBY')
    expect(ws.getCell('L11').formula).toContain('FILTER(ROW(Prices!')
    expect(ws.getCell('B11').formula).toContain('INDEX(')
    expect(ws.getCell('B11').formula).toContain('$L$11')

    // Helper lists moved behind the L/M spacer columns (N..R), and the
    // match count moved to S3.
    expect(ws.getCell('N3').value).toBe('description list → H6')
    expect(ws.getCell('O3').value).toBe('productId list → C5')
    expect(ws.getCell('P3').value).toBe('osUnit list → C8')
    expect(ws.getCell('S3').formula).toBeTruthy()
  })

  it('scales hourly units by FT_HOURS in the Monthly results column', async () => {
    const wb = await loadGenerated(false)
    const finder = wb.getWorksheet('Finder')!
    const ass = wb.getWorksheet('Assumptions')!

    // Locate the FT_HOURS assumption row (column C carries the key).
    let ftRow = 0
    ass.eachRow({ includeEmpty: false }, row => {
      if (row.getCell(3).value === '$FT_HOURS') ftRow = row.number
    })
    expect(ftRow).toBeGreaterThan(0)
    const ftRef = `Assumptions!$D$${ftRow}`

    expect(finder.getCell('H10').value).toBe('Monthly')
    const formula = finder.getCell('H11').formula
    // Hourly test on the unit column …
    expect(formula).toContain('IFERROR(IF(LEFT(INDEX(Prices!')
    expect(formula).toContain(',1)="h"')
    // … hourly branch scales priceAmount by the FT_HOURS cell …
    expect(formula).toContain(`*${ftRef},INDEX(`)
    // … non-hourly branch falls back to the unadjusted priceAmount.
    expect(formula.split(',1)="h"')[1]).toContain('INDEX(Prices!')
  })

  it('formats the Finder Description results like the BOM Description column', async () => {
    const wb = await loadGenerated(false)
    const bom = wb.getWorksheet('Components')!
    const finder = wb.getWorksheet('Finder')!

    // Locate the BOM Description column (current layout: column D).
    let descCol = 0
    for (let r = 1; r <= 8; r++) {
      bom.getRow(r).eachCell({ includeEmpty: false }, cell => {
        if (cell.value === 'Description') descCol = cell.col
      })
    }
    expect(descCol).toBeGreaterThan(0)
    // First data cell under the header (group headers carry no value).
    let bomDesc: ExcelJS.Cell | null = null
    bom.eachRow({ includeEmpty: false }, row => {
      if (!bomDesc && row.number > 5 && typeof row.getCell(descCol).value === 'string') {
        bomDesc = row.getCell(descCol)
      }
    })
    expect(bomDesc).not.toBeNull()

    // Results headers: Region right after Description.
    expect(finder.getCell('B10').value).toBe('Description')
    expect(finder.getCell('C10').value).toBe('Region')
    expect(finder.getCell('D10').value).toBe('vCpu')

    // The Description data column carries the BOM light-grey fill +
    // wrap text, on every row of the fixed array (not just the anchor).
    for (const cell of [finder.getCell('B11'), finder.getCell('B12')]) {
      expect(cell.fill?.fgColor?.argb).toBe(bomDesc!.fill?.fgColor?.argb)
      expect(cell.alignment?.wrapText).toBe(true)
      expect(cell.border?.left?.style).toBe('thin')
    }
  })

  it('references every BOM tab from the Volumes per-tab columns', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Volumes')!
    let anchorCol = 0
    ws.getRow(1).eachCell({ includeEmpty: false }, cell => {
      if (cell.value === 'Tab Volumes') anchorCol = cell.col
    })
    expect(anchorCol).toBeGreaterThan(0)
    expect(ws.getRow(3).getCell(anchorCol).value).toBe('Components')
    expect(ws.getRow(4).getCell(anchorCol).formula).toContain('Components!')
  })

  it('records the Source URL and pricing metadata on the T sheet', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet(META_SHEET_NAME)!
    let src: unknown
    ws.eachRow((row) => {
      if (row.getCell(2).value === 'Source URL') src = row.getCell(3).value
    })
    expect(src).toBe('https://example.com/prices.json')
  })

  it('defines the expected workbook names', async () => {
    const wb = await loadGenerated(false)
    const names = wb.definedNames.model.map(n => n.name)
    for (const n of ['BACKUP', 'RXM', 'GB_TO_GiB', 'GiB_TO_GB', 'PriceListDescs', 'T_ONE_TIME']) {
      expect(names).toContain(n)
    }
  })

  it('defines the PriceList* names as single ranges over Prices', async () => {
    const wb = await loadGenerated(false)
    const byName = Object.fromEntries(wb.definedNames.model.map(n => [n.name, n.ranges]))
    expect(byName['PriceListDescs']).toHaveLength(1)
    expect(byName['PriceListDescs'][0]).toMatch(/^Prices!\$B\$1:\$B\$\d+$/)
    expect(byName['PriceListRegions']).toHaveLength(1)
    expect(byName['PriceListRegions'][0]).toMatch(/^Prices!\$[A-Z]+\$1:\$[A-Z]+\$\d+$/)
    expect(byName['PriceListTable']).toHaveLength(1)
    expect(byName['PriceListTable'][0]).toMatch(/^Prices!\$B\$1:\$[A-Z]+\$\d+$/)
  })

  it('BOM pricing formulas reference the PriceList* names, not literal ranges', async () => {
    const wb = await loadGenerated(false)
    const ws = wb.getWorksheet('Components')!
    const formulas: string[] = []
    ws.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.formula) formulas.push(cell.formula)
      })
    })
    expect(formulas.some(f => f.includes('PriceListTable'))).toBe(true)
    expect(formulas.some(f => f.includes('PriceListDescs') && f.includes('PriceListRegions'))).toBe(true)
    expect(formulas.some(f => f.includes('T_ONE_TIME'))).toBe(true)
    expect(formulas.some(f => f.includes('Prices!$'))).toBe(false)
    expect(formulas.some(f => f.includes('T!$C$'))).toBe(false)
  })

  it('survives an ExcelJS round-trip with the names intact', async () => {
    const buffer = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const first = new ExcelJS.Workbook()
    await first.xlsx.load(buffer)
    const saved = await first.xlsx.writeBuffer()
    const second = new ExcelJS.Workbook()
    await second.xlsx.load(saved)
    const names = second.definedNames.model.map(n => n.name)
    for (const n of ['PriceListDescs', 'PriceListRegions', 'PriceListTable']) {
      expect(names).toContain(n)
    }
  })

  it('modernises workbook metadata for dynamic arrays', async () => {
    const buffer = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    const zip = await JSZip.loadAsync(buffer)
    const wbXml = await zip.file('xl/workbook.xml')!.async('string')
    expect(wbXml).toContain('calcId="191029"')
    expect(wbXml).toContain('xcalcf:calcFeatures')
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheetXml).toContain('xda:dynamicArrayProperties')
  })

  it('snapshot: cells and formulas across all sheets', async () => {
    const wb = await loadGenerated(true)
    const lines: string[] = []
    for (const ws of wb.worksheets) {
      lines.push(`## ${ws.name}`)
      ws.eachRow({ includeEmpty: false }, row => {
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          // The T sheet's Generated date is time-dependent; pin it.
          if (ws.name === 'T' && row.getCell(2).value === 'Generated' && colNumber === 3) {
            lines.push(`${cell.address} <date>`)
            return
          }
          lines.push(`${cell.address} ${cell.formula ? `=${cell.formula}` : dumpValue(cell.value)}`)
        })
      })
    }
    expect(lines.join('\n')).toMatchSnapshot()
  })
})
