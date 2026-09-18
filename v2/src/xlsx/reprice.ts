/**
 * Workbook refresh ("reprice") core.
 *
 * Pure and browser-safe (ExcelJS + JSZip only, no fs/fetch): the CLI
 * and the future SPA both drive this.  Plan: docs/TODO-reprice.md.
 *
 * Refreshing replaces Prices + Volumes + Finder with freshly generated
 * sheets (and regenerates T as the new baseline), while leaving the
 * user-owned sheets — Components tabs, Overview, Assumptions, ESA —
 * untouched.
 */

import ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';

import type { PricesData } from '../prices/types';
import { bomColumnRefs, genBomTemplateSheet } from './bom';
import {
  FORMAT_VERSION,
  FROZEN_SHEET_NAME,
  META_SHEET_NAME,
  TEMPLATE_SHEET_NAME,
} from './constants';
import {
  FINDER_SHEET_NAME,
  genFinderSheet,
  modernizeWorkbookMetadata,
} from './finder';
import { genMetaSheet } from './meta';
import { genPriceSheet, PRICES_DESC_NAME, PRICES_REGIONS_NAME, PRICES_TABLE_NAME } from './prices';
import {
  compareSourceMeta,
  extractSourceMeta,
  fingerprintSourceMeta,
  schemaMajor,
} from './staleness';
import type { SourceCompare } from './staleness';
import { mergeIntoMacroWorkbook } from './vba';
import { genVolumeSheet, updatePrices } from './vol';
import { cellToRowCol, sheetRef } from './xlu';

/* ── Types ─────────────────────────────────── */

export interface RefreshOptions {
  /** Bypass the staleness check and the schema-identity guard. */
  force?: boolean;
  /** Only run the staleness check; never refresh. */
  checkOnly?: boolean;
  appMeta: {
    version?: string;
    spaUrl?: string;
    sourceUrl?: string;
  };
  /**
   * Macro host bytes for macro-enabled output.  The CLI passes the
   * `--xlsm` template when given, else the ORIGINAL file's bytes (an
   * xlsm input's own vbaProject.bin).  Absent → plain xlsx output.
   */
  xlsmTemplate?: Uint8Array;
}

export interface RefreshResult {
  /** Refreshed workbook bytes; null when unchanged or check-only. */
  buffer: ArrayBuffer | null;
  check: SourceCompare;
  warnings: string[];
  forced: boolean;
}

export type RefreshErrorKind =
  | 'not-xl-pricer'
  | 'trimmed'
  | 'no-bom-tabs'
  | 'schema-major';

export class RefreshError extends Error {
  kind: RefreshErrorKind;
  constructor(kind: RefreshErrorKind, message: string) {
    super(message);
    this.name = 'RefreshError';
    this.kind = kind;
  }
}

/** A BOM tab discovered from the Volumes per-tab SUMIFS columns. */
export interface BomTab {
  name: string;
  /** Whole-column letters of the tab's QxH / Description / Region columns. */
  qxh: string;
  desc: string;
  reg: string;
}

/* ── Formula parsing ───────────────────────── */

/**
 * Parse sheet-qualified references out of a formula, e.g.
 * `SUMIFS('My Tab'!$K:$K,'My Tab'!$C:$C,…)` → [{sheet: 'My Tab',
 * range: '$K:$K'}, …].  Handles quoted and unquoted names, including
 * embedded apostrophes ('Mike''s Data'!).
 */
export function parseSheetRanges(
  formula: string,
): Array<{ sheet: string; range: string }> {
  const re = /('(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.]*)!(\$?[A-Z]{1,3}(?:\$\d+)?(?::\$?[A-Z]{1,3}(?:\$\d+)?)?)/g;
  const out: Array<{ sheet: string; range: string }> = [];
  for (const m of formula.matchAll(re)) {
    let sheet = m[1];
    if (sheet.startsWith("'")) {
      sheet = sheet.slice(1, -1).replace(/''/g, "'");
    }
    out.push({ sheet, range: m[2] });
  }
  return out;
}

/* ── BOM tab discovery ─────────────────────── */

/**
 * Discover the BOM tabs from the Volumes per-tab SUMIFS columns —
 * the formulas are the ground truth (user renames/reordering can't
 * lie to them).  Returns the tabs plus warnings for skipped columns.
 *
 * Fallback (no Volumes sheet — a trimmed workbook): enumerate the
 * `Components*` sheets and use the current-layout column letters.
 */
export function discoverBomTabs(
  wb: Workbook,
): { tabs: BomTab[]; warnings: string[] } {
  const warnings: string[] = [];
  const vols = wb.getWorksheet('Volumes');
  if (!vols) return discoverBomTabsFromSheets(wb, warnings);

  let anchorCol = 0;
  vols.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (cell.value === 'Tab Volumes') anchorCol = colNumber;
  });
  if (!anchorCol) {
    throw new RefreshError('no-bom-tabs', 'no "Tab Volumes" anchor on the Volumes sheet');
  }

  const tabs: BomTab[] = [];
  const seen = new Set<string>();
  for (let col = anchorCol; col < anchorCol + 200; col++) {
    const header = vols.getRow(3).getCell(col).value;
    if (header === null || header === undefined || String(header).trim() === '') break;

    // First formula beneath the header carries the SUMIFS references.
    let formula = '';
    for (let r = 4; r <= 80; r++) {
      const f = vols.getRow(r).getCell(col).formula;
      if (f) { formula = f; break; }
    }
    if (!formula) {
      warnings.push(`Volumes column ${col} has no formulas; skipping`);
      continue;
    }
    const refs = parseSheetRanges(formula);
    if (refs.length < 3
      || refs[0].sheet !== refs[1].sheet
      || refs[1].sheet !== refs[2].sheet) {
      warnings.push(`Volumes column ${col} has an unexpected formula shape; skipping`);
      continue;
    }
    const name = refs[0].sheet;
    if (!wb.getWorksheet(name)) {
      warnings.push(`Volumes references tab "${name}", which no longer exists; skipping`);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    tabs.push({
      name,
      qxh: refs[0].range,
      desc: refs[1].range,
      reg: refs[2].range,
    });
  }
  if (tabs.length === 0) {
    throw new RefreshError('no-bom-tabs', 'no Components tabs could be discovered from the Volumes sheet');
  }
  return { tabs, warnings };
}

/** No-Volumes fallback: every `Components*` sheet, current layout. */
function discoverBomTabsFromSheets(
  wb: Workbook,
  warnings: string[],
): { tabs: BomTab[]; warnings: string[] } {
  const refs = bomColumnRefs();
  const tabs: BomTab[] = [];
  for (const ws of wb.worksheets) {
    if (!ws.name.toLowerCase().startsWith('components')) continue;
    if (ws.name === TEMPLATE_SHEET_NAME) continue;
    tabs.push({ name: ws.name, qxh: refs.qxh, desc: refs.desc, reg: refs.reg });
  }
  if (tabs.length === 0) {
    throw new RefreshError('no-bom-tabs', 'no Components tabs found and no Volumes sheet to discover them from');
  }
  return { tabs, warnings };
}

/* ── Defined-name pruning ──────────────────── */

/** Sheet name a defined-name range points at (quoted or not). */
function rangeSheet(range: string): string {
  if (range.startsWith("'")) {
    const end = range.indexOf("'!", 1);
    if (end === -1) return '';
    return range.slice(1, end).replace(/''/g, "'");
  }
  const bang = range.indexOf('!');
  return bang === -1 ? '' : range.slice(0, bang);
}

/**
 * Remove defined-name entries whose ranges point at removed sheets.
 * (`workbook.removeWorksheet` does NOT prune defined names — verified
 * against the installed ExcelJS source — so this is mandatory before
 * regenerating Prices/T, whose names are re-stamped by the generators.)
 */
export function pruneDefinedNames(wb: Workbook, removed: ReadonlySet<string>): void {
  const entries = wb.definedNames.model;
  const kept = entries
    .map(entry => ({
      name: entry.name,
      ranges: entry.ranges.filter(r => !removed.has(rangeSheet(r))),
    }))
    .filter(entry => entry.ranges.length > 0);
  wb.definedNames.model = kept;
}

/* ── Sheet ordering ────────────────────────── */

/** Renumber `orderNo` so the workbook's tab order matches `order`. */
export function reorderSheets(wb: Workbook, order: readonly string[]): void {
  let i = 1;
  for (const name of order) {
    const ws = wb.getWorksheet(name);
    if (ws) {
      (ws as unknown as { orderNo: number }).orderNo = i++;
    }
  }
}

/* ── Assumption ref revival ────────────────── */

/**
 * Rebuild the refMap entries genAssSheet would have defined, from the
 * EXISTING Assumptions sheet (refresh never regenerates it): `$KEY`
 * rows → `Assumptions!$D$<row>`, `#KEY` rows → the bare name.
 */
export function reviveAssumptionRefs(
  wb: Workbook,
  refMap: Record<string, string>,
): void {
  const ws = wb.getWorksheet('Assumptions');
  if (!ws) return;
  ws.eachRow({ includeEmpty: false }, row => {
    const key = row.getCell(3).value;
    if (typeof key !== 'string') return;
    if (key.startsWith('$')) {
      refMap[key.slice(1).toLowerCase()] = `Assumptions!$D$${row.number}`;
    } else if (key.startsWith('#')) {
      refMap[key.slice(1).toLowerCase()] = key.slice(1);
    }
  });
}

/* ── Prices-ref revival ───────────────────── */

/**
 * Rebuild the `cm_*` refMap entries genPriceSheet defines (zero-based
 * column indices), from the EXISTING Prices sheet's header row
 * `(<key>)` markers.  Used when generating the BOM template without
 * running genPriceSheet (xlsx → xlsm conversion).
 */
export function revivePriceRefs(
  wb: Workbook,
  refMap: Record<string, string>,
): void {
  const ws = wb.getWorksheet('Prices');
  if (!ws) return;
  ws.getRow(3).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const v = cell.value;
    if (typeof v !== 'string') return;
    const m = v.match(/\(([^)]+)\)\s*$/);
    if (m) refMap[`cm_${m[1].toLowerCase()}`] = String(colNumber - 1);
  });
}

/* ── T_ONE_TIME is a defined name ──────────── */

/**
 * `T_ONE_TIME` is a defined name on the T sheet (stamped by
 * genMetaSheet), so BOM formulas reference it by name and a
 * regenerated T can move the row freely — the refresh only redefines
 * the name.  The refMap entry is the bare name string.
 */
export const T_ONE_TIME_NAME = 'T_ONE_TIME';

/**
 * Ensure the hidden BOM clone template exists (adding it when
 * absent), generated against refs revived from the existing
 * Assumptions sheet plus the PriceList* /T_ONE_TIME name constants.
 * Shared by refresh and xlsx -> xlsm conversion.
 */
export function ensureBomTemplate(
  wb: Workbook,
  refMap: Record<string, string>,
): void {
  if (wb.getWorksheet(TEMPLATE_SHEET_NAME)) return;
  reviveAssumptionRefs(wb, refMap);
  revivePriceRefs(wb, refMap);
  refMap['t_one_time'] = T_ONE_TIME_NAME;
  refMap['prices_desc'] = PRICES_DESC_NAME;
  refMap['prices_region'] = PRICES_REGIONS_NAME;
  refMap['prices_table'] = PRICES_TABLE_NAME;
  const ws = wb.addWorksheet(TEMPLATE_SHEET_NAME);
  ws.state = 'veryHidden';
  genBomTemplateSheet(ws, refMap);
}

/* ── _Frozen revival ──────────────────────── */

function colIndex(letters: string): number {
  let c = 0;
  for (let i = 0; i < letters.length; i++) {
    c = c * 26 + letters.charCodeAt(i) - 64;
  }
  return c;
}

function indexToCol(idx: number): string {
  let name = '';
  let c = idx;
  while (c > 0) {
    const mod = (c - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    c = Math.floor((c - 1) / 26);
  }
  return name;
}

/**
 * Shift every *unqualified* A1-style reference in a formula by
 * (dRow, dCol).  Sheet-qualified refs (`Assumptions!$D$5`) and
 * defined names (`PriceListTable`, `T_ONE_TIME`) are untouched;
 * whole-column refs (`$AK:$AK`) shift columns only.
 */
export function shiftFormula(
  formula: string,
  dRow: number,
  dCol: number,
): string {
  const re = /(\$?[A-Z]{1,3})(\$?\d+)?/g;
  return formula.replace(re, (full, colPart: string, rowPart?: string, offset?: number, whole?: string) => {
    if (typeof offset !== 'number' || whole === undefined) return full;
    const before = whole[offset - 1] ?? '';
    const after = whole[offset + full.length] ?? '';
    // Inside a qualified ref or a longer identifier → leave alone.
    if (/[A-Za-z0-9_.!']/.test(before) || /[A-Za-z0-9_.]/.test(after)) return full;

    const colDollar = colPart.startsWith('$') ? '$' : '';
    const letters = colPart.replace('$', '');
    const newCol = colIndex(letters) + dCol;
    if (newCol < 1 || newCol > 16384) return full;
    let out = colDollar + indexToCol(newCol);
    if (rowPart !== undefined) {
      const rowDollar = rowPart.startsWith('$') ? '$' : '';
      out += rowDollar + String(Number(rowPart.replace('$', '')) + dRow);
    }
    return out;
  });
}

/** Parse `'Sheet'!$A$1` or `Sheet!$A$1` (formula text, no leading =). */
function parseSheetRef(text: string): { sheet: string; row: number; col: number } | null {
  const bang = text.lastIndexOf('!');
  if (bang === -1) return null;
  let sheet = text.slice(0, bang).trim();
  if (sheet.startsWith("'") && sheet.endsWith("'")) {
    sheet = sheet.slice(1, -1).replace(/''/g, "'");
  }
  const [row, col] = cellToRowCol(text.slice(bang + 1).trim());
  return { sheet, row, col };
}

export interface FrozenRevival {
  restored: number;
  warnings: string[];
}

/**
 * Restore the formulas TrimWB/trimWorkbook froze, from the veryHidden
 * `_Frozen` sheet: parse each LiveRef (Excel/LibreOffice keep it
 * pointed at the logical cell through structural edits), compute the
 * deltas against the recorded original address, shift the formula's
 * unqualified refs, and restore it.  `#REF!` entries (deleted rows)
 * are skipped with warnings.
 */
export function reviveFrozenFormulas(wb: Workbook): FrozenRevival {
  const warnings: string[] = [];
  const frz = wb.getWorksheet(FROZEN_SHEET_NAME);
  if (!frz) return { restored: 0, warnings };
  let restored = 0;
  frz.eachRow({ includeEmpty: false }, (row) => {
    const live = row.getCell(1).value as { formula?: string } | null;
    const liveFormula = (live && typeof live === 'object') ? live.formula : undefined;
    if (!liveFormula) return;
    if (liveFormula.includes('#REF!')) {
      warnings.push(`_Frozen row ${row.number}: referenced cell was deleted; skipped`);
      return;
    }
    const orig = String(row.getCell(2).value ?? '');
    const text = String(row.getCell(3).value ?? '');
    if (!orig || !text) return;
    const newAddr = parseSheetRef(liveFormula);
    const oldAddr = parseSheetRef(orig);
    if (!newAddr || !oldAddr) {
      warnings.push(`_Frozen row ${row.number}: unparseable addresses; skipped`);
      return;
    }
    const target = wb.getWorksheet(newAddr.sheet);
    if (!target) {
      warnings.push(`_Frozen row ${row.number}: sheet "${newAddr.sheet}" missing; skipped`);
      return;
    }
    const shifted = shiftFormula(text, newAddr.row - oldAddr.row, newAddr.col - oldAddr.col);
    target.getCell(newAddr.row, newAddr.col).value = { formula: shifted };
    restored++;
  });
  return { restored, warnings };
}

/* ── Orchestrator ──────────────────────────── */

/** Text value of a T-sheet key row (B/C columns). */
function metaValue(ws: Worksheet, label: string): string {
  let out = '';
  ws.eachRow({ includeEmpty: false }, row => {
    if (row.getCell(2).value === label) {
      const v = row.getCell(3).value;
      out = v === null || v === undefined ? '' : String(v);
    }
  });
  return out;
}

const REPLACED_SHEETS = ['Tools', 'Prices', 'Volumes', FINDER_SHEET_NAME, META_SHEET_NAME] as const;

export async function refreshWorkbook(
  existingBytes: Uint8Array,
  pricingData: PricesData,
  opts: RefreshOptions,
): Promise<RefreshResult> {
  const warnings: string[] = [];

  /* ── Load ── */
  const wb = new ExcelJS.Workbook();
  await (wb.xlsx.load as unknown as (data: Uint8Array) => Promise<Workbook>)(existingBytes);
  const hadTemplate = Boolean(wb.getWorksheet(TEMPLATE_SHEET_NAME));

  /* ── Provenance guards ── */
  const metaWs = wb.getWorksheet(META_SHEET_NAME);
  if (!metaWs) {
    throw new RefreshError('not-xl-pricer', `no ${META_SHEET_NAME} sheet — not an XLPricer v2 workbook`);
  }
  const formatVersion = metaValue(metaWs, 'Format version');
  if (!formatVersion) {
    throw new RefreshError('not-xl-pricer', 'T sheet has no "Format version" row — not an XLPricer v2 workbook');
  }
  const hasPrices = Boolean(wb.getWorksheet('Prices'));
  const hasVolumes = Boolean(wb.getWorksheet('Volumes'));
  const trimmed = !hasPrices || !hasVolumes;
  if (trimmed && !wb.getWorksheet(FROZEN_SHEET_NAME)) {
    throw new RefreshError('trimmed', 'Prices/Volumes sheets are missing and there is no _Frozen sheet — the workbook appears trimmed without revival markers; refreshing it is not supported');
  }
  if (trimmed) {
    const revival = reviveFrozenFormulas(wb);
    warnings.push(`restored ${revival.restored} frozen formulas from ${FROZEN_SHEET_NAME}`);
    warnings.push(...revival.warnings);
    const frz = wb.getWorksheet(FROZEN_SHEET_NAME);
    if (frz) wb.removeWorksheet(frz.id);
  }

  /* ── Staleness check ── */
  const oldMeta = extractSourceMeta(metaWs);
  const freshMeta = fingerprintSourceMeta(pricingData);
  // Trimmed workbooks have no pricing sheets — there is nothing to
  // compare against the pipeline.  Skip the comparison (and the
  // "no change detected" warning): a trimmed rebuild is always forced.
  const check: SourceCompare = trimmed
    ? { stale: true, changedKeys: [], missingKeys: [], extraKeys: [], reason: 'trimmed workbook — staleness skipped' }
    : compareSourceMeta(oldMeta, freshMeta);
  if (opts.checkOnly) {
    return { buffer: null, check, warnings, forced: false };
  }
  if (!check.stale && !opts.force) {
    return { buffer: null, check, warnings, forced: false };
  }
  if (opts.force && !check.stale) {
    warnings.push('no change detected — forcing refresh');
  }

  /* ── Schema identity + format guards ── */
  const oldSchema = oldMeta['schema'] ?? '';
  const newSchema = pricingData.schema ?? '';
  if (oldSchema && newSchema && schemaMajor(oldSchema) !== schemaMajor(newSchema)) {
    if (!opts.force) {
      throw new RefreshError('schema-major', `pricing schema identity changed: ${oldSchema} → ${newSchema}`);
    }
    warnings.push(`schema identity changed (${oldSchema} → ${newSchema}) — forcing`);
  } else if (oldSchema && newSchema && oldSchema !== newSchema) {
    warnings.push(`pricing schema changed within the same major identity: ${oldSchema} → ${newSchema}`);
  }
  if (formatVersion !== FORMAT_VERSION) {
    warnings.push(`workbook Format version ${formatVersion} differs from current ${FORMAT_VERSION}`);
  }
  const oldIncludes = Object.keys(oldMeta).filter(k => k.startsWith('includes|'));
  const newIncludes = Object.keys(freshMeta).filter(k => k.startsWith('includes|'));
  if (oldIncludes.length > 0 && newIncludes.length === 0) {
    warnings.push(
      `old workbook was built with includes (${oldIncludes.map(k => k.slice('includes|'.length)).join(', ')}); none provided — the refreshed Prices will drop them`,
    );
  }

  /* ── Discovery (before deleting anything) ── */
  const discovered = discoverBomTabs(wb);
  warnings.push(...discovered.warnings);

  /* ── Desired final tab order ── */
  const block = ['Volumes', 'Prices', FINDER_SHEET_NAME];
  const desired: string[] = [];
  let blockInserted = false;
  for (const ws of wb.worksheets) {
    if (ws.name === 'Tools' || ws.name === META_SHEET_NAME) continue;
    if (block.includes(ws.name)) {
      if (!blockInserted) { desired.push(...block); blockInserted = true; }
      continue;
    }
    desired.push(ws.name);
  }
  if (!blockInserted) {
    // Trimmed workbooks have no Volumes/Prices/Finder — place the
    // regenerated block before Assumptions/ESA.
    const at = desired.findIndex(n => n === 'Assumptions' || n === 'ESA');
    desired.splice(at === -1 ? desired.length : at, 0, ...block);
  }
  if (opts.xlsmTemplate && !wb.getWorksheet(TEMPLATE_SHEET_NAME)) {
    const at = desired.indexOf('Volumes');
    desired.splice(at === -1 ? desired.length : at, 0, TEMPLATE_SHEET_NAME);
  }
  desired.push(META_SHEET_NAME);

  /* ── Sheet swap ── */
  for (const name of REPLACED_SHEETS) {
    const ws = wb.getWorksheet(name);
    if (ws) wb.removeWorksheet(ws.id);
  }
  pruneDefinedNames(wb, new Set(REPLACED_SHEETS));

  const byName = new Map(wb.worksheets.map(w => [w.name, w]));
  for (const name of desired) {
    // The template sheet is created by ensureBomTemplate below.
    if (byName.has(name) || name === TEMPLATE_SHEET_NAME) continue;
    const ws = wb.addWorksheet(name);
    byName.set(name, ws);
  }

  /* ── Regenerate Prices / Volumes / Finder ── */
  const refMap: Record<string, string> = {};
  const wsPrc = byName.get('Prices')!;
  const wsFinder = byName.get(FINDER_SHEET_NAME)!;
  const wsVols = byName.get('Volumes')!;

  genPriceSheet(wsPrc, refMap, pricingData);
  genFinderSheet(wsFinder, pricingData);
  for (const tab of discovered.tabs) {
    const key = tab.name.toLowerCase();
    refMap[`${key}!!f_qxh`] = `${sheetRef(tab.name)}!${tab.qxh}`;
    refMap[`${key}!!f_desc`] = `${sheetRef(tab.name)}!${tab.desc}`;
    refMap[`${key}!!f_reg`] = `${sheetRef(tab.name)}!${tab.reg}`;
  }
  genVolumeSheet(wsVols, refMap, discovered.tabs.map(t => t.name), pricingData);
  updatePrices(wsPrc, refMap);

  /* ── Regenerate T ── */
  const metaRef: Record<string, string> = {};
  const wsMeta = byName.get(META_SHEET_NAME)!;
  genMetaSheet(
    wsMeta,
    metaRef,
    opts.appMeta.version ?? '',
    opts.appMeta.spaUrl ?? '',
    opts.appMeta.sourceUrl ?? '',
    pricingData,
  );
  // Trimmed workbooks carry a veryHidden T; the rebuild restores its
  // visibility (a freshly added sheet would default to visible, but
  // this keeps the contract explicit).
  wsMeta.state = 'visible';

  /* ── The BOM template (when the output is macro-enabled and the
   * content lacks it): generated after T regen; it needs the refs
   * revived from the untouched Assumptions sheet plus the
   * PriceList* /T_ONE_TIME name constants.  An existing template
   * survives the round-trip. */
  if (opts.xlsmTemplate && !hadTemplate) ensureBomTemplate(wb, refMap);

  /* ── Finalise ── */
  reorderSheets(wb, desired);
  const raw = await wb.xlsx.writeBuffer();
  const content = await modernizeWorkbookMetadata(
    raw as unknown as ArrayBuffer,
  );
  const buffer = opts.xlsmTemplate
    ? await mergeIntoMacroWorkbook(opts.xlsmTemplate, content)
    : content;

  return { buffer, check, warnings, forced: Boolean(opts.force) };
}
