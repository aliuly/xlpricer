#!python
#
# Grab tables
#
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell, xl_cell_to_rowcol

from . import xlu
from .constants import K
from .xlfmt import XlFmt

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
  GRP1 = { 'level': 1 }
  '''Grouping option'''
  GRP1H = { 'level': 1, 'hidden': 1 }
  '''Collapsed group option'''
  
  COLUMNS = [
    SPACER,
    {
      'h': [ 'Qty', 10, XlFmt.f_header, 'f_qty' ],
      'f': XlFmt.f_qty,
    },
    {
      'h': [ 'Cloud Desc', 42, XlFmt.f_header, 'f_desc' ],
      'f': XlFmt.f_desc,
      'validate-list': xl.ref(K.RF_PRICES_DESCS),
    },
    SPACER,
    {
      'h': [ 'vCPU', 6, XlFmt.f_syshdr, None, GRP1 ],
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
      'c': '={STD_HOURS}',
    },
    SPACER,
    {
      'h': [ 'Region', 6, XlFmt.f_header, 'f_reg',GRP1H  ],
      'f': XlFmt.f_text,
      'c': '={DEF_REGION}',
      'validate-list': xl.vlist(K.VL_REGIONS),
    },
    {
      'h': [ 'EVS Class', 16, XlFmt.f_header, 'f_evs_type', GRP1H ],
      'f': XlFmt.f_text,
      'c': '={DEF_EVS}',
      'validate-list': xl.vlist(K.VL_EVS),
    },
    {
      'h': [ 'Persist?', 6.5, XlFmt.f_header, 'f_evs_perm', GRP1H ],
      'f': XlFmt.f_text,
      'c': 'Y',
      'validate-list': ['Y','N'],
    },
    {
      'h': [ 'Backup Class', 16, XlFmt.f_header, 'f_cbr', GRP1H ],
      'f': XlFmt.f_text,
      'c': '={DEF_CBR}',
      'validate-list': xl.vlist(K.VL_CBR),
    },
    {
      'h': [ 'Backup Factor', 7, XlFmt.f_header, 'f_bak', GRP1H ],
      'f': XlFmt.f_float_in,
      'c': '={BACKUP_FACT}',
    },
    {
      'h': [ 'Backup (GB)', 7, XlFmt.f_header, 'f_bakvol', GRP1H ],
      'f': XlFmt.f_num_in,
      'c': '=IF(AND({#f_evs_perm}="Y",{#f_storage}>0),{#f_storage}*{#f_bak},"")',
    },
    SPACER,
    {
      'h': [ 'Row Idx', 6.5, XlFmt.f_syshdr, 'f_sku', GRP1H ],
      'f': XlFmt.f_num_c,
      'c': '==IF(OR({#f_desc}="",{#f_reg}=""),"",MATCH(1,({PRICES_DESCS}={#f_desc})*({PRICES_REGION}={#f_reg}),0))',
    },
    {
      'h': ['EVS Idx', 6, XlFmt.f_syshdr, 'f_evs_id', GRP1H ],
      'f': XlFmt.f_num_c,
      'c': '==IF(OR({#f_desc}="",{#f_evs_type}="",{#f_reg}=""),"",MATCH(1,({PRICES_DESCS}="Storage: EVS " & {#f_evs_type})*({PRICES_REGION}={#f_reg}),0))',
    },
    {
      'h': ['CBR Idx', 6, XlFmt.f_syshdr, 'f_cbr_id', GRP1H ],
      'f': XlFmt.f_num_c,
      'c': '==IF(OR({#f_desc}="",{#f_cbr}="",{#f_reg}=""),"",MATCH(1,({PRICES_DESCS}="Storage: CBR " & {#f_cbr})*({PRICES_REGION}={#f_reg}),0))',
    },
    {
      'h': ['PayG', 10, XlFmt.f_syshdr, 'f_price', GRP1H ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_priceAmount})'
        ')'
    },
    {
      'h': ['Unit', 10, XlFmt.f_syshdr, 'f_unit', GRP1H ],
      'f': XlFmt.f_text_c,
      'c': '=IF({#f_sku}="","",'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_unit})'
        ')'
    },
    {
      'h': ['R12M', 10, XlFmt.f_syshdr, 'f_pr12m', GRP1H ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",IF('
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R12})>0,'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R12}),'
              '""'
        '))'
    },
    {
      'h': ['R24M', 10, XlFmt.f_syshdr, 'f_pr24m', GRP1H ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",IF('
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R24})>0,'
              'INDEX({PRICES_TABLE},{#f_sku},{cm_R24}),'
              '""'
        '))'
    },
    {
      'h': ['EVS Price per GB', 8, XlFmt.f_syshdr, 'f_evs_price', GRP1H ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_evs_id}="","",'
              'INDEX({PRICES_TABLE},{#f_evs_id},{cm_priceAmount})'
        ')'
    },
    {
      'h': ['CBR Price per GB', 8, XlFmt.f_syshdr, 'f_cbr_price', GRP1H ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_cbr_id}="","",'
              'INDEX({PRICES_TABLE},{#f_cbr_id},{cm_priceAmount})'
        ')'
    },
    {
      'h': ['Tier Calc', 8, XlFmt.f_syshdr, 'f_tier_calc', GRP1H ],
      'f': XlFmt.f_def_data,
    },
    SPACER,
    {
      'h': ['Price', 8, XlFmt.f_refhdr, 'f_pmonth' ],
      'f': XlFmt.f_euro,
      'c': '=IF({#f_sku}="","",'
          'IF(AND({#f_pr12m}<>"",{#f_hrs}="R12M"),{#f_pr12m},'
            'IF(AND({#f_pr24m}<>"",{#f_hrs}="R24M"),{#f_pr24m},'
              'IF(LEFT({#f_unit},1)="h",'
                'IF(ISNUMBER({#f_hrs}),{#f_hrs},{DEF_HOURS})*{#f_price},'
                '{#f_price}'
        '))))'
    },
    {
      'h': ['EVS Price', 10, XlFmt.f_refhdr, 'f_evs_sub' ],
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
      'h': ['Sub-total per unit', 10, XlFmt.f_refhdr, 'f_tot_1' ],
      'f': XlFmt.f_euro,
      'c': '=IFERROR({#f_pmonth}+{#f_evs_sub}+{#f_cbr_sub},0)'
    },
    {
      'h': ['Sub-total', 10, XlFmt.f_refhdr, 'f_tot_qty' ],
      'f': XlFmt.f_euro,
      'c': '={#f_qty}*{#f_tot_1}',
    },
  ]
  '''Column definitions'''

  r = 0
  ws.write(r,0, 'Cloud Components', XlFmt.f_title)

  coloffs = len(COLUMNS)
  ws.write(r,coloffs+1,
            'Future Price Forecast (Adjusted for Inflation)',
            XlFmt.f_title)
  
  r += 1
  for c in range(0,coloffs):
    ws_header(xl, r, c, COLUMNS[c]['h'])
  

  ws.write(r,coloffs+1,'Year:',XlFmt.f_header)
  ws.set_column(coloffs+1,coloffs+1,6)
  ws.write(r,coloffs+2,1,XlFmt.f_header)
  year_row = r
  for y in range(1,K.YEAR_MAX):
    ws.write_formula(r,coloffs+y+2,
                '=' + xl_rowcol_to_cell(r,coloffs+y+1) + '+1',
                XlFmt.f_header)

  r += 1
  ws.write(r,1,'Monthly Price', XlFmt.f_sumline)
  for c in range(2,coloffs): ws.write(r, c, None, XlFmt.f_sumline)
  ws.write_formula(r,coloffs-1,
        ('=SUMIFS({f_tot_qty}:{f_tot_qty},' +
            '{f_qty}:{f_qty},"<>"&{f_qty}{r1},'+
            '{f_tier_calc}:{f_tier_calc},"=")').format(r1=r+1,**xl.ref()),
        XlFmt.f_sumline_total)

  for y in range(0,K.YEAR_MAX):
    c = coloffs+y+2
    ws.set_column(c,c,12)
    cn = xl_col_to_name(c)
    ws.write_formula(r,c,
            ('=SUMIFS({cn}:{cn},' +
                '{f_qty}:{f_qty},"<>"&{f_qty}{r1},' +
                '{f_tier_calc}:{f_tier_calc},"=")').format(cn=cn,r1=r+1,**xl.ref()),
        XlFmt.f_sumline_total)

  r += 1
  ws.freeze_panes(r, 3)

  ws.write(r,1,'General', XlFmt.f_hr1)
  for c in range(2,coloffs): ws.write(r, c, None, XlFmt.f_hr1)

  for r in range(r+1,r+20):
    xl.rowrefs(r+1)
    for c in range(0,len(COLUMNS)):
      ws_bom_cell(xl,r,c, COLUMNS[c])
    ws_inflation(xl, r, K.YEAR_MAX, year_row, COLUMNS)
    

  r += 2
  ws_tiers(xl, apidat, r, year_row, K.YEAR_MAX, COLUMNS)


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
    
  if isinstance(content,str) and content.startswith('='):
    if content.startswith('=='):
      ws.write_dynamic_array_formula(r,c, r,c, content[1:], fmt)
    else:
      ws.write_formula(r,c, content, fmt)
    # ~ if XlBomCols.COLUMNS[c]['h'][0] == 'EVS Price': 
    # ~ ic('Formula',XlBomCols.COLUMNS[c]['h'][0],r)
  else:
    ws.write(r,c,content,fmt)
    # ~ if XlBomCols.COLUMNS[c]['h'][0] == 'EVS Price': 
    # ~ ic('Value',XlBomCols.COLUMNS[c]['h'][0],r)

  if 'validate-list' in coldef and o is None:
    vlst = coldef['validate-list']
    # ~ if isinstance(vlst,str) and (vlst in R): vlst = R[vlst]
    ws.data_validation(xl_rowcol_to_cell(r,c), {
        'validate': 'list',
        'source': vlst,
      })




def ws_header(xl:xlu.XlUtils,r:int,c:int,hdef:dict)->None:
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
  opts = hdef[4] if len(hdef) > 4 else None
  ws.set_column(c,c,w,None,opts)
  if h is None: return
  ws.write(r,c, h, fmt)
  if not fld_id is None:
    xl.ref(**{fld_id: xl_col_to_name(c,True)})


def ws_tiers(xl:xlu.XlUtils, apidat:dict, r:int, yearrow:int, yrmx:int, COLUMNS:list) -> None:
  '''Write tiered calculations

  Create rows that contain tiered calculations to apply volume discounts
  depending on the total volume being used.

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  :param r: row being generated
  :param yearrow: Row containing year index (for inflation adlustments)
  :param yrmx: Max number of years to calculate (for inflation adjustments)
  :param COLUMNS: column definitions
  '''
  ws = xl.ws(K.WS_COMPONENT)

  coloffs = len(COLUMNS)
  
  ws.write(r,1,'Tiered Volume Pricing', XlFmt.f_hr1)
  for c in range(2,coloffs): ws.write(r, c, None, XlFmt.f_hr1)
  r += 1

  # ~ n = dict()
  # ~ for i in range(0,len(COLUMNS)): n[COLUMNS[i]] = i

  _, desc_col = xl_cell_to_rowcol(xl.ref('#f_desc'))
  _, qty_col = xl_cell_to_rowcol(xl.ref('#f_qty'))
  _, tier_col = xl_cell_to_rowcol(xl.ref('#f_tier_calc'))
  _, region_col = xl_cell_to_rowcol(xl.ref('#f_reg'))
  _, up_col = xl_cell_to_rowcol(xl.ref('#f_pmonth'))
  _, tot_col = xl_cell_to_rowcol(xl.ref('#f_tot_qty'))
  _, sku_col = xl_cell_to_rowcol(xl.ref('#f_sku'))
  _, tot1_col = xl_cell_to_rowcol(xl.ref('#f_tot_1'))
  _, totqty_col = xl_cell_to_rowcol(xl.ref('#f_tot_qty'))

  tiers = list(apidat['tiers'].keys())
  tiers.sort()

  for ttariff in tiers:
    ws.set_row(r,None,None,{'level':1, 'hidden': 1})
    
    xl.rowrefs(r+1)    
    for c in range(0,len(COLUMNS)):
      ws_bom_cell(xl,r,c, COLUMNS[c],'')
    ws_bom_cell(xl,r,desc_col, COLUMNS[desc_col],apidat['tiers'][ttariff][K.COL_XLTITLE])
    ws_bom_cell(xl,r,tier_col, COLUMNS[tier_col],'Vol')
    ws_bom_cell(xl,r,qty_col, COLUMNS[qty_col], '=SUMIFS({f_qty}:{f_qty},{f_desc}:{f_desc},"="&{#f_desc},{f_tier_calc}:{f_tier_calc},"=",{f_reg}:{f_reg},"="&{#f_reg})')
    ws_bom_cell(xl,r,region_col, COLUMNS[region_col],apidat['tiers'][ttariff]['region'])

    # ~ XlBomCols.cell(ws,r,1,R,
        # ~ '=SUMIFS({f_qty}:{f_qty},{f_desc}:{f_desc},"="&{#f_desc},{f_tier_calc}:{f_tier_calc},"=",{f_reg}:{f_reg},"="&{#f_reg})'.format(**R))
    xl.ref(**{
        '#volcell': xl_rowcol_to_cell(r,1,False,True),
        '#region': xl.ref('#f_reg'),
    })
    r += 1
    first = None
    for tariff in apidat['tiers'][ttariff][K.COL_XLTARIFFS]:
      ws.set_row(r,None,None,{'level':2, 'hidden': 1})
      xl.rowrefs(r+1)    
      last = xl.ref('#f_tot_qty')
      if first is None: first = last
      
      for c in range(0,len(COLUMNS)):
        ws_bom_cell(xl,r,c, COLUMNS[c], '')
      ws_bom_cell(xl,r,tier_col, COLUMNS[tier_col],'Tier')
      ws_bom_cell(xl,r,desc_col, COLUMNS[desc_col], tariff[K.COL_XLTITLE])
      
      xl.ref(Tmin = 0 if tariff['fromOn'] == 0 else tariff['fromOn']-1,
             Tmax = tariff['upTo'])
      f = 'IF({#volcell}>={Tmin},{#volcell}-{Tmin},0)'
      if tariff['upTo']: f = 'IF({#volcell}>{Tmax},{Tmax}-{Tmin},'+f+')'
      # ~ if not R['Tmax'] is None: f = 'IF({#volcell}>{Tmax},{Tmax}-{Tmin},'+f+')'
      ws_bom_cell(xl,r,qty_col, COLUMNS[qty_col], '='+f)
      ws_bom_cell(xl,r,region_col, COLUMNS[region_col], '={#region}')
      ws_bom_cell(xl,r,tot1_col, COLUMNS[tot1_col], tariff['priceAmount'])
      ws_bom_cell(xl,r,totqty_col, COLUMNS[totqty_col])

      r += 1

    ws_bom_cell(xl,r, tot_col, COLUMNS[tot_col], f'=SUM({first}:{last})')
    # ~ XlBomCols.cell(ws,r,tot_col,R,f)
    ws.set_row(r,None,None,{'level':1, 'hidden': 1})
    ws_inflation(xl, r, yrmx, yearrow, COLUMNS, True)

    r+=1

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

  for y in range(0,yrmx):
    c = coloffs+y+2
    if alt:
      f = '={f_tot_qty}{r1}*(1+{INFLATION})^({year}-1)'.format(
            r1=r+1,year = xl_rowcol_to_cell(year_row, c,True,False), **xl.ref())
    else:
      f = (
        '=IF( AND({#f_hrs}="R24M",{#f_pr24m}<>0),'+
            '{#f_qty}*'+
              '(' +
                '{#f_pmonth}*(1+{INFLATION})^(FLOOR({year}-1,2))'+
                '+' +
                '({#f_cbr_sub}+{#f_evs_sub})*(1 + {INFLATION})^({year}-1)' +
              ')' +
          ','+
            '{#f_tot_qty}*(1+{INFLATION})^({year}-1)'+
        ')').format(year = xl_rowcol_to_cell(year_row, c,True,False), **xl.ref())
    ws.write_formula(r,c,f,XlFmt.f_euro)
  
