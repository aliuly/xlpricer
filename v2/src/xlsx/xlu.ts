/**
 * Excel‑generation helpers.
 *
 * Ported from `xlpricer/xlu.py`.  Coordinates are **1‑based**
 * (row 1 is the top row, column 1 is `A`).
 */

import type { Cell, Worksheet } from 'exceljs';
import { applyStyle, fmt  } from './formats';
//~ import type { StyleDef } from './formats';

/* ── Types ─────────────────────────────────── */
export interface ColumnDef {
  h: {
    tx: string;
    w?: number;
    fmt: string;
  };
  fmt: string;
  name?: string;
  formula?: string[];
  val?: string|string[];
};

/* ── Column and map helpers ────────────────────── */

export function mapCol(
  name: string,
  cols: (number|ColumnDef)[],
): number {
  for (let c = 1; c <= cols.length ; c++) {
    const col = cols[c];
    if (col === undefined || typeof col === 'number') continue;
    if ((col.name ?? '') == name) return c;
  }
  throw new Error(`${name}: column not found in mapCol`);
}

export function def(map: Record<string, string>, name:string, value:string): void {
  map[name.toLowerCase()] = value;
}

export function updRowRefs(
  map: Record<string, string>,
  r: number,
  cols: (number|ColumnDef)[],
): void {
  for (let c = 1; c < cols.length; c++) {
    const col = cols[c];
    if (typeof col === 'number') continue;
    def(map,`#${col.name}`, rowcolToCell(r, c, false, true));
  }
}


/* ── Coordinate helpers ────────────────────── */

/**
 * Convert a 1‑based column index to an Excel column letter.
 *
 * ```
 * colToName(1)  // "A"
 * colToName(27) // "AA"
 * colToName(1, true) // "$A"
 * colToName(1, true, 'sheet 1') // "'sheet 1'!$A"
 * ```
 */
export function colToName(c: number, absolute = false, sheetName?: string): string {
  let name = '';
  while (c > 0) {
    const mod = (c - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    c = Math.floor((c - 1) / 26);
  }
  const col = (absolute ? '$' : '') + (name || 'A');
  return sheetName ? `${sheetRef(sheetName)}!${col}`: col;
}

/**
 * Convert row + column indices to an Excel cell reference.
 *
 * ```
 * rowcolToCell(5, 3)                          // "C5"
 * rowcolToCell(5, 3, true, true)              // "$C$5"
 * rowcolToCell(5, 3, false, true)             // "$C5"
 * rowcolToCell(5, 3, true, true, 'My Data')   // "'My Data'!$C$5"
 * ```
 */
export function rowcolToCell(
  r: number,
  c: number,
  absRow = false,
  absCol = false,
  sheetName?: string,
): string {
  const cell = `${absCol ? '$' : ''}${colToName(c)}${absRow ? '$' : ''}${r}`;
  return sheetName ? `${sheetRef(sheetName)}!${cell}` : cell;
}

/**
 * Reverse of `rowcolToCell` — parse "C5" → `[5, 3]` (1‑based).
 */
export function cellToRowCol(pos: string): [number, number] {
  const m = pos.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i);
  if (!m) throw new Error(`Invalid cell reference: ${pos}`);
  const col = colNameToIndex(m[2]);
  const row = Number(m[4]);
  return [row, col];
}

/** Convert column letter(s) back to a 1‑based index. */
function colNameToIndex(name: string): number {
  let c = 0;
  for (let i = 0; i < name.length; i++) {
    c = c * 26 + name.charCodeAt(i) - 64;
  }
  return c;
}

/**
 * Quote a sheet name for use in formula references.
 *
 * Sheet names containing spaces (or special characters) must be
 * wrapped in single quotes; any embedded single quotes are escaped
 * by doubling them.
 *
 * ```
 * sheetRef('Sheet1')        // "Sheet1"
 * sheetRef('My Sheet')     // "'My Sheet'"
 * sheetRef("Mike's Data")  // "'Mike''s Data'"
 * ```
 */
export function sheetRef(name: string): string {
  if (/[ !@#$%^&*()\-+=,.;:"'[\]{}|\\\/?<>]/.test(name)) {
    return `'${name.replace(/'/g, "''")}'`;
  }
  return name;
}

/* ── Cell writing ──────────────────────────── */

/**
 * Write a value (optionally with a style) to a cell.
 *
 * | `value` type             | ExcelJS action                          |
 * |-------------------------|----------------------------------------|
 * | `null | undefined`     | leaves cell empty (applies style only) |
 * | `string` starting with `=` | written as `{ formula: … }`   |
 * | `number`                | written as `{ value: number }`         |
 * | `Date`                  | written as `{ value: date }`           |
 * | `string` that looks numeric | coërced to `number`              |
 * | other string            | written as `{ value: string }`         |
 */
export function writeCell(
  ws: Worksheet,
  r: number,
  c: number,
  value: unknown,
  style?: readonly [section: string, key: string, variant?: string],
  name?: string,
): Cell {
  const cell = ws.getCell(r, c);
  if (name !== null && name !== undefined) {
    cell.name = name;
  }
  if (style !== undefined) {
    applyStyle(cell, fmt(...style));
  }

  if (value === null || value === undefined) {
    // keep default (empty) value, style already applied
    return cell;
  }

  if (typeof value === 'number') {
    cell.value = value;
  } else if (value instanceof Date) {
    cell.value = value;
  } else if (typeof value === 'string') {
    if (value.startsWith('=')) {
      cell.value = { formula: value.substring(1) };
    } else if (isNumeric(value)) {
      cell.value = Number(value);
    } else if (value === '') {
      cell.value = null;
    } else {
      cell.value = String(value);
    }
  } else {
    cell.value = String(value);
  }
  return cell;
}

/** True when a string can be parsed as a finite number. */
function isNumeric(s: string): boolean {
  if (s.trim() === '') return false;
  const n = Number(s);
  return Number.isFinite(n) && !isNaN(n);
}

/* ── Column widths ─────────────────────────── */

export function setColumnWidth(
  ws: Worksheet,
  c: number,
  width: number,
): void {
  ws.getColumn(c).width = width;
}

/* ── Data validation ───────────────────────── */
/**
 * Add a list‑type data validation (dropdown) to a single cell.
 */
export function dataValidationList(
  ws: Worksheet,
  r: number,
  c: number,
  vlist: string | readonly string[],
  allowBlank:boolean = true,
): void {
  // ExcelJS runtime has .dataValidations but the type declarations
  // haven't caught up — cast through unknown.
  const dv = (ws as unknown as {
    dataValidations: {
      add: (addr: string, dv: Record<string, unknown>) => void;
    };
  }).dataValidations;

  const nlist = typeof vlist === 'string' ? vlist : `"${vlist.join(',')}"`;

  dv.add(ws.getCell(r, c).address, {
    type: 'list',
    allowBlank,
    formulae: [`${nlist}`],
    showErrorMessage: true,
    showInputMessage: true,
  });
}

/* ── Freeze panes ──────────────────────────── */

export function freezePanes(
  ws: Worksheet,
  r: number,
  c: number,
): void {
  // ExcelJS: split row above r, column left of c → cell r,c is first scrollable
  ws.views = [
    {
      state: 'frozen',
      xSplit: c - 1,
      ySplit: r - 1,
      topLeftCell: rowcolToCell(r, c),
      activeCell: rowcolToCell(r, c),
    },
  ];
}

/* ── Auto‑filter ───────────────────────────── */

export function autofilter(
  ws: Worksheet,
  t: number,
  l: number,
  b: number,
  r_: number,
): void {
  ws.autoFilter = {
    from: { row: t, column: l },
    to: { row: b, column: r_ },
  };
}

/* ── Column / row grouping ─────────────────── */

export function groupColumns(
  ws: Worksheet,
  start: number,
  end: number,
  opts?: { hidden?: boolean; outlineLevel?: number },
): void {
  for (let c = start; c <= end; c++) {
    const col = ws.getColumn(c);
    if (opts?.hidden) col.hidden = true;
    if (opts?.outlineLevel !== undefined) col.outlineLevel = opts.outlineLevel;
  }
}

export function groupRows(
  ws: Worksheet,
  start: number,
  end: number,
  opts?: { hidden?: boolean; outlineLevel?: number },
): void {
  for (let r = start; r <= end; r++) {
    const row = ws.getRow(r);
    if (opts?.hidden) row.hidden = true;
    if (opts?.outlineLevel !== undefined) row.outlineLevel = opts.outlineLevel;
  }
}

/* ── Format timestamps ─────────────────────────── */

export function fmtEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  return [
    d.getDate().toString().padStart(2, '0'),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getFullYear().toString(),
  ].join('-');
}

/* ── Formula substitution ──────────────────── */

/**
 * Replace `{Label}` placeholders with cell references from `mappings`
 */
export function resolveFormula(
  template: string,
  mappings: Record<string, string>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_full, name: string) => {
    const key = name.toLowerCase();
    if (key in mappings) return mappings[key];
    throw new Error(
      `Unresolved reference {${name}} in formula: ${template}`,
    );
  });
}

