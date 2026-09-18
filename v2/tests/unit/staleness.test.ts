import { describe, expect, it } from 'vitest'

import type { PricesData } from '../../src/prices/types'
import {
  compareSourceMeta,
  fingerprintSourceMeta,
  schemaMajor,
} from '../../src/xlsx/staleness'

describe('schemaMajor', () => {
  it('returns the first dot-segment as the major identity', () => {
    expect(schemaMajor('pipeline-pricing-1.0')).toBe('pipeline-pricing-1')
    expect(schemaMajor('pipeline-pricing-2.1')).toBe('pipeline-pricing-2')
    expect(schemaMajor('alternate-pricing-1.0')).toBe('alternate-pricing-1')
  })

  it('falls back to the whole string when there is no dot', () => {
    expect(schemaMajor('opaque-schema')).toBe('opaque-schema')
  })

  it('returns empty for missing schemas', () => {
    expect(schemaMajor(undefined)).toBe('')
    expect(schemaMajor(null)).toBe('')
  })
})

describe('fingerprintSourceMeta', () => {
  const data: PricesData = {
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
  }

  it('maps schema, date, params, includes and patches', () => {
    expect(fingerprintSourceMeta(data)).toEqual({
      schema: 'pipeline-pricing-1.0',
      'pricing-data': expect.any(String),
      'params|region[]': 'eu-de,eu-nl',
      'params|currency': 'EUR',
      'params|nested': 'a=1,b=two',
      'includes|oracle': '2026-09-08T10:00:00.000Z',
      'includes|bare': 'v2',
      'patches|fixer': '3',
    })
  })

  it('skips absent fields', () => {
    expect(fingerprintSourceMeta({ keys: [], columns: [], records: [] })).toEqual({})
  })
})

describe('compareSourceMeta', () => {
  it('unchanged when key sets and values match', () => {
    const meta = { schema: 'pipeline-pricing-1.0', 'pricing-data': '08-09-2026' }
    const cmp = compareSourceMeta(meta, { ...meta })
    expect(cmp.stale).toBe(false)
    expect(cmp.reason).toBe('unchanged')
    expect(cmp.changedKeys).toEqual([])
    expect(cmp.missingKeys).toEqual([])
    expect(cmp.extraKeys).toEqual([])
  })

  it('detects changed values', () => {
    const cmp = compareSourceMeta(
      { 'pricing-data': '08-09-2026' },
      { 'pricing-data': '09-09-2026' },
    )
    expect(cmp.stale).toBe(true)
    expect(cmp.changedKeys).toEqual(['pricing-data'])
    expect(cmp.reason).toContain('08-09-2026 → 09-09-2026')
  })

  it('detects keys only the fresh data has', () => {
    const cmp = compareSourceMeta({}, { 'params|region[]': 'eu-de' })
    expect(cmp.stale).toBe(true)
    expect(cmp.missingKeys).toEqual(['params|region[]'])
  })

  it('detects keys only the old file has', () => {
    const cmp = compareSourceMeta({ 'patches|fixer': '3' }, {})
    expect(cmp.stale).toBe(true)
    expect(cmp.extraKeys).toEqual(['patches|fixer'])
  })

  it('ignores includes keys on both sides — custom pricing is not pipeline state', () => {
    // Old workbook recorded includes; fresh check side has none → not stale.
    const dropped = compareSourceMeta(
      { 'pricing-data': '08-09-2026', 'includes|oracle': 'v1', 'includes|bare': 'v2' },
      { 'pricing-data': '08-09-2026' },
    )
    expect(dropped.stale).toBe(false)
    expect(dropped.changedKeys).toEqual([])
    expect(dropped.missingKeys).toEqual([])
    expect(dropped.extraKeys).toEqual([])

    // Include version drift alone never flags stale.
    const changed = compareSourceMeta(
      { 'pricing-data': '08-09-2026', 'includes|oracle': 'v1' },
      { 'pricing-data': '08-09-2026', 'includes|oracle': 'v9' },
    )
    expect(changed.stale).toBe(false)

    // Pipeline keys still decide.
    const pipeline = compareSourceMeta(
      { 'pricing-data': '08-09-2026', 'includes|oracle': 'v1' },
      { 'pricing-data': '09-09-2026', 'includes|oracle': 'v9' },
    )
    expect(pipeline.stale).toBe(true)
    expect(pipeline.changedKeys).toEqual(['pricing-data'])
  })
})
