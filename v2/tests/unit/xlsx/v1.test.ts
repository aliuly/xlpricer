import { describe, expect, it } from 'vitest'

import type { AssumptionsRow } from '../../../src/editorTab/classify'
import type { ComponentsRow } from '../../../src/editorTab/classify'
import { processPricingData } from '../../../src/prices'
import type { PricesData } from '../../../src/prices/types'
import {
  buildV1Assumptions,
  checkV1Workbook,
  convertV1Workbook,
  extractV1Workbook,
  fixV1Descriptions,
  V1ConvertError,
  v1TitleMaps,
} from '../../../src/xlsx/v1'
import {
  buildInput,
  buildV1Workbook,
  buildV2FormatWorkbook,
  loadWorkbookBytes,
} from '../../helpers'

describe('checkV1Workbook', () => {
  it('accepts a v1 workbook (Overview + v1-shaped Assumptions)', async () => {
    const wb = await loadWorkbookBytes(await buildV1Workbook())
    expect(() => checkV1Workbook(wb)).not.toThrow()
  })

  it('rejects a workbook without an Overview sheet', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Assumptions')
    expect(() => checkV1Workbook(wb)).toThrowError(V1ConvertError)
    try { checkV1Workbook(wb) } catch (err) {
      expect((err as V1ConvertError).kind).toBe('not-v1')
    }
  })

  it('rejects a v2-format workbook with a use-refresh hint', async () => {
    const wb = await loadWorkbookBytes(await buildV2FormatWorkbook())
    try { checkV1Workbook(wb) } catch (err) {
      expect((err as V1ConvertError).kind).toBe('v2-file')
      expect((err as V1ConvertError).message).toContain('--update')
    }
  })
})

describe('extractV1Workbook', () => {
  it('converts the Components tab with the extraction rules', async () => {
    const wb = await loadWorkbookBytes(await buildV1Workbook())
    const ext = extractV1Workbook(wb)

    expect(ext.tabs.map(t => t.name)).toEqual(['Components'])
    expect(ext.dropped).toEqual(['Deal Summary'])
    expect(ext.notes).toEqual(['Trailing note one', 'Trailing note two'])
    expect(ext.warnings).toHaveLength(1)
    expect(ext.warnings[0]).toContain('Region')

    const rows = ext.tabs[0].rows
    // 2 group sections + 5 data rows.
    expect(rows).toHaveLength(7)
    expect(rows[0]).toEqual({ type: 'section', qty: 'base', function: 'Base Infrastructure', description: '', storage: '', hr: '' })
    expect(rows[4]).toEqual({ type: 'section', qty: 'com', function: 'Compute', description: '', storage: '', hr: '' })

    // Data row: default H/R formula → blank; plain values copied.
    expect(rows[1]).toMatchObject({ type: 'data', qty: '1', description: 'Essentials: VPC', hr: '' })
    // Data row: literal H/R kept, function/storage copied.
    expect(rows[2]).toMatchObject({ type: 'data', qty: '2', function: 'ADFS Servers', storage: '100', hr: '500' })
    // Other-sheet qty formula frozen to its cached value.
    expect(rows[3]).toMatchObject({ type: 'data', qty: '100', description: 'Network: Internet Traffic' })
    // Local qty formula kept with the '=' prefix (rows map 1:1 here).
    expect(rows[5]).toMatchObject({ type: 'data', qty: '=B7+B8', description: 'Anti-virus' })
    // Tiered group-level description copied verbatim (conversion fixes it).
    expect(rows[6]).toMatchObject({ type: 'data', qty: '3', description: 'Storage: OBS Outbound Traffic' })
  })

  it('fails when the Overview references no convertible tabs', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Overview')
    const ass = wb.addWorksheet('Assumptions')
    ass.getCell('B2').value = '#'
    ass.getCell('C2').value = 'Assumption'
    ass.getCell('D2').value = 'Value'
    ass.getCell('C3').value = 'Format version'
    ass.getCell('D3').value = '1.8.1'
    try { extractV1Workbook(wb) } catch (err) {
      expect((err as V1ConvertError).kind).toBe('no-components')
    }
  })

  it('freezes formulas referencing unknown defined names', async () => {
    const wb = await loadWorkbookBytes(await buildV1Workbook())
    // A v1-only defined name the v2 output will not define.  The
    // model setter rebuilds the name matrix (the getter is derived).
    wb.definedNames.model = [
      ...wb.definedNames.model,
      { name: 'MyName', ranges: ["'Components'!$B$7"] },
    ]
    const comp = wb.getWorksheet('Components')!
    comp.getCell(13, 2).value = { formula: 'MyName*2', result: 4 }
    const ext = extractV1Workbook(wb)
    expect(ext.tabs[0].rows[5]).toMatchObject({ qty: '4' })
  })
})

describe('v1TitleMaps / fixV1Descriptions', () => {
  /** Pipeline-processed dataset with controlled tier shapes. */
  function tieredPricingData(): PricesData {
    const data: PricesData = {
      keys: [
        'id', 'idGroupTiered', 'productId', 'opiFlavour', 'productName',
        'osUnit', 'currency', 'priceAmount', 'unit', 'description',
        'vCpu', 'ram', 'additionalText', 'storageType', 'storageVolume',
        'serviceType', 'productIdParameter', 'productSection', 'productType',
        'productFamily', 'productCategory', 'fromOn', 'upTo', 'minAmount',
        'maxAmount', 'region', 'isMRC', 'R12', 'R24', 'R36', 'RU12', 'RU24', 'RU36',
      ],
      columns: [
        'Id', 'Tier Group', 'Product ID', 'Flavour', 'Product Name',
        'OS', 'Currency', 'Price', 'Unit', 'Description',
        'vCPU', 'RAM', 'Notes', 'Storage Type', 'Storage Volume',
        'Service Type', 'Product Param', 'Section', 'Type', 'Family',
        'Category', 'From', 'Up To', 'Min', 'Max', 'Region', 'MRC',
        'R12M', 'R24M', 'R36M', 'RU12M', 'RU24M', 'RU36M',
      ],
      records: [
        // Flat hourly item (no tier).
        ['OTC_vm-1', '', 'ECS', '', 'Virtuelle Maschine', 'Linux', 'EUR', 0.05, 'h', 'Virtuelle Maschine', '', '', '', '', '', '', 'ecs', 'main', 'OTC', 'Compute', '', 0, '', '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
        // GiB tier: two tariffs (unit 'GB/month' normalises to 'GiB').
        ['OTC_VPC_UP_1', 'OTC_VPC_UP', 'Internet Traffic Outbound', '', 'Internet Traffic Outbound', 'Standard', 'EUR', 0.09, 'GB/month', 'Ausgehender Traffic', '', '', '', '', '', '', 'vpc', 'main', 'OTC', 'Network', '', 0, 1, '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
        ['OTC_VPC_UP_2', 'OTC_VPC_UP', 'Internet Traffic Outbound', '', 'Internet Traffic Outbound', 'Standard', 'EUR', 0.07, 'GB/month', 'Ausgehender Traffic', '', '', '', '', '', '', 'vpc', 'main', 'OTC', 'Network', '', 2, '', '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
        // h-unit tier.
        ['OTC_CWAF_1', 'OTC_CWAF', 'Cloud WAF Domain', '', 'Cloud WAF Domain', 'Standard', 'EUR', 1.25, 'h', 'WAF Domain', '', '', '', '', '', '', 'cwaf', 'main', 'OTC', 'Security', '', 0, 730, '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
        ['OTC_CWAF_2', 'OTC_CWAF', 'Cloud WAF Domain', '', 'Cloud WAF Domain', 'Standard', 'EUR', 1.25, 'h', 'WAF Domain', '', '', '', '', '', '', 'cwaf', 'main', 'OTC', 'Security', '', 731, '', '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
        // Empty-unit tier.
        ['OTC_OBST_OUTB_1', 'OTC_OBST_OUTB', 'OBS Standard Data Transfer Outbound', '', 'OBS Standard Data Transfer Outbound', 'Standard', 'EUR', 0, '', 'Cloud Storage Outbound Traffic', '', '', '', '', '', '', 'obs', 'main', 'OTC', 'Storage', '', 0, 5000000, '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
        ['OTC_OBST_OUTB_2', 'OTC_OBST_OUTB', 'OBS Standard Data Transfer Outbound', '', 'OBS Standard Data Transfer Outbound', 'Standard', 'EUR', 0, '', 'Cloud Storage Outbound Traffic', '', '', '', '', '', '', 'obs', 'main', 'OTC', 'Storage', '', 5000001, '', '', 'eu-de', false, 0, 0, 0, 0, 0, 0],
      ],
    }
    processPricingData(data, {})
    return data
  }

  const pd = tieredPricingData()

  it('collects flat, group and tariff titles as exact', () => {
    const maps = v1TitleMaps(pd)!
    expect(maps.exact.has('Compute: Virtuelle Maschine')).toBe(true)
    expect(maps.exact.has('Network: Internet Traffic Outbound (GiB)')).toBe(true)
    expect(maps.exact.has('Network: Internet Traffic Outbound [T1] (until 1)')).toBe(true)
    expect(maps.exact.has('Network: Internet Traffic Outbound [T2] (from 2)')).toBe(true)
    expect(maps.exact.has('Network: Internet Traffic Outbound')).toBe(false)
  })

  it('maps only non-h, non-empty unit tiers to the suffixed title', () => {
    const maps = v1TitleMaps(pd)!
    expect(maps.groupBase.get('Network: Internet Traffic Outbound'))
      .toBe('Network: Internet Traffic Outbound (GiB)')
    // h and empty units get no suffix in v2 → no mapping.
    expect(maps.groupBase.has('Security: Cloud WAF Domain')).toBe(false)
    expect(maps.groupBase.has('Storage: OBS Standard Data Transfer Outbound')).toBe(false)
  })

  it('returns null for payloads without computed titles', () => {
    const bare: PricesData = { keys: ['id'], columns: ['Id'], records: [['x']] }
    expect(v1TitleMaps(bare)).toBeNull()
  })

  it('appends the unit only to group-level descriptions', () => {
    const rows: ComponentsRow[] = [
      { type: 'section', qty: 'base', function: 'Base', description: '', storage: '', hr: '' },
      { type: 'data', qty: '1', function: '', description: 'Network: Internet Traffic Outbound', storage: '', hr: '' },
      { type: 'data', qty: '2', function: '', description: 'Network: Internet Traffic Outbound [T1] (until 1)', storage: '', hr: '' },
      { type: 'data', qty: '3', function: '', description: 'Compute: Virtuelle Maschine', storage: '', hr: '' },
      { type: 'data', qty: '4', function: '', description: 'Security: Cloud WAF Domain', storage: '', hr: '' },
      { type: 'data', qty: '5', function: '', description: 'Something: Gone', storage: '', hr: '' },
    ]
    const { rows: out, warnings } = fixV1Descriptions('Components', rows, pd)
    expect(out.map(r => r.description)).toEqual([
      '',
      'Network: Internet Traffic Outbound (GiB)',
      'Network: Internet Traffic Outbound [T1] (until 1)',
      'Compute: Virtuelle Maschine',
      'Security: Cloud WAF Domain',
      'Something: Gone',
    ])
    expect(warnings.some(w => w.includes('1 component description(s) updated'))).toBe(true)
    expect(warnings.some(w => w.includes('need review') && w.includes('Something: Gone'))).toBe(true)
  })

  it('skips the fix entirely when the pricing data has no titles', () => {
    const rows: ComponentsRow[] = [
      { type: 'data', qty: '1', function: '', description: 'Network: Internet Traffic Outbound', storage: '', hr: '' },
    ]
    const { rows: out, warnings } = fixV1Descriptions('Components', rows, { keys: [], columns: [], records: [] })
    expect(out).toEqual(rows)
    expect(warnings).toHaveLength(0)
  })
})

describe('buildV1Assumptions', () => {
  it('appends the trailing notes and the dropped-tabs record', () => {
    const out = buildV1Assumptions(
      [{ type: 'data', key: '$FT_HOURS', value: '730', when: '', who: '', notes: '' }],
      ['Trailing note one', 'Trailing note two'],
      ['Deal Summary'],
    )
    expect(out).toEqual([
      { type: 'data', key: '$FT_HOURS', value: '730', when: '', who: '', notes: '' },
      { type: 'note', key: 'Trailing note one', value: '', when: '', who: '', notes: '' },
      { type: 'note', key: 'Trailing note two', value: '', when: '', who: '', notes: '' },
      { type: 'section', key: 'Dropped tabs', value: '', when: '', who: '', notes: '' },
      { type: 'note', key: 'Deal Summary', value: '', when: '', who: '', notes: '' },
    ])
  })
})

describe('convertV1Workbook', () => {
  it('converts a v1 workbook into a v2 workbook buffer', async () => {
    const v1Bytes = await buildV1Workbook()
    const input = buildInput()

    const result = await convertV1Workbook({
      file: new Uint8Array(v1Bytes),
      pricingData: input.pricingData,
      assumptions: input.assumptions as AssumptionsRow[],
      appMeta: { version: 'test', spaUrl: 'http://spa/', sourceUrl: 'https://example.com/prices.json' },
    })

    expect(result.tabs).toEqual([{ name: 'Components', rows: 7 }])
    expect(result.dropped).toEqual(['Deal Summary'])
    expect(result.notes).toBe(2)
    // The manual-review caveat is always present.
    expect(result.caveat).toContain('Item descriptions may have changed')
    // The v1 file's recorded includes are surfaced, not replayed.
    expect(result.warnings.some(w => w.includes('includes: dctemp (2026-08-31)'))).toBe(true)
    // The tiered group-level description gained the price-list unit.
    expect(result.warnings.some(w => w.includes('unit suffix added'))).toBe(true)

    const wb = await loadWorkbookBytes(Buffer.from(result.buffer))
    expect(wb.worksheets.map(w => w.name)).toEqual([
      'Overview', 'Components', 'Volumes', 'Prices', 'Finder', 'Assumptions', 'ESA', 'T',
    ])
    const comp = wb.getWorksheet('Components')!
    expect(comp.getCell(6, 2).value).toBe('Base Infrastructure')
    expect(comp.getCell(6, 9).value).toBe('base')
    expect(comp.getCell(7, 4).value).toBe('Essentials: VPC')
    expect(comp.getCell(8, 7).value).toBe(500)
    expect(comp.getCell(9, 2).value).toBe(100)
    expect(comp.getCell(13, 4).value).toBe('Storage: OBS Outbound Traffic (GiB)')

    const ass = wb.getWorksheet('Assumptions')!
    const texts: string[] = []
    ass.eachRow({ includeEmpty: false }, row => {
      for (const col of [2, 3]) {
        const v = row.getCell(col).value
        if (typeof v === 'string') texts.push(v)
      }
    })
    expect(texts).toContain('$FT_HOURS')
    expect(texts).toContain('Trailing note one')
    expect(texts).toContain('Trailing note two')
    expect(texts).toContain('Dropped tabs')
    expect(texts).toContain('Deal Summary')
  })

  it('rejects a v2-format workbook with the v2-file kind', async () => {
    const { pricingData } = buildInput()
    await expect(convertV1Workbook({
      file: new Uint8Array(await buildV2FormatWorkbook()),
      pricingData,
      assumptions: [],
    })).rejects.toMatchObject({ kind: 'v2-file' })
  })
})
