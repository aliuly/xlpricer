import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'

import { processPricingData } from '../../../src/prices/index'
import type { PricesData } from '../../../src/prices/types'

function loadPrices(): PricesData {
  return JSON.parse(
    readFileSync(new URL('../../fixtures/prices.json', import.meta.url), 'utf-8'),
  ) as PricesData
}

function loadOracle(): Record<string, unknown>[] {
  const raw = readFileSync(
    new URL('../../fixtures/includes/oracle.csv', import.meta.url), 'utf-8',
  )
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => v.trim(),
  })
  return parsed.data as unknown as Record<string, unknown>[]
}

describe('processPricingData', () => {
  const data = loadPrices()
  processPricingData(data, { includes: { oracle: { version: 'test', records: loadOracle() } } })
  const x: Record<string, number> = {}
  data.keys.forEach((k, i) => { x[k] = i })

  it('expands region "*" includes into eu-de and eu-nl with defaults', () => {
    const oracleRows = data.records.filter(r => r[x.productName] === 'Oracle Database')
    expect(oracleRows.length).toBe(2)
    expect(new Set(oracleRows.map(r => r[x.region]))).toEqual(new Set(['eu-de', 'eu-nl']))
    for (const r of oracleRows) {
      expect(r[x.R12]).toBe(0)        // INCLUDE_DEFAULTS '0.0 EUR' → 0
      expect(r[x.isMRC]).toBe(false)
    }
  })

  it('extracts tier definitions for the Volumes sheet', () => {
    const tier = data.tiers?.['obs-out-eu-de']
    expect(tier).toBeTruthy()
    const tariffs = (tier as { _tariffs_: Array<Record<string, unknown>> })._tariffs_
    expect(tariffs.length).toBe(2)
    expect(tariffs[0].fromOn).toBe(0)
    expect(tariffs[0].upTo).toBe(50)
    expect(tariffs[1].fromOn).toBe(50)
  })

  it('cross-references backup products', () => {
    const vm = data.records.find(r => r[x.id] === 'OTC_vm-1')
    expect(vm?.[x._backup_]).toBe('Storage: CBR Server Backup')
  })

  it('collects EVS classes and regions', () => {
    expect(data.choices?.EVS).toContain('SATA')
    expect(data.choices?.REGIONS).toEqual(['eu-de', 'eu-nl'])
  })

  it('sorts records naturally by _XlTitle_', () => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const titles = data.records.map(r => String(r[x._XlTitle_]))
    expect(titles).toEqual([...titles].sort((a, b) => collator.compare(a, b)))
  })
})
