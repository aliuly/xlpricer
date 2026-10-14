import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { applyPatches } from '../../../src/prices/patching'
import { processPricingData } from '../../../src/prices/index'
import type { PricesData } from '../../../src/prices/types'

function loadPrices(): PricesData {
  return JSON.parse(
    readFileSync(new URL('../../fixtures/prices.json', import.meta.url), 'utf-8'),
  ) as PricesData
}

/**
 * Append a synthetic DWS-M3XLarge-style family: a base row plus
 * `_R12`/`_R24`/`_R36` sibling rows whose priceAmount really belongs
 * in the base row's reserved columns.  The cloned fields are
 * overwritten so the family's _XlTitle_ is unique among the fixture
 * records.
 */
function addReservedSplit(
  data: PricesData,
  baseR12 = '0.000000 EUR',
): void {
  const x: Record<string, number> = {}
  data.keys.forEach((k, i) => { x[k] = i })

  const identity: Record<string, string> = {
    productName: 'DWS Node dws.m3.xl',
    productFamily: 'Analytics',
    productId: 'Data Warehouse Services',
    serviceType: 'DWS',
    opiFlavour: 'dws.m3.xlarge',
    vCpu: '4',
    ram: '32 GiB',
    additionalText: '160 GB SSD',
    description: 'Postgres',
  }

  const base = JSON.parse(JSON.stringify(data.records[0])) as unknown[]
  base[x.id] = 'OTC_DWS_M3XLarge'
  base[x.priceAmount] = '0.463478 EUR'
  base[x.R12] = baseR12
  base[x.R24] = '0.000000 EUR'
  base[x.R36] = '0.000000 EUR'
  for (const [k, v] of Object.entries(identity)) base[x[k]] = v
  data.records.push(base)

  const reserved: Record<string, string> = {
    _R12: '237.000000 EUR',
    _R24: '210.000000 EUR',
    _R36: '195.000000 EUR',
  }
  for (const [suffix, price] of Object.entries(reserved)) {
    const variant = JSON.parse(JSON.stringify(data.records[0])) as unknown[]
    variant[x.id] = `OTC_DWS_M3XLarge${suffix}`
    variant[x.priceAmount] = price
    variant[x.R12] = '0.000000 EUR'
    variant[x.R24] = '0.000000 EUR'
    variant[x.R36] = '0.000000 EUR'
    for (const [k, v] of Object.entries(identity)) variant[x[k]] = v
    data.records.push(variant)
  }
}

describe('DWS-M3XLarge-split patch', () => {
  it('merges _R12/_R24/_R36 sibling rows into the base row', () => {
    const data = loadPrices()
    addReservedSplit(data)
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['DWS-M3XLarge-split']).toEqual({
      count: 3,
      description: expect.stringContaining('DWS M3XLarge'),
    })

    // The sibling rows are gone…
    const ids = data.records.map(r => String(r[x.id]))
    expect(ids.filter(id => /_R(12|24|36)$/i.test(id))).toEqual([])

    // …and their prices landed in the base row's reserved columns
    // (normalize turns the EUR strings into numbers afterwards).
    const merged = data.records.find(r => r[x.id] === 'OTC_DWS_M3XLarge')
    expect(merged).toBeTruthy()
    expect(merged?.[x.R12]).toBe(237)
    expect(merged?.[x.R24]).toBe(210)
    expect(merged?.[x.R36]).toBe(195)

    // A single _XlTitle_/region pair for the merged product.
    const key = `${String(merged?.[x._XlTitle_])}|${String(merged?.[x.region])}`
    expect(
      data.records.filter(r => `${String(r[x._XlTitle_])}|${String(r[x.region])}` === key),
    ).toHaveLength(1)
  })

  it('never clobbers a reserved price the base row already carries', () => {
    const data = loadPrices()
    addReservedSplit(data, '99.000000 EUR')
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    // R12 was already priced: only the R24/R36 siblings merge, and the
    // _R12 sibling is left for the duplicates report to flag.
    expect(data.patches?.['DWS-M3XLarge-split']?.count).toBe(2)
    const merged = data.records.find(r => r[x.id] === 'OTC_DWS_M3XLarge')
    expect(merged?.[x.R12]).toBe(99)
    expect(merged?.[x.R24]).toBe(210)
    expect(merged?.[x.R36]).toBe(195)
    expect(data.records.some(r => r[x.id] === 'OTC_DWS_M3XLarge_R12')).toBe(true)
  })
})

/* ── Synthetic duplicate families ───────────────────────── */

interface SynthOverride {
  id: string;
  region: string;
  priceAmount?: string;
  r12?: string;
  productName?: string;
  productIdParameter?: string;
}

/**
 * Append synthetic rows (cloned from a fixture record with a
 * caller-supplied identity).  Defaults give every row the same
 * pricing, so suffix siblings qualify for removal.
 */
function addSynthRows(
  data: PricesData,
  identity: Record<string, string>,
  overrides: SynthOverride[],
): void {
  const x: Record<string, number> = {}
  data.keys.forEach((k, i) => { x[k] = i })

  for (const o of overrides) {
    const rec = JSON.parse(JSON.stringify(data.records[0])) as unknown[]
    rec[x.id] = o.id
    rec[x.region] = o.region
    rec[x.priceAmount] = o.priceAmount ?? '0.100000 EUR'
    rec[x.R12] = o.r12 ?? '0.000000 EUR'
    rec[x.R24] = '0.000000 EUR'
    rec[x.R36] = '0.000000 EUR'
    if (o.productName !== undefined) rec[x.productName] = o.productName
    if (o.productIdParameter !== undefined) rec[x.productIdParameter] = o.productIdParameter
    for (const [k, v] of Object.entries(identity)) rec[x[k]] = v
    data.records.push(rec)
  }
}

const MRS_IDENTITY: Record<string, string> = {
  productName: 'MRS c3.2xlarge.2',
  productFamily: 'Analytics',
  productId: 'Map Reduce Service',
  serviceType: 'mrs',
  opiFlavour: 'c3.2xlarge.2',
  vCpu: '8',
  ram: '16 GiB',
  additionalText: '',
  description: '',
}

const LB_IDENTITY: Record<string, string> = {
  productName: 'Loadbalancer elastic per LCU',
  productFamily: 'Network',
  productId: 'ELASTIC LOAD BALANCE',
  serviceType: 'LBV3',
  productSection: '',
  productIdParameter: '',
  opiFlavour: 'lbv3.b.pro',
  vCpu: '0',
  ram: '0 GiB',
  additionalText: '',
  description: '',
}

function mrsIds(): SynthOverride[] {
  return [
    { id: 'OTC_C_2XL2_MRS', region: 'eu-de' },
    { id: 'OTC_C_2XL2_MRS_CN', region: 'eu-de' },
    { id: 'OTC_C_2XL2_MRS_N', region: 'eu-de' },
    { id: 'OTC_C_2XL2_MRS-eu-nl', region: 'eu-nl' },
    { id: 'OTC_C_2XL2_MRS_CN-eu-nl', region: 'eu-nl' },
    { id: 'OTC_C_2XL2_MRS_N-eu-nl', region: 'eu-nl' },
  ]
}

function lbIds(): SynthOverride[] {
  return [
    { id: 'OTC_LBV3_B_PRO', region: 'eu-de' },
    { id: 'OTC_LBV3_B_PRO_AZ2', region: 'eu-de' },
    { id: 'OTC_LBV3_B_PRO_AZ3', region: 'eu-de' },
    { id: 'OTC_LBV3_B_PRO-eu-nl', region: 'eu-nl' },
    { id: 'OTC_LBV3_B_PRO_AZ2-eu-nl', region: 'eu-nl' },
    { id: 'OTC_LBV3_B_PRO_AZ3-eu-nl', region: 'eu-nl' },
  ]
}

describe('MRS-CN-N-dupes patch', () => {
  it('drops _CN/_N rows matching the base price, incl. -eu-<region> ids', () => {
    const data = loadPrices()
    addSynthRows(data, MRS_IDENTITY, mrsIds())
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['MRS-CN-N-dupes']).toEqual({
      count: 4,
      description: expect.stringContaining('MRS'),
    })
    const ids = data.records.map(r => String(r[x.id]))
    expect(ids.filter(id => /(_CN|_N)(-eu-\w+)?$/i.test(id) && id.includes('_MRS'))).toEqual([])
    expect(ids).toContain('OTC_C_2XL2_MRS')
    expect(ids).toContain('OTC_C_2XL2_MRS-eu-nl')
  })

  it('keeps a _CN/_N row whose price differs from the base', () => {
    const data = loadPrices()
    addSynthRows(data, MRS_IDENTITY, mrsIds().map(o =>
      o.id === 'OTC_C_2XL2_MRS_CN' ? { ...o, priceAmount: '0.123456 EUR' } : o,
    ))
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['MRS-CN-N-dupes']?.count).toBe(3)
    expect(data.records.some(r => r[x.id] === 'OTC_C_2XL2_MRS_CN')).toBe(true)
  })

  it('keeps a _CN/_N row whose reserved columns differ from the base', () => {
    const data = loadPrices()
    addSynthRows(data, MRS_IDENTITY, mrsIds().map(o =>
      o.id === 'OTC_C_2XL2_MRS_N' ? { ...o, r12: '1.000000 EUR' } : o,
    ))
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['MRS-CN-N-dupes']?.count).toBe(3)
    expect(data.records.some(r => r[x.id] === 'OTC_C_2XL2_MRS_N')).toBe(true)
  })

  it('ignores _CN/_N ids outside the MRS product', () => {
    const data = loadPrices()
    addSynthRows(data, MRS_IDENTITY, [
      { id: 'OTC_EL_BLST_R', region: 'eu-de' },
      { id: 'OTC_EL_BLST_R_N', region: 'eu-de' },
    ])
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['MRS-CN-N-dupes']).toBeUndefined()
    expect(data.records.some(r => r[x.id] === 'OTC_EL_BLST_R')).toBe(true)
    expect(data.records.some(r => r[x.id] === 'OTC_EL_BLST_R_N')).toBe(true)
  })
})

describe('LBV3-AZ-dupes patch', () => {
  it('drops _AZ2/_AZ3 rows matching the base price, incl. -eu-<region> ids', () => {
    const data = loadPrices()
    addSynthRows(data, LB_IDENTITY, lbIds())
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['LBV3-AZ-dupes']).toEqual({
      count: 4,
      description: expect.stringContaining('LBV3'),
    })
    const ids = data.records.map(r => String(r[x.id]))
    expect(ids.filter(id => /_AZ[23](-eu-\w+)?$/i.test(id))).toEqual([])
    expect(ids).toContain('OTC_LBV3_B_PRO')
    expect(ids).toContain('OTC_LBV3_B_PRO-eu-nl')
  })

  it('keeps an _AZ2/_AZ3 row whose price differs from the base', () => {
    const data = loadPrices()
    addSynthRows(data, LB_IDENTITY, lbIds().map(o =>
      o.id === 'OTC_LBV3_B_PRO_AZ2' ? { ...o, priceAmount: '0.020000 EUR' } : o,
    ))
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['LBV3-AZ-dupes']?.count).toBe(3)
    expect(data.records.some(r => r[x.id] === 'OTC_LBV3_B_PRO_AZ2')).toBe(true)
  })

  it('keeps an _AZ2/_AZ3 row whose reserved columns differ from the base', () => {
    const data = loadPrices()
    addSynthRows(data, LB_IDENTITY, lbIds().map(o =>
      o.id === 'OTC_LBV3_B_PRO_AZ3' ? { ...o, r12: '1.000000 EUR' } : o,
    ))
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['LBV3-AZ-dupes']?.count).toBe(3)
    expect(data.records.some(r => r[x.id] === 'OTC_LBV3_B_PRO_AZ3')).toBe(true)
  })
})

describe('DDS-OG-config-dupes patch', () => {
  const DDS_IDENTITY: Record<string, string> = {
    productFamily: 'Database',
    productId: 'DOCUMENT DATABASE SERVICE',
    serviceType: 'DDS',
    opiFlavour: 'db.s2.large.2.config',
    vCpu: '2',
    ram: '4 GiB',
    additionalText: 'Config Group s2.l.2',
    description: 'Config Group s2.l.2',
    storageType: '',
  }

  const ddsRows = (): SynthOverride[] => [
    { id: 'OTC_MGCHP_LARGE-eu-nl', region: 'eu-nl', productName: 'DDS Config 2 vCPU 4 GB RAM', productIdParameter: 'dds', priceAmount: '0.340046 EUR' },
    { id: 'OTC_OGCN_LARGE-eu-nl', region: 'eu-nl', productName: 'DDS Config 2 vCPU 4 GB RAM', productIdParameter: 'ddsog', priceAmount: '0.317800 EUR' },
    { id: 'OTC_OGGTM_LARGE-eu-nl', region: 'eu-nl', productName: 'DDS Config 2 vCPU 4 GB RAM', productIdParameter: 'ddsog', priceAmount: '0.317800 EUR' },
    { id: 'OTC_OG_MEDIUM-eu-nl', region: 'eu-nl', productName: 'DDS openGauss 1 vCPU 4 GB RAM', productIdParameter: 'ddsog', priceAmount: '0.053820 EUR' },
  ]

  it('drops OGCN and adds (Open Gauss) to the surviving name/title', () => {
    const data = loadPrices()
    addSynthRows(data, DDS_IDENTITY, ddsRows())
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['DDS-OG-config-dupes']).toEqual({
      count: 2,
      description: expect.stringContaining('Open Gauss'),
    })

    // OGCN is gone; the survivor carries the marker and a distinct title…
    expect(data.records.some(r => r[x.id] === 'OTC_OGCN_LARGE-eu-nl')).toBe(false)
    const survivor = data.records.find(r => r[x.id] === 'OTC_OGGTM_LARGE-eu-nl')
    expect(survivor?.[x.productName]).toBe('DDS Config 2 vCPU 4 GiB RAM (Open Gauss)')
    expect(String(survivor?.[x._XlTitle_])).toContain('(Open Gauss)')

    // …the regular DDS row is untouched, and already-named openGauss
    // rows do not gain a suffix.
    const dds = data.records.find(r => r[x.id] === 'OTC_MGCHP_LARGE-eu-nl')
    expect(dds?.[x.productName]).toBe('DDS Config 2 vCPU 4 GiB RAM')
    expect(String(dds?.[x._XlTitle_])).not.toContain('(Open Gauss)')
    const ogMedium = data.records.find(r => r[x.id] === 'OTC_OG_MEDIUM-eu-nl')
    expect(ogMedium?.[x.productName]).toBe('DDS openGauss 1 vCPU 4 GiB RAM')
  })

  it('is surgical: guards on ddsog, OTC_OG*, and the DDS Config name', () => {
    const data = loadPrices()
    addSynthRows(data, DDS_IDENTITY, [
      ...ddsRows(),
      // OGCN EVS storage: same id prefix, but not a DDS Config row.
      { id: 'OTC_OGCN_EL_BLST_SSD-eu-nl', region: 'eu-nl', productName: 'EVS Ultra-High I/O', productIdParameter: 'ddsog', priceAmount: '0.099000 EUR' },
      // Non-ddsog row with the OTC_OG id shape.
      { id: 'OTC_OGZZ_LARGE-eu-nl', region: 'eu-nl', productName: 'DDS Config 2 vCPU 4 GB RAM', productIdParameter: 'dds', priceAmount: '0.100000 EUR' },
    ])

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    applyPatches(data, x)
    expect(data.patches['DDS-OG-config-dupes']?.count).toBe(2)
    expect(data.records.some(r => r[x.id] === 'OTC_OGCN_LARGE-eu-nl')).toBe(false)
    // Untouched by the drop…
    expect(data.records.some(r => r[x.id] === 'OTC_OGCN_EL_BLST_SSD-eu-nl')).toBe(true)
    // …and untouched by the rename.
    expect(data.records.find(r => r[x.id] === 'OTC_OGZZ_LARGE-eu-nl')?.[x.productName])
      .toBe('DDS Config 2 vCPU 4 GB RAM')

    // Idempotent: a second run appends nothing.
    applyPatches(data, x)
    expect(data.patches['DDS-OG-config-dupes']).toBeUndefined()
    expect(data.records.find(r => r[x.id] === 'OTC_OGGTM_LARGE-eu-nl')?.[x.productName])
      .toBe('DDS Config 2 vCPU 4 GB RAM (Open Gauss)')
  })
})

describe('C7-PHYSICAL-dupes patch', () => {
  const BM_IDENTITY: Record<string, string> = {
    productFamily: 'Compute',
    productName: 'BM General Purpose c7t.28xl Linux',
    productId: 'BARE METAL',
    serviceType: '',
    opiFlavour: 'c7t.28xl',
    vCpu: '112',
    ram: '512 GiB',
    additionalText: '',
    description: '',
  }

  const bmRows = (): SynthOverride[] => [
    { id: 'OTC_C7T28XL4_P_LI', region: 'eu-de', productIdParameter: 'bms', priceAmount: '6.990000 EUR', r12: '4,050.000000 EUR' },
    { id: 'OTC_C7T28XL4_P_LI_PHYSICAL', region: 'eu-de', productIdParameter: 'ecsnoc', priceAmount: '6.990000 EUR', r12: '4,050.000000 EUR' },
    { id: 'OTC_C7T28XL4_P_LI-eu-nl', region: 'eu-nl', productIdParameter: 'bms', priceAmount: '6.990000 EUR', r12: '4,050.000000 EUR' },
    { id: 'OTC_C7T28XL4_P_LI_PHYSICAL-eu-nl', region: 'eu-nl', productIdParameter: 'ecsnoc', priceAmount: '6.990000 EUR', r12: '4,050.000000 EUR' },
  ]

  it('drops _PHYSICAL rows matching the base, incl. -eu-<region> ids', () => {
    const data = loadPrices()
    addSynthRows(data, BM_IDENTITY, bmRows())
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['C7-PHYSICAL-dupes']).toEqual({
      count: 2,
      description: expect.stringContaining('PHYSICAL'),
    })
    const ids = data.records.map(r => String(r[x.id]))
    expect(ids.filter(id => /OTC_C7.*_PHYSICAL(-[a-z0-9-]+)?$/i.test(id))).toEqual([])
    expect(ids).toContain('OTC_C7T28XL4_P_LI')
    expect(ids).toContain('OTC_C7T28XL4_P_LI-eu-nl')
  })

  it('keeps a _PHYSICAL row whose price differs from the base', () => {
    const data = loadPrices()
    addSynthRows(data, BM_IDENTITY, bmRows().map(o =>
      o.id === 'OTC_C7T28XL4_P_LI_PHYSICAL' ? { ...o, priceAmount: '7.000000 EUR' } : o,
    ))
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['C7-PHYSICAL-dupes']?.count).toBe(1)
    expect(data.records.some(r => r[x.id] === 'OTC_C7T28XL4_P_LI_PHYSICAL')).toBe(true)
    expect(data.records.some(r => r[x.id] === 'OTC_C7T28XL4_P_LI_PHYSICAL-eu-nl')).toBe(false)
  })

  it('ignores _PHYSICAL ids outside the OTC_C7 scope', () => {
    const data = loadPrices()
    addSynthRows(data, BM_IDENTITY, [
      { id: 'OTC_XYZ', region: 'eu-de', productIdParameter: 'bms', priceAmount: '6.990000 EUR' },
      { id: 'OTC_XYZ_PHYSICAL', region: 'eu-de', productIdParameter: 'ecsnoc', priceAmount: '6.990000 EUR' },
    ])
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['C7-PHYSICAL-dupes']).toBeUndefined()
    expect(data.records.some(r => r[x.id] === 'OTC_XYZ')).toBe(true)
    expect(data.records.some(r => r[x.id] === 'OTC_XYZ_PHYSICAL')).toBe(true)
  })
})

describe('DMS-STO-engine patch', () => {
  const DMS_IDENTITY: Record<string, string> = {
    productFamily: 'Application',
    productId: 'DMS VOLUME SERVICE',
    serviceType: 'Network',
    opiFlavour: 'dms.physical.storage.high',
    vCpu: '0',
    ram: '0 GiB',
    additionalText: '',
    description: 'Occupation high',
  }

  const dmsRows = (): SynthOverride[] => [
    // Base row: enrichment prunes dmsvol as a duplicate of EVS pricing.
    { id: 'OTC_DMS_STO_HIGH', region: 'eu-de', productName: 'DMS storage high', productIdParameter: 'dmsvol', priceAmount: '0.066000 EUR' },
    { id: 'OTC_DMS_STO_HIGH_KP', region: 'eu-de', productName: 'DMS storage high', productIdParameter: 'dmsk', priceAmount: '0.066000 EUR' },
    { id: 'OTC_DMS_STO_HIGH_KP-eu-nl', region: 'eu-nl', productName: 'DMS storage high', productIdParameter: 'dmsk', priceAmount: '0.059400 EUR' },
    { id: 'OTC_DMS_STO_HIGH_RMQ', region: 'eu-de', productName: 'DMS storage high', productIdParameter: 'dmsrmq', priceAmount: '0.066000 EUR' },
  ]

  it('spells Kafka/RocketMQ out in the name, clearing the title pair', () => {
    const data = loadPrices()
    addSynthRows(data, DMS_IDENTITY, dmsRows())
    processPricingData(data)

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    expect(data.patches?.['DMS-STO-engine']).toEqual({
      count: 3,
      description: expect.stringContaining('Kafka'),
    })

    // The dmsvol base row is pruned by enrichment; the engine rows stay.
    expect(data.records.some(r => r[x.id] === 'OTC_DMS_STO_HIGH')).toBe(false)
    const kp = data.records.find(r => r[x.id] === 'OTC_DMS_STO_HIGH_KP')
    expect(kp?.[x.productName]).toBe('DMS storage high (Kafka)')
    expect(String(kp?.[x._XlTitle_])).toContain('(Kafka)')
    const rmq = data.records.find(r => r[x.id] === 'OTC_DMS_STO_HIGH_RMQ')
    expect(rmq?.[x.productName]).toBe('DMS storage high (RocketMQ)')
    expect(String(rmq?.[x._XlTitle_])).toContain('(RocketMQ)')

    // No duplicate title/region pairs among the surviving DMS rows.
    const counts = new Map<string, number>()
    for (const r of data.records) {
      if (!String(r[x.id]).startsWith('OTC_DMS_STO')) continue
      const key = `${String(r[x._XlTitle_])}|${String(r[x.region])}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect([...counts.values()]).toEqual([1, 1, 1])
  })

  it('is scoped to DMS_STO ids and never double-appends', () => {
    const data = loadPrices()
    addSynthRows(data, DMS_IDENTITY, [
      { id: 'OTC_DMS_STO_HIGH_KP', region: 'eu-de', productName: 'DMS storage high', productIdParameter: 'dmsk' },
      { id: 'OTC_DMS_STO_HIGH_RMQ', region: 'eu-de', productName: 'DMS storage high', productIdParameter: 'dmsrmq' },
      // _KP outside the DMS_STO scope.
      { id: 'OTC_FOO_KP', region: 'eu-de', productName: 'DMS storage high', productIdParameter: 'dmsk' },
    ])

    const x: Record<string, number> = {}
    data.keys.forEach((k, i) => { x[k] = i })

    applyPatches(data, x)
    expect(data.patches['DMS-STO-engine']?.count).toBe(2)
    expect(data.records.find(r => r[x.id] === 'OTC_FOO_KP')?.[x.productName])
      .toBe('DMS storage high')

    // Idempotent: a second run appends nothing.
    applyPatches(data, x)
    expect(data.patches['DMS-STO-engine']).toBeUndefined()
    expect(data.records.find(r => r[x.id] === 'OTC_DMS_STO_HIGH_KP')?.[x.productName])
      .toBe('DMS storage high (Kafka)')
  })
})
