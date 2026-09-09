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

/* ── Types ─────────────────────────────────── */

/** Subset of fixed_prices.json consumed by the Metadata sheet. */
export interface FixedPricesMeta {
  schema?: string;
  timestamp?: number;
  params?: Record<string, string | string[]>;
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
  writeCell(ws, r, C_KEY, label, ['meta','key']);
  writeCell(ws, r, C_VAL, values[0] ?? null, ['meta', 'value'], label);
  writeCell(ws, r, C_COMMENT, null, ['meta','comment']);
  r ++;
  for (let i = 1; i < values.length; i++) {
    writeCell(ws, r, C_KEY, null, ['meta','key']);
    writeCell(ws, r, C_VAL, values[i], ['meta', 'value'], label);
    writeCell(ws, r, C_COMMENT, null, ['meta','comment']);
    r++;
  }
  def(refMap, label, label);
  return r;
}

/* ── Column constants ──────────────────────── */

const C_KEY = 2;      // Column A — label / key
const C_VAL = 3;      // Column B — value
const C_COMMENT = 4;  // Column C — comment

/* ── Main generator ────────────────────────── */

export function genMetaSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  version: string,
  spaUrl: string,
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
  writeCell(ws, r, C_KEY, 'Meta Data', ['meta','title']);
  r++;
  writeCell(ws, r, C_KEY, 'Key', [ 'meta','header', '1']);
  writeCell(ws, r, C_VAL, 'Value', ['meta', 'header', '1']);
  writeCell(ws, r, C_COMMENT, 'Comment', ['meta', 'header', '1']);
  r++;

  /* ── Meta section header ─────────────────── */
  writeCell(ws, r, C_KEY, 'System', [ 'meta','header', '2']);
  writeCell(ws, r, C_VAL, null, ['meta', 'header', '2']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'header', '2']);
  r++;

  /* ── Core metadata ───────────────────────── */
  writeCell(ws, r, C_KEY, 'Generated', [ 'meta','key']);
  writeCell(ws, r, C_VAL, fmtEpoch(Date.now() / 1000), ['meta', 'value', 'date']);
  writeCell(ws, r, C_COMMENT, 'by XLpricer SPA', ['meta', 'comment']);
  r++;

  writeCell(ws, r, C_KEY, 'Script version', [ 'meta','key']);
  writeCell(ws, r, C_VAL, version, ['meta', 'value']);
  writeCell(ws, r, C_COMMENT, 'TypeScript', ['meta', 'comment']);
  r++;

  writeCell(ws, r, C_KEY, 'SPA URL', [ 'meta','key']);
  writeCell(ws, r, C_VAL, spaUrl, ['meta', 'value']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  r++;

  if (fixed.schema) {
    writeCell(ws, r, C_KEY, 'Schema', ['meta','key']);
    writeCell(ws, r, C_VAL, fixed.schema, ['meta', 'value']);
    writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
    r++;
  }

  writeCell(ws, r, C_KEY, 'Format version', ['meta','key']);
  writeCell(ws, r, C_VAL, FORMAT_VERSION, ['meta', 'value']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  r++;

  if (fixed.timestamp !== undefined) {
    writeCell(ws, r, C_KEY, 'Pricing Data', ['meta','key']);
    writeCell(ws, r, C_VAL, fmtEpoch(fixed.timestamp), ['meta', 'value', 'date']);
    writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
    r++;
  }

  writeCell(ws, r, C_KEY, 'Non-recurrent items', ['meta','key']);
  writeCell(ws, r, C_VAL, AS_ONE_TIME, ['meta', 'value']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  def(refMap,'T_ONE_TIME', rowcolToCell(r,C_VAL,true,true, ws.name));
  r++;

  /* ── Params ──────────────────────────────── */
  if (fixed.params) {
    const entries = Object.entries(fixed.params);
    if (entries.length > 0) {
      writeCell(ws, r, C_KEY, 'Params', ['meta','header', '2']);
      writeCell(ws, r, C_VAL, null, ['meta', 'header', '2']);
      writeCell(ws, r, C_COMMENT, null, ['meta', 'header', '2']);
      r++;
      for (const [key, val] of entries) {
        const display = Array.isArray(val) ? val.join(',') : val;
        writeCell(ws, r, C_KEY, key, ['meta','key']);
        writeCell(ws, r, C_VAL, display, ['meta', 'value']);
        writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
        r++;
      }
    }
  }
  /* ── Includes ────────────────────────────── */
  if (fixed.includes) {
    const entries = Object.entries(fixed.includes)
    if (entries.length > 0) {
      writeCell(ws, r, C_KEY, 'Includes', ['meta','header', '2']);
      writeCell(ws, r, C_VAL, null, ['meta', 'header', '2']);
      writeCell(ws, r, C_COMMENT, null, ['meta', 'header', '2']);
      r++;
      for (const [group, val] of entries) {
        const version = typeof val === 'string' ? val : val.version;
        let comment: string | null = null;
        if (typeof val === 'object' && val !== null) {
          comment = [val.sha, val.message].filter(Boolean).join(' ') || null;
        }
        writeCell(ws, r, C_KEY, group, ['meta','key']);
        writeCell(ws, r, C_VAL, version, ['meta', 'value']);
        writeCell(ws, r, C_COMMENT, comment, ['meta', 'comment']);
        r++;
      }
    }
  }

  /* ── Patches ─────────────────────────────── */
  if (fixed.patches) {
    const entries = Object.entries(fixed.patches)
    if (entries.length > 0) {
      writeCell(ws, r, C_KEY, 'Patches', ['meta','header', '2']);
      writeCell(ws, r, C_VAL, null, ['meta', 'header', '2']);
      writeCell(ws, r, C_COMMENT, null, ['meta', 'header', '2']);
      r++;
      for (const [label, { count, description }] of entries) {
        writeCell(ws, r, C_KEY, label, ['meta','key']);
        writeCell(ws, r, C_VAL, count, ['meta', 'value', 'num']);
        writeCell(ws, r, C_COMMENT, description, ['meta', 'comment']);
        r++;
      }
    }
  }

  /* ── Choices ─────────────────────────────── */
  writeCell(ws, r, C_KEY, 'Choices', ['meta','header', '2']);
  writeCell(ws, r, C_VAL, null, ['meta', 'header', '2']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'header', '2']);
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


  writeCell(ws, r, C_KEY, 'Units', ['meta','header', '2']);
  writeCell(ws, r, C_VAL, null, ['meta', 'header', '2']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'header', '2']);
  r++;
  let GB = r;
  writeCell(ws, r, C_KEY, 'GB', ['meta','key']);
  writeCell(ws, r, C_VAL, '=10^9', ['meta', 'value', 'num']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  r++;
  let GiB = r;
  writeCell(ws, r, C_KEY, 'GiB', ['meta','key']);
  writeCell(ws, r, C_VAL, '=2^30', ['meta', 'value', 'num']);
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  r++;
  writeCell(ws, r, C_KEY, 'GB to GiB', ['meta','key']);
  writeCell(ws, r, C_VAL, `=${rowcolToCell(GB,C_VAL)}/${rowcolToCell(GiB,C_VAL)}`, ['meta', 'value', 'float'],'GB_TO_GiB');
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  r++;
  writeCell(ws, r, C_KEY, 'GiB to GB', ['meta','key']);
  writeCell(ws, r, C_VAL, `=${rowcolToCell(GiB,C_VAL)}/${rowcolToCell(GB,C_VAL)}`, ['meta', 'value', 'float'],'GiB_TO_GB');
  writeCell(ws, r, C_COMMENT, null, ['meta', 'comment']);
  r++;

  //~ r++;
  //~ Object.entries(refMap).forEach(([key,val]) => {
    //~ writeCell(ws,r, C_KEY, key);
    //~ writeCell(ws,r, C_VAL, val);
    //~ r++;
  //~ });


}
