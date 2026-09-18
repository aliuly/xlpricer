import { describe, expect, it } from 'vitest'

import { displayInclude, displayParam, displayPatch } from '../../src/xlsx/meta'

describe('displayParam', () => {
  it('passes strings through', () => {
    expect(displayParam('EUR')).toBe('EUR')
  })

  it('joins arrays', () => {
    expect(displayParam(['eu-de', 'eu-nl'])).toBe('eu-de,eu-nl')
  })

  it('flattens objects to key=value pairs', () => {
    expect(displayParam({ a: '1', b: 'two' })).toBe('a=1,b=two')
  })

  it('stringifies other values', () => {
    expect(displayParam(42)).toBe('42')
  })
})

describe('displayInclude', () => {
  it('passes strings through', () => {
    expect(displayInclude('v2')).toBe('v2')
  })

  it('takes the version of objects', () => {
    expect(displayInclude({ version: '2026-09-08T10:00:00.000Z', sha: 'abc1234' }))
      .toBe('2026-09-08T10:00:00.000Z')
  })
})

describe('displayPatch', () => {
  it('stringifies the count', () => {
    expect(displayPatch({ count: 3, description: 'patched' })).toBe('3')
  })
})
