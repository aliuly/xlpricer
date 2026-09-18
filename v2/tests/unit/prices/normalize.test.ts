import { describe, expect, it } from 'vitest'

import { normalize } from '../../../src/prices/normalize'
import type { PricesData } from '../../../src/prices/types'

const keys = ['currency', 'ram', 'productName', 'fromOn', 'unit', 'region']
const x: Record<string, number> = {
  currency: 0, ram: 1, productName: 2, fromOn: 3, unit: 4, region: 5,
}

function run(rec: unknown[]): PricesData {
  const data: PricesData = { keys, columns: [], records: [rec] }
  normalize(data, x)
  return data
}

describe('normalize', () => {
  it('strips GiB suffixes into numbers', () => {
    expect(run(['EUR', '8 GiB', 'VM', '', 'h', 'eu-de']).records[0][1]).toBe(8)
  })

  it('turns sentinel max values into empty strings', () => {
    expect(run(['EUR', 999999999999, 'VM', '', 'h', 'eu-de']).records[0][1]).toBe('')
  })

  it('replaces GB/TB with GiB/TiB in text fields', () => {
    expect(run(['EUR', 1, 'Disk 1 TB and 1 GB', '', 'h', 'eu-de']).records[0][2])
      .toBe('Disk 1 TiB and 1 GiB')
  })

  it('normalises units', () => {
    expect(run(['EUR', 1, 'VM', '', 'GiB/month', 'eu-de']).records[0][4]).toBe('GiB')
    expect(run(['EUR', 1, 'VM', '', 'GiB/Month', 'eu-de']).records[0][4]).toBe('GiB')
  })

  it('coerces numeric strings', () => {
    expect(run(['EUR', '2.5', 'VM', '', 'h', 'eu-de']).records[0][1]).toBe(2.5)
    expect(run(['EUR', '7', 'VM', '', 'h', 'eu-de']).records[0][1]).toBe(7)
  })
})
