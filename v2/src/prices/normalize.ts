/*
 * Normalise pricing data.
 *
 * These transformations would still be needed even if the
 * upstream API produced perfect data — they coerce values
 * into the canonical shapes expected by downstream consumers.
 *
 *   1. GB → GiB  — mass string replacement across all fields
 *   2. Values     — sentinel max → '', strip GiB/currency suffixes, coerce numbers
 *   3. Unit       — strip redundant /month suffix, normalise hourly markers
 */

import type { PricesData } from './types'

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const SENTINEL_MAX = new Set([999999999999, 999999999999999])
const RE_ISINT = /^[0-9]+$/
const RE_ISFLOAT = /^[0-9]+\.[0-9]+$/

// ═══════════════════════════════════════════════════════════════════════
// Stage 1 — GB → GiB mass replacement
// ═══════════════════════════════════════════════════════════════════════

function gbToGib(rec: unknown[]): void {
  for (let i = 0; i < rec.length; i++) {
    const v = rec[i]
    if (typeof v !== 'string') continue
    const replaced = (' ' + v + ' ')
      .replace(/ GB /g, ' GiB ')
      .replace(/ GB\//g, ' GiB/')
      .replace(/ TB /g, ' TiB ')
      .trim()
    if (replaced !== v) rec[i] = replaced
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 2 — Value normalisation
// ═══════════════════════════════════════════════════════════════════════

function normalizeValues(
  rec: unknown[],
  x: Record<string, number>,
  columnNames: Set<string>,
): void {
  const currency = String(rec[x.currency]);

  for (const key of Object.keys(x)) {
    if (key.startsWith('_')) continue;
    if (!columnNames.has(key)) continue;
    if (key === 'productName') continue;

    const idx = x[key];
    let v = rec[idx];

    // Sentinel max values → ''
    if (typeof v === 'number' && SENTINEL_MAX.has(v)) {
      v = '';
    }

    if (typeof v === 'string') {
      if (v.endsWith(' GiB')) {
        const num = v.slice(0, -4);
        v = num === '' ? '' : num.includes('.') ? parseFloat(num) : parseInt(num, 10);
      } else if (v.endsWith(' ' + currency)) {
        v = parseFloat(v.slice(0, v.length - currency.length - 1).replace(/,/g, ''));
      } else if (RE_ISINT.test(v)) {
        v = parseInt(v, 10);
      } else if (RE_ISFLOAT.test(v)) {
        v = parseFloat(v);
      }
    }

    rec[idx] = v;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 3 — Unit cleanup
// ═══════════════════════════════════════════════════════════════════════

function normalizeUnit(rec: unknown[], x: Record<string, number>): void {
  const unitIdx = x.unit
  let unit = String(rec[unitIdx])

  // Strip /month suffix (all prices are monthly)
  if (unit === 'GiB/month' || unit === 'GiB/Month') {
    unit = 'GiB'
  }

  // Hourly unit normalisation for spreadsheet formula detection
  if (unit.startsWith('h')) {
    if (!unit.startsWith('h/') && unit !== 'h') {
      unit = '/' + unit
    }
  } else if (unit.endsWith('/h')) {
    unit = 'h:' + unit
  }

  rec[unitIdx] = unit
}

// ═══════════════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════════════

export function normalize(
  data: PricesData,
  x: Record<string, number>,
): void {
  const columnNames = new Set(data.keys)

  for (const rec of data.records) {
    gbToGib(rec)
    normalizeValues(rec, x, columnNames)
    normalizeUnit(rec, x)
  }
}
