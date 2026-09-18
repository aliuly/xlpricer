/**
 * Workbook conversion and offline trimming.
 *
 * Pure and browser-safe (ExcelJS + JSZip only):
 *  - `toXlsm` adds a macro project by merging into a host template;
 *  - `toXlsx` strips it by round-tripping content (ExcelJS never
 *    writes vbaProject.bin — no zip surgery needed);
 *  - `trimWorkbook` is the TrimWB equivalent: it freezes formulas from
 *    the CACHED results a saved-by-Excel file already carries, so no
 *    calculation engine is needed.
 *
 * Plan: docs/DONE-convert.md.
 */

import ExcelJS from 'exceljs';
import type { Workbook } from 'exceljs';

import { FROZEN_SHEET_NAME, META_SHEET_NAME, TEMPLATE_SHEET_NAME } from './constants';
import { FINDER_SHEET_NAME, modernizeWorkbookMetadata } from './finder';
import { ensureBomTemplate, pruneDefinedNames, reorderSheets } from './reprice';
import { mergeIntoMacroWorkbook } from './vba';
import { rowcolToCell, sheetRef } from './xlu';

/**
 * Sheets the freeze and DV-cleanup passes never touch: the pricing
 * sheets, the Finder and the BOM template are deleted by the trim, and
 * Tools goes with them — recording a frozen cell (or scanning
 * validations) on a sheet that is about to be removed would leave
 * revival entries pointing at a missing sheet.  Freezing any of them
 * is wasted work anyway (in the VBA version, walking the Finder's
 * fixed-size arrays was the slow part).
 */
const FROZEN_SKIP_SHEETS = new Set([
  'Prices',
  'Volumes',
  FROZEN_SHEET_NAME,
  FINDER_SHEET_NAME,
  TEMPLATE_SHEET_NAME,
  'Tools',
]);

/** Raised when trimming would need values the file does not carry. */
export class TrimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrimError';
  }
}

async function load(bytes: Uint8Array): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await (wb.xlsx.load as unknown as (data: Uint8Array) => Promise<Workbook>)(bytes);
  return wb;
}

async function finalize(wb: Workbook): Promise<ArrayBuffer> {
  const raw = await wb.xlsx.writeBuffer();
  return modernizeWorkbookMetadata(raw as unknown as ArrayBuffer);
}

/** True when a formula reaches the Prices sheet (names or literals). */
export function referencesPrices(formula: string): boolean {
  return formula.includes('PriceList')
    || formula.includes('Prices!')
    || formula.includes("'Prices'!");
}

/**
 * Strip macros and the macro-only sheets (Tools, _BOMTemplate) from a
 * workbook.  Prices/Volumes/Finder stay — this is a clean strip, not
 * the TrimWB-style trim.
 */
export async function toXlsx(bytes: Uint8Array): Promise<ArrayBuffer> {
  const wb = await load(bytes);
  for (const name of ['Tools', TEMPLATE_SHEET_NAME]) {
    const ws = wb.getWorksheet(name);
    if (ws) wb.removeWorksheet(ws.id);
  }
  pruneDefinedNames(wb, new Set(['Tools', TEMPLATE_SHEET_NAME]));
  return finalize(wb);
}

/**
 * Add a macro project to a workbook: ensure the BOM clone template,
 * then merge the content into the host template (whose vbaProject.bin
 * survives the merge).
 */
export async function toXlsm(
  bytes: Uint8Array,
  templateBytes: Uint8Array,
): Promise<ArrayBuffer> {
  const wb = await load(bytes);
  ensureBomTemplate(wb, {});
  // The template sheet was appended last; it must sit after the BOM
  // tabs, before Volumes, so the VBA AddBOM cloning order holds.
  const order = wb.worksheets.map(w => w.name).filter(n => n !== TEMPLATE_SHEET_NAME);
  const at = order.indexOf('Volumes');
  order.splice(at === -1 ? order.length : at, 0, TEMPLATE_SHEET_NAME);
  reorderSheets(wb, order);
  const content = await finalize(wb);
  return mergeIntoMacroWorkbook(templateBytes, content);
}

/**
 * Read a cell's formula defensively.  ExcelJS resolves shared-formula
 * slaves by translating the master's formula text; when the master has
 * no readable formula (e.g. Excel saved an empty `<f>` master, or the
 * master cell was overwritten with a value), the translation throws a
 * TypeError deep inside `slideFormula`.  Surface that as an actionable
 * TrimError naming the sheet/cell instead of letting it crash.
 */function readFormula(ws: ExcelJS.Worksheet, cell: ExcelJS.Cell): string | undefined {
  try {
    return cell.formula;
  } catch {
    const model = cell.model as { formula?: string; sharedFormula?: string };
    if (model.formula) return model.formula;
    throw new TrimError(
      `cannot read the formula of ${ws.name}!${cell.address}` +
      ` — its shared-formula master (${model.sharedFormula ?? 'unknown'})` +
      ' has no readable formula.  Open the workbook in Excel and re-save' +
      ' it before trimming.',
    );
  }
}

/** True when any formula cell carries a cached result. */
export function hasCachedResults(wb: Workbook): boolean {
  for (const ws of wb.worksheets) {
    let found = false;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (found) return;
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (found) return;
        // `cell.result` (not `cell.value`) keeps falsy cached results:
        // ExcelJS's value model drops `result: 0`/`''` when copying.
        if (readFormula(ws, cell) && cell.result !== undefined) found = true;
      });
    });
    if (found) return true;
  }
  return false;
}

/**
 * The TrimWB equivalent, offline: freeze every formula referencing
 * the Prices sheet (PriceList* names or literal refs) to its cached
 * result, remove PriceList* data validations, delete the pricing and
 * macro-support sheets, drop the PriceList* names — and record each
 * frozen cell in a veryHidden `_Frozen` sheet (LiveRef formula /
 * OriginalAddress / FormulaText) so a later refresh can revive it.
 *
 * Requires cached results (the file was saved by Excel); raises
 * TrimError otherwise — never writes a half-frozen file.  A formula
 * whose cached result is empty (no `<v>` in the file) freezes to a
 * blank cell, exactly as `cell.Value = cell.Value` does; falsy cached
 * results (0, '') are preserved as-is.
 */
export async function trimWorkbook(bytes: Uint8Array): Promise<ArrayBuffer> {
  const wb = await load(bytes);
  if (!hasCachedResults(wb)) {
    throw new TrimError('no cached results — open and save the workbook in Excel first');
  }
  let frozen: ExcelJS.Worksheet | undefined;

  /* ── Snapshot every formula BEFORE mutating anything ── */
  // Shared-formula slaves resolve their text by translating the
  // master's formula (slideFormula).  Freezing a master replaces its
  // formula with the cached value, so reading a slave after its master
  // was frozen crashes the translation (slideFormula calls .replace on
  // undefined).  Read all formulas first, while every model is intact,
  // and let the freeze pass consume the snapshot.
  // Sheets in FROZEN_SKIP_SHEETS are never frozen: they are deleted
  // by the trim anyway, so freezing them is wasted work (and walking
  // the Finder's large fixed-size arrays was the slow part in the VBA
  // version).
  const formulas = new Map<string, Map<string, string>>();
  for (const ws of wb.worksheets) {
    if (FROZEN_SKIP_SHEETS.has(ws.name)) continue;
    const map = new Map<string, string>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const formula = readFormula(ws, cell);
        if (formula) map.set(cell.address, formula);
      });
    });
    formulas.set(ws.name, map);
  }

  /* ── Freeze formulas referencing the Prices sheet ── */
  for (const ws of wb.worksheets) {
    if (FROZEN_SKIP_SHEETS.has(ws.name)) continue;
    const map = formulas.get(ws.name);
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const formula = map?.get(cell.address);
        if (!formula) return;
        if (!referencesPrices(formula)) return;
        if (!frozen) {
          frozen = wb.addWorksheet(FROZEN_SHEET_NAME);
          frozen.state = 'veryHidden';
          frozen.getCell(1, 1).value = 'LiveRef';
          frozen.getCell(1, 2).value = 'OriginalAddress';
          frozen.getCell(1, 3).value = 'FormulaText';
        }
        const r = (frozen.lastRow?.number ?? 0) + 1;
        // LiveRef: Excel/LibreOffice keep this reference pointed at
        // the logical cell through structural edits (and it evaluates
        // to the frozen value).
        frozen.getCell(r, 1).value = {
          formula: rowcolToCell(rowNumber, colNumber, true, true, ws.name),
        };
        frozen.getCell(r, 2).value =
          `${sheetRef(ws.name)}!${rowcolToCell(rowNumber, colNumber, true, true)}`;
        frozen.getCell(r, 3).value = formula;
        // `cell.result` keeps falsy cached values (0, '') intact — a
        // missing <v> still freezes to a blank cell, like
        // `cell.Value = cell.Value`.
        cell.value = (cell.result === undefined ? null : cell.result) as ExcelJS.CellValue;
      });
    });
  }

  /* ── Remove data validations whose list source is a PriceList* name ── */
  for (const ws of wb.worksheets) {
    if (FROZEN_SKIP_SHEETS.has(ws.name)) continue;
    const dvs = (ws as unknown as {
      dataValidations: { model: Record<string, { formulae?: unknown[] }> };
    }).dataValidations;
    for (const [addr, dv] of Object.entries(dvs.model)) {
      const f = dv?.formulae?.[0];
      if (typeof f === 'string' && f.startsWith('PriceList')) delete dvs.model[addr];
    }
  }

  /* ── Delete the macro-support and pricing sheets ── */
  for (const name of ['Tools', 'Prices', 'Volumes', FINDER_SHEET_NAME, TEMPLATE_SHEET_NAME]) {
    const ws = wb.getWorksheet(name);
    if (ws) wb.removeWorksheet(ws.id);
  }

  /* ── Delete Prices-scoped defined names (PriceList* convention) ── */
  wb.definedNames.model = wb.definedNames.model
    .filter(entry => !entry.name.startsWith('PriceList'));

  /* ── Hide the T machinery sheet ── */
  // T stays (it carries the XLPricer identity marker, the pricing
  // provenance for the staleness check, and the T_ONE_TIME anchor),
  // but it is machinery — hide it like _Frozen.  The refresh rebuild
  // regenerates T and restores its visibility.
  const metaWs = wb.getWorksheet(META_SHEET_NAME);
  if (metaWs) metaWs.state = 'veryHidden';

  return finalize(wb);
}
