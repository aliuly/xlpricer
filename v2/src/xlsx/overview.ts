/**
 * Overview sheet generator
 *
 * Aggregates costs from all component (BOM) sheets into a multi-year
 * projection with per-group subtotals, ramp-up handling, and an
 * optional ESA (Enterprise Support Agreement) add‑on section.
 *
 * Ported from `xlover.py`.
 */

import type { Worksheet } from 'exceljs';

import {
  writeCell,
  setColumnWidth,
  rowcolToCell,
  colToName,
  resolveFormula,
  groupColumns,
  groupRows,
  sheetRef,
  def,
} from './xlu';

import { YEAR_MAX, INFO_URLS, ESA_URLS } from './constants';
const RS_ADJ = 7; // Right side adjustment
import type { ComponentsRow } from '../editorTab/classify';


/* ── Group extraction ───────────────────────── */

/** Collect unique groups (section rows) from all component sheets,
 *  preserving which tab each group comes from. */
function extractGroups(
  components: Record<string, unknown>,
): Record<string, Array<{ key: string; label: string }>> {
  const result: Record<string, Array<{ key: string; label: string }>> = {};
  for (const [tabName, rows] of Object.entries(components)) {
    const arr = rows as ComponentsRow[];
    const seen = new Set<string>();
    const groups: Array<{ key: string; label: string }> = [];
    for (const row of arr) {
      if (row.type === 'section' && row.qty && !seen.has(row.qty)) {
        seen.add(row.qty);
        groups.push({ key: row.qty, label: row.function || row.qty });
      }
    }
    result[tabName] = groups;
  }
  return result;
}



/* ── Links ──────────────────────────────────── */


function wsLinks(
  ws: Worksheet,
  r: number,
  title: string,
  urls: Array<[label: string, url: string, sd: string]>,
): number {
  if (title) {
    writeCell(ws, r, 1, title, ['overview', 'title']);
    r++;
  }
  for (const [text, _link, sd] of urls) {
    console.log(text,_link,sd);
    const cellLink = ws.getCell(r, 2);
    cellLink.value = {
      text: text,
      hyperlink: _link,
    };
    cellLink.style = { font: { underline: true, color: { argb: 'FF0563C1' } } };

    const cellSd = ws.getCell(r, 3);
    cellSd.value = {
	text: 'SD',
	hyperlink: sd,
    };
    cellSd.style = { font: { underline: true, color: { argb: 'FF0563C1' } } };
    r++;
  }
  return r;
}

/* ── ESA section  ──────────────────── */

function wsEsaSection(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): number {
  const month_row = Number(myMap['month_row']);
  const year_row = Number(myMap['year_row']);
  const totalRow = Number(myMap['total_row']);
  const formula = resolveFormula('{ESA_UPLIFT}',refMap);

  /* ── Section headers ────────────────────────── */
  wsHeading(ws, r, 'Enterprise Support Agreement',2, 5+YEAR_MAX);
  r++;

  // ── Uplift row ────────────────────────────
  const upliftRow = r;
  writeCell(ws, r,2, 'Uplift');
  for (let y=1; y <= YEAR_MAX; y++) {
    writeCell(ws,r,y+3,
	resolveFormula(
	    `=IF({ESA_ENABLED}="Y",${formula},0)`,
	    {
		...refMap,
		revenue: rowcolToCell(totalRow, y+YEAR_MAX+RS_ADJ+1),
	    }),
	['overview','table','percent_c']);
  }
  r++;

  const fixed_row = r;
  writeCell(ws, r, 2, 'Fixed Charge');
  for (let y = 1; y <= YEAR_MAX ; y++) {
    let c = y+3;
    writeCell(ws,r,c,
	resolveFormula([
	  '={ESA_FIXED_PRICE}*{months}*',
	  '(1+{INFLATION})^({year_this}-{start_year})'
	].join(''),
	{
	  ...refMap, ...myMap,
	  months: rowcolToCell(month_row, c,true,false),
	  year_this: rowcolToCell(year_row, c,true,false),
	}),['overview','table','euro']);

  }
  writeCell(
      ws,r,YEAR_MAX+5,
      resolveFormula(
	  '=SUM({left}:{right})',
	  { left: rowcolToCell(r,4), right: rowcolToCell(r,YEAR_MAX+3) },
      ),
      ['overview','table','euro']
  );
  r++;

  const variable_row = r;
  writeCell(ws, r, 2, 'Variable Charge');
  for (let y = 1; y <= YEAR_MAX ; y++) {
    let c = y+3;
    writeCell(ws,r,c,
	resolveFormula('={uplift}*{subtot}',{
	  ...refMap, ...myMap,
	  uplift: rowcolToCell(upliftRow, c),
	  subtot: rowcolToCell(totalRow, c),
	}),['overview','table','euro']);
  }
  writeCell(
      ws,r,YEAR_MAX+5,
      resolveFormula(
	  '=SUM({left}:{right})',
	  { left: rowcolToCell(r,4), right: rowcolToCell(r,YEAR_MAX+3) },
      ),
      ['overview','table','euro']
  );
  r++;

  writeCell(ws, r, 2, 'Total ESA');
  for (let y = 1; y <= YEAR_MAX ; y++) {
    let c = y+3;
    writeCell(ws,r,c,
	resolveFormula('={variable}+{fixed}',{
	  ...refMap, ...myMap,
	  variable: rowcolToCell(variable_row, c),
	  fixed: rowcolToCell(fixed_row, c),
	}),['overview','table','euro']);
  }
  writeCell(
      ws,r,YEAR_MAX+5,
      resolveFormula(
	  '=SUM({left}:{right})',
	  { left: rowcolToCell(r,4), right: rowcolToCell(r,YEAR_MAX+3) },
      ),
      ['overview','table','euro']
  );
  r++;


  // ── ESA links ──────────────────────────────
  r = wsLinks(ws, r, '', ESA_URLS);
  r++;

  return r;
}
/* ── year / month helpers ───────────────────── */

function currentProjection(): { year: string; months: number } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1‑based
  if (m > 9) {
    return { year: String(y + 1), months: 12 };
  }
  return { year: String(y), months: 12 - m };
}


/** Section header with magenta background. */
function wsHeading(
  ws: Worksheet,
  r: number,
  label: string,
  leftCol: number,
  rightCol: number,
): void {
  writeCell(ws, r, leftCol, label, ['overview', 'heading']);
  for (let c = leftCol+1; c <= rightCol; c++) {
    writeCell(ws, r, c, null, ['overview', 'heading']);
  }
}

function wsOVYheading(
  ws: Worksheet,
  r: number,
  year: string,
  months: number,
  myMap: Record<string, string>,
): number {
  /* ── Title ──────────────────────────────────── */
  writeCell(ws, r, 1, 'Yearly Overview', ['overview', 'title']);
  r++;
  /* ── Section headers ────────────────────────── */
  wsHeading(ws, r, 'Yearly Prices',2, 5+YEAR_MAX);

  r++;r++;

  writeCell(ws, r, 2, 'Year');
  writeCell(ws, r, 4, year, ['overview','table','center']);
  let y = 5;
  while (y < 4+YEAR_MAX) {
    writeCell(ws, r, y,
	      resolveFormula('={left}+1',{ left: rowcolToCell(r, y-1) }),
	      ['overview','table','center'],
	      );
    y++;
  }
  writeCell(ws, r, y+1, 'Total', ['overview','table','center']);
  def(myMap,'year_row', String(r));
  def(myMap,'start_year', rowcolToCell(r,4,true,true));

  r++;
  def(myMap,'month_row', String(r));
  writeCell(ws,r,2, 'Months');
  writeCell(ws,r,4, months, ['overview','table','center']);
  y = 5;
  while (y < YEAR_MAX+4) {
    writeCell(ws,r,y,12,['overview','table','center']);
    y++;
  }
  def(myMap,'y1_months', rowcolToCell(r,4,true,true));
  writeCell(
      ws,r,y+1,
      resolveFormula(
	  '=SUM({left}:{right})',
	  { left: rowcolToCell(r,4), right: rowcolToCell(r,YEAR_MAX+3) },
      ),
      ['overview','table','center']
  );

  r++
  def(myMap,'rampup_row', String(r));
  writeCell(ws,r,2, 'Ram-up');
  y = 4;
  while (y < YEAR_MAX+4) {
    writeCell(ws,r,y,1,['overview','table','percent_c']);
    y++;
  }

  r++;r++;

  wsHeading(ws, r, 'Per-Group Prices',2, 5+YEAR_MAX);

  r++;r++;

  return r;
}

function wsYearlyGroup(
  ws: Worksheet,
  r: number,
  label: string,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  const left = YEAR_MAX+ RS_ADJ;
  const month_row = Number(myMap['month_row']);
  const year_row = Number(myMap['year_row']);
  const rampup_row = Number(myMap['rampup_row']);

  writeCell(ws, r, 2, label);

  for (let y = 1; y <= YEAR_MAX ; y++) {
    let c = y+3;
    let formula = resolveFormula([ '=',
		'IF({start_year}={year},',
		    // Calculation for Year 1 (includes setup)
                    '{setup}+{monthly}*{m}*{r},',
                    // Calculation for Year 1+N (handles partial first year)
                    'IF({y1_months}>{m},',
                      // next year months is less than first month, use previous year pricing only
                      '{m}*{monthly_n1}*{r},',
		      // mix the prev year with this year
                      '({m}-{y1_months})*{monthly_n1}*{r}+',
                      '({y1_months})*{monthly}*{r}',
                    ')',
                  ')',
	      ].join(''),
	      {
		...refMap, ...myMap,
		year: rowcolToCell(year_row, c, true, false),
		setup: rowcolToCell(r, left+1),
		monthly: rowcolToCell(r, left+y+1),
		m: rowcolToCell(month_row, c, true, false),
		r: rowcolToCell(rampup_row, c, true, false),
		monthly_n1: rowcolToCell(r, left+y),
		m_n1: rowcolToCell(month_row, c-1, true, false),
	      },
    );
    writeCell(ws,r,c,formula,['overview','table','euro']);
  }
  writeCell(
      ws,r, YEAR_MAX+5,
      resolveFormula(
	  '=SUM({left}:{right})',
	  { left: rowcolToCell(r,4), right: rowcolToCell(r,YEAR_MAX+3) },
      ),
      ['overview','table','euro']
  );

}

function wsOVYfooter(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  const top_row = Number(myMap['top_row']);
  const bottom_row = Number(myMap['bottom_row']);

  writeCell(ws, r, 2, 'Totals');
  for (let y = 1; y <= YEAR_MAX ; y++) {
    let c = y+3;
    writeCell(ws,r,c,
	  resolveFormula('=SUM({start}:{end})', {
	      ...refMap, ...myMap,
	      start: rowcolToCell(top_row,c),
	      end: rowcolToCell(bottom_row,c),
	  }), ['overview','table','euro']);
  }
  writeCell(
      ws,r, YEAR_MAX+5,
      resolveFormula(
	  '=SUM({left}:{right})',
	  { left: rowcolToCell(r,4), right: rowcolToCell(r,YEAR_MAX+3) },
      ),
      ['overview','table','euro']
  );

}

function wsOVMheading(
  ws: Worksheet,
  r: number,
  tabs: string[],
  // @ts-expect-error - myMap
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): number {
  const left = YEAR_MAX+ RS_ADJ;
  r++;
  /* ── Section headers ────────────────────────── */
  wsHeading(ws, r, 'Monthly Prices',left, left+1+YEAR_MAX);

  r++;r++;

  writeCell(ws, r, left, 'groups', ['overview','table','center']);
  writeCell(ws, r, left+1, 'set-up', ['overview','table','center']);
  if (tabs.length > 0) {
    const n0 = tabs[0];
    for (let y=1; y <= YEAR_MAX; y++) {
      writeCell(
	  ws,r,left+1+y,
	  resolveFormula(
	      `=TEXT({${n0}!YEAR_${y}}{${n0}!YEAR_ROW},"@")`,
	      refMap
	  ),
	  ['overview','table','center'],
      );
    }
  }

  r++;
  writeCell(ws, r, left, 'total tabs', ['overview','table','center']);
  if (tabs.length > 0) {
    let sum : string[];
    sum = [];
    for (const n of tabs) {
      sum.push(`{${sheetRef(n)}!TOTAL_SETUP}`);
    }
    writeCell(ws, r, left+1,
	resolveFormula(
	    `=SUM(${sum.join(",")})`,
	    refMap
	), ['overview','table','amt']);
    sum = [];
    for (const n of tabs) {
      sum.push(`{${sheetRef(n)}!TOTAL_MONTHLY}`);
    }
    writeCell(ws, r, left+2,
	resolveFormula(
	    `=SUM(${sum.join(",")})`,
	    refMap
	), ['overview','table','amt']);
  }

  r++;
  writeCell(ws, r, left, 'total overview', ['overview','table','center']);
  writeCell(ws, r, left+1,
	    resolveFormula(
		'=SUMIFS({col_setup}:{col_setup},{col_title}:{col_title},"<>total*")',
		{ col_setup: colToName(left+1), col_title: colToName(left) },
	    ),  ['overview','table','amt']);
  writeCell(ws, r, left+2,
	    resolveFormula(
		'=SUMIFS({col_mrc}:{col_mrc},{col_title}:{col_title},"<>total*")',
		{ col_mrc: colToName(left+2), col_title: colToName(left) },
	    ),  ['overview','table','amt']);

  r++;
  writeCell(ws, r, left, 'total diff', ['overview','table','center']);
  writeCell(ws, r, left+1,
	    resolveFormula(
		'={tabs}-{calc}',
		{ tabs: rowcolToCell(r-2,left+1), calc: rowcolToCell(r-1,left+1) },
	    ),  ['overview','table','amt']);
  writeCell(ws, r, left+2,
	    resolveFormula(
		'={tabs}-{calc}',
		{ tabs: rowcolToCell(r-2,left+2), calc: rowcolToCell(r-1,left+2) },
	    ),  ['overview','table','amt']);

  r++;

  wsHeading(ws, r, 'Monthly Group Prices',left, left+1+YEAR_MAX);

  r++;r++;

  return r;
}

function wsMonthlyGroup(
  ws: Worksheet,
  r: number,
  tab: string,
  key: string,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  const left = YEAR_MAX+ RS_ADJ;

  writeCell(ws, r, left, key , ['overview','table','center']);
  def(myMap,'grpcell', rowcolToCell(r,left,false,true));
  writeCell(ws, r, left+1,
	    resolveFormula([
		`=SUMIFS({${tab}!!SETUP},`,
		 `{${tab}!!f_qty},"<>Total*",`,
		 `{${tab}!!f_grouping},"="&{grpcell}`,
		')'].join(''),
		{ ...refMap, ...myMap }
	    ),  ['overview','table','amt']);
  for (let y = 1; y <= YEAR_MAX ; y++) {
    writeCell(ws, r, left+y+1,
	    resolveFormula([
		`=SUMIFS({${tab}!!YEAR_${y}},`,
		 `{${tab}!!f_qty},"<>Total*",`,
		 `{${tab}!!f_grouping},"="&{grpcell}`,
		')'].join(''),
		{ ...refMap, ...myMap }
	    ),  ['overview','table','amt']);
  }
}

function wsOVMfooter(
  ws: Worksheet,
  r: number,
  myMap: Record<string, string>,
  refMap: Record<string, string>,
): void {
  const left = YEAR_MAX+ RS_ADJ;
  const top_row = Number(myMap['top_row']);
  const bottom_row = Number(myMap['bottom_row']);

  writeCell(ws, r, left, 'total' , ['overview','table','center']);

  for (let y = 0; y <= YEAR_MAX ; y++) {
    let c = left+y+1;
    writeCell(ws,r,c,
	  resolveFormula('=SUM({start}:{end})', {
	      ...refMap, ...myMap,
	      start: rowcolToCell(top_row,c),
	      end: rowcolToCell(bottom_row,c),
	  }), ['overview','table','amt']);
  }
}

/* ── Main generator ────────────────────────── */

export function genOverviewSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  components: Record<string, unknown>,
  enableEsa: boolean = true,
): void {
  const { year, months } = currentProjection();
  const tabs = Object.keys(components);
  const myMap : Record<string, string> = {};
  //~ const groups = extractGroups(components);

  /* ── Column widths ───────────────────────── */
  setColumnWidth(ws, 1, 2);
  setColumnWidth(ws, 2, 10);
  setColumnWidth(ws, 3, 10);
  for (let c = 4; c < 4+YEAR_MAX; c++) {
    setColumnWidth(ws, c, 14);
  }
  setColumnWidth(ws, 4+ YEAR_MAX, 2);
  setColumnWidth(ws, 5+ YEAR_MAX, 14);

  setColumnWidth(ws, 7+ YEAR_MAX, 18);

  let r = Math.max(
      wsOVYheading(ws,1,year,months,myMap),
      wsOVMheading(ws,1,tabs,myMap,refMap),
  );

  def(myMap,'top_row', String(r));

  for (const [tn, groups] of Object.entries(extractGroups(components))) {
    if (tabs.length > 1) {
      wsHeading(ws, r, tn,2, 5+YEAR_MAX);
      r++;
    }
    for (const {key,label} of groups) {
      wsYearlyGroup(ws,r,label,myMap, refMap);
      wsMonthlyGroup(ws,r,tn,key,myMap, refMap);
      r++;
    }
  }
  def(myMap,'bottom_row', String(r));
  r++;
  def(myMap,'total_row', String(r));
  wsOVYfooter(ws, r, myMap, refMap);
  wsOVMfooter(ws, r, myMap, refMap);
  r++;r++;

  r = wsLinks(ws, r, 'Links for more information', INFO_URLS);
  r++;

  /* ── ESA section ────────────────────────────── */
  let esaStartRow = 0;
  if (enableEsa) {
    esaStartRow  =r;
    r++;
    r = wsEsaSection(ws, r, myMap, refMap);
    r++;
  }

  /* ── Collapse right‑side per‑group year columns ── */
  groupColumns(ws, YEAR_MAX+ RS_ADJ, YEAR_MAX+ RS_ADJ+YEAR_MAX+2, {
      outlineLevel: 1,
      //~ hidden: true,
  });
  // Hide ESA section behind a row group
  if (esaStartRow) {
    groupRows(ws, esaStartRow, r, {
      outlineLevel: 1,
      hidden: true,
    });
  }


  //~ console.log('r',r);
  //~ console.log('myMap',myMap);
  //~ console.log('refMap',refMap);


}
