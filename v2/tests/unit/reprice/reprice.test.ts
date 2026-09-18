import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import {
  parseSheetRanges,
  pruneDefinedNames,
  reorderSheets,
} from '../../../src/xlsx/reprice'

describe('parseSheetRanges', () => {
  it('parses unquoted sheet refs', () => {
    const f = 'SUMIFS(Components!$K:$K,Components!$C:$C,"="&$B5,Components!$G:$G,"="&$D5)'
    expect(parseSheetRanges(f)).toEqual([
      { sheet: 'Components', range: '$K:$K' },
      { sheet: 'Components', range: '$C:$C' },
      { sheet: 'Components', range: '$G:$G' },
    ])
  })

  it('unquotes names and unescapes apostrophes', () => {
    expect(parseSheetRanges("SUMIFS('Mike''s Data'!$K:$K,'Mike''s Data'!$C:$C)"))
      .toEqual([
        { sheet: "Mike's Data", range: '$K:$K' },
        { sheet: "Mike's Data", range: '$C:$C' },
      ])
  })

  it('parses single cells and row-bounded ranges', () => {
    expect(parseSheetRanges('=T!$C$11+1')).toEqual([{ sheet: 'T', range: '$C$11' }])
    expect(parseSheetRanges('INDEX(Prices!$B$1:$AL$12,A1,2)'))
      .toEqual([{ sheet: 'Prices', range: '$B$1:$AL$12' }])
  })

  it('ignores name references without a sheet', () => {
    expect(parseSheetRanges('INDEX(PriceListTable,A1,2)')).toEqual([])
  })
})

describe('pruneDefinedNames', () => {
  it('drops names whose ranges point at removed sheets', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Prices')
    wb.addWorksheet('T')
    wb.addWorksheet('Assumptions')
    wb.definedNames.add('Prices!$B$1:$B$5', 'PriceListDescs')
    wb.definedNames.add('T!$C$21', 'BACKUP')
    wb.definedNames.add('Assumptions!$D$5', 'KEEP')
    pruneDefinedNames(wb, new Set(['Prices', 'T']))
    const names = wb.definedNames.model.map(n => n.name)
    expect(names).toEqual(['KEEP'])
  })
})

describe('reorderSheets', () => {
  it('renumbers orderNo so the tab order matches', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('A')
    wb.addWorksheet('B')
    wb.addWorksheet('C')
    reorderSheets(wb, ['C', 'A', 'B'])
    expect(wb.worksheets.map(w => w.name)).toEqual(['C', 'A', 'B'])
  })
})

import {
  discoverBomTabs,
  reviveFrozenFormulas,
  shiftFormula,
} from '../../../src/xlsx/reprice'

describe('shiftFormula', () => {
  const sku = 'IF(OR($D7="",$K7=""),"",MATCH(1,INDEX((PriceListDescs=$D7)*(PriceListRegions=$K7),0),0))'

  it('shifts unqualified refs by row and column', () => {
    expect(shiftFormula(sku, 1, 0))
      .toBe('IF(OR($D8="",$K8=""),"",MATCH(1,INDEX((PriceListDescs=$D8)*(PriceListRegions=$K8),0),0))')
    expect(shiftFormula('$D7', 0, 1)).toBe('$E7')
  })

  it('leaves qualified refs and defined names alone', () => {
    expect(shiftFormula('Assumptions!$D$5+T_ONE_TIME', 2, 1))
      .toBe('Assumptions!$D$5+T_ONE_TIME')
    expect(shiftFormula('T_ONE_TIME', 5, 5)).toBe('T_ONE_TIME')
  })

  it('shifts whole-column ranges by column only', () => {
    expect(shiftFormula('SUMIFS($AK:$AK,$Y:$Y,"<>"&T_ONE_TIME,$B:$B,"<>Total *")', 0, 1))
      .toBe('SUMIFS($AL:$AL,$Z:$Z,"<>"&T_ONE_TIME,$C:$C,"<>Total *")')
  })
})

describe('discoverBomTabs fallback (no Volumes)', () => {
  it('discovers Components* sheets with the current-layout refs', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Overview')
    wb.addWorksheet('Components')
    wb.addWorksheet('Components2')
    wb.addWorksheet('T')
    const { tabs, warnings } = discoverBomTabs(wb)
    expect(tabs.map(t => t.name)).toEqual(['Components', 'Components2'])
    expect(tabs[0].qxh).toMatch(/^\$[A-Z]+:\$[A-Z]+$/)
    expect(tabs[0].desc).not.toBe(tabs[0].qxh)
    expect(warnings).toEqual([])
  })

  it('throws when nothing is discoverable', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Overview')
    expect(() => discoverBomTabs(wb)).toThrow(/no Components tabs/)
  })
})

describe('reviveFrozenFormulas', () => {
  it('restores recorded formulas, re-anchored for drift', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Components')
    ws.getCell('D8').value = 5 // frozen value
    const frz = wb.addWorksheet('_Frozen')
    frz.getCell(1, 1).value = 'LiveRef'
    frz.getCell(1, 2).value = 'OriginalAddress'
    frz.getCell(1, 3).value = 'FormulaText'
    // Excel adjusted the LiveRef when a row was inserted above:
    frz.getCell(2, 1).value = { formula: "'Components'!$D$8" }
    frz.getCell(2, 2).value = "'Components'!$D$7"
    frz.getCell(2, 3).value = 'IF(OR($D7="",$K7=""),"",MATCH(1,INDEX((PriceListDescs=$D7)*(PriceListRegions=$K7),0),0))'
    const res = reviveFrozenFormulas(wb)
    expect(res.restored).toBe(1)
    expect(ws.getCell('D8').formula)
      .toBe('IF(OR($D8="",$K8=""),"",MATCH(1,INDEX((PriceListDescs=$D8)*(PriceListRegions=$K8),0),0))')
  })

  it('skips #REF! entries with a warning', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Components')
    const frz = wb.addWorksheet('_Frozen')
    frz.getCell(1, 1).value = { formula: "'Components'!#REF!" }
    frz.getCell(1, 2).value = "'Components'!$D$7"
    frz.getCell(1, 3).value = 'IF(1,2,3)'
    const res = reviveFrozenFormulas(wb)
    expect(res.restored).toBe(0)
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('deleted')
  })
})
