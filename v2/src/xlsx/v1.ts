/* ── v1 → v2 workbook conversion (extraction) ─────────────
 *
 * Reads a legacy v1 xlpricer workbook and extracts the user-owned
 * data the v2 generator needs: the Components tabs (found via the
 * Overview formulas) and the trailing plain-text Assumptions notes.
 * Everything else — Overview, Prices, Volumes, Finder, ESA, T — is
 * recreated by the v2 generator.
 *
 * Plan: the CLI's `--from-v1` mode (src/xlsx/cli.ts).
 */

import ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';

import type { AssumptionsRow, ComponentsRow } from '../editorTab/classify';
import type { PricesData } from '../prices/types';
import { generatePricingXlsx } from './writer';
import type { AppMeta, PricingData } from './writer';
import { mergeIntoMacroWorkbook } from './vba';

/** Conversion failure — `kind` is reported by the CLI (exit 2). */
export class V1ConvertError extends Error {
  kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Sheet names the v2 generator recreates (never converted). */
const GENERATED_TABS = new Set([
  'overview', 'prices', 'volumes', 'assumptions', 'esa', 'tools',
  'finder', 't', '_frozen', '_bomtemplate',
]);

/** v1 header labels per extracted field (DV-protected names). */
const V1_HEADERS: Record<string, string[]> = {
  qty: ['Qty'],
  function: ['Function'],
  description: ['Cloud Desc', 'Description'],
  storage: ['Storage (GiB)'],
  hr: ['H/R'],
  group: ['Group'],
};

/** Fixed v2 BOM user-column letters (bom.ts COLUMNS layout). */
const V2_BOM_COLS: Record<string, number> = {
  'Qty': 2,
  'Function': 3,
  'Description': 4,
  'Storage (GiB)': 6,
  'H/R': 7,
};

/** First BOM data row in the v2 layout. */
const V2_FIRST_DATA_ROW = 6;

/** Defined names the v2 generator emits (safe in kept formulas). */
const V2_SAFE_NAMES = new Set(['GB_TO_GiB', 'GiB_TO_GB', 'T_ONE_TIME']);

/* ── Cell reading ─────────────────────────────────────── */

interface CellInfo {
  /** Literal text, or the cached result for formula cells. */
  text: string;
  /** Formula text when the cell carries one, else null. */
  formula: string | null;
}

function readCell(ws: Worksheet, r: number, c: number): CellInfo | null {
  const cell = ws.getCell(r, c);
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const obj = v as {
      formula?: string;
      richText?: Array<{ text?: unknown }>;
      result?: unknown;
    };
    if (obj.formula !== undefined) {
      const res = cell.result;
      return {
        text: res === undefined || res === null ? '' : String(res),
        formula: obj.formula,
      };
    }
    if (Array.isArray(obj.richText)) {
      return {
        text: obj.richText.map(rt => String(rt?.text ?? '')).join(''),
        formula: null,
      };
    }
    if ('result' in obj) {
      return {
        text: obj.result === undefined || obj.result === null ? '' : String(obj.result),
        formula: null,
      };
    }
    return { text: JSON.stringify(obj), formula: null };
  }
  return { text: String(v), formula: null };
}

/* ── Formula handling ─────────────────────────────────── */

const SHEET_REF_RE =
  /(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!([$A-Z]{1,3}[$0-9]+(?::[$A-Z]{1,3}[$0-9]+)?)/g;

const CELL_REF_RE = /\$?[A-Z]{1,3}\$?[0-9]+(?::\$?[A-Z]{1,3}\$?[0-9]+)?/g;

function colName(index: number): string {
  let n = index;
  let name = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Lowercased sheet names referenced by the formula. */
function referencedSheets(formula: string): string[] {
  const out: string[] = [];
  for (const m of formula.matchAll(SHEET_REF_RE)) {
    out.push((m[1] ?? m[2] ?? '').toLowerCase());
  }
  return out;
}

/** Shift one cell ref through the column map + row map; null = unmappable. */
function remapCellRef(
  match: string,
  letterMap: Map<string, string>,
  rowMap: Map<number, number>,
): string | null {
  const parts = match.split(':');
  const remapped = parts.map(part => {
    const m = /^(\$?)([A-Z]{1,3})(\$?)([0-9]+)$/.exec(part);
    if (!m) return null;
    const target = letterMap.get(m[2].toUpperCase());
    if (target === undefined) return null;
    // Every row reference is a position in the v1 sheet — map it to
    // its v2 destination row (skipped rows have no mapping → freeze).
    const targetRow = rowMap.get(Number(m[4]));
    if (targetRow === undefined) return null;
    return `${m[1]}${target}${m[3]}${targetRow}`;
  });
  if (remapped.some(p => p === null)) return null;
  return remapped.join(':');
}

/**
 * Formula policy for qty/storage cells:
 *  - references to OTHER sheets → freeze to the cached value;
 *  - references to a defined name the v2 output will not define →
 *    freeze to the cached value;
 *  - otherwise keep the formula, remapping local cell refs through
 *    the v1→v2 column map and the v1-row → v2-row map (both identity
 *    for the standard layouts).
 */
function formulaCell(
  formula: string,
  cached: string,
  wsName: string,
  letterMap: Map<string, string>,
  rowMap: Map<number, number>,
  v1DefinedNames: Set<string>,
): string {
  const sheets = referencedSheets(formula);
  if (!sheets.every(s => s === wsName.toLowerCase())) return cached;

  for (const name of v1DefinedNames) {
    if (name.startsWith('PriceList')) continue;
    if (!V2_SAFE_NAMES.has(name) && formula.includes(name)) return cached;
  }

  let out = formula;
  for (const m of formula.matchAll(CELL_REF_RE)) {
    const remapped = remapCellRef(m[0], letterMap, rowMap);
    if (remapped === null) return cached;
    out = out.replace(m[0], remapped);
  }
  // The v2 generator treats strings starting with '=' as formulas.
  return out.startsWith('=') ? out : '=' + out;
}

/* ── Compatibility gate ────────────────────────────────── */

/**
 * Confirm the workbook is a convertible v1 file: an Overview sheet
 * must exist, and the Assumptions sheet must carry v1 data (header
 * row C=Assumption/D=Value plus a `Format version` row starting 1.).
 */
export function checkV1Workbook(wb: Workbook): void {
  if (!wb.getWorksheet('Overview')) {
    throw new V1ConvertError('not-v1', 'not a v1 xlpricer workbook: no Overview sheet');
  }
  const ass = wb.getWorksheet('Assumptions');
  if (!ass) {
    throw new V1ConvertError('not-v1', 'not a v1 xlpricer workbook: no Assumptions sheet');
  }

  let headerRow = -1;
  for (let r = 1; r <= Math.min(10, ass.rowCount); r++) {
    const key = readCell(ass, r, 3);
    const val = readCell(ass, r, 4);
    if (key?.text.trim() === 'Assumption' && val?.text.trim() === 'Value') {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) {
    throw new V1ConvertError('not-v1', 'Assumptions sheet is not v1-shaped (no Assumption/Value header row)');
  }

  for (let r = headerRow + 1; r <= ass.rowCount; r++) {
    const key = readCell(ass, r, 3);
    if (key?.text.trim() !== 'Format version') continue;
    const version = (readCell(ass, r, 4)?.text ?? '').trim();
    if (version.startsWith('2.')) {
      throw new V1ConvertError('v2-file', `this is a v2 workbook (Format version ${version}) — use --update to refresh it instead`);
    }
    if (version.startsWith('1.')) return;
    throw new V1ConvertError('not-v1', `Assumptions has no recognisable Format version (got "${version}")`);
  }
  throw new V1ConvertError('not-v1', 'Assumptions sheet has no Format version row');
}

/* ── Tab discovery ─────────────────────────────────────── */

/** Lowercased sheet names referenced by Overview formulas. */
function overviewSheetRefs(wb: Workbook): Set<string> {
  const refs = new Set<string>();
  const ov = wb.getWorksheet('Overview');
  if (!ov) return refs;
  ov.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const f = cell.formula;
      if (!f) return;
      for (const m of f.matchAll(/(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!/g)) {
        refs.add((m[1] ?? m[2] ?? '').toLowerCase());
      }
    });
  });
  return refs;
}

/** Components tabs: referenced by the Overview and not generated. */
export function findBomTabs(wb: Workbook): Worksheet[] {
  const refs = overviewSheetRefs(wb);
  return wb.worksheets.filter(ws =>
    refs.has(ws.name.toLowerCase()) && !GENERATED_TABS.has(ws.name.toLowerCase()),
  );
}

/* ── Column helpers ────────────────────────────────────── */

function headerCol(ws: Worksheet, headerRow: number, names: string[]): number {
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= row.cellCount; c++) {
    const info = readCell(ws, headerRow, c);
    if (!info || info.formula) continue;
    const text = info.text.trim().toLowerCase();
    if (names.some(n => n.toLowerCase() === text)) return c;
  }
  return -1;
}

const isNumeric = (s: string): boolean => s !== '' && !Number.isNaN(Number(s));

/* ── Components extraction ─────────────────────────────── */

/**
 * Extract the user-owned columns of a v1 Components tab as v2
 * `ComponentsRow`s: Qty, Function, Cloud Desc/Description,
 * Storage (GiB), H/R, Group (the Group column only opens sections).
 */
export function extractV1Components(
  ws: Worksheet,
  v1DefinedNames: Set<string> = new Set(),
): { rows: ComponentsRow[]; warnings: string[] } {
  const warnings: string[] = [];

  let headerRow = -1;
  for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
    if (headerCol(ws, r, ['Qty']) !== -1) { headerRow = r; break; }
  }
  if (headerRow === -1) {
    throw new V1ConvertError('no-components', `${ws.name}: no Qty header row found — not a v1 Components tab`);
  }

  const cols: Record<string, number> = {};
  for (const [field, names] of Object.entries(V1_HEADERS)) {
    cols[field] = headerCol(ws, headerRow, names);
    if (cols[field] === -1) {
      throw new V1ConvertError('no-components', `${ws.name}: missing "${names.join(' / ')}" header column`);
    }
  }

  // Column map for local-formula remapping (v1 letter → v2 letter).
  const letterMap = new Map<string, string>();
  const toV2: Array<[field: string, v2Header: string]> = [
    ['qty', 'Qty'],
    ['function', 'Function'],
    ['description', 'Description'],
    ['storage', 'Storage (GiB)'],
    ['hr', 'H/R'],
  ];
  for (const [field, v2Header] of toV2) {
    letterMap.set(colName(cols[field]), colName(V2_BOM_COLS[v2Header]));
  }
  // v1 row → v2 destination row for every kept row (skipped rows have
  // no mapping, so formulas referencing them freeze to their cache).
  const rowMap = new Map<number, number>();
  const wsName = ws.name;

  // Columns deliberately not converted — flag per-row overrides.
  const ignoredNames = ['Region', 'EVS Class', 'Backup?', 'Persist?', 'Backup Factor'];
  const ignoredCols = Object.fromEntries(
    ignoredNames.map(n => [n, headerCol(ws, headerRow, [n])]),
  );
  let ignoredOverrides = 0;

  const rows: ComponentsRow[] = [];
  // v2 re-inserts a Total row after every group (extracted totals are
  // skipped), so each new section shifts the destination rows by one.
  let closedGroups = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const qty = readCell(ws, r, cols.qty);
    const func = readCell(ws, r, cols.function);
    const desc = readCell(ws, r, cols.description);
    const storage = readCell(ws, r, cols.storage);
    const hr = readCell(ws, r, cols.hr);
    const group = readCell(ws, r, cols.group);

    const qtyText = qty?.text.trim() ?? '';
    const funcText = func?.text.trim() ?? '';
    const descText = desc?.text.trim() ?? '';
    const storageText = storage?.text.trim() ?? '';

    // Empty template rows and the Total rows (v2 regenerates them).
    if (!qtyText && !funcText && !descText && !storageText) continue;
    if (qtyText.startsWith('Total')) continue;

    const isSection = qty !== null && !qty.formula && !isNumeric(qtyText);
    if (isSection && rows.length > 0) closedGroups++;
    rowMap.set(r, V2_FIRST_DATA_ROW + rows.length + closedGroups);

    // Group row: the Qty cell carries the label, the Group cell the key.
    if (isSection) {
      rows.push({
        type: 'section',
        qty: group?.text ?? '',
        function: qtyText,
        description: '',
        storage: '',
        hr: '',
      });
      continue;
    }

    // Data row.
    const qtyVal = qty && qty.formula
      ? formulaCell(qty.formula, qty.text, wsName, letterMap, rowMap, v1DefinedNames)
      : qtyText;
    const storageVal = storage && storage.formula
      ? formulaCell(storage.formula, storage.text, wsName, letterMap, rowMap, v1DefinedNames)
      : storageText;
    // H/R: keep literal values only — v1 default formulas are left
    // blank so the v2 generator recomputes from current prices.
    const hrVal = hr && !hr.formula ? hr.text : '';

    for (const c of Object.values(ignoredCols)) {
      if (c === -1) continue;
      const info = readCell(ws, r, c);
      if (info && info.text.trim() !== '') { ignoredOverrides++; break; }
    }

    rows.push({
      type: 'data',
      qty: qtyVal,
      function: funcText,
      description: descText,
      storage: storageVal,
      hr: hrVal,
    });
  }

  if (ignoredOverrides > 0) {
    warnings.push(
      `${ws.name}: ${ignoredOverrides} rows carry per-row ${ignoredNames.join('/')} values that are not converted — the v2 tab will use the assumption defaults`,
    );
  }
  return { rows, warnings };
}

/* ── v2 description mapping ─────────────────────────────── */

/**
 * Title sets derived from the current pricing data, used to adapt v1
 * BOM descriptions to the v2 price list.  The v2 BOM matches
 * descriptions against the Prices sheet's title column (`_XlTitle_`,
 * defined as `PriceListDescs`), and the pipeline appends " (unit)" to
 * tier-group titles for units other than 'h' (see `processTier` in
 * src/prices/enrich.ts).  So a v1 group-level description such as
 * "Network: Internet Traffic Outbound" must gain "(GiB)" to match,
 * while tariff titles ("… [T1] (until 1)") and flat titles are
 * unchanged in v2.
 */
export interface V1TitleMaps {
  /** Every v2 title (flat, tier group, tariff) — exact matches convert as-is. */
  exact: Set<string>;
  /** v1 group base title → v2 group title with the unit suffix. */
  groupBase: Map<string, string>;
}

/**
 * Title maps derived from the current pricing data, or null when the
 * payload carries no computed titles (legacy payloads without
 * `_XlTitle_`), in which case description fixing is skipped.
 */
export function v1TitleMaps(pricingData: PricesData): V1TitleMaps | null {
  const xTitle = pricingData.keys?.indexOf('_XlTitle_') ?? -1;
  if (xTitle === -1) return null;

  const out: V1TitleMaps = { exact: new Set<string>(), groupBase: new Map<string, string>() };
  for (const rec of pricingData.records ?? []) {
    out.exact.add(String(rec[xTitle] ?? ''));
  }
  for (const tier of Object.values(pricingData.tiers ?? {})) {
    const title = String(tier._XlTitle_ ?? '');
    out.exact.add(title);
    if (Array.isArray(tier._tariffs_)) {
      for (const t of tier._tariffs_) {
        out.exact.add(String(t._XlTitle_ ?? ''));
      }
    }
    // Mirror processTier's suffix rule: only non-empty, non-'h' units.
    const unit = String(tier.unit ?? '');
    if (unit !== '' && unit !== 'h' && title.endsWith(` (${unit})`)) {
      out.groupBase.set(title.slice(0, title.length - ` (${unit})`.length), title);
    }
  }
  return out;
}

/**
 * Rewrite v1 BOM descriptions so they match the current v2 price
 * list: group-level descriptions of tiered items gain the tier's
 * unit suffix ("Network: Internet Traffic Outbound" → "… (GiB)"),
 * while tariff ("… [T1] (until 1)") and flat titles are left alone.
 * Rows matching nothing in the price data are kept as-is and
 * reported for the manual-review caveat.
 */
export function fixV1Descriptions(
  tabName: string,
  rows: ComponentsRow[],
  pricingData: PricesData,
): { rows: ComponentsRow[]; warnings: string[] } {
  const maps = v1TitleMaps(pricingData);
  if (maps === null) return { rows, warnings: [] };

  const unmatched = new Set<string>();
  let fixed = 0;
  const out = rows.map(row => {
    if (row.type !== 'data' || row.description === '') return row;
    const d = row.description;
    if (maps.exact.has(d)) return row;
    const v2 = maps.groupBase.get(d);
    if (v2 === undefined) {
      unmatched.add(d);
      return row;
    }
    fixed++;
    return { ...row, description: v2 };
  });

  const warnings: string[] = [];
  if (fixed > 0) {
    warnings.push(`${tabName}: ${fixed} component description(s) updated to the current price list (unit suffix added)`);
  }
  if (unmatched.size > 0) {
    warnings.push(
      `${tabName}: ${unmatched.size} component description(s) do not match the current price list and need review: ` +
      [...unmatched].map(d => `"${d}"`).join(', '),
    );
  }
  return { rows: out, warnings };
}

/* ── Assumptions notes ─────────────────────────────────── */

/** Trailing plain-text rows after the last valued row (column C). */
export function extractV1AssumptionNotes(ws: Worksheet): string[] {
  let headerRow = -1;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const key = readCell(ws, r, 3);
    const val = readCell(ws, r, 4);
    if (key?.text.trim() === 'Assumption' && val?.text.trim() === 'Value') {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return [];

  let lastValued = headerRow;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const v = readCell(ws, r, 4);
    if (v && v.text.trim() !== '') lastValued = r;
  }

  const notes: string[] = [];
  for (let r = lastValued + 1; r <= ws.rowCount; r++) {
    const key = readCell(ws, r, 3);
    if (key && key.text.trim() !== '') notes.push(key.text.trim());
  }
  return notes;
}

/* ── Orchestration ─────────────────────────────────────── */

export interface V1Extraction {
  /** Converted BOM tabs, in workbook order. */
  tabs: Array<{ name: string; rows: ComponentsRow[] }>;
  /** Trailing plain-text rows from the v1 Assumptions sheet. */
  notes: string[];
  /** v1 sheets neither converted nor recreated (recorded in Assumptions). */
  dropped: string[];
  /** Includes recorded in the v1 Assumptions sheet (informational). */
  includes: Array<{ name: string; version: string }>;
  /** Non-blocking data-loss warnings. */
  warnings: string[];
}

export function extractV1Workbook(wb: Workbook): V1Extraction {
  checkV1Workbook(wb);

  const tabs = findBomTabs(wb);
  if (tabs.length === 0) {
    throw new V1ConvertError('no-components', 'Overview references no convertible Components tabs');
  }

  const v1DefinedNames = new Set(wb.definedNames.model.map(n => n.name));
  const warnings: string[] = [];
  const converted = tabs.map(ws => {
    const out = extractV1Components(ws, v1DefinedNames);
    warnings.push(...out.warnings);
    return { name: ws.name, rows: out.rows };
  });

  const convertedNames = new Set(tabs.map(t => t.name.toLowerCase()));
  const dropped = wb.worksheets
    .filter(ws =>
      !GENERATED_TABS.has(ws.name.toLowerCase()) &&
      !convertedNames.has(ws.name.toLowerCase()),
    )
    .map(ws => ws.name);

  const ass = wb.getWorksheet('Assumptions')!;
  const notes = extractV1AssumptionNotes(ass);
  const includes = extractV1IncludeInfo(ass);
  return { tabs: converted, notes, dropped, includes, warnings };
}

/** Base assumptions + v1 trailing notes + the dropped-tabs record. */
export function buildV1Assumptions(
  base: AssumptionsRow[],
  notes: string[],
  dropped: string[],
): AssumptionsRow[] {
  const out = [...base];
  for (const note of notes) {
    out.push({ type: 'note', key: note, value: '', when: '', who: '', notes: '' });
  }
  if (dropped.length > 0) {
    out.push({ type: 'section', key: 'Dropped tabs', value: '', when: '', who: '', notes: '' });
    for (const name of dropped) {
      out.push({ type: 'note', key: name, value: '', when: '', who: '', notes: '' });
    }
  }
  return out;
}

/* ── Include info ─────────────────────────────────────── */

/** Name/version pairs recorded in the v1 "Include files" section. */
export function extractV1IncludeInfo(
  ws: Worksheet,
): Array<{ name: string; version: string }> {
  let headerRow = -1;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const key = readCell(ws, r, 3);
    const val = readCell(ws, r, 4);
    if (key?.text.trim() === 'Assumption' && val?.text.trim() === 'Value') {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return [];

  // v1 section headers live in column B.
  let sectionRow = -1;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const b = readCell(ws, r, 2);
    if (b && b.text.trim() === 'Include files') {
      sectionRow = r;
      break;
    }
  }
  if (sectionRow === -1) return [];

  const out: Array<{ name: string; version: string }> = [];
  for (let r = sectionRow + 1; r <= ws.rowCount; r++) {
    const b = readCell(ws, r, 2);
    if (b && b.text.trim() !== '') break; // next section
    const name = readCell(ws, r, 3);
    if (!name || name.text.trim() === '') continue;
    out.push({
      name: name.text.trim(),
      version: (readCell(ws, r, 4)?.text ?? '').trim(),
    });
  }
  return out;
}

/* ── Conversion (shared by the CLI and the SPA worker) ── */

/**
 * Shown prominently on every v1 conversion: the v2 pricing pipeline
 * renames products between builds, so copied BOM descriptions may no
 * longer match the current price list.
 */
export const V1_DESCRIPTION_CAVEAT =
  'Item descriptions may have changed between v1 and v2 and need manual review: ' +
  'the pricing pipeline renames products between builds, so some components may ' +
  'no longer match the current price list. Check the converted Components tab ' +
  'and adjust the affected descriptions.';

export interface V1ConvertInput {
  /** The v1 workbook bytes. */
  file: Uint8Array;
  /** Already-fetched, pipeline-processed pricing data. */
  pricingData: PricesData;
  /** Base assumptions rows — v1 notes and dropped tabs are appended. */
  assumptions: AssumptionsRow[];
  /** Macro host bytes; when present the output is merged into it. */
  vbaTemplate?: Uint8Array;
  appMeta?: AppMeta;
}

export interface V1ConvertResult {
  buffer: ArrayBuffer;
  warnings: string[];
  /** Manual-review notice — always present, shown prominently. */
  caveat: string;
  tabs: Array<{ name: string; rows: number }>;
  dropped: string[];
  notes: number;
}

/**
 * Convert a v1 workbook into the v2 format: extract the user-owned
 * Components tabs, regenerate everything else from the given pricing
 * data, and append the v1 notes + dropped-tabs record to the
 * assumptions.  Pure — no fetch/fs; callers supply fetched data.
 */
export async function convertV1Workbook(input: V1ConvertInput): Promise<V1ConvertResult> {
  const wb = new ExcelJS.Workbook();
  await (wb.xlsx.load as unknown as (data: Uint8Array) => Promise<ExcelJS.Workbook>)(input.file);
  const extraction = extractV1Workbook(wb);

  const warnings = [...extraction.warnings];

  // The v2 price list carries the unit on tier-group titles
  // ("Network: Internet Traffic Outbound (GiB)"); adapt converted
  // group-level descriptions accordingly before generating the tabs.
  for (const tab of extraction.tabs) {
    const fixed = fixV1Descriptions(tab.name, tab.rows, input.pricingData);
    tab.rows = fixed.rows;
    warnings.push(...fixed.warnings);
  }

  if (extraction.includes.length > 0) {
    warnings.push(
      'v1 workbook was built with includes: ' +
      extraction.includes.map(i => `${i.name} (${i.version})`).join(', ') +
      ' — using the current include configuration instead',
    );
  }

  const components: Record<string, unknown> = {};
  for (const tab of extraction.tabs) {
    components[tab.name] = tab.rows;
  }

  const xlsxInput: PricingData = {
    assumptions: buildV1Assumptions(input.assumptions, extraction.notes, extraction.dropped),
    components,
    pricingData: input.pricingData,
    appMeta: input.appMeta ?? {},
  };

  let buffer = await generatePricingXlsx(xlsxInput, {
    vbaTemplate: Boolean(input.vbaTemplate),
  });
  if (input.vbaTemplate) {
    buffer = await mergeIntoMacroWorkbook(input.vbaTemplate, buffer);
  }

  return {
    buffer,
    warnings,
    caveat: V1_DESCRIPTION_CAVEAT,
    tabs: extraction.tabs.map(t => ({ name: t.name, rows: t.rows.length })),
    dropped: extraction.dropped,
    notes: extraction.notes.length,
  };
}
