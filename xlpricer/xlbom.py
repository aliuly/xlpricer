#!python
#
# Grab tables
#
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

from . import xlu
from .constants import K
from .xlfmt import XlFmt
from . import xltier

def ws_colname(name:str, COLUMNS:list, offset=1) -> int:
  for c in range(0,len(COLUMNS)):
    if not 'h' in COLUMNS[c]: continue
    if COLUMNS[c]['h'][0] == name: return c+offset
  return -1

def ws_bom(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Write to components tab

  This function creates a template worksheet used for pricing customer's
  solutions.

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''
  ws = xl.ws(K.WS_COMPONENT)

  SPACER = { 'h': [ None, 3 ] }
  '''Spacer column definition'''

  COLUMNS = [
    SPACER,
    {
      'h': [ K.CN_QTY, 10, XlFmt.f_header, 'f_qty', True ],
      'f': XlFmt.f_qty,
    },
    {
      'h': [ K.CN_DESC, 42, XlFmt.f_header, 'f_desc', True ],
      'f': XlFmt.f_desc,
      'validate-list': K.XLN_PRICES_DESCS,
    },
    SPACER,
    {
      'h': [ 'vCPU', 6, XlFmt.f_syshdr, 'f_vcpu' ],
      'f': XlFmt.f_num_c,
      'c': '=IF({#f_sku}="","",IF('
              'INDEX({PRICES_TABLE},{#f_sku},{cm_vCpu})>0,'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_vCpu}),'
              '""'
        '))'
    },
    {
      'h': [ 'RAM (GB)', 6, XlFmt.f_syshdr ],
      'f': XlFmt.f_num_c,
      'c': '=IF({#f_sku}="","",IF('
              'INDEX({PRICES_TABLE},{#f_sku},{cm_ram})>0,'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_ram}),'
              '""'
        '))'
    },
    SPACER,
    {
      'h': [ 'Storage (GB)', 7, XlFmt.f_header, 'f_storage' ],
      'f': XlFmt.f_qty,
    },
    {
      'h': [ 'H/R', 5.5, XlFmt.f_header, 'f_hrs' ],
      'f': XlFmt.f_qty,
      'c': '=IF({DEF_RXM}="R24M",'
         # Default Reserved is R24M
         'IF({#f_pr24m}<>"","R24M",'
           # But we don't have r24m pricing...
           #   so we use R12M if available... otherwise just use {DEF_HOURS} hours
           'IF({#f_pr12m}<>"","R12M",{DEF_HOURS})'
         ')'
        ','
         'IF({DEF_RXM}="R12M",'
           # Default Reserved is R12M
           'IF({#f_pr12m}<>"","R12M",{DEF_HOURS})'
         ','
           # No valid default reserved always use PAYG
           '{DEF_HOURS}'
         ')'
        ')',
    },
    SPACER,
    {
      'h': [ K.CN_REGION, 7, XlFmt.f_header, 'f_reg', True  ],
      'f': XlFmt.f_text,
      'c': '={DEF_REGION}',
      'validate-list': xl.vlist(K.VL_REGIONS),
    },
    {
      'h': [ 'EVS Class', 16, XlFmt.f_header, 'f_evs_type' ],
      'f': XlFmt.f_text,
      'c': '={DEF_EVS}',
      'validate-list': xl.vlist(K.VL_EVS),
    },
    {
      'h': [ 'Persist?', 6.5, XlFmt.f_header, 'f_evs_perm' ],
      'f': XlFmt.f_text,
      'c': 'Y',
      'validate-list': ['Y','N'],
    },
    {
      'h': [ 'Backup Class', 16, XlFmt.f_header, 'f_cbr' ],
      'f': XlFmt.f_text,
      'c': '={DEF_CBR}',
      'validate-list': xl.vlist(K.VL_CBR),
    },
    {
      'h': [ 'Backup Factor', 7, XlFmt.f_header, 'f_bak' ],
      'f': XlFmt.f_float_in,
      'c': '={BACKUP_FACT}',
    },
    {
      'h': [ 'Backup (GB)', 7, XlFmt.f_header, 'f_bakvol' ],
      'f': XlFmt.f_num_in,
      'c': '=IF(AND({#f_evs_perm}="Y",{#f_storage}>0),{#f_storage}*{#f_bak},"")',
    },
    SPACER,
    {
      'h': [ 'Row Idx', 6.5, XlFmt.f_syshdr, 'f_sku' ],
      'f': XlFmt.f_num_c,
      'c': '==IF(OR({#f_desc}="",{#f_reg}=""),"",MATCH(1,({PRICES_DESCS}={#f_desc})*({PRICES_REGION}={#f_reg}),0))',
    },
    {
      'h': ['EVS Idx', 6, XlFmt.f_syshdr, 'f_evs_id' ],
      'f': XlFmt.f_num_c,
      'c': '==IF(OR({#f_desc}="",{#f_evs_type}="",{#f_reg}=""),"",MATCH(1,({PRICES_DESCS}="Storage: EVS " & {#f_evs_type})*({PRICES_REGION}={#f_reg}),0))',
    },
    {
      'h': ['CBR Idx', 6, XlFmt.f_syshdr, 'f_cbr_id' ],
      'f': XlFmt.f_num_c,
      'c': '==IF(OR({#f_desc}="",{#f_cbr}="",{#f_reg}=""),"",MATCH(1,({PRICES_DESCS}="Storage: CBR " & {#f_cbr})*({PRICES_REGION}={#f_reg}),0))',
    },
    {
      'h': ['PayG', 10, XlFmt.f_syshdr, 'f_price' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_priceAmount})'
        ')'
    },
    {
      'h': ['Unit', 10, XlFmt.f_syshdr, 'f_unit' ],
      'f': XlFmt.f_text_c,
      'c': '=IF({#f_sku}="","",'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_unit})'
        ')'
    },
    {
      'h': ['R12M', 10, XlFmt.f_syshdr, 'f_pr12m' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",IF('
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R12})>0,'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R12}),'
              '""'
        '))'
    },
    {
      'h': ['R24M', 10, XlFmt.f_syshdr, 'f_pr24m' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",IF('
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R24})>0,'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R24}),'
              '""'
        '))'
    },
    {
      'h': ['EVS Price per GB', 8, XlFmt.f_syshdr, 'f_evs_price' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_evs_id}="","",'
              'INDEX({PRICES_TABLE},{#f_evs_id},{cm_priceAmount})'
        ')'
    },
    {
      'h': ['CBR Price per GB', 8, XlFmt.f_syshdr, 'f_cbr_price' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_cbr_id}="","",'
              'INDEX({PRICES_TABLE},{#f_cbr_id},{cm_priceAmount})'
        ')'
    },
    {
      'h': [K.CN_TIER_CALC, 8, XlFmt.f_syshdr, 'f_tier_calc', True ],
      'f': XlFmt.f_def_data,
    },
    {
      'h': [K.CN_GROUPING, 8, XlFmt.f_syshdr, 'f_grouping', True ],
      'f': XlFmt.f_def_data,
    },
    SPACER,
    {
      'h': ['Price', 10, XlFmt.f_refhdr, 'f_pmonth' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="",0,'
          'IF(AND({#f_pr12m}<>"",{#f_hrs}="R12M"),{#f_pr12m},'
            'IF(AND({#f_pr24m}<>"",{#f_hrs}="R24M"),{#f_pr24m},'
              'IF(LEFT({#f_unit},1)="h",'
                'IF(ISNUMBER({#f_hrs}),{#f_hrs},{DEF_HOURS})*{#f_price},'
                '{#f_price}'
        '))))'
    },
    {
      'h': ['EVS Price', 12, XlFmt.f_refhdr, 'f_evs_sub' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_storage}="",0,'
          '{#f_storage}*{#f_evs_price}*IF('
            'AND({#f_evs_perm}="N",ISNUMBER({#f_hrs})),'
              '{#f_hrs}/{FT_HOURS},'
              '1'
        '))',
    },
    {
      'h': ['CBR Price', 10, XlFmt.f_refhdr, 'f_cbr_sub' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_bakvol}="",0,{#f_bakvol}*{#f_cbr_price})',
    },
    {
      'h': [K.CN_SUBTOTAL_UNIT, 12, XlFmt.f_refhdr, 'f_tot_1', True ],
      'f': XlFmt.f_euro,
      'c': '=IFERROR({#f_pmonth}+{#f_evs_sub}+{#f_cbr_sub},0)',
    },
    {
      'h': ['Sub-total', 15, XlFmt.f_refhdr, 'f_tot_qty' ],
      'f': XlFmt.f_euro,
      'c': '={#f_qty}*{#f_tot_1}',
    },
  ]
  '''Column definitions'''
  coloffs = len(COLUMNS)+1
  tier_calc = ws_colname(K.CN_TIER_CALC,COLUMNS)

  r = 1
  xlu.write(ws,r,1, 'Cloud Components', XlFmt.f_title)
  xlu.write(ws,r,coloffs+1,
            'Future Price Forecast (Adjusted for Inflation)',
            XlFmt.f_title)

  r += 1
  for c in range(1,coloffs):
    ws_header(xl, r, c, COLUMNS[c-1]['h'])

  xlu.write(ws,r,coloffs+1,'Year:',XlFmt.f_header)
  xlu.set_column_width(ws,coloffs+1,6)

  xlu.write(ws,r,coloffs+2,'Set-up',XlFmt.f_header)
  xlu.set_column_width(ws,coloffs+2,6)

  xlu.write(ws,r,coloffs+3,1,XlFmt.f_header)
  year_row = r
  for y in range(1,K.YEAR_MAX):
    xlu.write(ws,r,coloffs+y+3,
                '=' + xlu.rowcol_to_cell(r,coloffs+y+2) + '+1',
                XlFmt.f_header)


  r += 1
  xlu.write(ws,r,2,'Non-recurrent Charges', XlFmt.f_sumline)
  for c in range(3,coloffs): xlu.write(ws,r, c, None, XlFmt.f_sumline)
  xlu.write(ws,r, tier_calc, 'setup', XlFmt.f_sumline)
  xlu.write(ws,r,coloffs-1,
        ('=SUMIFS({f_tot_qty}:{f_tot_qty},'           # Column to sum
            '{f_qty}:{f_qty},"<>"&{f_qty}{r1},'       # We are on the same row
            '{f_unit}:{f_unit},"="&{ONE_TIME_ITEM},'  # Select One Time Items
            '{f_grouping}:{f_grouping},"<>Total *",'  # Skip per-group totals
            '{f_tier_calc}:{f_tier_calc},"=")'        # Select the valid tiered calculation rows
        ).format(r1=r,**xl.ref()),
        XlFmt.f_sumline_total)

  r += 1
  xlu.write(ws,r,2,'Monthly Price', XlFmt.f_sumline)
  for c in range(3,coloffs): xlu.write(ws,r, c, None, XlFmt.f_sumline)
  xlu.write(ws,r, tier_calc, 'total', XlFmt.f_sumline)
  xlu.write(ws,r,coloffs-1,
        ('=SUMIFS({f_tot_qty}:{f_tot_qty},'           # Column to sum
            '{f_qty}:{f_qty},"<>"&{f_qty}{r1},'       # We are on the same row
            '{f_unit}:{f_unit},"<>"&{ONE_TIME_ITEM},' # Skip one-time items
            '{f_grouping}:{f_grouping},"<>Total *",'  # Skip per-group totals
            '{f_tier_calc}:{f_tier_calc},"=")'        # Select the valid tiered calculation rows
        ).format(r1=r,**xl.ref()),
        XlFmt.f_sumline_total)

  for y in range(0,K.YEAR_MAX+1):
    c = coloffs+y+2
    xlu.set_column_width(ws,c,15)
    cn = xlu.col_to_name(c)
    xlu.write(ws,r,c,
            ('=SUMIFS({cn}:{cn},'                       # Column to sum
              '{f_qty}:{f_qty},"<>"&{f_qty}{r1},'       # We are on the same row
              '{f_grouping}:{f_grouping},"<>Total *",'  # Skip per-group totals
              '{f_tier_calc}:{f_tier_calc},"=")'        # Select the valid tiered calculation rows
            ).format(cn=cn,r1=r,**xl.ref()),
        XlFmt.f_sumline_total)

  r += 1
  xlu.freeze_panes(ws, r, 5)

  xlu.write(ws,r,2,'General', XlFmt.f_hr1)
  for c in range(3,coloffs): xlu.write(ws,r, c, None, XlFmt.f_hr1)

  for r in range(r+1,r+20):
    xl.rowrefs(r)
    for c in range(1,len(COLUMNS)+1):
      ws_bom_cell(xl,r,c, COLUMNS[c-1])
    ws_inflation(xl, r, K.YEAR_MAX, year_row, COLUMNS)


  r += 2
  xltier.bom_tiers(xl, apidat, r, year_row, K.YEAR_MAX, COLUMNS)

  xlu.group_columns(ws, ws_colname('vCPU',COLUMNS), ws_colname('RAM (GB)', COLUMNS), hide=False)
  xlu.group_columns(ws, ws_colname('Region',COLUMNS), ws_colname('Backup (GB)', COLUMNS), hide=True)
  xlu.group_columns(ws, ws_colname('Row Idx',COLUMNS), ws_colname(K.CN_GROUPING, COLUMNS), hide=True)
  xlu.group_columns(ws, coloffs+1, coloffs+K.YEAR_MAX+2 , hide=True)



def ws_bom_cell(xl:xlu.XlUtils,r:int,c:int, coldef:dict, o:str = None)->None:
  '''Write a cell

  Will write data on a cell, either from the given parameter `o` or use
  the default from the header definition.  Usually, the default is for
  creating cells with some default calculation.

  In either case, `o` can be:

  - `None`, will use the pre-defined default for the column.
  - _callable_: A lambda that takes a single parameter `ref`.
  - _str_ : A string, which if it starts with `=` it will be written
    as a formula, otherwise it is written as a value.  The string
    will be formated using `str.format` with the `ref` dict being
    passed as named arguments.

  :param xl: xl utility object
  :param r: row
  :param c: column
  :param coldef: Column defintion
  '''
  ws = xl.ws(K.WS_COMPONENT)

  content = (coldef['c'] if 'c' in coldef else None) if o is None else o
  fmt = coldef['f'] if ('f' in coldef) else XlFmt.f_def_data

  if callable(content):
    content = content(xl.ref())
  elif isinstance(content,str):
    content = content.format(**xl.ref())

  xlu.write(ws,r,c, content, fmt)

  if 'validate-list' in coldef and o is None:
    xlu.data_validation_list(ws, r, c, coldef['validate-list'])

def ws_header(xl:xlu.XlUtils,r:int,c:int,hdef:list)->None:
  '''Write a header cell (formatting columns on the way)

  :param xl: xl utility object
  :param r: row
  :param c: column
  :param hdef: column header definition
  '''
  ws = xl.ws(K.WS_COMPONENT)

  # ~ ic(XlBomCols.COLUMNS[c])
  h = hdef[0] if len(hdef) > 0 else None
  w = hdef[1] if len(hdef) > 1 else None
  fmt = hdef[2] if len(hdef) > 2 else XlFmt.f_header
  fld_id = hdef[3] if len(hdef) > 3 else None
  hprot = hdef[4] if len(hdef) > 4 else False
  xlu.set_column_width(ws,c,w)

  if h is None: return
  xlu.write(ws,r,c, h, fmt)
  if not fld_id is None: xl.ref(**{fld_id: xlu.col_to_name(c,True)})
  if hprot: xlu.data_validation_list(ws, r, c, [ h ], True, False)

def ws_inflation(xl:xlu.XlUtils,r:int,yrmx:int,year_row:int,COLUMNS:list,alt:bool = False)->None:
  '''Write row with inflation adjustments

  :param xl: xl utility object
  :param r: row being generated
  :param year_row: Row containing year index (for inflation adlustments)
  :param yrmx: Max number of years to calculate (for inflation adjustments)
  :param alt: Calculation selection.  If False, use the normal calculation used by normal prices.  True use a simplified calculation for Tiered prices.
  :param COLUMNS: column definitions
  '''
  ws = xl.ws(K.WS_COMPONENT)
  coloffs = len(COLUMNS)

  xlu.write(ws,r,coloffs+3,
        ('=IF({#f_unit}={ONE_TIME_ITEM},' 
            '{#f_tot_qty},'
            '0)').format(r1=r,**xl.ref()),
        XlFmt.f_euro)

  for y in range(0,yrmx):
    c = coloffs+y+4
    if alt:
      f = '={f_tot_qty}{r1}*(1+{INFLATION})^({year}-1)'.format(
            r1=r,year = xlu.rowcol_to_cell(year_row, c,True,False), **xl.ref())
    else:
      
      f = (
        '=IF({#f_unit}={ONE_TIME_ITEM},0,'
          'IF( AND({#f_hrs}="R24M",{#f_pr24m}<>0),'
              '{#f_qty}*'
                '(' 
                  '{#f_pmonth}*(1+{INFLATION})^(FLOOR({year}-1,2))'
                  '+' 
                  '({#f_cbr_sub}+{#f_evs_sub})*(1 + {INFLATION})^({year}-1)' 
                ')' 
            ','
              '{#f_tot_qty}*(1+{INFLATION})^({year}-1)'
          ')'
        ')').format(year = xlu.rowcol_to_cell(year_row, c,True,False), **xl.ref())
    xlu.write(ws, r,c,f,XlFmt.f_euro)

