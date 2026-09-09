/**
 * Format (style) definitions for generated Excel sheets.
 *
 * Ported from `xlpricer/xlfmt.py`, adapted to a Telekom‑Magenta theme
 * (magenta = #E20074 instead of #0000FF) and to ExcelJS’s per‑cell style
 * model (no workbook‑level named styles).
 *
 * Each exported constant is a plain object whose keys are recognised by
 * {@link applyStyle}.  Import the one you need and pass it to
 * `applyStyle(cell, FMT_XXX)`.
 *
 */

import type { Cell } from 'exceljs';

/* ── Telekom Magenta palette ───────────────── */

const MAGENTA = 'E20074';
const GREEN = '89f572';
const RED = 'FF0000';
const BLUE = '0000FF';
const GREY = '808080';
const LIGHT_GREY = 'C0C0C0';
const LIGHT_BLUE = 'ADD8E6'

/** Convert a 6‑hex‑digit colour to an ExcelJS argb object. */
function argb(hex: string): { argb: string } {
  return { argb: 'FF' + hex };
}

/* ── Internal helpers ──────────────────────── */

export interface StyleDef {
  font?: Partial<{
    bold: boolean;
    size: number;
    color: { argb: string };
  }>;
  fill?: string;
  border?: string;
  numFmt?: string;
  alignment?: Partial<{
    horizontal: 'left' | 'center' | 'right';
    vertical: 'top' | 'middle' | 'bottom';
    wrapText: boolean;
  }>;
}


/* Common styles */
const FMT_TITLE: StyleDef = {
  font: { bold: true, size: 16, color: argb(MAGENTA) },
};
const FMT_SUBTITLE: StyleDef = {
  font: { bold: true, size: 16, color: argb(RED) },
};

const FMT_HDR: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
  alignment: { wrapText: true },
};

const FMT_HDR_USR: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
  alignment: { wrapText: true },
};
const FMT_HDR_SYS: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: RED,
  alignment: { wrapText: true },
};
const FMT_HDR_CALC: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: GREY,
  alignment: { wrapText: true },
};
const FMT_GRP_TOP: StyleDef = {
  font: { bold: true, color: argb(MAGENTA) },
  fill: GREEN,
};
const FMT_GRP_TOP_C: StyleDef = {
  font: { bold: true, color: argb(MAGENTA) },
  fill: GREEN,
  alignment: { horizontal: 'center' },
};
const FMT_GRP_BOTTOM: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
};
const FMT_GRP_BOTTOM_C: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
  alignment: { horizontal: 'center' },
};

const FMT_HDR1: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
};
const FMT_HDR2: StyleDef = {
  font: { bold: true, color: argb(MAGENTA) },
  fill: GREEN,
};

const FMT_EURO_TOTAL: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
  numFmt: '#,##0.00 €',
};

const FMT_PRICE_TOTAL: StyleDef = {
  font: { bold: true, color: argb('FFFFFF') },
  fill: MAGENTA,
  numFmt: '#,##0.00',
};

const FMT_EURO: StyleDef = {
  border: 'thin',
  numFmt: '#,##0.00 €',
};

const FMT_DEF_DATA: StyleDef = {
  border: 'thin',
};
/* ── Value formats (matching CSV format column) ─ */
const FMT_PERCENT_C: StyleDef = {
  border: 'thin',
  alignment: { horizontal: 'center' },
  numFmt: '0.00%',
};

const FMT_TEXT_C: StyleDef = {
  border: 'thin',
  alignment: { horizontal: 'center' },
};

const FMT_IN_NUM_C: StyleDef = {
  border: 'thin',
  numFmt: '#,##0',
  fill: LIGHT_GREY,
  alignment: { horizontal: 'center' },
};

const FMT_IN_TEXT: StyleDef = {
  border: 'thin',
  fill: LIGHT_GREY,
  alignment: { wrapText: true },
};
const FMT_IN_TEXT_C: StyleDef = {
  border: 'thin',
  fill: LIGHT_GREY,
  alignment: { horizontal: 'center', wrapText: true  },
};
const FMT_IN_DEF_C: StyleDef = {
  border: 'thin',
  fill: LIGHT_GREY,
  alignment: { horizontal: 'center'},
};

const FMT_DD_DEF : StyleDef = {
  border: 'thin',
  fill: LIGHT_BLUE,
}


const FMT_NUM_C: StyleDef = {
  border: 'thin',
  numFmt: '#,##0',
  alignment: { horizontal: 'center' },
};

const FMT_NUM: StyleDef = {
  border: 'thin',
  numFmt: '#,##0',
};

const FMT_FLOAT_C: StyleDef = {
  border: 'thin',
  numFmt: '#,##0.0000',
  alignment: { horizontal: 'center' },
};

//~ const FMT_FLOAT: StyleDef = {
  //~ border: 'thin',
  //~ numFmt: '#,##0.0000',
//~ };

const FMT_FLOAT_L: StyleDef = {
  border: 'thin',
  numFmt: '#,##0.0000',
  alignment: { horizontal: 'left' },
};

const FMT_DATE_C: StyleDef = {
  border: 'thin',
  numFmt: 'dd-mm-yyyy',
  alignment: { horizontal: 'center' },
};

const FMT_COMMENT: StyleDef = {
  border: 'thin',
  alignment: { wrapText: true },
};

const FMT_PRICE_2: StyleDef = {
  border: 'thin',
  numFmt: '#,##0.00',
};
const FMT_PRICE_5: StyleDef = {
  border: 'thin',
  numFmt: '#,##0.00000',
};


const FORMAT_VOL: Record<string, StyleDef|Record<string, StyleDef>> = {
  'title': FMT_TITLE,
  'header': {
    'user': FMT_HDR_USR,
    'system': FMT_HDR_SYS,
    //~ 'calc': FMT_HDR_CALC,
  },
  'data': {
    'qty': FMT_NUM_C,
    'text': FMT_DEF_DATA,
    'text_c': FMT_TEXT_C,
    'num': FMT_NUM_C,
    'price_5': FMT_PRICE_5,
    'euro': FMT_EURO,
  },
  'grp': {
    'qty': FMT_IN_NUM_C,
    'text': FMT_IN_TEXT,
    'text_c': FMT_IN_TEXT_C,
    'num': FMT_IN_NUM_C,
    'price_5': FMT_PRICE_5,
    'euro': FMT_EURO,
  },
};
const FORMAT_BOM: Record<string, StyleDef|Record<string, StyleDef>> = {
  'title': FMT_TITLE,
  'header': {
    'user': FMT_HDR_USR,
    'system': FMT_HDR_SYS,
    'calc': FMT_HDR_CALC,
  },
  'grp': {
    'bottom': FMT_GRP_BOTTOM,
    'bottom_c': FMT_GRP_BOTTOM_C,
    'total': FMT_EURO_TOTAL,
    'float': FMT_PRICE_TOTAL,
    'top':	FMT_GRP_TOP,
    'top_c':	FMT_GRP_TOP_C,
  },
  'props': {
    'title': { font: { bold: true, color: argb(BLUE) }},
    'key': {
      font: { bold: true, color: argb(BLUE) },
      alignment: { horizontal: 'right' },
      border: 'thin'
    },
    'text': FMT_DEF_DATA,
    'float': FMT_FLOAT_L,
    'total': FMT_EURO_TOTAL,
  },
  'data': {
    'qty': FMT_IN_NUM_C,
    'itext_c': FMT_IN_TEXT_C,
    'itext': FMT_IN_TEXT,
    'idef_c': FMT_IN_DEF_C,
    'd_def': FMT_DD_DEF,
    'num_c': FMT_NUM_C,
    'price_h': FMT_PRICE_5,
    'price_m': FMT_PRICE_2,
    'euro': FMT_EURO,
    'data': FMT_DEF_DATA,
  },
};
const FORMAT_PRICES: Record<string, StyleDef|Record<string, StyleDef>> = {
  'title': FMT_TITLE,
  'header': FMT_HDR,
  'data': {
    '': FMT_DEF_DATA,
    'price_lg': FMT_PRICE_2,
    'price_sm': FMT_PRICE_5,
    'idx': FMT_NUM_C,
    'num': FMT_NUM,
  },
};
const FORMAT_ASS: Record<string, StyleDef|Record<string, StyleDef>> = {
  "title": FMT_TITLE,
  "header": {
    "1": FMT_HDR1,
    '2': FMT_HDR2,
  },
  '#': FMT_DEF_DATA,
  'key': FMT_DEF_DATA,
  "value": {
    "": FMT_DEF_DATA,
    "percent": FMT_PERCENT_C,
    "text": FMT_TEXT_C,
    "num": FMT_NUM_C,
    "float": FMT_FLOAT_C,
    "date": FMT_DATE_C,
  },
  "when": FMT_DATE_C,
  "who": FMT_DEF_DATA,
  "comment": FMT_COMMENT,
};
const FORMAT_OVERVIEW: Record<string, StyleDef|Record<string, StyleDef>> = {
  'title': FMT_TITLE,
  'heading': FMT_HDR1,
  'table': {
    'center': {
      border: 'thin',
      alignment: { horizontal: 'center' },
    },
    'euro': {
      border: 'thin',
      numFmt: '#,##0.00 €',
    },
    'amt': {
      border: 'thin',
      numFmt: '#,##0.00',
    },
    'percent': {
      border: 'thin',
      numFmt: '0.00%',
    },
    'percent_c': {
      border: 'thin',
      numFmt: '0.00%',
      alignment: { horizontal: 'center' },
    },
  },
};

const FORMAT_ESA: Record<string, StyleDef|Record<string, StyleDef>> = {
  'title': FMT_TITLE,
  'subtitle': FMT_SUBTITLE,
  'header': {
    '': FMT_HDR1,
    'total': FMT_EURO_TOTAL,
  },
  'table': {
    'text': FMT_DEF_DATA,
    'text_c': FMT_TEXT_C,
    'euro': FMT_EURO,
    'percent': FMT_PERCENT_C,
  },
};

const FORMAT_META: Record<string, StyleDef|Record<string, StyleDef>> = {
  "title": FMT_TITLE,
  "header": {
    '1': FMT_HDR1,
    '2': FMT_HDR2,
  },
  "key": FMT_DEF_DATA,
  "value": {
    '': FMT_TEXT_C,
    "date": FMT_DATE_C,
    "num": FMT_NUM_C,
    'float': FMT_FLOAT_C,
  },
  "comment": FMT_COMMENT,
};
/* Semantic styles */
const FORMAT: Record<string, Record<string, StyleDef|Record<string, StyleDef>>> = {
  'vol': FORMAT_VOL,
  'bom': FORMAT_BOM,
  'prices': FORMAT_PRICES,
  "assumptions": FORMAT_ASS,
  "meta": FORMAT_META,
  "overview": FORMAT_OVERVIEW,
  "esa": FORMAT_ESA,
  "": { "": FMT_DEF_DATA, },
};


/** Apply a StyleDef to an ExcelJS Cell. */
export function applyStyle(cell: Cell, style: StyleDef): void {
  if (style.font) {
    cell.font = { ...cell.font, ...style.font };
  }
  if (style.fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + style.fill },
    };
  }
  if (style.border) {
    const side = { style: style.border as 'thin' | 'medium' | 'thick' | 'double' };
    cell.border = {
      top: side,
      bottom: side,
      left: side,
      right: side,
    };
  }
  if (style.numFmt) {
    cell.numFmt = style.numFmt;
  }
  if (style.alignment) {
    cell.alignment = { ...cell.alignment, ...style.alignment };
  }
}

export function fmt(
  section: string,
  key: string,
  variant?: string,
): StyleDef {
  const val = FORMAT[section][key];
  if (variant) {
    return (val as Record<string, StyleDef>)[variant];
  }
  if ('' in val) {
    return (val as Record<string, StyleDef>)[''];
  }
  return val as StyleDef
}
