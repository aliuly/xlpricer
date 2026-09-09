/**
 * Enterprise Support Agreement sheet generator
 *
 * Ported from `xlesa.py`.
 */

import type { Worksheet } from 'exceljs';

import {
  writeCell,
  setColumnWidth,
  rowcolToCell,
  colToName,
  resolveFormula,
  dataValidationList,
  def,
} from './xlu';

/* ── Constants ────────────────────────────────── */

const BASE_FEE = 2500;

const OPTIONS: Array<[string, number]> = [
  ['Service Credits on ECS/EVS/OBS', 1000],
  ['Dedicated Service Delivery Manager', 3000],
  ['SD Manager on Duty', 6000],
];

const VARIABLE_RATE: Array<[number, number | null, number]> = [
  [0, 5000, 10],
  [5001, 100000, 4],
  [100001, 200000, 3],
  [200001, 500000, 2],
  [500001, null, 1],
];

/* ── Main generator ────────────────────────────── */

export function genEsaSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
): void {
  /* ── Column widths ─────────────────────────── */
  setColumnWidth(ws, 1, 2);
  setColumnWidth(ws, 2, 36);
  setColumnWidth(ws, 3, 6);
  setColumnWidth(ws, 4, 12);
  setColumnWidth(ws, 5, 2);
  setColumnWidth(ws, 6, 12);
  setColumnWidth(ws, 7, 12);
  setColumnWidth(ws, 8, 10);

  /* ── Title ─────────────────────────────────── */
  let r = 2;
  writeCell(ws, r, 1, 'Enterprise Support Agreement', ['esa', 'title']);

  /* ── Fixed Price Component ─────────────────── */
  r += 2;
  writeCell(ws, r, 2, 'Fixed Price Component', ['esa', 'subtitle']);

  r += 2;
  writeCell(ws, r, 2, 'Item Description', ['esa', 'header']);
  writeCell(ws, r, 3, '', ['esa', 'header']);
  writeCell(ws, r, 4, 'Monthly', ['esa', 'header']);

  /* Base Fee row */
  r += 1;
  writeCell(ws, r, 2, 'Base Fee', ['esa', 'table', 'text']);
  writeCell(ws, r, 3, 'Y', ['esa', 'table', 'text_c']);
  dataValidationList(ws, r, 3, ['Y','N']);
  const isEnabled = rowcolToCell(r, 3);
  writeCell(ws, r, 4, BASE_FEE, ['esa', 'table', 'euro']);
  def(refMap, 'ESA_ENABLED', rowcolToCell(r, 3, true, true, ws.name));

  /* Optional Components header */
  r += 1;
  writeCell(ws, r, 2, 'Optional Components', ['esa', 'header']);
  writeCell(ws, r, 3, ' Y/N', ['esa', 'header']);
  writeCell(ws, r, 4, '', ['esa', 'header']);

  /* Option rows */
  for (const [text, price] of OPTIONS) {
    r += 1;
    writeCell(ws, r, 2, text, ['esa', 'table', 'text']);
    writeCell(ws, r, 3, '', ['esa', 'table','text_c']);
    dataValidationList(ws, r, 3, ['Y', 'N']);
    writeCell(ws, r, 4, price, ['esa', 'table','euro']);
  }

  /* Total row */
  r += 1;
  writeCell(ws, r, 2, 'Total', ['esa', 'header']);
  writeCell(ws, r, 3, '', ['esa', 'header']);
  writeCell(ws, r, 4,
    resolveFormula(
      '=IF({is_enabled}="Y",SUMIF({refcol}:{refcol},"=Y",{sumcol}:{sumcol}),0)',
      {
        is_enabled: isEnabled,
        refcol: colToName(3),
        sumcol: colToName(4),
      },
    ),
    ['esa', 'header','total'],
  );
  def(refMap, 'ESA_FIXED_PRICE', rowcolToCell(r, 4, true, true, ws.name));

  /* ── Uplift bands ──────────────────────────── */
  r = 4;
  writeCell(ws, r, 6, 'Uplift bands', ['esa', 'subtitle']);

  r += 2;
  writeCell(ws, r, 6, 'Oplift range', ['esa', 'header']);
  writeCell(ws, r, 7, '', ['esa', 'header']);
  writeCell(ws, r, 8, 'Percentage', ['esa', 'header']);

  r += 1;
  writeCell(ws, r, 6, 'From', ['esa', 'table', 'text']);
  writeCell(ws, r, 7, 'To', ['esa', 'table','text']);
  writeCell(ws, r, 8, '', ['esa', 'table','text']);

  /* Build nested IF formula for uplift */
  let formula = '';
  for (const [frm, to, percent] of VARIABLE_RATE) {
    r += 1;
    writeCell(ws, r, 6, frm, ['esa', 'table', 'euro']);
    writeCell(ws, r, 7, to, ['esa', 'table', 'euro']);
    writeCell(ws, r, 8, percent / 100, ['esa', 'table', 'percent']);
    if (to !== null) {
      const yes = rowcolToCell(r + 1, 8, true, true, ws.name);
      const no = formula
        ? formula
        : rowcolToCell(r, 8, true, true, ws.name);
      formula = `IF({revenue}>${rowcolToCell(r, 7, true, true, ws.name)},${yes},${no})`;
    }
  }
  def(refMap, 'ESA_UPLIFT', formula);
  console.log('ESA_UPLIFT FORMULA',formula);

  //~ r+=2;
  //~ writeCell(ws,r,2,resolveFormula(`=${formula}`,{ revenue: 10000 }));

}
