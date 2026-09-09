/**
 * Pricing sheet generator
 */

import type {
  Worksheet,
} from 'exceljs';

import {
  autofilter,
  writeCell,
  setColumnWidth,
  //~ sheetRef,
  freezePanes,
  rowcolToCell,
  //~ colToName,
  def,
  //~ dataValidationList,
  //~ resolveFormula,
} from './xlu';

/* ── Types ─────────────────────────────────── */

/** Subset of fixed_prices.json consumed by the Pricing sheet. */
export interface PricesPayload {
  schema?: string;
  keys: string[];
  columns: (string|null)[];
  records: unknown[][];
}

/* ── Main generator ────────────────────────── */

export function genPriceSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  pricingRaw: unknown,
): void {
  const prices = pricingRaw as PricesPayload;
  // Exit early if we don't have any records!
  if (!prices.records) throw new Error('Missing price data');
  const colmap: Record<string, number> = {};
  const x : Record<string,number> = {};

  for (let i = 0; i < prices.keys.length ; i++) {
    x[prices.keys[i]] = i;
  }

  let r=2;
  /* ── Column widths ───────────────────────── */
  const colWidths = [0, 3, 50];
  for (let c = 1; c <= colWidths.length; c++) {
    setColumnWidth(ws, c, colWidths[c]);
  }

  /* ── Title ───────────────────────────────── */
  writeCell(ws, r, 1, 'Price List', ['prices','title']);
  r++;

  const overrides: Record<string, number> = {
    id: 20,
    idGroupTiered: 10,
    productId: 16,
    opiFlavour: 20,
    productName: 37,
    description: 30,
    ram: 7,
    fromOn: 10.5,
    upTo: 10.5,
    _backup_: 30,
  };

  /* ── Headings ───────────────────────────────── */

  let c = 3;
  for (let i=0; i < prices.keys.length ; i++) {
    const key = prices.keys[i];
    const value = prices.columns[i];
    if (!value) {
      console.log(`Skipping ${key} form prices table`);
      continue;
    }
    writeCell(ws, r, c, `${value}\n(${key})`, ['prices', 'header']);
    if (key in overrides) {
      setColumnWidth(ws, c, overrides[key]);
    } else {
      setColumnWidth(ws, c, value.length * 1.25);
    }
    colmap[key] = c;
    def(refMap,`cm_${key}`, String(c-1));
    c++;
  }
  writeCell(ws, r, c, 'Backup Index\n(_backup_idx_)', ['prices', 'header']);
  setColumnWidth(ws, c, 12);
  def(refMap,'cm__backup_idx_',String(c-1));
  c++;
  r++;
  freezePanes(ws, r, 3);

  /* ── Initial record to name map ───────────────────────── */
  const jmap: Record<string, number> = {};
  for (let i = 0; i < prices.records.length; i++) {
    let title = prices.records[i][x._XlTitle_];
    let region  = prices.records[i][x.region];
    jmap[`${title}|${region}`] = i+r;
  }
  //~ console.log(jmap);

  /* ──Populate prices ───────────────────────── */
  const prc = new Set(['R12','R24','R36', 'RU12','RU24','RU36']);
  let top = r;
  let left = 2;

  for (let i = 0; i < prices.records.length; i++, r++) {
    c = 2;
    writeCell(ws, r, c, prices.records[i][x._XlTitle_], [ 'prices', 'data' ], 'PriceListDescs');
    c++;
    for (const key of prices.keys) {
      if (!prices.columns[x[key]]) continue;
      let format = '';
      const val = prices.records[i][x[key]];
      if (prc.has(key)) {
	format = 'price_lg';
      } else if (key == 'priceAmount') {
	format = 'price_sm';
      } else 	if (Number.isInteger(val)) {
	format = 'num';
      }
      writeCell(ws, r, c, prices.records[i][x[key]], [ 'prices', 'data', format ]);
      c++;
    }

    if (prices.records[i][x._backup_]) {
      // Need to find backup index...
      let title = prices.records[i][x._backup_];
      let region  = prices.records[i][x.region];
      writeCell(ws, r, c, jmap[`${title}|${region}`], [ 'prices', 'data', 'num' ]);
    }
    c++;
  }
  let bottom = r;
  let right = c;

  autofilter(ws, top-1, left, bottom, right-1);
  console.log("top:", top);
  console.log("bottom:", bottom);

  //~ def(refMap,'prices_desc',`${sheetRef(ws.name)}!${colToName(2,true)}:${colToName(2,true)}`);
  //~ def(refMap,'prices_region', `${sheetRef(ws.name)}!${colToName(colmap['region'],true)}:${colToName(colmap['region'],true)}`);
  //~ def(refMap,'prices_table',`${sheetRef(ws.name)}!${colToName(2,true)}:${colToName(right,true)}`);
  def(refMap,'prices_desc',`${rowcolToCell(1,2,true,true,ws.name)}:${rowcolToCell(bottom,2,true,true)}`);
  def(refMap,'prices_region',`${rowcolToCell(1,colmap['region'],true,true,ws.name)}:${rowcolToCell(bottom,colmap['region'],true,true)}`);
  def(refMap,'prices_table',`${rowcolToCell(1,2,true,true,ws.name)}:${rowcolToCell(bottom,right,true,true)}`);

  def(refMap,'last_sku', String(bottom));
  def(refMap,'last_column', String(right));
  def(refMap,'prices_coord', `${top},${left},${bottom},${right}`);
}
