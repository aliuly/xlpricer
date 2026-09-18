/**
 * Metadata sheet generator
 *
 * Returns the populated `refMap` so later phases (Components, Overview) can
 * reference assumption values cross‑sheet.
 */

import type {
  Worksheet,
} from 'exceljs';

import type { IncludeMeta } from '../prices/types';

import {
  FORMAT_VERSION,
  AS_ONE_TIME,
  VLIST_BACKUP,
  VLIST_RXM,
} from './constants';

import {
  writeCell,
  setColumnWidth,
  rowcolToCell,
  //~ dataValidationList,
  fmtEpoch,
  def,
} from './xlu';

import { applyStyle, fmt } from './formats';

/* ── Types ─────────────────────────────────── */

/** A single value in the pricing data's `params` map. */
export type MetaParamValue = string | string[] | Record<string, string>;

/** Subset of fixed_prices.json consumed by the Metadata sheet. */
export interface FixedPricesMeta {
  schema?: string;
  timestamp?: number;
  params?: Record<string, MetaParamValue>;
  /** Include group → version string or IncludeMeta object. */
  includes?: Record<string, string | IncludeMeta>;
  patches?: Record<string, { count: number; description: string }>;
  choices?: Record<string, string[]>;
}

/* ── Helpers ───────────────────────────────── */

function addChoice(
  ws: Worksheet,
  r: number,
  label: string,
  values: readonly string[],
  refMap: Record<string, string>,
): number {
  writeCell(ws, r, META_KEY_COL, label, ['meta','key']);
  writeCell(ws, r, META_VAL_COL, values[0] ?? null, ['meta', 'value'], label);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta','comment']);
  r ++;
  for (let i = 1; i < values.length; i++) {
    writeCell(ws, r, META_KEY_COL, null, ['meta','key']);
    writeCell(ws, r, META_VAL_COL, values[i], ['meta', 'value'], label);
    writeCell(ws, r, META_COMMENT_COL, null, ['meta','comment']);
    r++;
  }
  def(refMap, label, label);
  return r;
}

/* ── Column constants ──────────────────────── */

/** Key column of the metadata sheet (B). */
export const META_KEY_COL = 2;
/** Value column of the metadata sheet (C). */
export const META_VAL_COL = 3;
/** Comment column of the metadata sheet (D). */
export const META_COMMENT_COL = 4;

/** Section headers written by genMetaSheet, in order. */
export const META_SECTIONS = [
  'System', 'Params', 'Includes', 'Patches', 'Choices', 'Units',
] as const;

/* ── Display helpers ─────────────────────────
 * Shared with src/xlsx/staleness.ts: the staleness fingerprint must
 * byte-match what genMetaSheet writes, so both directions go through
 * these helpers.
 */

/** Display a `params` entry: strings as-is, arrays joined, objects flattened. */
export function displayParam(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(v => String(v)).join(',');
  if (val !== null && typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(',');
  }
  return String(val);
}

/** Version string of an `includes` entry (string or IncludeMeta). */
export function displayInclude(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val !== null && typeof val === 'object') {
    return String((val as { version?: unknown }).version ?? '');
  }
  return '';
}

/** Count of a `patches` entry, as a string. */
export function displayPatch(val: unknown): string {
  if (val !== null && typeof val === 'object' && 'count' in val) {
    return String((val as { count: unknown }).count);
  }
  return '';
}

/**
 * Write a value as an explicit string, bypassing writeCell's numeric
 * coercion, so numeric-looking strings ("2.0") round-trip
 * byte-identically for the staleness check.
 */
function writeMetaText(
  ws: Worksheet,
  r: number,
  c: number,
  text: string | null,
  style?: readonly [section: string, key: string, variant?: string],
): void {
  const cell = ws.getCell(r, c);
  if (style !== undefined) {
    applyStyle(cell, fmt(...style));
  }
  cell.value = text === null || text === '' ? null : text;
}

/* ── Main generator ────────────────────────── */

export function genMetaSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  version: string,
  spaUrl: string,
  sourceUrl: string,
  pricingData: unknown,
): void {
  const fixed = pricingData as FixedPricesMeta;

  /* ── Column widths ───────────────────────── */
  const colWidths = [0, 3, 15, 45, 50];
  for (let c = 1; c < colWidths.length; c++) {
    setColumnWidth(ws, c, colWidths[c]);
  }

  let r = 2;
  /* ── Title ───────────────────────────────── */
  writeCell(ws, r, META_KEY_COL, 'Meta Data', ['meta','title']);
  r++;
  writeCell(ws, r, META_KEY_COL, 'Key', [ 'meta','header', '1']);
  writeCell(ws, r, META_VAL_COL, 'Value', ['meta', 'header', '1']);
  writeCell(ws, r, META_COMMENT_COL, 'Comment', ['meta', 'header', '1']);
  r++;

  /* ── Meta section header ─────────────────── */
  writeCell(ws, r, META_KEY_COL, 'System', [ 'meta','header', '2']);
  writeCell(ws, r, META_VAL_COL, null, ['meta', 'header', '2']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'header', '2']);
  r++;

  /* ── Core metadata ───────────────────────── */
  writeCell(ws, r, META_KEY_COL, 'Generated', [ 'meta','key']);
  writeCell(ws, r, META_VAL_COL, fmtEpoch(Date.now() / 1000), ['meta', 'value', 'date']);
  writeCell(ws, r, META_COMMENT_COL, 'by XLpricer SPA', ['meta', 'comment']);
  r++;

  writeCell(ws, r, META_KEY_COL, 'Script version', [ 'meta','key']);
  writeCell(ws, r, META_VAL_COL, version, ['meta', 'value']);
  writeCell(ws, r, META_COMMENT_COL, 'TypeScript', ['meta', 'comment']);
  r++;

  writeCell(ws, r, META_KEY_COL, 'SPA URL', [ 'meta','key']);
  writeCell(ws, r, META_VAL_COL, spaUrl, ['meta', 'value']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  r++;

  if (sourceUrl) {
    writeCell(ws, r, META_KEY_COL, 'Source URL', [ 'meta','key']);
    writeCell(ws, r, META_VAL_COL, sourceUrl, ['meta', 'value']);
    writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
    r++;
  }

  if (fixed.schema) {
    writeMetaText(ws, r, META_KEY_COL, 'Schema', ['meta','key']);
    writeMetaText(ws, r, META_VAL_COL, fixed.schema, ['meta', 'value']);
    writeMetaText(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
    r++;
  }

  writeCell(ws, r, META_KEY_COL, 'Format version', ['meta','key']);
  writeCell(ws, r, META_VAL_COL, FORMAT_VERSION, ['meta', 'value']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  r++;

  if (fixed.timestamp !== undefined) {
    writeMetaText(ws, r, META_KEY_COL, 'Pricing Data', ['meta','key']);
    writeMetaText(ws, r, META_VAL_COL, fmtEpoch(fixed.timestamp), ['meta', 'value', 'date']);
    writeMetaText(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
    r++;
  }

  writeCell(ws, r, META_KEY_COL, 'Non-recurrent items', ['meta','key']);
  writeCell(ws, r, META_VAL_COL, AS_ONE_TIME, ['meta', 'value'], 'T_ONE_TIME');
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  // Bare defined-name reference: BOM formulas use {T_ONE_TIME}, so the
  // regenerated T can land the row anywhere and only the name's target
  // changes — no formula surgery (see docs/DONE-reprice.md).
  def(refMap,'T_ONE_TIME', 'T_ONE_TIME');
  r++;

  /* ── Params ──────────────────────────────── */
  if (fixed.params) {
    const entries = Object.entries(fixed.params);
    if (entries.length > 0) {
      writeCell(ws, r, META_KEY_COL, 'Params', ['meta','header', '2']);
      writeCell(ws, r, META_VAL_COL, null, ['meta', 'header', '2']);
      writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'header', '2']);
      r++;
      for (const [key, val] of entries) {
        writeMetaText(ws, r, META_KEY_COL, key, ['meta','key']);
        writeMetaText(ws, r, META_VAL_COL, displayParam(val), ['meta', 'value']);
        writeMetaText(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
        r++;
      }
    }
  }
  /* ── Includes ────────────────────────────── */
  if (fixed.includes) {
    const entries = Object.entries(fixed.includes)
    if (entries.length > 0) {
      writeCell(ws, r, META_KEY_COL, 'Includes', ['meta','header', '2']);
      writeCell(ws, r, META_VAL_COL, null, ['meta', 'header', '2']);
      writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'header', '2']);
      r++;
      for (const [group, val] of entries) {
        let comment: string | null = null;
        if (typeof val === 'object' && val !== null) {
          comment = [val.sha, val.message].filter(Boolean).join(' ') || null;
        }
        writeMetaText(ws, r, META_KEY_COL, group, ['meta','key']);
        writeMetaText(ws, r, META_VAL_COL, displayInclude(val), ['meta', 'value']);
        writeMetaText(ws, r, META_COMMENT_COL, comment, ['meta', 'comment']);
        r++;
      }
    }
  }

  /* ── Patches ─────────────────────────────── */
  if (fixed.patches) {
    const entries = Object.entries(fixed.patches)
    if (entries.length > 0) {
      writeCell(ws, r, META_KEY_COL, 'Patches', ['meta','header', '2']);
      writeCell(ws, r, META_VAL_COL, null, ['meta', 'header', '2']);
      writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'header', '2']);
      r++;
      for (const [label, patch] of entries) {
        writeMetaText(ws, r, META_KEY_COL, label, ['meta','key']);
        writeMetaText(ws, r, META_VAL_COL, displayPatch(patch), ['meta', 'value', 'num']);
        writeMetaText(ws, r, META_COMMENT_COL, patch.description, ['meta', 'comment']);
        r++;
      }
    }
  }

  /* ── Choices ─────────────────────────────── */
  writeCell(ws, r, META_KEY_COL, 'Choices', ['meta','header', '2']);
  writeCell(ws, r, META_VAL_COL, null, ['meta', 'header', '2']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'header', '2']);
  r++;
  if (fixed.choices) {
    const entries = Object.entries(fixed.choices)
    if (entries.length > 0) {
      for (const [name, values] of entries) {
        r = addChoice(ws, r, name, values, refMap);
      }
    }
  }
  r = addChoice(ws, r, 'BACKUP', VLIST_BACKUP, refMap);
  r = addChoice(ws, r, 'RXM', VLIST_RXM, refMap);


  writeCell(ws, r, META_KEY_COL, 'Units', ['meta','header', '2']);
  writeCell(ws, r, META_VAL_COL, null, ['meta', 'header', '2']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'header', '2']);
  r++;
  let GB = r;
  writeCell(ws, r, META_KEY_COL, 'GB', ['meta','key']);
  writeCell(ws, r, META_VAL_COL, '=10^9', ['meta', 'value', 'num']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  r++;
  let GiB = r;
  writeCell(ws, r, META_KEY_COL, 'GiB', ['meta','key']);
  writeCell(ws, r, META_VAL_COL, '=2^30', ['meta', 'value', 'num']);
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  r++;
  writeCell(ws, r, META_KEY_COL, 'GB to GiB', ['meta','key']);
  writeCell(ws, r, META_VAL_COL, `=${rowcolToCell(GB,META_VAL_COL)}/${rowcolToCell(GiB,META_VAL_COL)}`, ['meta', 'value', 'float'],'GB_TO_GiB');
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  r++;
  writeCell(ws, r, META_KEY_COL, 'GiB to GB', ['meta','key']);
  writeCell(ws, r, META_VAL_COL, `=${rowcolToCell(GiB,META_VAL_COL)}/${rowcolToCell(GB,META_VAL_COL)}`, ['meta', 'value', 'float'],'GiB_TO_GB');
  writeCell(ws, r, META_COMMENT_COL, null, ['meta', 'comment']);
  r++;

  //~ r++;
  //~ Object.entries(refMap).forEach(([key,val]) => {
    //~ writeCell(ws,r, META_KEY_COL, key);
    //~ writeCell(ws,r, META_VAL_COL, val);
    //~ r++;
  //~ });


}
