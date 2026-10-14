/**
 * Finder sheet generator.
 *
 * A static, formula-driven filter UI over the Prices sheet (no VBA).
 *
 * Every Prices column letter in the formulas is computed at generation
 * time via `pricesLayout` — never hard-coded — so schema changes in the
 * upstream pricing JSON flow through automatically.
 *
 * Compatibility notes (empirically verified in the target Excel, which
 * loads generated dynamic-array formulas as legacy):
 * - all finder formulas are stored as array formulas (`t="array"`)
 *   whose ref spans the MAXIMUM possible output; each formula pads its
 *   result with empty strings up to the fixed size, so unused slots
 *   show blank instead of #N/A.  Filter changes re-fill the fixed
 *   block — no spill machinery required, no `@` operators inserted,
 *   works in every Excel version;
 * - function names use the `_xlfn.` spellings the file format
 *   requires (plain names get repaired out of the file);
 * - dropdown validations reference the helper blocks as plain ranges
 *   (DV lists skip blank cells, so padding rows stay out of the
 *   dropdowns);
 * - hidden count cells (S3, S4:S8) drive the padding and the
 *   "Results (n matches)" line;
 * - the workbook is stamped with current engine markers
 *   (`calcId=191029`, `rupBuild=30228`, calcFeatures, per-sheet
 *   dynamicArrayProperties) by `modernizeWorkbookMetadata()`.
 */

import type { Worksheet } from 'exceljs';
import JSZip from 'jszip';

import {
  colToName,
  dataValidationList,
  resolveFormula,
  rowcolToCell,
  setColumnWidth,
  writeCell,
} from './xlu';
import { applyStyle, fmt } from './formats';
import { pricesLayout } from './prices';
import type { PricesPayload } from './prices';

/** Name of the generated finder sheet (visible; deleted by TrimWB). */
export const FINDER_SHEET_NAME = 'Finder';

/** Prices sheet referenced by all finder formulas. */
const PRICES_SHEET = 'Prices';

/** Uniform sentinel for every "any value" dropdown entry. */
const ALL = '(all)';

/** Sentinel for filtering records whose value is blank. */
const BLANK = '(blank)';

/** productFamily is always applied; this value is pre-selected. */
const DEFAULT_FAMILY = 'Compute';

/** Pre-selected Description filter value. */
const DEFAULT_DESCRIPTION = 'Virtuelle Maschine';

/* ── Function names ─────────────────────────────────────────
 * OOXML requires the `_xlfn.` prefixes; FILTER/SORT additionally use
 * the `_xlws.` worksheet namespace, UNIQUE is plain `_xlfn.UNIQUE`.
 * Excel displays the clean names.
 */
const XL_FILTER = '_xlfn._xlws.FILTER';
const XL_SORT = '_xlfn._xlws.SORT';
const XL_SORTBY = '_xlfn.SORTBY';
const XL_UNIQUE = '_xlfn.UNIQUE';
const XL_VSTACK = '_xlfn.VSTACK';

/* ── Finder sheet coordinates (1-based) ─────────────────── */
const TITLE_COL = 2;                    // Prices B: _XlTitle_ (no header cell)

const LEFT = 1;                         // column A: thin empty spacer
const COL_LABEL = LEFT + 1;             // B: row labels + results Description
const COL_DROP = LEFT + 2;              // C: left dropdowns (merged C..F)
const COL_DROP_END = LEFT + 5;          // F: last column of the merge
const COL_SIDE = LEFT + 6;              // G: vCpu/RAM/Description labels
const COL_MINL = LEFT + 7;              // H: "min" label
const COL_MIN = LEFT + 8;               // I: min input
const COL_MAXL = LEFT + 9;              // J: "max" label
const COL_MAX = LEFT + 10;              // K: max input (mirrors min)

const ROW_FAMILY = 3;
const ROW_REGION = 4;                   // Region filter + RAM min/max
const ROW_PRODUCT_ID = 5;
const ROW_STORAGE = 6;                  // storageType filter + Description
const ROW_SERVICE = 7;
const ROW_OSUNIT = 8;                   // last left-side dropdown

const ROW_RESULTS_TITLE = 9;
const ROW_RESULTS_HEADER = 10;
const ROW_RESULTS = 11;

const HELP_ROW = 4;                     // helper array formulas live in row 4
const HELP_COLS = [14, 15, 16, 17, 18]; // N..R: helper list arrays
const COUNT_COL = 19;                   // S: hidden count cells
const BLANK_COL = 20;                   // T: hidden blank-flag cells
const MATCH_COUNT_CELL = '$S$3';        // total matches (drives the pad)

const RESULTS_ROW_COL = 12;             // L: shared match-row index column

/* ── Helpers ────────────────────────────────────────────── */

/** Distinct, naturally sorted values of a build-time column. */
function distinctSorted(values: unknown[]): string[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...new Set(values.map(v => String(v)).filter(v => v !== ''))].sort(collator.compare);
}

/** Absolute Prices column range, e.g. `Prices!$V$4:$V$5366`. */
function colRange(col: number, firstRow: number, lastRow: number): string {
  const letter = colToName(col, true, PRICES_SHEET);
  return `${letter}$${firstRow}:${letter}$${lastRow}`;
}

/** Absolute cell reference on the finder sheet, e.g. `$B$3`. */
function cellRef(r: number, c: number): string {
  return rowcolToCell(r, c, true, true);
}

/** Range of a fixed-size array formula, e.g. `I4:I131`. */
function arrayRef(row: number, col: number, count: number): string {
  const letter = colToName(col);
  return `${letter}${row}:${letter}${row + count - 1}`;
}

/**
 * Write an array formula (`t="array"`) whose ref spans the maximum
 * possible output.  ExcelJS's types predate `shareType`, hence the
 * cast.
 */
function writeArrayCell(
  ws: Worksheet,
  r: number,
  c: number,
  formula: string,
  ref: string,
  style?: readonly [section: string, key: string, variant?: string],
): void {
  const cell = ws.getCell(r, c);
  if (style !== undefined) {
    applyStyle(cell, fmt(...style));
  }
  cell.value = {
    formula,
    shareType: 'array',
    ref,
  } as unknown as import('exceljs').CellValue;
}

/** `""` repeated `pad` times — a legacy-safe empty-array expression. */
function padExpr(pad: string): string {
  return `IF(ROW(INDEX($A:$A,1):INDEX($A:$A,${pad}))>0,"","")`;
}

/* ── Main generator ─────────────────────────────────────── */

export function genFinderSheet(
  ws: Worksheet,
  refMap: Record<string, string>,
  pricingRaw: unknown,
): void {
  const prices = pricingRaw as PricesPayload;
  // Exit early if we don't have any records!
  if (!prices.records) throw new Error('Missing price data');

  const layout = pricesLayout(prices);
  const { colmap, firstRow, lastRow } = layout;

  const x: Record<string, number> = {};
  for (let i = 0; i < prices.keys.length; i++) {
    x[prices.keys[i]] = i;
  }

  /* ── Build-time dropdown lists ─────────────────────── */
  // records is row-oriented: records[rowIdx][colIdx]
  const families = distinctSorted(prices.records.map(r => r[x.productFamily]));
  const family = families.includes(DEFAULT_FAMILY) ? DEFAULT_FAMILY : (families[0] ?? '');
  const regions = [ALL, ...distinctSorted(prices.records.map(r => r[x.region]))];

  /* ── Maximum output sizes (fixed array refs) ──────── */
  // Upper bound for every helper list: the maximum distinct-value
  // count within a single productFamily.
  const helperMax = (key: string): number => {
    let max = 0;
    const groups = new Map<string, Set<string>>();
    for (const r of prices.records) {
      const grp = String(r[x.productFamily]);
      let set = groups.get(grp);
      if (!set) {
        set = new Set();
        groups.set(grp, set);
      }
      set.add(String(r[x[key]] ?? ''));
    }
    for (const set of groups.values()) {
      max = Math.max(max, set.size);
    }
    return max + 1; // + the "(all)" sentinel
  };

  /* ── Shared formula fragments ──────────────────────── */
  const data = (key: string): string => colRange(colmap[key], firstRow, lastRow);

  // Parens around the family condition: Excel's comparison operators
  // bind looser than `*`, so an unparenthesised `a=b*c` parses as
  // `a=(b*c)`.
  const familyCond = `(${data('productFamily')}=${cellRef(ROW_FAMILY, COL_DROP)})`;
  // Optional-equality criterion for a dropdown filter: blank or
  // "(all)" passes everything, "(blank)" matches empty cells,
  // otherwise exact match.
  const optEq = (key: string, cell: string): string =>
    `((${cell}="")+(${cell}="${ALL}")+(${cell}="${BLANK}")*(${data(key)}="")+(${data(key)}=${cell}))`;
  // Description is a guarded exact-match filter: blank or "(all)"
  // passes everything, otherwise the description must equal the
  // input (case-sensitive — the contains scan was too slow).
  const descCond = `((${cellRef(ROW_STORAGE, COL_MINL)}="")+(${cellRef(ROW_STORAGE, COL_MINL)}="${ALL}")+(${data('description')}=${cellRef(ROW_STORAGE, COL_MINL)}))`;

  // Every criterion EXCEPT description — used by the results together
  // with descCond, and alone as the source scope of the dynamic
  // Description dropdown (so its options reflect the other filters).
  const otherCriteria = [
    familyCond,
    optEq('productId', cellRef(ROW_PRODUCT_ID, COL_DROP)),
    optEq('osUnit', cellRef(ROW_OSUNIT, COL_DROP)),
    optEq('storageType', cellRef(ROW_STORAGE, COL_DROP)),
    optEq('serviceType', cellRef(ROW_SERVICE, COL_DROP)),
    `((${cellRef(ROW_REGION, COL_DROP)}="")+(${cellRef(ROW_REGION, COL_DROP)}="${ALL}")+(${data('region')}=${cellRef(ROW_REGION, COL_DROP)}))`,
    `((${cellRef(ROW_FAMILY, COL_MIN)}="")+(${data('vCpu')}>=${cellRef(ROW_FAMILY, COL_MIN)}))`,
    `((${cellRef(ROW_FAMILY, COL_MAX)}="")+(${data('vCpu')}<=${cellRef(ROW_FAMILY, COL_MAX)}))`,
    `((${cellRef(ROW_REGION, COL_MIN)}="")+(${data('ram')}>=${cellRef(ROW_REGION, COL_MIN)}))`,
    `((${cellRef(ROW_REGION, COL_MAX)}="")+(${data('ram')}<=${cellRef(ROW_REGION, COL_MAX)}))`,
  ].join('*');
  const criteria = `${otherCriteria}*${descCond}`;

  /* ── Title ─────────────────────────────────────────── */
  writeCell(ws, 1, COL_LABEL, 'Price Finder', ['finder', 'title']);

  /* ── Column widths (sized for the RESULTS columns) ── */
  const widths: Record<number, number> = {
    [LEFT]: 3,      // A: thin empty spacer
    [COL_LABEL]: 50,   // B: labels + results Description
    3: 8,              // C: Region results
    4: 8,              // D: vCpu results
    5: 8,              // E: RAM results
    6: 12,             // F: priceAmount results
    [COL_SIDE]: 10,    // G: unit results
    [COL_MINL]: 10,    // H: Monthly results
    [COL_MIN]: 10,     // I: R12 results
    [COL_MAXL]: 10,    // J: R24 results
    [COL_MAX]: 10,      // K: R36 results
    12: 8,             // L: Row results (shared match-row index)
    13: 10,            // M: spacer before the helper lists
  };
  for (const [c, w] of Object.entries(widths)) {
    setColumnWidth(ws, Number(c), w);
  }

  /* ── Filter grid ───────────────────────────────────── */
  const labels: Array<[row: number, col: number, text: string]> = [
    [ROW_FAMILY, COL_LABEL, 'Product Family'],
    [ROW_REGION, COL_LABEL, 'Region'],
    [ROW_PRODUCT_ID, COL_LABEL, 'productId'],
    [ROW_STORAGE, COL_LABEL, 'storageType'],
    [ROW_SERVICE, COL_LABEL, 'serviceType'],
    [ROW_OSUNIT, COL_LABEL, 'osUnit'],
    [ROW_FAMILY, COL_SIDE, 'vCpu'],
    [ROW_FAMILY, COL_MINL, 'min'],
    [ROW_FAMILY, COL_MAXL, 'max'],
    [ROW_REGION, COL_SIDE, 'RAM'],
    [ROW_REGION, COL_MINL, 'min'],
    [ROW_REGION, COL_MAXL, 'max'],
    [ROW_STORAGE, COL_SIDE, 'Description'],
  ];
  for (const [r, c, text] of labels) {
    writeCell(ws, r, c, text, ['finder', 'label']);
  }

  // Dynamic dropdowns: fixed-size helper arrays in columns N..R, one
  // per cascading filter.  The Description list is scoped to ALL the
  // OTHER criteria (family + productId + osUnit + storageType +
  // serviceType + region + vCpu/RAM ranges), so its options reflect
  // the rest of the filter state; the other four are restricted to
  // productFamily only.  The columns are left VISIBLE for now so the
  // dropdown sources can be inspected; to hide them, set
  // `ws.getColumn(14..18).hidden = true` again.
  const helpers: Array<{ key: string; col: number; input: [number, number]; label: string; cond?: string }> = [
    { key: 'description', col: HELP_COLS[0], input: [ROW_STORAGE, COL_MINL], label: 'description list → H6', cond: otherCriteria },
    { key: 'productId', col: HELP_COLS[1], input: [ROW_PRODUCT_ID, COL_DROP], label: 'productId list → C5' },
    { key: 'osUnit', col: HELP_COLS[2], input: [ROW_OSUNIT, COL_DROP], label: 'osUnit list → C8' },
    { key: 'storageType', col: HELP_COLS[3], input: [ROW_STORAGE, COL_DROP], label: 'storageType list → C6' },
    { key: 'serviceType', col: HELP_COLS[4], input: [ROW_SERVICE, COL_DROP], label: 'serviceType list → C7' },
  ];
  helpers.forEach(({ key, col: hcol, input: [row, col], label, cond = familyCond }, i) => {
    writeCell(ws, HELP_ROW - 1, hcol, label, ['finder', 'label']);

    const size = helperMax(key) + 1; // + the "(blank)" slot

    // per-helper count of distinct source values (drives the pad)
    const countCell = cellRef(HELP_ROW + i, COUNT_COL);
    writeArrayCell(
      ws, HELP_ROW + i, COUNT_COL,
      `IFERROR(ROWS(${XL_UNIQUE}(${XL_FILTER}(${data(key)},${cond}))),0)`,
      colToName(COUNT_COL) + (HELP_ROW + i),
    );
    // 1 when the scope has blank values, else 0 — toggles "(blank)"
    const blankCell = cellRef(HELP_ROW + i, BLANK_COL);
    writeArrayCell(
      ws, HELP_ROW + i, BLANK_COL,
      `IF(IFERROR(ROWS(${XL_FILTER}(${data(key)},${cond}*(${data(key)}=""))),0)>0,1,0)`,
      colToName(BLANK_COL) + (HELP_ROW + i),
    );

    // list = "(all)" + sorted unique values + "(blank)" when the scope
    // has blanks.  Blanks stay blanks via the IF(col="","",col) wrap
    // (UNIQUE coerces blank cells to 0).
    const listExpr = `${XL_VSTACK}("${ALL}",${XL_SORT}(${XL_UNIQUE}(${XL_FILTER}(IF(${data(key)}="","",${data(key)}),${cond}))),IF(${blankCell}>0,"${BLANK}",""))`;
    // Pad with "" up to the fixed size so unused slots are blank.
    const paddedList = `${XL_VSTACK}("${ALL}",${XL_SORT}(${XL_UNIQUE}(${XL_FILTER}(IF(${data(key)}="","",${data(key)}),${cond}))),IF(${blankCell}>0,"${BLANK}",""),${padExpr(`${size}-${countCell}-2`)})`;
    const padded = `IF(${countCell}+2>=${size},${listExpr},${paddedList})`;
    writeArrayCell(ws, HELP_ROW, hcol, padded, arrayRef(HELP_ROW, hcol, size));

    writeCell(ws, row, col, key === 'description' ? DEFAULT_DESCRIPTION : ALL, ['finder', 'input']);
    // Plain-range DV source: data-validation lists skip blank cells,
    // so the array's "" padding never appears in the dropdown.
    dataValidationList(
      ws, row, col,
      `${colToName(hcol, true)}${HELP_ROW}:${colToName(hcol, true)}${HELP_ROW + size - 1}`,
    );
    // The dropdown inputs span 4 columns (C..F on the left rows,
    // H..K for Description).  The DV lives on the merged top-left
    // cell; the style is applied to every cell of the merge.
    const endCol = key === 'description' ? COL_MAX : COL_DROP_END;
    ws.mergeCells(row, col, row, endCol);
    for (let c = col + 1; c <= endCol; c++) {
      applyStyle(ws.getCell(row, c), fmt('finder', 'input'));
    }
  });

  // productFamily: static list, always applied (no sentinel)
  writeCell(ws, ROW_FAMILY, COL_DROP, family, ['finder', 'input']);
  dataValidationList(ws, ROW_FAMILY, COL_DROP, families, false);
  ws.mergeCells(ROW_FAMILY, COL_DROP, ROW_FAMILY, COL_DROP_END);
  for (let c = COL_DROP + 1; c <= COL_DROP_END; c++) {
    applyStyle(ws.getCell(ROW_FAMILY, c), fmt('finder', 'input'));
  }

  // Region: static list, independent of the other filters
  writeCell(ws, ROW_REGION, COL_DROP, ALL, ['finder', 'input']);
  dataValidationList(ws, ROW_REGION, COL_DROP, regions);
  ws.mergeCells(ROW_REGION, COL_DROP, ROW_REGION, COL_DROP_END);
  for (let c = COL_DROP + 1; c <= COL_DROP_END; c++) {
    applyStyle(ws.getCell(ROW_REGION, c), fmt('finder', 'input'));
  }

  // vCpu / RAM min/max inputs.  The max cell mirrors the min cell, so
  // typing just a min gives an exact match; typing a max directly
  // overwrites the formula to set a range.
  writeCell(ws, ROW_FAMILY, COL_MIN, null, ['finder', 'input']);
  writeCell(
    ws, ROW_FAMILY, COL_MAX,
    `=IF(${cellRef(ROW_FAMILY, COL_MIN)}="","",${cellRef(ROW_FAMILY, COL_MIN)})`,
    ['finder', 'input'],
  );
  writeCell(ws, ROW_REGION, COL_MIN, null, ['finder', 'input']);
  writeCell(
    ws, ROW_REGION, COL_MAX,
    `=IF(${cellRef(ROW_REGION, COL_MIN)}="","",${cellRef(ROW_REGION, COL_MIN)})`,
    ['finder', 'input'],
  );

  /* ── Results block ─────────────────────────────────── */
  // Fixed-size arrays spanning the whole record count; rows beyond the
  // current matches are padded with "".  R3 holds the numeric match
  // count and B9 renders it as text.
  const maxRows = prices.records.length;
  writeArrayCell(
    ws, 3, COUNT_COL,
    `IFERROR(ROWS(${XL_FILTER}(${colRange(TITLE_COL, firstRow, lastRow)},${criteria})),0)`,
    colToName(COUNT_COL) + 3,
  );
  writeCell(
    ws, ROW_RESULTS_TITLE, COL_LABEL,
    `="Results ("&${MATCH_COUNT_CELL}&" matches)"`,
    ['finder', 'count'],
  );

  const headers = ['Description', 'Region', 'vCpu', 'RAM', 'priceAmount', 'unit', 'Monthly', 'R12', 'R24', 'R36', 'Row'];
  headers.forEach((h, i) => {
    writeCell(ws, ROW_RESULTS_HEADER, COL_LABEL + i, h, ['finder', 'header']);
  });

  // Shared filter (column L): the criteria are resolved ONCE into the
  // matching Prices ROW numbers, sorted cheapest-first by priceAmount.
  // Every visible column below just INDEXes into its own Prices column
  // with those row numbers — no repeated FILTER per column.
  // (`_xlfn.SORTBY` — the plain `_xlfn.` spelling, like `_xlfn.UNIQUE`;
  // LibreOffice does not map the `_xlws.` variant of SORTBY.)
  const rowBlock = `${colToName(RESULTS_ROW_COL, true)}$${ROW_RESULTS}:${colToName(RESULTS_ROW_COL, true)}$${ROW_RESULTS + maxRows - 1}`;
  const sortedRows = `${XL_SORTBY}(${XL_FILTER}(ROW(${colRange(TITLE_COL, firstRow, lastRow)}),${criteria}),${XL_FILTER}(${data('priceAmount')},${criteria}))`;
  writeArrayCell(
    ws, ROW_RESULTS, RESULTS_ROW_COL,
    `IFERROR(${XL_VSTACK}(${sortedRows},${padExpr(`${maxRows}-${MATCH_COUNT_CELL}`)}),"")`,
    arrayRef(ROW_RESULTS, RESULTS_ROW_COL, maxRows),
    ['finder', 'data', 'num'],
  );
  for (let r = ROW_RESULTS + 1; r <= ROW_RESULTS + maxRows - 1; r++) {
    applyStyle(ws.getCell(r, RESULTS_ROW_COL), fmt('finder', 'data', 'num'));
  }

  // Visible results columns: one array INDEX per column.
  // Description is formatted like the BOM tabs' Description column
  // (`itext`: light-grey fill + wrap text).
  const results: Array<[key: string, fmt: string]> = [
    ['_XlTitle_', 'itext'],
    ['region', 'text'],
    ['vCpu', 'num'],
    ['ram', 'num'],
    ['priceAmount', 'price_sm'],
    ['unit', 'text'],
    ['monthly', 'price_lg'],
    ['R12', 'price_lg'],
    ['R24', 'price_lg'],
    ['R36', 'price_lg'],
  ];
  const offset = firstRow - 1; // Prices row number → 1-based column position
  // Hourly-billed rows (unit starts with "h") carry a per-hour price:
  // the Monthly column scales them by FT_HOURS so every row shows a
  // full-time monthly price, comparable with the R12/R24/R36 columns.
  // Non-hourly units are already monthly and pass through unchanged.
  const ftHours = resolveFormula('{FT_HOURS}', refMap);
  const monthlyExpr =
    `IF(LEFT(INDEX(${data('unit')},${rowBlock}-${offset}),1)="h",` +
    `INDEX(${data('priceAmount')},${rowBlock}-${offset})*${ftHours},` +
    `INDEX(${data('priceAmount')},${rowBlock}-${offset}))`;
  results.forEach(([key, fmtKey], i) => {
    const col = COL_LABEL + i;
    const formula = key === 'monthly'
      ? `IFERROR(${monthlyExpr},"")`
      : `IFERROR(INDEX(${
          key === '_XlTitle_'
            ? colRange(TITLE_COL, firstRow, lastRow)
            : data(key)
        },${rowBlock}-${offset}),"")`;
    writeArrayCell(
      ws, ROW_RESULTS, col,
      formula,
      arrayRef(ROW_RESULTS, col, maxRows),
      ['finder', 'data', fmtKey],
    );
    // Style every row of the fixed array — ExcelJS formats only the
    // anchor cell by default.
    for (let r = ROW_RESULTS + 1; r <= ROW_RESULTS + maxRows - 1; r++) {
      applyStyle(ws.getCell(r, col), fmt('finder', 'data', fmtKey));
    }
  });
}

/* ── Excel compatibility patches (ExcelJS limitations) ─────
 *
 * ExcelJS stamps the generated workbook with ancient engine markers
 * (`rupBuild=9303`, `calcId=171027` — Excel 2007/2016-era) and emits
 * no per-sheet dynamic-array flag.  Patch the generated zip to match
 * what a current Excel save produces: `lastEdited=7` /
 * `rupBuild=30228` / `calcId=191029`, the calcFeatures block, and
 * `xda:dynamicArrayProperties` on every worksheet.
 */
export async function modernizeWorkbookMetadata(
  buffer: ArrayBuffer,
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  /* ── workbook.xml: engine markers + calcFeatures ── */
  const wbPart = 'xl/workbook.xml';
  const wb = await zip.file(wbPart)?.async('string');
  if (wb) {
    let out = wb
      .replace(
        /<fileVersion[^>]*\/>/,
        '<fileVersion appName="xl" lastEdited="7" lowestEdited="5" rupBuild="30228"/>',
      )
      .replace(/calcId="\d+"/, 'calcId="191029"');
    if (!out.includes('xcalcf:calcFeatures')) {
      out = out.replace(
        '</workbook>',
        '<extLst><ext uri="{B58B0392-4F1F-4190-BB64-5DF3571DCE5F}" xmlns:xcalcf="http://schemas.microsoft.com/office/spreadsheetml/2018/calcfeatures"><xcalcf:calcFeatures>' +
        '<xcalcf:feature name="microsoft.com:RD"/><xcalcf:feature name="microsoft.com:Single"/>' +
        '<xcalcf:feature name="microsoft.com:FV"/><xcalcf:feature name="microsoft.com:CNMTM"/>' +
        '<xcalcf:feature name="microsoft.com:LET_WF"/><xcalcf:feature name="microsoft.com:LAMBDA_WF"/>' +
        '<xcalcf:feature name="microsoft.com:ARRAYTEXT_WF"/></xcalcf:calcFeatures></ext></extLst>' +
        '</workbook>',
      );
    }
    zip.file(wbPart, out);
  }

  /* ── worksheets: dynamic-array flag ─────────────────── */
  const XDA_EXT =
    '<extLst><ext uri="{954F100B-0A67-4677-8C40-BB1E43ACF239}" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">' +
    '<xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst>';
  const sheetParts = Object.keys(zip.files).filter(n =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(n),
  );
  for (const part of sheetParts) {
    const xml = await zip.file(part)?.async('string');
    if (!xml || xml.includes('xda:dynamicArrayProperties')) continue;
    zip.file(part, xml.replace('</worksheet>', `${XDA_EXT}</worksheet>`));
  }

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
