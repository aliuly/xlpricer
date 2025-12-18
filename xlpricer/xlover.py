#!python
#
# Overview sheet
#
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import datetime

from . import xlu
from .constants import K
from .xlfmt import XlFmt
from . import preload

def sheet(xl:xlu.XlUtils) -> None:
  '''Write to overview tab

  This function creates a template worksheet used for pricing customer's
  solutions.

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''
  ws = xl.ws(K.WS_OVERVIEW)
  year = datetime.datetime.today().strftime('%Y')
  if int(datetime.datetime.today().strftime('%Y')) > 9:
    # Last quarter of the year, we just change the overview to next
    # year!
    year = str(int(year)+1)
  
  r = 1
  xlu.write(ws,r,1, 'Yearly Overview', XlFmt.f_title)
  
  r += 1

  xlu.write(ws,r,2, 'Yearly Prices', XlFmt.f_sumline)  
  for i in range(3, K.YEAR_MAX+6):
    xlu.write(ws,r,i, '', XlFmt.f_sumline)

  i += 3
  
  xlu.write(ws,r,i, 'Montnly Prices', XlFmt.f_sumline)
  for i in range(i+1, i+K.YEAR_MAX+2):
    xlu.write(ws,r,i, '', XlFmt.f_sumline)
    
  r += 2
  xlu.write(ws,r,2, 'Year')
  xlu.write(ws,r, 4, year, XlFmt.f_ov_center)
  for i in range(5,K.YEAR_MAX+4):
    xlu.write(ws,r, i,
                '=' + xlu.rowcol_to_cell(r,i-1) + '+1',
                XlFmt.f_ov_center)
  i += 2
  xlu.write(ws,r, i, 'Total', XlFmt.f_ov_center)

  i += 3
  xlu.write(ws,r, i, 'groups', XlFmt.f_ov_center)
  xlu.write(ws,r, i+1, 'set-up', XlFmt.f_ov_center)
  i += 1
  for y in range(1,K.YEAR_MAX+1):
    # We force these to be strings so they are not included in sums
    xlu.write(ws,r, i+y, f'="{y}"', XlFmt.f_ov_center)

  r += 1
  month_row = r
  xlu.write(ws,r,2, 'Months')
  for i in range(4,K.YEAR_MAX+4):
    xlu.write(ws,r, i, 12, XlFmt.f_ov_center)
  i += 2
  xlu.write(ws,r, i,
            '=SUM({start}:{end})'.format(
                    start = xlu.rowcol_to_cell(r, 4),
                    end = xlu.rowcol_to_cell(r, K.YEAR_MAX+3)),
            XlFmt.f_ov_center)

  i += 3
  xlu.write(ws,r, i, 'total comp', XlFmt.f_ov_center)
  xlu.write(ws,r, i+1, '={BOM_TOTAL_SETUP}'.format(**xl.ref()), XlFmt.f_ov_euro)
  xlu.write(ws,r, i+2, '={BOM_TOTAL_MONTHLY}'.format(**xl.ref()), XlFmt.f_ov_euro)

  r += 1
  rampup_row = r
  xlu.write(ws,r,2, 'Ramp-up')
  for i in range(4,K.YEAR_MAX+4):
    xlu.write(ws,r, i, 1, XlFmt.f_ov_percent)

  i += 5
  col_title = xlu.col_to_name(i,True)
  xlu.write(ws,r, i, 'total calc', XlFmt.f_ov_center)
  col_setup = xlu.col_to_name(i+1)
  xlu.write(ws,r, i+1, f'=SUMIFS({col_setup}:{col_setup},{col_title}:{col_title},"<>total*")',XlFmt.f_ov_euro)
  col_mrc = xlu.col_to_name(i+2)
  xlu.write(ws,r, i+2, f'=SUMIFS({col_mrc}:{col_mrc},{col_title}:{col_title},"<>total*")',XlFmt.f_ov_euro)

  r += 1
  
  xlu.write(ws,r, i, 'total diff', XlFmt.f_ov_center)
  xlu.write(ws,r, i+1, f'={xlu.rowcol_to_cell(r-2,i+1)}-{xlu.rowcol_to_cell(r-1,i+1)}', XlFmt.f_ov_euro)
  xlu.write(ws,r, i+2, f'={xlu.rowcol_to_cell(r-2,i+2)}-{xlu.rowcol_to_cell(r-1,i+2)}', XlFmt.f_ov_euro)
  
  
  r += 1
  
  xlu.write(ws,r,2, 'Sub-Totals', XlFmt.f_sumline)  
  for i in range(3, K.YEAR_MAX+6):
    xlu.write(ws,r,i, '', XlFmt.f_sumline)

  i += 3  
  xlu.write(ws,r,i, 'Per-Group Prices', XlFmt.f_sumline)
  for i in range(i+1, i+K.YEAR_MAX+2):
    xlu.write(ws,r,i, '', XlFmt.f_sumline)

  r += 2
  tot_start = r
  
  for grouping, desc in preload.GROUPS:
    xlu.write(ws,r,2, desc)
    
    i =4
    for y in range(0,K.YEAR_MAX):
      c = i + y
      xlu.write(ws,r, c,
                '={setup}+({monthly}*{m}*{r})'.format(
                    monthly = xlu.rowcol_to_cell(r, c+K.YEAR_MAX+6),
                    setup = 0 if y else xlu.rowcol_to_cell(r, c+K.YEAR_MAX+5),
                    m = xlu.rowcol_to_cell(month_row,c, True, False),
                    r = xlu.rowcol_to_cell(rampup_row,c, True, False),
                ), XlFmt.f_ov_euro)

    i += 1+K.YEAR_MAX
    xlu.write(ws,r, i,
              '=SUM({start}:{end})'.format(
                      start = xlu.rowcol_to_cell(r, 4),
                      end = xlu.rowcol_to_cell(r, K.YEAR_MAX+3)),
              XlFmt.f_ov_euro)

    i += 3
    xlu.write(ws,r, i, grouping, XlFmt.f_ov_center)
    grpcell = xlu.rowcol_to_cell(r,i,False,True)
    i += 1
    for y in range(0, K.YEAR_MAX+1):
      xlu.write(ws,r, i+y,
              ('=SUMIFS('
                  '{bom_sheet}!{bom_col}:{bom_col},'
                  '{bom_sheet}!{f_qty}:{f_qty},"<>Total*",'
                  '{bom_sheet}!{f_grouping}:{f_grouping},"="&{grpcell}'
                ')').format(
                  bom_sheet = K.WS_COMPONENT,
                  bom_col = xlu.col_to_name(xl.ref('IDXTAB')+y),
                  grpcell = grpcell,
                  **xl.ref(),
              ), XlFmt.f_ov_euro)
    tot_end =r
    r += 1
  
  r += 1

  xlu.write(ws,r,2, 'Total')
  for i in range(4,K.YEAR_MAX+4):
    xlu.write(ws,r, i,
                '=SUM({start}:{end})'.format(
                    start = xlu.rowcol_to_cell(tot_start, i),
                    end = xlu.rowcol_to_cell(tot_end, i),
                ), XlFmt.f_ov_euro)

  i += 2
  xlu.write(ws,r, i,
            '=SUM({start}:{end})'.format(
                    start = xlu.rowcol_to_cell(r, 4),
                    end = xlu.rowcol_to_cell(r, K.YEAR_MAX+3)),
            XlFmt.f_ov_euro)
    
  i += 3
  xlu.write(ws,r, i, 'total', XlFmt.f_ov_center)
  i += 1
  for y in range(0, K.YEAR_MAX+1):
    xlu.write(ws,r, i+y,
                '=SUM({start}:{end})'.format(
                    start = xlu.rowcol_to_cell(tot_start, i+y),
                    end = xlu.rowcol_to_cell(tot_end, i+y),
                ), XlFmt.f_ov_euro)

  xlu.set_column_width(ws,1,2)  
  for i in range(4,K.YEAR_MAX+4):
    xlu.set_column_width(ws, i, 14)
  i += 1
  xlu.set_column_width(ws, i, 2)  
  i += 1
  xlu.set_column_width(ws, i, 14)

  # ~ xlu.write(ws,r+2, i+3, 'START', XlFmt.f_ov_center)
  # ~ xlu.write(ws,r+2, i+4+K.YEAR_MAX, 'END', XlFmt.f_ov_center)

  xlu.group_columns(ws, i+3, i+4+K.YEAR_MAX, hide=True)
  
