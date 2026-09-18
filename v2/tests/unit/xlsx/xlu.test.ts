import { describe, expect, it } from 'vitest'

import {
  cellToRowCol,
  colToName,
  def,
  fmtEpoch,
  resolveFormula,
  rowcolToCell,
  sheetRef,
} from '../../../src/xlsx/xlu'

describe('colToName', () => {
  it('converts column indices to letters', () => {
    expect(colToName(1)).toBe('A')
    expect(colToName(27)).toBe('AA')
    expect(colToName(27, true)).toBe('$AA')
    expect(colToName(1, true, 'My Tab')).toBe("'My Tab'!$A")
  })
})

describe('rowcolToCell / cellToRowCol', () => {
  it('round-trips references', () => {
    expect(rowcolToCell(5, 3)).toBe('C5')
    expect(rowcolToCell(5, 3, true, true)).toBe('$C$5')
    expect(rowcolToCell(5, 3, true, true, 'My Tab')).toBe("'My Tab'!$C$5")
    expect(cellToRowCol('$C$5')).toEqual([5, 3])
  })
})

describe('sheetRef', () => {
  it('quotes only when needed', () => {
    expect(sheetRef('Sheet1')).toBe('Sheet1')
    expect(sheetRef('My Sheet')).toBe("'My Sheet'")
    expect(sheetRef("Mike's Data")).toBe("'Mike''s Data'")
  })
})

describe('resolveFormula', () => {
  it('substitutes case-insensitive placeholders', () => {
    expect(resolveFormula('={A}+{B}', { a: 'X1', b: 'Y2' })).toBe('=X1+Y2')
  })

  it('throws on unresolved references', () => {
    expect(() => resolveFormula('={MISSING}', {})).toThrow(/MISSING/)
  })
})

describe('def / fmtEpoch', () => {
  it('def lowercases keys', () => {
    const map: Record<string, string> = {}
    def(map, 'A_B', 'x')
    expect(map['a_b']).toBe('x')
  })

  it('formats epochs as dd-mm-yyyy', () => {
    expect(fmtEpoch(1788845092)).toMatch(/^\d{2}-\d{2}-\d{4}$/)
  })
})
