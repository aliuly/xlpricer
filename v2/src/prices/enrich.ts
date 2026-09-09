/*
 * Enrich pricing data with computed columns, tiers, and cross-references.
 *
 * These derive new information from already-correct data.
 * None of this would change if the upstream API were fixed.
 *
 *   1. Schema init          — add internal columns (_XlTitle_, _backup_)
 *   2. Pruning              — remove duplicates, legacy, empty records
 *   3. Choices collection   — gather EVS classes & region codes
 *   4. Tier extraction      — pull tiered records into tier definitions
 *   5. Title enrichment     — GPU, vCPU, RAM, flavour, family rules
 *   6. Backup cross-ref     — map source products → backup products
 *   7. Finalise             — set data.tiers, data.choices
 */

import type { PricesData } from './types'

const EVS_PREFIX = 'EVS '

const RE_OPIFLAVOR = /^([^.]+)\./

type Row = unknown[]

type TierEntry = Record<string, unknown> & {
  _tiers: number
  _tariffs_: Record<string, unknown>[]
  _XlTitle_: string
}

interface WorkingState {
  x: Record<string, number>
  columnNames: Set<string>
  tiers: Record<string, TierEntry>
  choices: Record<string, Set<string>>
}

/** Convert a column-oriented row to a named-property object. */
function rowToObject(rec: Row, x: Record<string, number>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const key of Object.keys(x)) {
    obj[key] = rec[x[key]]
  }
  return obj
}

// ── Stage 1 — Schema initialisation ───────────────────────────────────

function addInternalColumns(data: PricesData, ws: WorkingState): void {
  const internals: [string, string | null][] = [
    ['_XlTitle_', ''],
    ['_backup_', 'Backup'],
  ]
  for (const [key, label] of internals) {
    if (ws.x[key] === undefined) {
      data.keys.push(key)
      data.columns.push(label)
      ws.x[key] = data.keys.length - 1
    }
    ws.columnNames.add(key)
  }

  ws.tiers = {}
  ws.choices = {
    EVS: new Set<string>(),
    REGIONS: new Set<string>(),
  }
}

// ── Stage 2 — Record pruning ──────────────────────────────────────────

function shouldKeep(rec: Row, x: Record<string, number>): boolean {
  if (rec[x.productName] === '' || rec[x.productFamily] === '') return false

  const fam = rec[x.productFamily] as string

  // Application: dmsvol is a duplicate of EVS storage pricing
  if (fam === 'Application' && rec[x.productIdParameter] === 'dmsvol') return false

  // Compute: dehl is a duplicate of deh
  if (fam === 'Compute' && rec[x.productIdParameter] === 'dehl') return false

  // Database — remove legacy records
  if (fam === 'Database') {
    const id = String(rec[x.id])
    const region = String(rec[x.region])
    if (
      !id.startsWith('OTC_') ||
      id.endsWith('_LEGACY') ||
      id.endsWith('_LEGACY-' + region)
    ) {
      return false
    }
  }

  // Storage — vss.* flavours are duplicates (except EVS)
  if (fam === 'Storage') {
    const flavour = String(rec[x.opiFlavour] ?? '')
    if (flavour.startsWith('vss.') && rec[x.productIdParameter] !== 'evs') return false
  }

  // Network — eip and drs are duplicates
  if (fam === 'Network') {
    if (rec[x.productSection] === 'eip' || rec[x.productIdParameter] === 'drs') return false
  }

  return true
}

// ── Stage 3 — Validation-list collection ──────────────────────────────

function collectChoices(
  rec: Row,
  x: Record<string, number>,
  choices: Record<string, Set<string>>,
): void {
  if (rec[x.productIdParameter] === 'evs') {
    const pname = String(rec[x.productName])
    if (pname.startsWith(EVS_PREFIX)) {
      choices.EVS.add(pname.slice(EVS_PREFIX.length))
    }
  }
  choices.REGIONS.add(String(rec[x.region]))
}

// ── Stage 4 — Tier processing ─────────────────────────────────────────

const TIER_COPY_FIELDS = [
  'idGroupTiered', 'region',
  'productId', 'productName',
  'osUnit', 'unit', 'description',
  'productIdParameter', 'productSection',
  'productType', 'productFamily', 'productCategory',
]

function validateTier(groupID: string, recID: string, region: string): boolean {
  if (!recID.startsWith(groupID) || recID === groupID) return false
  const l = groupID.length
  if (recID[l] !== '_') return false
  for (let i = l + 1; i < recID.length; i++) {
    if (recID[i] < '0' || recID[i] > '9') {
      return recID.slice(i) === ('-' + region)
    }
  }
  return true
}

function processTier(rec: Row, x: Record<string, number>, ws: WorkingState): boolean {
  const idGroupTiered = String(rec[x.idGroupTiered] ?? '')
  if (idGroupTiered === '') return true

  // Security WAF Domain — title uses productId instead of productName
  if (rec[x.productFamily] === 'Security' && rec[x.productName] === 'WAF Domain') {
    rec[x._XlTitle_] = `${rec[x.productFamily]}: ${rec[x.productId]}`
    if (rec[x.serviceType] !== '') {
      rec[x._XlTitle_] += ` ${rec[x.serviceType]}`
    }
  }

  const recId = String(rec[x.id] ?? '')
  const region = String(rec[x.region])
  if (!validateTier(idGroupTiered, recId, region)) {
    rec.length = 0 // clear record
    return false
  }

  const tierID = `${idGroupTiered}-${region}`

  if (!ws.tiers[tierID]) {
    const entry: TierEntry = {} as TierEntry
    for (const colName of Object.keys(x)) {
      entry[colName] = null
    }
    for (const tc of TIER_COPY_FIELDS) {
      entry[tc] = rec[x[tc]]
    }
    entry._tiers = 0

    const unit = String(rec[x.unit] ?? '')
    const suffix = !unit || unit === 'h' ? '' : ` (${unit})`
    entry._XlTitle_ = String(rec[x._XlTitle_]) + suffix
    entry._tariffs_ = []
    ws.tiers[tierID] = entry
  }

  const tier = ws.tiers[tierID]
  tier._tiers++
  tier._tariffs_.push(rowToObject(rec, x))
  rec[x._XlTitle_] += ` [T${tier._tiers}]`

  // Append tier-range suffix
  const fromOn = rec[x.fromOn] as number
  const upTo = rec[x.upTo] as number
  if (!fromOn) {
    rec[x._XlTitle_] += ` (until ${upTo.toLocaleString()})`
  } else if (!upTo) {
    rec[x._XlTitle_] += ` (from ${fromOn.toLocaleString()})`
  } else {
    rec[x._XlTitle_] += ` (${fromOn.toLocaleString()} to ${upTo.toLocaleString()})`
  }

  return true
}

// ── Stage 5 — Title enrichment ────────────────────────────────────────

function enrichTitle(rec: Row, x: Record<string, number>): void {
  const get = (k: string): string => String(rec[x[k]] ?? '')

  // GPU Server specifications
  if (get('additionalText') !== '' && get('productId') === 'GPU Server') {
    rec[x._XlTitle_] += ` ${get('additionalText')}`
  }

  // DMS Kafka / DMS product descriptions
  const svcType = get('serviceType')
  if (
    (svcType === 'cluster' || svcType === 'single') &&
    get('productIdParameter') === 'dmsk'
  ) {
    const desc = get('description')
    rec[x._XlTitle_] += desc.startsWith('DMS Kafka') ? ` ${desc.slice(4)}` : ` ${desc}`
  }

  // vCPU, RAM, flavour
  const vcpu = get('vCpu')
  const ram = get('ram')
  if (vcpu && vcpu !== '0') rec[x._XlTitle_] += ` ${vcpu} vcpu`
  if (ram && ram !== '0') rec[x._XlTitle_] += ` ${ram} GiB`
  if (
    vcpu && vcpu !== '0' && ram && ram !== '0' &&
    get('opiFlavour') !== '' && svcType !== 'CSS'
  ) {
    const flav = get('opiFlavour')
    const mv = RE_OPIFLAVOR.exec(flav)
    rec[x._XlTitle_] += ` ${mv ? mv[1] : flav}`
  }

  // additionalText — product-line specific
  const at = rec[x.additionalText]
  if (at !== '' && at != null) {
    const fam = get('productFamily')
    if (fam === 'Container' && typeof at === 'number') {
      rec[x._XlTitle_] += ` (max ${at} nodes)`
    } else if (svcType === 'DWS' || svcType === 'd2' || svcType === 'i3') {
      rec[x._XlTitle_] += ` ${at}`
    } else if (get('productIdParameter') === 'gpu') {
      rec[x._XlTitle_] += ` - ${at}`
    }
  }

  // ── Product-family–specific rules ─────────

  const fam = get('productFamily')

  if (fam === 'AI') {
    rec[x._XlTitle_] += ` ${svcType}`
  }

  if (fam === 'Analytics') {
    if (svcType === 'CSS') {
      rec[x._XlTitle_] += ` ${get('productIdParameter')}`
    } else if (svcType === 'PaaS' && get('productIdParameter') === 'mrs') {
      if (get('productSection') !== 'main') return // early exit
    }
  }

  if (fam === 'Database') {
    const pidpar = get('productIdParameter')
    const stype = get('storageType')
    if ((pidpar === 'drs' || pidpar === 'rds') && stype !== '') {
      rec[x._XlTitle_] += ` (${stype})`
    }
  }

  if (fam === 'Storage') {
    if (get('opiFlavour') === 'obs.crr.outbound') {
      rec[x._XlTitle_] += ` (${get('productId')})`
    } else if (get('_idGroup').endsWith('_PERF')) {
      rec[x._XlTitle_] += ' Enhanced'
    }
  }
}

// ── Stage 6 — Backup cross-reference ──────────────────────────────────

function isBackupProduct(rec: Row, x: Record<string, number>): boolean {
  const pname = String(rec[x.productName])
  const fam = String(rec[x.productFamily])

  if (fam === 'Storage' && pname.startsWith('CBR ')) {
    if (pname === 'CBR Cross Region Traffic Outbound' || pname === 'CBR No Backup') return false
    return pname.endsWith(' Backup')
  }

  if (pname.toLowerCase().includes('backup space')) return true
  if (pname === 'Cloud Server Backup Service' || pname === 'Volume Backup Service') return true

  return false
}

function sourceToBackup(rec: Row, x: Record<string, number>): [string, string] | null {
  if (isBackupProduct(rec, x)) return null

  const fam = String(rec[x.productFamily])
  const pname = String(rec[x.productName])
  const pidpar = String(rec[x.productIdParameter] ?? '')

  if (fam === 'Storage' && pname.startsWith('CBR ')) return null

  if (fam === 'Compute') return ['Storage', 'CBR Server Backup']

  if (fam === 'Storage') {
    if (pname.startsWith('EVS ')) return ['Storage', 'CBR Volume Backup']
    if (pname.startsWith('SFS ')) return ['Storage', 'CBR SFS Backup']
    return null
  }

  if (fam === 'Database') {
    if (pidpar === 'rds' && !pname.includes('Backup')) return ['Database', 'RDS Backup Space']
    if (pidpar === 'dds') return ['Database', 'DDS Backup Space']
    if (pidpar === 'dcs') return ['Database', 'DCS Backup Space']
    if (pname.includes('GeminiDB') && !pname.includes('Backup')) return ['Database', 'GeminiDB backup space']
    if (pname.includes('TaurusDB') && !pname.includes('Backup')) return ['Database', 'Backup Space TaurusDB']
    return null
  }

  if (fam === 'Analytics' && pname.includes('DWS') && !pname.includes('Backup')) {
    return ['Analytics', 'DWS Backup Space']
  }

  return null
}

function crossReferenceBackups(rows: Row[], x: Record<string, number>): void {
  // Pass A: identify backup products, build (family|name|region) → _XlTitle_ lookup
  const lookup = new Map<string, string>()
  for (const rec of rows) {
    if (rec.length === 0) continue
    if (isBackupProduct(rec, x)) {
      const key = `${rec[x.productFamily]}|${rec[x.productName]}|${rec[x.region]}`
      lookup.set(key, String(rec[x._XlTitle_]))
    }
  }

  // Pass B: match source → backup
  for (const rec of rows) {
    if (rec.length === 0) continue
    const criteria = sourceToBackup(rec, x)
    if (criteria) {
      const [bakFam, bakName] = criteria
      const key = `${bakFam}|${bakName}|${rec[x.region]}`
      rec[x._backup_] = lookup.get(key) ?? ''
    } else {
      rec[x._backup_] = ''
    }
  }
}

// ── Stage 7 — Finalise output ─────────────────────────────────────────

function finalize(data: PricesData, x: Record<string, number>, ws: WorkingState): void {
  // Expose tiers as a top-level object (consumed by vol.ts)
  data.tiers = ws.tiers as Record<string, Record<string, unknown>>

  // Push tier-group rows into records (consumed by the Pricing sheet)
  for (const tier of Object.values(ws.tiers)) {
    const row: unknown[] = new Array(data.keys.length).fill('')
    for (const key of Object.keys(tier)) {
      if (key === '_tariffs_') continue // nested array, not a column value
      const idx = x[key]
      if (idx !== undefined && idx >= 0) {
        row[idx] = tier[key]
      }
    }
    data.records.push(row)
  }

  // Convert choices sets to sorted arrays
  data.choices = {}
  for (const [name, values] of Object.entries(ws.choices)) {
    data.choices[name] = [...values].sort()
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────

export function enrich(
  data: PricesData,
  x: Record<string, number>,
): void {
  const ws: WorkingState = {
    x,
    columnNames: new Set(data.keys),
    tiers: {},
    choices: {},
  }

  // 1. Schema init
  addInternalColumns(data, ws)

  // 2–5. Per-record stages
  const kept: Row[] = []

  for (const rec of data.records) {
    // 2. Pruning
    if (!shouldKeep(rec, x)) continue

    // 2b. Non-tiered with tier data → prune
    if (
      String(rec[x.idGroupTiered] ?? '') === '' &&
      (rec[x.upTo] !== '' || Number(rec[x.fromOn]) > 1)
    ) {
      continue
    }

    // 3. Choices collection
    collectChoices(rec, x, ws.choices)

    // Internal bookkeeping
    rec[x._XlTitle_] = `${rec[x.productFamily]}: ${rec[x.productName]}`

    // 4. Tier extraction
    if (!processTier(rec, x, ws)) continue

    // 5. Title enrichment
    enrichTitle(rec, x)

    kept.push(rec)
  }

  data.records = kept

  // 6. Backup cross-reference
  crossReferenceBackups(data.records, x)

  // 7. Finalise
  finalize(data, x, ws)
}
