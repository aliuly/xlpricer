/**
 * Volume Tier pricing sheet generator
 */

import type {
  Worksheet,
} from 'exceljs';

import {
  writeCell,
  setColumnWidth,
  freezePanes,
  rowcolToCell,
  colToName,
  //~ dataValidationList,
  resolveFormula,
  //~ groupColumns,
  mapCol,
  def,
  updRowRefs,
  //~ sheetRef,
} from './xlu';

/* ── Types ─────────────────────────────────── */
import type { ColumnDef } from './xlu';

/** Subset of fixed_prices.json consumed by the Volumes sheet. */
export interface PricesVols {
  schema?: string;
  //~ columns?: Record<string, string>;
  //~ count?: number;
  //~ records?: Record<string, any>;
  tiers?: Record<string, any>;
}


const COLUMNS: (number|ColumnDef)[] = [
  0,
  5,
  {
    h: {
      tx: 'Tiered Volume',
      w: 10,
      fmt: 'user',
    },
    name: 'f_v_tiered_vol',
    fmt: 'qty',
  },
  {
    h: {
      tx: 'Description',
      w: 42,
      fmt: 'user',
    },
    name: 'f_v_desc',
    fmt: 'text',
  },
  {
    h: {
      tx: 'Region',
      w: 7,
      fmt: 'user',
    },
    name: 'f_v_reg',
    fmt: 'text_c',
  },
  5,
  {
    h: {
      tx: 'Tiered Price',
      w: 10,
      fmt: 'system'
    },
    name: 'f_v_price',
    fmt: 'price_5',
  },
  {
    h: {
      tx: 'Unit',
      w: 15,
      fmt: 'system',
    },
    name: 'f_v_unit',
    fmt: 'text_c',
  },
  5,
  {
    h: {
      tx: 'Sub-total',
      w: 15,
      fmt: 'system',
    },
    name: 'f_v_total',
    fmt: 'euro',
  }
];

/* ── Helpers ────────────────────────── */
function wsColumn(name: string): number {
  return mapCol(name, COLUMNS);
}


/* ── Main volume table ────────────────────────── */

function  wsVolumeHdr(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
): void {
  for (let c=1; c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    writeCell(ws, r, c, col.h.tx, [ 'vol','header', col.h.fmt ]);
    if (col.name) {
      def(myMap, col.name, colToName(c, true));
    }
  }
}

const grpMap : Record<string,string> = {
  f_v_desc: '_XlTitle_',
  f_v_reg: 'region',
  f_v_unit: 'unit',
};

function wsVolumeGroup(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
  ntabs: number,
  colloffs: number,
  td: Record<string,any>,
): void {
  for (let c=1; c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    writeCell(ws, r, c,null, [ 'vol','grp', col.fmt ]);
  }
  let c;
  c = wsColumn('f_v_tiered_vol');
  writeCell(
      ws,
      r, c,
      `=SUM(${rowcolToCell(r,colloffs-1,false,true)}:${rowcolToCell(r,colloffs+ntabs,false,true)})`,
  );
  def(myMap, '#volcell', rowcolToCell(r, c, false, true))

  for (const [col,src] of Object.entries(grpMap)) {
    c = wsColumn(col);
    writeCell(
      ws,
      r,c,
      String(td[src])
    );
  }
  c = wsColumn('f_v_total');
  writeCell(
      ws,
      r,c,
      `=SUM(${rowcolToCell(r+1,c,false,true)}:${rowcolToCell(r+td._tariffs_.length,c,false,true)})`
  );
  c = wsColumn('f_v_price');
  writeCell(
      ws,
      r,c,
      resolveFormula(
	  '=IF({#f_v_tiered_vol}<>0,{#f_v_total}/{#f_v_tiered_vol},"")',
	  myMap
      )
  );
  // Make it possible to find the price later...
  def(
      refMap,
      `TIER_PRICE|${td._XlTitle_}|${td.region}`,
      rowcolToCell(r,c,true,true,ws.name),
  );
}

const rowMap : Record<string,string> = {
  f_v_desc: '_XlTitle_',
  f_v_reg: 'region',
  //~ f_v_unit: 'unit',
  f_v_price: 'priceAmount',
};

function wsVolumeRow(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  tariff: Record<string,any>,
): void {
  for (let c=1; c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    writeCell(ws, r, c,null, [ 'vol','data', col.fmt ]);
  }
  let c;

  for (const [col,src] of Object.entries(rowMap)) {
    c = wsColumn(col);
    writeCell(
      ws,
      r,c,
      String(tariff[src])
    );
  }

  c = wsColumn('f_v_total');
  writeCell(
      ws,
      r,c,
      resolveFormula(
	  '={#f_v_tiered_vol}*{#f_v_price}',
	  myMap,
      )
  );

  c = wsColumn('f_v_tiered_vol');
  let f = 'IF({#volcell}>={Tmin},{#volcell}-{Tmin},0)'
  if (tariff.upTo) {
    f = 'IF({#volcell}>{Tmax},{Tmax}-{Tmin},'+f+')'
  }
  writeCell(
      ws,
      r,c,
      resolveFormula(
	  '='+f,
	  {
	    ...myMap,
	    tmin: String(tariff.fromOn == 0 ? 0 : tariff.fromOn - 1),
	    tmax: String(tariff.upTo),
	  }
      )
  );
}

/* ── Main Per Tab table ────────────────────────── */
function  wsPerTabHdr(
  ws: Worksheet,
  r: number,
  coloffs: number,
  tabs: readonly string[],
): void {
  for (let c=0; c < tabs.length; c++) {
    setColumnWidth(ws, coloffs + c, 12);
    writeCell(ws, r, coloffs + c, tabs[c], ['vol', 'header', 'user' ]);
  }
  //~ def(refMap, `${ws.name}!YEAR_ROW`, String(r));
  //~ def(refMap, `${ws.name}!SETUP`, colToName(colloffs, true, ws.name))
  //~ def(refMap,
    //~ `${ws.name}!!SETUP`,
    //~ `${sheetRef(ws.name)}!${colToName(colloffs, true)}:${colToName(colloffs, true)}`
  //~ )
}

function wsPerTabRows(
  ws: Worksheet,
  r: number,
  coloffs: number,
  tabs: readonly string[],
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  let n
  for (let c = 0; c < tabs.length; c++) {
    n = tabs[c].toLowerCase();
    writeCell(
	ws,
	r, coloffs + c,
	resolveFormula([
	      '=SUMIFS({tab_f_qxh},',			// Column to sum
		'{tab_f_desc},"="&{#f_v_desc},',	// Pick product description
		'{tab_f_reg},"="&{#f_v_reg}',		// Pick region
	      ')'
	    ].join(''),
	    {
	      ...refMap, ...myMap,
	      tab_f_qxh: refMap[`${n}!!f_qxh`],
	      tab_f_desc: refMap[`${n}!!f_desc`],
	      tab_f_reg: refMap[`${n}!!f_reg`],
	    }
	),
	[ 'vol', 'grp', 'qty' ],
    );
  }
}

/* ── Main generator ────────────────────────── */
export function genVolumeSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  tabs: readonly string[],
  pricingRaw: unknown,
): void {
  const prices = pricingRaw as PricesVols;
  const myMap: Record<string, string> = {};     // Local map
  //~ console.log(tabs);

  /* ── Column widths ───────────────────────── */
  for (let c = 1; c < COLUMNS.length; c++) {
    const col = COLUMNS[c];
    let w = (typeof col === 'number') ? col : (col.h.w ?? 0);
    if (w) setColumnWidth(ws, c, w);
  }
  let coloffs = COLUMNS.length+2;

  let r=1
  /* ── Title ───────────────────────────────── */
  writeCell(ws, r, 1, `Volume`, ['vol','title']);
  writeCell(ws, r, coloffs, 'Tab Volumes', ['vol','title']);

  r += 2;

  /* -- Column headings ----------------- */
  wsVolumeHdr(ws, r, myMap);
  wsPerTabHdr(ws, r, coloffs, tabs)
  r++;
  freezePanes(ws, r, 1);

  /* -- Go over tiered SKUs ----------------- */
  for (const td of Object.values(prices.tiers ?? {})) {
    updRowRefs(myMap, r, COLUMNS);
    wsVolumeGroup(ws, r, myMap, refMap, tabs.length, coloffs, td);
    wsPerTabRows(ws, r, coloffs, tabs, myMap, refMap);
    r++;
    for (const i of td._tariffs_) {
      updRowRefs(myMap, r, COLUMNS);
      wsVolumeRow(ws, r, myMap, i);
      r++;
    }
    r++;
  }
}

export function updatePrices(
  ws: Worksheet,
  refMap: Record<string, string>,
): void {
  let last_sku = Number(refMap['last_sku']);
  let cm_title = 2;
  let cm_region = Number(refMap['cm_region'])+1;
  let cm_price = Number(refMap['cm_priceamount'])+1;

  for (let r = 2; r < last_sku ; r++) {
    let k = `TIER_PRICE|${ws.getCell(rowcolToCell(r,cm_title)).value}|${ws.getCell(rowcolToCell(r,cm_region)).value}`
    k = k.toLowerCase();
    if (k in refMap) {
      writeCell(
	  ws,
	  r, cm_price,
	  `=${refMap[k]}`,
      );
    }
  }
}
