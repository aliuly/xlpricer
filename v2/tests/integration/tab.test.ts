import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import type { PricesData } from '../../src/prices/types'
import { META_SHEET_NAME } from '../../src/xlsx/constants'
import { genMetaSheet } from '../../src/xlsx/meta'
import {
  compareSourceMeta,
  extractSourceMeta,
  fingerprintSourceMeta,
} from '../../src/xlsx/staleness'

const pricingData: PricesData = {
  keys: [],
  columns: [],
  records: [],
  schema: 'pipeline-pricing-1.0',
  timestamp: 1788845092,
  params: {
    'region[]': ['eu-de', 'eu-nl'],
    currency: 'EUR',
    nested: { a: '1', b: 'two' },
  },
  includes: {
    oracle: { version: '2026-09-08T10:00:00.000Z', sha: 'abc1234', message: 'fix' },
    bare: 'v2',
  },
  patches: {
    fixer: { count: 3, description: 'patched' },
  },
  choices: {
    EVS: ['SATA', 'SSD'],
  },
}

async function buildAndLoadT(): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(META_SHEET_NAME)
  genMetaSheet(
    ws,
    {},
    'test-version',
    'http://localhost:5173/',
    'https://example.com/prices-latest.json',
    pricingData,
  )
  const buffer = await workbook.xlsx.writeBuffer()
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(buffer)
  const t = loaded.getWorksheet(META_SHEET_NAME)
  if (!t) throw new Error('T sheet missing after round-trip')
  return t
}

describe('T tab staleness contract', () => {
  it('round-trip canary: extracted meta matches the fingerprint (unchanged)', async () => {
    const ws = await buildAndLoadT()
    const cmp = compareSourceMeta(extractSourceMeta(ws), fingerprintSourceMeta(pricingData))
    expect(cmp.stale).toBe(false)
    expect(cmp.changedKeys).toEqual([])
    expect(cmp.missingKeys).toEqual([])
    expect(cmp.extraKeys).toEqual([])
    expect(cmp.reason).toBe('unchanged')
  })

  it('a newer publish date reads as changed', async () => {
    const ws = await buildAndLoadT()
    const changed: PricesData = {
      ...pricingData,
      timestamp: (pricingData.timestamp ?? 0) + 86400,
    }
    const cmp = compareSourceMeta(extractSourceMeta(ws), fingerprintSourceMeta(changed))
    expect(cmp.stale).toBe(true)
    expect(cmp.changedKeys).toContain('pricing-data')
  })

  it('writes the Source URL row, excluded from the fingerprint', async () => {
    const ws = await buildAndLoadT()
    let found = false
    ws.eachRow((row) => {
      if (row.getCell(2).value === 'Source URL') {
        found = true
        expect(row.getCell(3).value).toBe('https://example.com/prices-latest.json')
      }
    })
    expect(found).toBe(true)
    expect(extractSourceMeta(ws)['source-url']).toBeUndefined()
  })
})
