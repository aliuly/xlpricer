/**
 * Components sheet generator
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
  dataValidationList,
  resolveFormula,
  groupColumns,
  mapCol,
  def,
  updRowRefs,
  sheetRef,
} from './xlu';

import { YEAR_MAX } from './constants';


/* ── Types ─────────────────────────────────── */
import type { ComponentsRow } from '../editorTab/classify';
import type { ColumnDef } from './xlu';

const USER_COLS: (number|ColumnDef)[] = [
  {
    h: {
      tx: 'Qty',
      w: 10,
      fmt: 'user',
    },
    name: 'f_qty',
    fmt: 'qty',
  },
  {
    h: {
      tx: 'Function',
      w: 24,
      fmt: 'user',
    },
    name: 'f_func',
    fmt: 'itext',
  },
  {
    h: {
      tx: 'Description',
      w: 42,
      fmt: 'user',
    },
    name: 'f_desc',
    fmt: 'itext',
    val: 'PriceListDescs',
  },
  3,
  {
    h: {
      tx: 'Storage (GiB)',
      w: 16,
      fmt: 'user',
    },
    name: 'f_storage',
    fmt: 'qty',
  },
  {
    h: {
      tx: 'H/R',
      w: 6,
      fmt: 'user',
    },
    name: 'f_hrs',
    fmt: 'idef_c',
    formula: [
        '=IF({WS_RXM}="R36M",',
           // Default Reserved is R36M
           'IF({#f_pr36m}<>"","R36M",',
             // But we don't have r36m pricing...
             //   so we use R24M, R12M if available... otherwise just use {DEFAULT_HOURS} hours
             'IF({#f_pr24m}<>"","R24M",',
                'IF({#f_pr12m}<>"","R12M",{DEFAULT_HOURS})',
             ')',
            ')',
           ',',
            'IF({WS_RXM}="R24M",',
             // Default Reserved is R24M
             'IF({#f_pr24m}<>"","R24M",',
               // But we don't have r24m pricing...
               //   so we use R12M if available... otherwise just use {DEFAULT_HOURS} hours
               'IF({#f_pr12m}<>"","R12M",{DEFAULT_HOURS})',
             ')',
            ',',
             'IF({WS_RXM}="R12M",',
               // Default Reserved is R12M
               'IF({#f_pr12m}<>"","R12M",{DEFAULT_HOURS})',
             ',',
              'IF({WS_RXM}="Elastic-FT",',
               // System operates 24x7
               '{FT_HOURS}',
              ',',
               'IF({WS_RXM}="Elastic-Office",',
                // System operates office hours
                '{WK_HOURS}',
               ',',
                // OK, use the default hours in assumptions
                '{DEFAULT_HOURS}',
               ')',
              ')',
             ')',
            ')',
          ')',
    ],
  },
  3,
  {
    h: {
      tx: 'Group',
      w: 12,
      fmt: 'user',
    },
    name: 'f_grouping',
    fmt: 'itext_c',
    formula: [ '={prev}' ],
  },
];

const USER_EX_COLS: (number|ColumnDef)[] = [
  {
    h: {
      tx: 'Region',
      w: 7,
      fmt: 'user',
    },
    name: 'f_reg',
    fmt: 'd_def',
    formula: [ '={WS_REGION}' ],
    val: 'REGIONS',
  },
  {
    h: {
      tx: 'EVS Class',
      w: 16,
      fmt: 'user',
    },
    name: 'f_evs_type',
    fmt: 'd_def',
    formula: [ '={WS_DEF_EVS}' ],
    val: 'EVS',
  },
  {
    h: {
      tx: 'Persist?',
      w: 7,
      fmt: 'user',
    },
    name: 'f_evs_perm',
    fmt: 'd_def',
    formula: [ 'Y' ],
    val: [ 'Y','N' ],
  },
  {
    h: {
      tx: 'Backup?',
      w: 7,
      fmt: 'user',
    },
    name: 'f_backup',
    fmt: 'd_def',
    formula: ['={WS_DEF_BACKUP}'],
    val: 'BACKUP',
  },
  {
    h: {
      tx: 'Backup Factor',
      w: 7,
      fmt: 'user',
    },
    name: 'f_bak',
    fmt: 'd_def',
    formula: ['={WS_BACKUP_FACT}'],
  },
  {
    h: {
      tx: 'Backup (GiB)',
      w: 7,
      fmt: 'user',
    },
    name: 'f_bakvol',
    fmt: 'd_def',
    formula: ['=IF(AND({#f_evs_perm}="Y",{#f_storage}>0),{#f_storage}*{#f_bak},"")'],
  },
]

const COMPUTE_COLS: (number|ColumnDef)[] = [
  {
    h: {
      tx: 'vCPU',
      w: 6,
      fmt: 'system',
    },
    name: 'f_vcpu',
    fmt: 'num_c',
    formula: [
      '=IF({#f_sku}="","",IF(',
	'INDEX({PRICES_TABLE},{#f_sku},{cm_vCpu})>0,',
	'INDEX({PRICES_TABLE},{#f_sku},{cm_vCpu}),',
      '""))',
    ],
  },
  {
    h: {
      tx: 'vRAM (GiB)',
      w: 6,
      fmt: 'system',
    },
    name: 'f_ram',
    fmt: 'num_c',
    formula: [
      '=IF({#f_sku}="","",IF(',
	'INDEX({PRICES_TABLE},{#f_sku},{cm_ram})>0,',
	'INDEX({PRICES_TABLE},{#f_sku},{cm_ram}),',
      '""))',
    ],
  },
  3,
  {
    h: {
      tx: 'Row Idx',
      w: 7,
      fmt: 'system',
    },
    name: 'f_sku',
    fmt: 'num_c',
    formula: [
      '=IF(OR({#f_desc}="",{#f_reg}=""),"",',
	  'MATCH(1,INDEX(({PRICES_DESC}={#f_desc})*({PRICES_REGION}={#f_reg}),0),0)',
	')',
    ],
  },
  {
    h: {
      tx: 'EVS Idx',
      w: 7,
      fmt: 'system',
    },
    name: 'f_evs_id',
    fmt: 'num_c',
    formula: [
      '=IF(OR({#f_desc}="",{#f_evs_type}="",{#f_reg}=""),"",',
	'MATCH(1,INDEX(({PRICES_DESC}="Storage: EVS " & {#f_evs_type})*({PRICES_REGION}={#f_reg}),0),0)',
      ')',
    ],
  },
  {
    h: {
      tx: 'Backup Idx',
      w: 7,
      fmt: 'system',
    },
    name: 'f_backup_idx',
    fmt: 'num_c',
    formula: [
      '=IF(OR({#f_desc}="",{#f_evs_type}="",{#f_reg}="",{#f_backup}<>"STD"),',
	'"",',
	'INDEX({PRICES_TABLE}, {#f_sku}, {cm__backup_idx_})',
	')',
      ],
  },
  {
    h: {
      tx: 'PayG',
      w: 10,
      fmt: 'system',
    },
    name: 'f_price',
    fmt: 'price_h',
    formula: [
      '=IF({#f_sku}="","",',
	'INDEX({PRICES_TABLE}, {#f_sku}, {cm_priceAmount})',
      ')'
    ],
  },
  {
    h: {
      tx: 'Unit',
      w: 10,
      fmt: 'system',
    },
    name: 'f_unit',
    fmt: 'data',
    formula: [
      '=IF({#f_sku}="","",',
	'INDEX({PRICES_TABLE}, {#f_sku}, {cm_unit})',
      ')'
    ],
  },
  // Reserved pricing...
  {
    h: {
      tx: 'R12M',
      w: 10,
      fmt: 'system',
    },
    name: 'f_pr12m',
    fmt: 'price_m',
    formula: [
	'=IF({#f_sku}="","",IF(',
	    'INDEX({PRICES_TABLE},{#f_sku},{cm_R12})>0,',
	    'INDEX({PRICES_TABLE},{#f_sku},{cm_R12}),',
	    '""',
      '))',
    ],
  },
  {
    h: {
      tx: 'R24M',
      w: 10,
      fmt: 'system',
    },
    name: 'f_pr24m',
    fmt: 'price_m',
    formula: [
      '=IF({#f_sku}="","",IF(',
	    'INDEX({PRICES_TABLE},{#f_sku},{cm_R24})>0,',
	    'INDEX({PRICES_TABLE},{#f_sku},{cm_R24}),',
	    '""',
      '))',
    ],
  },
  {
    h: {
      tx: 'R36M',
      w: 10,
      fmt: 'system',
    },
    name: 'f_pr36m',
    fmt: 'price_m',
    formula: [
      '=IF({#f_sku}="","",IF(',
	    'INDEX({PRICES_TABLE},{#f_sku},{cm_R36})>0,',
	    'INDEX({PRICES_TABLE},{#f_sku},{cm_R36}),',
	    '""',
      '))',
    ],
  },
  {
    h: {
      tx: 'QxH',
      w: 10,
      fmt: 'system',
    },
    name: 'f_qxh',
    fmt: 'num_c',
    formula: [
      '=IF({#f_sku}="","",',
	'IF(LEFT({#f_unit},1)="h",',
	  'IF(ISNUMBER({#f_hrs}),{#f_hrs},{DEFAULT_HOURS}),',
	  '1',
	')*{#f_qty}',
      ')',
    ],
  },
  {
    h: {
      tx: 'EVS €/GiB',
      w: 8,
      fmt: 'system',
    },
    name: 'f_evs_price',
    fmt: 'price_h',
    formula: [
	'=IF({#f_evs_id}="","",',
              'INDEX({PRICES_TABLE},{#f_evs_id},{cm_priceAmount})',
        ')'
    ],
  },
  {
    h: {
      tx: 'Backup €/GiB',
      w: 8,
      fmt: 'system',
    },
    name: 'f_backup_price',
    fmt: 'price_h',
    formula: [
	'=IF({#f_backup_idx}="","",',
              'INDEX({PRICES_TABLE},{#f_backup_idx},{cm_priceAmount})',
        ')',
    ],
  },
];

const SUBTOT_COLS: (number|ColumnDef)[] = [
  {
    h: {
      tx: 'Price',
      w: 12,
      fmt: 'calc',
    },
    name: 'f_pmonth',
    fmt: 'euro',
    formula: [
	'=IF({#f_sku}="",0,',
          'IF(AND({#f_pr12m}<>"",{#f_hrs}="R12M"),{#f_pr12m},',
            'IF(AND({#f_pr24m}<>"",{#f_hrs}="R24M"),{#f_pr24m},',
              'IF(AND({#f_pr36m}<>"",{#f_hrs}="R36M"),{#f_pr36m},',
                'IF(LEFT({#f_unit},1)="h",',
                  'IF(ISNUMBER({#f_hrs}),{#f_hrs},{DEFAULT_HOURS})*{#f_price},',
                  '{#f_price}',
        ')))))',
    ],
  },
  {
    h: {
      tx: 'EVS price',
      w: 12,
      fmt: 'calc',
    },
    name: 'f_evs_sub',
    fmt: 'euro',
    formula: [
	'=IFERROR(IF({#f_storage}="",0,',
          '{#f_storage}*{#f_evs_price}*IF(',
            'AND({#f_evs_perm}="N",ISNUMBER({#f_hrs})),',
              '{#f_hrs}/{FT_HOURS},',
              '1',
        ')),0)',
    ],
  },
  {
    h: {
      tx: 'Backup Price',
      w: 12,
      fmt: 'calc',
    },
    name: 'f_backup_sub',
    fmt: 'euro',
    formula: [
      '=IFERROR(IF(OR({#f_bakvol}="",{#f_bakvol}=0),0,{#f_bakvol}*{#f_backup_price}),0)'
    ]
  },
  {
    h: {
      tx: 'Sub-Total per Unit',
      w: 12,
      fmt: 'calc',
    },
    name: 'f_tot_1',
    fmt: 'euro',
    formula: [ '=IFERROR({#f_pmonth}+{#f_evs_sub}+{#f_backup_sub},0)' ],
  },
  {
    h: {
      tx: 'Sub-Total',
      w: 15,
      fmt: 'calc',
    },
    name: 'f_tot_qty',
    fmt: 'euro',
    formula: [ '={#f_qty}*{#f_tot_1}' ],
  },
];


const COLUMNS: (number|ColumnDef)[] = [
  0,
  3,
  ...USER_COLS,
  3,
  ...USER_EX_COLS,
  3,
  ...COMPUTE_COLS,
  3,
  ...SUBTOT_COLS,

]

/* ── Helpers ────────────────────────── */
function wsColumn(name: string): number {
  return mapCol(name, COLUMNS);
}

/* -- Per sheet defaults ----------------- */
function  wsStorageProps(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  let evs_type = wsColumn('f_evs_type');
  let backup = wsColumn('f_backup');

  writeCell(ws, r, evs_type-1, 'EVS', ['bom','props','title']);
  writeCell(ws, r+1, evs_type-1, 'Class:', ['bom','props','key']);
  writeCell(
      ws,
      r+1, evs_type,
      resolveFormula('={DEFAULT_EVS}',{...refMap, ...myMap}),
      ['bom','props','text'],
  );
  dataValidationList(ws, r+1, evs_type, 'EVS');
  def(myMap, 'WS_DEF_EVS', rowcolToCell(r+1,evs_type,true,true));

  writeCell(ws, r, backup-1, 'Backup', ['bom','props','title']);
  writeCell(ws, r+1, backup-1, 'Class:', ['bom','props','key']);
  writeCell(
      ws,
      r+1, backup,
      resolveFormula('={DEFAULT_BACKUP}',{...refMap, ...myMap}),
      ['bom','props','text'],
  );
  dataValidationList(ws, r+1, backup, 'BACKUP');
  writeCell(ws, r+2, backup-1, 'Factor:', ['bom','props','key']);
  writeCell(
      ws,
      r+2, backup,
      resolveFormula('={BACKUP_FACT}',{...refMap, ...myMap}),
      ['bom','props','float'],
  );
  def(myMap, 'WS_DEF_BACKUP', rowcolToCell(r+1,backup,true,true));
  def(myMap, 'WS_BACKUP_FACT', rowcolToCell(r+2,backup,true,true));
}

function  wsSheetProps(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  const c = 2;
  writeCell(ws, r, c, 'Region:', ['bom','props','key']);
  writeCell(
      ws, r, c+1,
      resolveFormula('={DEFAULT_REGION}',{...refMap, ...myMap}),
      ['bom','props','text'],
  );
  dataValidationList(ws, r, c+1, 'REGIONS');
  def(myMap, 'WS_REGION', rowcolToCell(r,c+1,true,true));

  writeCell(ws, r+1, c, 'Pricing:', ['bom','props','key']);
  writeCell(
      ws, r+1, c+1,
      resolveFormula('={DEFAULT_RXM}',{...refMap, ...myMap}),
      ['bom','props','text'],
  );
  dataValidationList(ws, r+1, c+1, 'RXM');
  def(myMap, 'WS_RXM', rowcolToCell(r+1,c+1,true,true));
}

function  wsSheetTotals(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  const c = 4;
  writeCell(ws, r, c, 'Set-up:', ['bom','props','key']);
  ws.mergeCells(`${rowcolToCell(r,c+1)}:${rowcolToCell(r,c+2)}`);

  const iMap: Record<string, string> = {};
  const items = [ 'f_tot_qty', 'f_unit', 'f_qty' ];
  for (const i of items) {
    def(iMap, i, colToName(wsColumn(i),true));
  }
  writeCell(
      ws, r, c+1,
      resolveFormula(
	[
	  '=SUMIFS({f_tot_qty}:{f_tot_qty},',		// Column to sum
	    '{f_unit}:{f_unit},"="&{T_ONE_TIME}',	// Pick one-time items
	  ')',
	].join(''),
	{ ...refMap, ...myMap, ...iMap },
      ),
      ['bom','props','total'],
  );
  def(refMap, `${ws.name}!TOTAL_SETUP`, rowcolToCell(r,c+1,true,true,ws.name));

  writeCell(ws, r+1, c, 'Monthly Total:', ['bom','props','key']);
  ws.mergeCells(`${rowcolToCell(r+1,c+1)}:${rowcolToCell(r+1,c+2)}`);
  writeCell(
      ws, r+1, c+1,
      resolveFormula(
	[
	  '=SUMIFS({f_tot_qty}:{f_tot_qty},',		// Column to sum
	    '{f_unit}:{f_unit},"<>"&{T_ONE_TIME},',	// Skip one-time items
	    '{f_qty}:{f_qty},"<>Total *"',		// Skip totals
	  ')',
	].join(''),
	{ ...refMap, ...myMap, ...iMap },
      ),
      ['bom','props','total'],
  );
  def(refMap, `${ws.name}!TOTAL_MONTHLY`, rowcolToCell(r+1,c+1,true,true,ws.name));
}

/* ── Main components table ────────────────────────── */

function  wsDataHdr(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  for (let c=1; c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    writeCell(ws, r, c, col.h.tx, [ 'bom','header', col.h.fmt ]);
    if (col.name) {
      def(myMap, col.name, colToName(c, true));
      def(refMap, `${ws.name}!${col.name}`, colToName(c, true, ws.name))
      def(refMap,
	`${ws.name}!!${col.name}`,
	`${sheetRef(ws.name)}!${colToName(c, true)}:${colToName(c, true)}`
      )
    }
  }
}

function wsDataGrp(
  ws: Worksheet,
  r: number,
  title: string,
  grp: string,
): void {
  writeCell(ws, r, 2, title, ['bom','grp','top']);
  const gc = wsColumn('f_grouping');
  for (let c=3;c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    if (c == gc) {
      writeCell(ws,r,c,grp, ['bom','grp','top_c']);
    } else {
      writeCell(ws,r,c,null, ['bom','grp','top']);
    }
  }
}

function wsDataTotal(
  ws: Worksheet,
  r: number,
  grprow: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  writeCell(
      ws,
      r, 2,
      resolveFormula(
	  '="Total "&IFERROR(IF({#f_grouping}="","N/A",{#f_grouping}),"N/A")',
	  {...refMap, ...myMap },
      ),
      [ 'bom','grp', 'bottom' ]
  );
  const grp = wsColumn('f_grouping');
  const tot = wsColumn('f_tot_qty');
  for (let c=3;c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    if (c == grp) {
      writeCell(
	  ws,
	  r,c,
	  `=${rowcolToCell(grprow, c)}`,
	  ['bom','grp','bottom_c']
      );
    } else if (c == tot) {
      writeCell(
	  ws,
	  r,c,
	  resolveFormula(
	      [
		'=SUMIFS({f_tot_qty}:{f_tot_qty},', 	// Column to sum
		'{f_unit}:{f_unit},"<>"&{T_ONE_TIME},',	// SKip one-time items
		'{f_qty}:{f_qty},"<>"&{#f_qty},',	// Skip total lines
		'{f_grouping}:{f_grouping},"="&{#f_grouping}',	// Only pick this group
		')'
	      ].join(''),
	      {...refMap, ...myMap },
	  ),
	  ['bom','grp','total']
      );

    } else {
      writeCell(ws,r,c,null,['bom','grp','bottom']);
    }
  }
}
function wsDataRow(
  ws: Worksheet,
  r: number,
  row: ComponentsRow,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {

  for (let c=2;c < COLUMNS.length ; c++) {
    let col = COLUMNS[c];
    if (typeof col === 'number') continue;
    let val = '';

    let col_name = col.name ?? '';
    if (col_name == 'f_qty' && row.qty) {
      val = row.qty;
    } else if (col_name == 'f_func' && row.function) {
      val = row.function;
    } else if (col_name == 'f_desc' && row.description) {
      val = row.description;
    } else if (col_name == 'f_storage' && row.storage) {
      val = row.storage;
    } else if (col_name == 'f_hrs' && row.hr) {
      val = row.hr;
    } else if (col.formula) {
      val = col.formula.join('');
    }
    writeCell(
      ws,
      r, c,
      resolveFormula(val, {
	  ...refMap, ...myMap,
	  prev: rowcolToCell(r-1, c),
      }),
      ['bom','data', col.fmt],
    );
    if (col.val) {
      dataValidationList(ws, r, c, col.val);
    }

  }
}

/* ── Main inflation table ────────────────────────── */
function  wsInflationHdr(
  ws: Worksheet,
  r: number,
  colloffs: number,
  years: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  writeCell(ws, r-1,colloffs, 'Years: ➜', [ 'bom', 'header', 'calc' ]);
  for (let c=1 ; c <= years; c++) {
    writeCell(ws, r-1,colloffs + c, null, [ 'bom', 'header', 'calc' ]);
  }

  writeCell(ws, r,colloffs, 'Set-up', [ 'bom', 'header', 'calc' ]);
  writeCell(ws, r, colloffs+1, 1, [ 'bom', 'header', 'calc' ]);
  for (let c=2 ; c <= years; c++) {
    writeCell(
      ws,
      r, colloffs+c,
      `=${rowcolToCell(r,colloffs+c-1)}+1`,
      [ 'bom', 'header', 'calc' ]
    );
  }
  def(myMap, 'year_row', String(r));

  def(refMap, `${ws.name}!YEAR_ROW`, String(r));
  def(refMap, `${ws.name}!SETUP`, colToName(colloffs, true, ws.name))
  def(refMap,
    `${ws.name}!!SETUP`,
    `${sheetRef(ws.name)}!${colToName(colloffs, true)}:${colToName(colloffs, true)}`
  )
  for (let c=1; c <= years; c++) {
    def(refMap, `${ws.name}!YEAR_${c}`, colToName(c+colloffs, true, ws.name))
    def(refMap,
      `${ws.name}!!YEAR_${c}`,
      `${sheetRef(ws.name)}!${colToName(c+colloffs, true)}:${colToName(c+colloffs, true)}`
    )
  }
}

function wsInflationRow(
  ws: Worksheet,
  r: number,
  colloffs: number,
  years: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  writeCell(
	  ws, r, colloffs,
	  resolveFormula(
	    [
	      '=IF({#f_unit}={T_ONE_TIME},',
		'{#f_tot_qty},',
		'0)',
	    ].join(''),
	    {...refMap, ...myMap},
	  ),
	  ['bom','data', 'price_m'],
  );
  for (let y=1; y<=years; y++) {
    writeCell(
	  ws, r, colloffs+y,
	  resolveFormula(
	    [
	      '=IF({#f_unit}={T_ONE_TIME},0,',
		'IF( AND({#f_hrs}="R24M",{#f_pr24m}<>0),',
		  // 24M reserved pricing calculation
		  '{#f_qty}*',
		    '(',
		      '{#f_pmonth}*(1+{INFLATION})^(FLOOR({year}-1,2))',
		      '+',
		      '({#f_backup_sub}+{#f_evs_sub})*(1 + {INFLATION})^({year}-1)',
		    ')',
		  ',',
		    'IF( AND({#f_hrs}="R36M",{#f_pr36m}<>0),',
		      // 36M reserved pricing calculation
		      '{#f_qty}*',
			'(',
			  '{#f_pmonth}*(1+{INFLATION})^(FLOOR({year}-1,3))',
			  '+',
			  '({#f_backup_sub}+{#f_evs_sub})*(1 + {INFLATION})^({year}-1)',
			')',
		      ',',
		      // Normal calculation
		      '{#f_tot_qty}*(1+{INFLATION})^({year}-1)',
		  ')',
	      '))',
	    ].join(''),
	    {
	      ...refMap, ...myMap,
	      'year': `${colToName(colloffs+y)}$${myMap["year_row"]}`,
	    },
	  ),
	  ['bom','data', 'price_m'],
    );
  }
}

function wsInflationTotal(
  ws: Worksheet,
  r: number,
  colloffs: number,
  years: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  for (let y=0; y<=years; y++) {
    let cn = colToName(colloffs+y);
    writeCell(
	  ws, r, colloffs+y,
	  resolveFormula(
	    [
	      '=SUMIFS({cn}:{cn},',		// Column to sum
		'{f_qty}:{f_qty},"<>"&{#f_qty},',	// Skip total lines
		'{f_grouping}:{f_grouping},"="&{#f_grouping}',	// Only pick this group
	      ')'
	    ].join(''),
	    {
	      ...refMap, ...myMap,
	      'cn': cn,
	    },
	  ),
	  ['bom','grp', 'float'],
    );
  }
}


/* ── Main generator ────────────────────────── */
export function genBOMSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  componentsRaw: unknown,
): void {
  const components = componentsRaw as ComponentsRow[];
  const myMap: Record<string, string> = {};     // Local map

  /* ── Column widths ───────────────────────── */
  for (let c = 1; c < COLUMNS.length; c++) {
    const col = COLUMNS[c];
    let w = (typeof col === 'number') ? col : (col.h.w ?? 0);
    if (w) setColumnWidth(ws, c, w);
  }
  let coloffs = COLUMNS.length+2;

  let r=1
  /* ── Title ───────────────────────────────── */
  writeCell(ws, r, 1, `Cloud ${ws.name}`, ['bom','title']);
  writeCell(ws, r, coloffs, 'Future Price Forecast (Adjusted for inflation)', ['bom','title']);

  /* -- sheet properties ----------------- */
  wsStorageProps(ws,r,myMap,refMap);
  wsSheetProps(ws,r+1,myMap,refMap);
  wsSheetTotals(ws,r+1,myMap,refMap);
  r += 4;

  /* -- Column headings ----------------- */
  wsDataHdr(ws, r, myMap, refMap);
  wsInflationHdr(ws, r, coloffs, YEAR_MAX, myMap, refMap)
  r++;

  freezePanes(ws, r, wsColumn('f_storage')+1);

  /* -- Main row contents ---------------- */
  let grprow = 0;
  for (const row of components) {
    updRowRefs(myMap, r, COLUMNS);
    if (row.type == 'section') {
      if (grprow) {
	// create a group total
	wsDataTotal(ws, r, grprow,myMap,refMap);
	wsInflationTotal(ws, r, coloffs, YEAR_MAX, myMap, refMap);
	r++;
      }
      // create a group header
      wsDataGrp(ws,r, row.function, row.qty);
      grprow = r;
    } else {
      // create a data row
      wsDataRow(ws, r, row, myMap, refMap);
      wsInflationRow(ws, r, coloffs, YEAR_MAX, myMap, refMap);
    }
    r++;
  }
  if (grprow) {
    updRowRefs(myMap, r, COLUMNS);
    wsDataTotal(ws, r, grprow,myMap,refMap);
    wsInflationTotal(ws, r, coloffs, YEAR_MAX, myMap, refMap);
    r++;
  }

  groupColumns(ws, wsColumn('f_reg'), wsColumn('f_bakvol'), {hidden: true, outlineLevel: 1});
  groupColumns(ws, wsColumn('f_vcpu'), wsColumn('f_ram'), {outlineLevel: 1});
  groupColumns(ws, wsColumn('f_sku'), wsColumn('f_backup_price'), {hidden: true, outlineLevel: 1});
  groupColumns(ws, wsColumn('f_evs_sub'), wsColumn('f_backup_sub'), {outlineLevel: 1});
  groupColumns(ws, coloffs, coloffs+YEAR_MAX, {hidden: true, outlineLevel: 1});

}

  // @*ts-expect-error - temp
