/**
 * Assumptions sheet generator
 *
 */

import type {
  Worksheet,
} from 'exceljs';

import {
  writeCell,
  setColumnWidth,
  rowcolToCell,
  dataValidationList,
  resolveFormula,
  def,
} from './xlu';

/* ── Types ─────────────────────────────────── */
import type { AssumptionsRow } from '../editorTab/AssumptionsTab';



/* ── Column constants ──────────────────────── */

const C_KEY = 3;      // Column C — label / key
const C_VAL = 4;      // Column D — value
const C_WHEN = 5;     // Column E — when (date)
const C_WHO = 6;      // Column F — who
const C_COMMENT = 7;  // Column G — comment

/* ── Main generator ────────────────────────── */

export function genAssSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  assumptionsRaw: unknown,
): void {
  const assumptions = assumptionsRaw as AssumptionsRow[];

  let r=2
  /* ── Column widths ───────────────────────── */

  const colWidths = [0, 3, 3, 45, 15, 15, 16, 50];
  for (let c = 1; c <= colWidths.length; c++) {
    setColumnWidth(ws, c, colWidths[c]);
  }

  /* ── Title ───────────────────────────────── */
  writeCell(ws, r, 2, 'Assumptions', ['assumptions','title']);
  r++;
  writeCell(ws, r, 2, '#', [ 'assumptions','header', '1']);
  writeCell(ws, r, C_KEY, 'Key', [ 'assumptions','header', '1']);
  writeCell(ws, r, C_VAL, 'Value', ['assumptions', 'header', '1']);
  writeCell(ws, r, C_WHEN, 'When', ['assumptions', 'header', '1']);
  writeCell(ws, r, C_WHO, 'Who', ['assumptions', 'header', '1']);
  writeCell(ws, r, C_COMMENT, 'Comment', ['assumptions', 'header', '1']);
  r++;

  /* Do a first pass to resolve references... */
  //~ console.log(assumptions);
  const myMap: Record<string, string> = {};	// Local map

  for (let ir = 0; ir < assumptions.length; ir++) {
    if ((assumptions[ir].type === 'section') || !(assumptions[ir].key && assumptions[ir].value)) {
      continue;
    }
    let key = assumptions[ir].key
    if (key.startsWith('$')) {
      // This is a xlpricer global reference
      let name = key.slice(1);
      def(myMap, name, rowcolToCell(r+ir, C_VAL));
      def(refMap, name, rowcolToCell(r+ir, C_VAL, true, true, ws.name));
    } else if (key.startsWith('#')) {
      // This is an Excel reference
      let name = key.slice(1);
      def(myMap, name, name);
      def(refMap, name, name);
      // We actually define the name when we write to the cell
    } else {
      // This is a local only reference...
      def(myMap, key, rowcolToCell(r+ir, C_VAL));
    }

    //~ console.log(assumptions[ir].type);
    //~ console.log(assumptions[ir]);
  }

  /* Build the assumptions */
  for (const row of assumptions) {
    if (row.type == 'section')  {
      //~ console.log('section',row);
      if (row.key) {
	writeCell(ws, r, 2, row.key, [ 'assumptions','header', '2']);
	for (let c = C_KEY ;  c <= C_COMMENT; c++) {
	  writeCell(ws, r, c, null, [ 'assumptions','header', '2']);
	}
      } else {
	writeCell(ws, r, 2, null, [ 'assumptions','#']);
	writeCell(ws, r, C_KEY, null, [ 'assumptions','key']);
	writeCell(ws, r, C_VAL, null, ['assumptions', 'value']);
	writeCell(ws, r, C_WHEN, row.when, ['assumptions', 'when']);
	writeCell(ws, r, C_WHO, row.who, ['assumptions', 'who']);
	writeCell(ws, r, C_COMMENT, row.notes, ['assumptions', 'comment']);
      }
    } else {
      writeCell(ws, r, 2, null, [ 'assumptions','#']);
      writeCell(ws, r, C_KEY, row.key, [ 'assumptions','key']);

      if (row.value) {
	let name = undefined;
	let format = 'text';
	let val = row.value;
	let key = row.key ?? '';
	if (key.startsWith('#')) {
	  name = key.slice(1);
	}
	if (val.startsWith('#')) {
	  val = val.slice(1);
	  format = 'float';
	}
	else if (val.startsWith('%')) {
	  val = val.slice(1);
	  format = 'percent';
	  let num = Number(val);
	  if (!isNaN(num)) { val = String(num/100.0); }
	}
	if (val.startsWith('=')) {
	  // This is a formula
	  val = resolveFormula(val, {...refMap, ...myMap });
	} else if (val.includes(':')) {
	  // Choice list is needed...
	  let dv = val.split(':');
	  val = dv[0];
	  dataValidationList(ws, r, C_VAL, dv[1]);
	}
	writeCell(ws, r, C_VAL, val, ['assumptions', 'value', format], name);
      } else {
	writeCell(ws, r, C_VAL, null, ['assumptions', 'value']);
      }
      writeCell(ws, r, C_WHEN, row.when, ['assumptions', 'when']);
      writeCell(ws, r, C_WHO, row.who, ['assumptions', 'who']);
      writeCell(ws, r, C_COMMENT, row.notes, ['assumptions', 'comment']);
    }
    r++;
  }
}
