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
 * - hidden count cells (H9, N4:N8) drive the padding and the
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

/** Pre-selected description (falls back to `(all)` if not present). */
const DEFAULT_DESCRIPTION = 'Virtuelle Maschine';

/* ── Function names ─────────────────────────────────────────
 * OOXML requires the `_xlfn.` prefixes; FILTER/SORT additionally use
 * the `_xlws.` worksheet namespace, UNIQUE is plain `_xlfn.UNIQUE`.
 * Excel displays the clean names.
 */
const XL_FILTER = '_xlfn._xlws.FILTER';
const XL_SORT = '_xlfn._xlws.SORT';
const XL_UNIQUE = '_xlfn.UNIQUE';
const XL_VSTACK = '_xlfn.VSTACK';
const XL_CHOOSECOLS = '_xlfn.CHOOSECOLS';

/* ── Finder sheet coordinates (1-based) ─────────────────── */
const TITLE_COL = 2;                    // Prices B: _XlTitle_ (no header cell)

const LEFT = 1;                         // column A: thin empty spacer
const COL_LABEL = LEFT + 1;             // B: row labels + results Description
const COL_INPUT = LEFT + 2;             // C: dropdowns
const COL_SIDE = LEFT + 3;              // D: vCpu/RAM/osUnit/Region labels
const COL_OPTD = LEFT + 4;              // E: min/max labels + dropdowns
const COL_MIN = LEFT + 5;               // F: min input
const COL_MAXL = LEFT + 6;              // G: max label
const COL_MAX = LEFT + 7;               // H: max input

const ROW_FAMILY = 3;
const ROW_DESC = 4;
const ROW_PRODUCT_ID = 5;
const ROW_STORAGE = 6;
const ROW_SERVICE = 7;

const ROW_RESULTS_TITLE = 9;
const ROW_RESULTS_HEADER = 10;
const ROW_RESULTS = 11;

const HELP_ROW = 4;                     // helper array formulas live in row 4
const HELP_COLS = [10, 11, 12, 13, 14]; // J..N: helper list arrays
const COUNT_COL = 15;                   // O: hidden count cells
const BLANK_COL = 16;                   // P: hidden blank-flag cells
const MATCH_COUNT_CELL = '$O$3';        // total matches (drives the pad)

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
  pricingRaw: unknown,
): void {
  const prices = pricingRaw as PricesPayload;
  // Exit early if we don't have any records!
  if (!prices.records) throw new Error('Missing price data');

  const layout = pricesLayout(prices);
  const { colmap, firstRow, lastRow, lastCol } = layout;

  const x: Record<string, number> = {};
  for (let i = 0; i < prices.keys.length; i++) {
    x[prices.keys[i]] = i;
  }

  /* ── Build-time dropdown lists ─────────────────────── */
  // records is row-oriented: records[rowIdx][colIdx]
  const families = distinctSorted(prices.records.map(r => r[x.productFamily]));
  const family = families.includes(DEFAULT_FAMILY) ? DEFAULT_FAMILY : (families[0] ?? '');
  const regions = [ALL, ...distinctSorted(prices.records.map(r => r[x.region]))];

  /* ── Default filter state (pre-selected values) ───── */
  const familyRows = prices.records.filter(r => String(r[x.productFamily]) === family);
  const descOptions = distinctSorted(familyRows.map(r => r[x.description]));
  const descDefault = descOptions.includes(DEFAULT_DESCRIPTION) ? DEFAULT_DESCRIPTION : ALL;

  /* ── Maximum output sizes (fixed array refs) ──────── */
  // description lists are family-scoped; the other four are scoped to
  // family+description.
  const helperMax = (key: string, descScoped: boolean): number => {
    let max = 0;
    const groups = new Map<string, Set<string>>();
    for (const r of prices.records) {
      const fam = String(r[x.productFamily]);
      const grp = descScoped ? `${fam}|${String(r[x.description])}` : fam;
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
  const array = `${colToName(TITLE_COL, true, PRICES_SHEET)}$${firstRow}:${colToName(lastCol, true, PRICES_SHEET)}$${lastRow}`;

  // Parens around the family condition: Excel's comparison operators
  // bind looser than `*`, so an unparenthesised `a=b*c` parses as
  // `a=(b*c)`.
  const familyCond = `(${data('productFamily')}=${cellRef(ROW_FAMILY, COL_INPUT)})`;
  // Optional-equality criterion for a dropdown filter: "(all)" passes
  // everything, "(blank)" matches empty cells, otherwise exact match.
  const optEq = (key: string, cell: string): string =>
    `((${cell}="${ALL}")+(${cell}="${BLANK}")*(${data(key)}="")+(${data(key)}=${cell}))`;
  const descCond = optEq('description', cellRef(ROW_DESC, COL_INPUT));

  const criteria = [
    familyCond,
    descCond,
    optEq('productId', cellRef(ROW_PRODUCT_ID, COL_INPUT)),
    optEq('osUnit', cellRef(ROW_PRODUCT_ID, COL_OPTD)),
    optEq('storageType', cellRef(ROW_STORAGE, COL_INPUT)),
    optEq('serviceType', cellRef(ROW_SERVICE, COL_INPUT)),
    `((${cellRef(ROW_STORAGE, COL_OPTD)}="${ALL}")+(${data('region')}=${cellRef(ROW_STORAGE, COL_OPTD)}))`,
    `((${cellRef(ROW_FAMILY, COL_MIN)}="")+(${data('vCpu')}>=${cellRef(ROW_FAMILY, COL_MIN)}))`,
    `((${cellRef(ROW_FAMILY, COL_MAX)}="")+(${data('vCpu')}<=${cellRef(ROW_FAMILY, COL_MAX)}))`,
    `((${cellRef(ROW_DESC, COL_MIN)}="")+(${data('ram')}>=${cellRef(ROW_DESC, COL_MIN)}))`,
    `((${cellRef(ROW_DESC, COL_MAX)}="")+(${data('ram')}<=${cellRef(ROW_DESC, COL_MAX)}))`,
  ].join('*');

  /* ── Title ─────────────────────────────────────────── */
  writeCell(ws, 1, COL_LABEL, 'Price Finder', ['finder', 'title']);

  /* ── Column widths ─────────────────────────────────── */
  const widths: Record<number, number> = {
    [LEFT]: 3,      // A: thin empty spacer
    [COL_LABEL]: 50,   // B: labels + results Description
    [COL_INPUT]: 24,   // C: dropdowns
    [COL_SIDE]: 10,    // D: vCpu / RAM / osUnit labels
    [COL_OPTD]: 14,    // E: min / max / dropdowns
    [COL_MIN]: 8,      // F: min input
    [COL_MAXL]: 8,     // G: max label
    [COL_MAX]: 8,      // H: max input
    9: 10,             // I: separator before helper columns
  };
  for (const [c, w] of Object.entries(widths)) {
    setColumnWidth(ws, Number(c), w);
  }

  /* ── Filter grid ───────────────────────────────────── */
  const labels: Array<[row: number, col: number, text: string]> = [
    [ROW_FAMILY, COL_LABEL, 'Product Family'],
    [ROW_DESC, COL_LABEL, 'Description'],
    [ROW_PRODUCT_ID, COL_LABEL, 'productId'],
    [ROW_STORAGE, COL_LABEL, 'storageType'],
    [ROW_SERVICE, COL_LABEL, 'serviceType'],
    [ROW_FAMILY, COL_SIDE, 'vCpu'],
    [ROW_FAMILY, COL_OPTD, 'min'],
    [ROW_FAMILY, COL_MAXL, 'max'],
    [ROW_DESC, COL_SIDE, 'RAM'],
    [ROW_DESC, COL_OPTD, 'min'],
    [ROW_DESC, COL_MAXL, 'max'],
    [ROW_PRODUCT_ID, COL_SIDE, 'osUnit'],
    [ROW_STORAGE, COL_SIDE, 'Region'],
  ];
  for (const [r, c, text] of labels) {
    writeCell(ws, r, c, text, ['finder', 'label']);
  }

  // Dynamic dropdowns: fixed-size helper arrays in columns J..N, one
  // per filter.  The description list is restricted to the selected
  // family only; the other four are restricted to family AND
  // description.  The columns are left VISIBLE for now so the dropdown
  // sources can be inspected; to hide them, set
  // `ws.getColumn(10..14).hidden = true` again.
  const helpers: Array<[key: string, col: number, input: [number, number], label: string]> = [
    ['description', HELP_COLS[0], [ROW_DESC, COL_INPUT], 'description list → C4'],
    ['productId', HELP_COLS[1], [ROW_PRODUCT_ID, COL_INPUT], 'productId list → C5'],
    ['osUnit', HELP_COLS[2], [ROW_PRODUCT_ID, COL_OPTD], 'osUnit list → E5'],
    ['storageType', HELP_COLS[3], [ROW_STORAGE, COL_INPUT], 'storageType list → C6'],
    ['serviceType', HELP_COLS[4], [ROW_SERVICE, COL_INPUT], 'serviceType list → C7'],
  ];
  helpers.forEach(([key, hcol, [row, col], label], i) => {
    writeCell(ws, HELP_ROW - 1, hcol, label, ['finder', 'label']);

    const isDesc = key === 'description';
    const cond = isDesc ? familyCond : `${familyCond}*${descCond}`;
    const size = helperMax(key, !isDesc) + 1; // + the "(blank)" slot

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

    writeCell(ws, row, col, isDesc ? descDefault : ALL, ['finder', 'input']);
    // Plain-range DV source: data-validation lists skip blank cells,
    // so the array's "" padding never appears in the dropdown.
    dataValidationList(
      ws, row, col,
      `${colToName(hcol, true)}${HELP_ROW}:${colToName(hcol, true)}${HELP_ROW + size - 1}`,
    );
  });

  // productFamily: static list, always applied (no sentinel)
  writeCell(ws, ROW_FAMILY, COL_INPUT, family, ['finder', 'input']);
  dataValidationList(ws, ROW_FAMILY, COL_INPUT, families, false);

  // Region: static list, independent of the other filters
  writeCell(ws, ROW_STORAGE, COL_OPTD, ALL, ['finder', 'input']);
  dataValidationList(ws, ROW_STORAGE, COL_OPTD, regions);

  // vCpu / RAM min/max inputs (empty = no bound)
  for (const [row, col] of [[ROW_FAMILY, COL_MIN], [ROW_FAMILY, COL_MAX], [ROW_DESC, COL_MIN], [ROW_DESC, COL_MAX]] as Array<[number, number]>) {
    writeCell(ws, row, col, null, ['finder', 'input']);
  }

  /* ── Results block ─────────────────────────────────── */
  // Fixed-size arrays spanning the whole record count; rows beyond the
  // current matches are padded with "".  O3 holds the numeric match
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

  const headers = ['Description', 'vCpu', 'RAM', 'priceAmount', 'R12', 'R24', 'R36'];
  headers.forEach((h, i) => {
    writeCell(ws, ROW_RESULTS_HEADER, COL_LABEL + i, h, ['finder', 'header']);
  });

  // One array formula per output column.  The FILTER array starts at
  // column B, so a key's position inside it is its column minus one.
  const results: Array<[key: string, fmt: string]> = [
    ['_XlTitle_', 'text'],
    ['vCpu', 'num'],
    ['ram', 'num'],
    ['priceAmount', 'price_sm'],
    ['R12', 'price_lg'],
    ['R24', 'price_lg'],
    ['R36', 'price_lg'],
  ];
  results.forEach(([key, fmtKey], i) => {
    const idx = key === '_XlTitle_' ? 1 : colmap[key] - 1;
    const col = COL_LABEL + i;
    // Sort the filtered rows by priceAmount (position within the B..AK
    // array), ascending — cheapest first.
    const sorted = `${XL_SORT}(${XL_FILTER}(${array},${criteria}),${colmap['priceAmount'] - 1})`;
    writeArrayCell(
      ws, ROW_RESULTS, col,
      `IFERROR(${XL_CHOOSECOLS}(${XL_VSTACK}(${sorted},${padExpr(`${maxRows}-${MATCH_COUNT_CELL}`)}),${idx}),"")`,
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
