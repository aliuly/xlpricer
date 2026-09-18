/**
 * Pricing-source staleness check.
 *
 * Standalone (no I/O) so the CLI and the SPA can call the same logic
 * differently: the CLI reads the T sheet from a file, the SPA will
 * read it from an uploaded buffer.  Layout contract:
 * docs/TODO-gen-t-tab.md §5.
 */

import type { CellValue, Worksheet } from 'exceljs';

import type { PricesData } from '../prices/types';
import {
  META_KEY_COL,
  META_SECTIONS,
  META_VAL_COL,
  displayInclude,
  displayParam,
  displayPatch,
} from './meta';
import { fmtEpoch } from './xlu';

/** Normalised source-metadata map (`params|<key>`, `includes|<group>`, …). */
export type SourceMeta = Record<string, string>;

/** Result of comparing an old workbook's source meta with fresh data. */
export interface SourceCompare {
  /** True when the pricing source has changed. */
  stale: boolean;
  /** Keys present on both sides whose values differ. */
  changedKeys: string[];
  /** Keys in the fresh data that the old file lacks. */
  missingKeys: string[];
  /** Keys in the old file that the fresh data lacks (e.g. includes dropped). */
  extraKeys: string[];
  /** Human-readable summary (e.g. "unchanged" or the changed/new/dropped counts). */
  reason: string;
}

/** Text of a cell value, normalised for the source-metadata map. */
function cellText(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value);
  const obj = value as {
    richText?: Array<{ text?: unknown }>;
    result?: unknown;
  };
  if (Array.isArray(obj.richText)) {
    return obj.richText.map(part => String(part.text ?? '')).join('');
  }
  if (obj.result !== undefined) return String(obj.result);
  return '';
}

/**
 * Read the source-pricing metadata recorded on the T sheet into a
 * normalised key → value map (see docs/TODO-gen-t-tab.md §5).
 */
export function extractSourceMeta(ws: Worksheet): SourceMeta {
  const out: SourceMeta = {};
  let section = '';
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 3) return;
    const key = cellText(row.getCell(META_KEY_COL).value);
    if (!key) return;
    const value = row.getCell(META_VAL_COL).value;
    if ((META_SECTIONS as readonly string[]).includes(key) && cellText(value) === '') {
      section = key.toLowerCase();
      return;
    }
    const k = key.toLowerCase();
    if (section === 'system') {
      if (k === 'schema') out['schema'] = cellText(value);
      else if (k === 'pricing data') out['pricing-data'] = cellText(value);
    } else if (section === 'params') {
      out[`params|${k}`] = cellText(value);
    } else if (section === 'includes') {
      out[`includes|${k}`] = cellText(value);
    } else if (section === 'patches') {
      out[`patches|${k}`] = cellText(value);
    }
  });
  return out;
}

/**
 * Build the same key → value map from freshly pipelined data, using
 * the same display helpers genMetaSheet uses (byte-match contract).
 */
export function fingerprintSourceMeta(pricingData: PricesData): SourceMeta {
  const out: SourceMeta = {};
  if (pricingData.schema) out['schema'] = pricingData.schema;
  if (pricingData.timestamp !== undefined) {
    out['pricing-data'] = fmtEpoch(pricingData.timestamp);
  }
  for (const [key, val] of Object.entries(pricingData.params ?? {})) {
    out[`params|${key.toLowerCase()}`] = displayParam(val);
  }
  for (const [group, val] of Object.entries(pricingData.includes ?? {})) {
    out[`includes|${group.toLowerCase()}`] = displayInclude(val);
  }
  for (const [label, val] of Object.entries(pricingData.patches ?? {})) {
    out[`patches|${label.toLowerCase()}`] = displayPatch(val);
  }
  return out;
}

/** Keys excluded from the staleness comparison on both sides. */
const EXCLUDED_PREFIX = 'includes|';

/**
 * Compare an old workbook's recorded source meta with freshly
 * pipelined data.  "Unchanged" requires equal key sets AND equal
 * values; anything else is changed (fail-open for older files).
 *
 * `includes|*` keys are excluded on both sides: custom pricing is
 * under user control and fairly static, so include drift is not
 * pipeline staleness.  The keys are still recorded on the T sheet
 * (and in the fingerprint) for display and refresh-time warnings.
 */
export function compareSourceMeta(
  oldMeta: SourceMeta,
  freshMeta: SourceMeta,
): SourceCompare {
  const changedKeys: string[] = [];
  const missingKeys: string[] = [];
  const extraKeys: string[] = [];

  for (const [key, value] of Object.entries(freshMeta)) {
    if (key.startsWith(EXCLUDED_PREFIX)) continue;
    if (!(key in oldMeta)) missingKeys.push(key);
    else if (oldMeta[key] !== value) changedKeys.push(key);
  }
  for (const key of Object.keys(oldMeta)) {
    if (key.startsWith(EXCLUDED_PREFIX)) continue;
    if (!(key in freshMeta)) extraKeys.push(key);
  }

  changedKeys.sort();
  missingKeys.sort();
  extraKeys.sort();

  const stale = changedKeys.length + missingKeys.length + extraKeys.length > 0;

  let reason = 'unchanged';
  if (stale) {
    const parts: string[] = [];
    if (changedKeys.length) parts.push(`${changedKeys.length} changed`);
    if (missingKeys.length) parts.push(`${missingKeys.length} new`);
    if (extraKeys.length) parts.push(`${extraKeys.length} dropped`);
    reason = `changed: ${parts.join(', ')}`;
    const oldDate = oldMeta['pricing-data'];
    const newDate = freshMeta['pricing-data'];
    if (oldDate && newDate && oldDate !== newDate) {
      reason += ` (Pricing Data ${oldDate} → ${newDate})`;
    }
  }

  return { stale, changedKeys, missingKeys, extraKeys, reason };
}

/**
 * Major identity of a pricing schema: the first dot-segment
 * ("pipeline-pricing-1.0" → "pipeline-pricing-1").  A change here is
 * an incompatible change; later segments only warn.
 */
export function schemaMajor(schema: string | null | undefined): string {
  if (!schema) return '';
  const dot = schema.indexOf('.');
  return dot === -1 ? schema : schema.slice(0, dot);
}
