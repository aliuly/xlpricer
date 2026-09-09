#!python
#
# Enterprise Support Agreement sheet
#
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import datetime

from . import xlu
from .constants import K
from .xlfmt import XlFmt

ENABLE_ESA = True

BASE_FEE = 2500
OPTIONS = [
  ('Service Credits on ECS/EVS/OBS', 1000),
  ('Dedicated Service Delivery Manager', 3000),
  ('SD Manager on Duty', 6000),
]

VARIABLE_RATE = [
  (    0,   5000, 10),
  ( 5001,  100000, 4),
  (100001, 200000, 3),
  (200001, 500000, 2),
  (500001,  None,  1),
]

def sheet(xl:xlu.XlUtils) -> None:
  '''Write to ESA tab

  This function creates a template worksheet used for calculating
  ESA fixed fees.

  :param xl: xl utility object
  '''
  ws = xl.ws(K.WS_ESA)
  year = datetime.datetime.today().strftime('%Y')
  if int(datetime.datetime.today().strftime('%m')) > 9:
    # Last quarter of the year, we just change the overview to next
    # year!
    year = str(int(year)+1)
  
  r = 2
  xlu.write(ws,r,1, 'Enterprise Support Agreement', XlFmt.f_title)
  
  r += 2
  xlu.write(ws,r,2, 'Fixed Price Component', XlFmt.f_title)

  r += 2
  xlu.write(ws,r,2, 'Item Description', XlFmt.f_sumline)  
  xlu.write(ws,r,3, '', XlFmt.f_sumline)
  xlu.write(ws,r,4, 'Monthly', XlFmt.f_sumline)
  
  r += 1
  xlu.write(ws, r, 2, 'Base Fee', XlFmt.f_text)
  xlu.write(ws, r, 3, 'Y', XlFmt.f_qty)
  is_enabled = xlu.rowcol_to_cell(r,3)
  xlu.data_validation_list(ws, r, 3, ['Y'])
  xlu.write(ws, r, 4, BASE_FEE, XlFmt.f_ov_euro)
  xl.ref(ESA_ENABLED = f'{ws.title}!{xlu.rowcol_to_cell(r,3,True,True)}')

  r += 1
  xlu.write(ws,r,2, 'Optional Components', XlFmt.f_sumline)  
  xlu.write(ws,r,3, ' Y/N', XlFmt.f_sumline)
  xlu.write(ws,r,4, '', XlFmt.f_sumline)

  for text,price in OPTIONS:
    r += 1
    xlu.write(ws, r, 2, text, XlFmt.f_text)
    xlu.write(ws, r, 3, '', XlFmt.f_qty)
    xlu.data_validation_list(ws, r, 3, ['Y','N'])
    xlu.write(ws, r, 4, price, XlFmt.f_ov_euro)

  r += 1
  xlu.write(ws,r,2, 'Total', XlFmt.f_sumline)  
  xlu.write(ws,r,3, '', XlFmt.f_sumline)
  xlu.write(ws,r,4,
            '=IF({is_enabled}="Y",SUMIF({refcol},"=Y",{sumcol}),0)'.format(
              is_enabled = is_enabled,
              refcol = f'{xlu.col_to_name(3)}:{xlu.col_to_name(3)}',
              sumcol = f'{xlu.col_to_name(4)}:{xlu.col_to_name(4)}',
            ),
            XlFmt.f_sumline_total)
  xl.ref(ESA_FIXED_PRICE = f'{ws.title}!{xlu.rowcol_to_cell(r,4,True,True)}')

  xlu.set_column_width(ws,1,2)  
  xlu.set_column_width(ws,2,36)
  xlu.set_column_width(ws,3,6)
  xlu.set_column_width(ws,4,12)

  r = 4
  xlu.write(ws,r,6, 'Uplift bands', XlFmt.f_title)
  
  r += 2
  xlu.write(ws,r,6, 'Oplift range', XlFmt.f_sumline)  
  xlu.write(ws,r,7, '', XlFmt.f_sumline)
  xlu.write(ws,r,8, 'Percentage', XlFmt.f_sumline)
  
  r += 1
  xlu.write(ws, r, 6, 'From', XlFmt.f_text)
  xlu.write(ws, r, 7, 'To', XlFmt.f_text)
  xlu.write(ws, r, 8, '', XlFmt.f_text)
  
  formula = ''
  for frm,to,percent in VARIABLE_RATE:
    r += 1
    xlu.write(ws, r, 6, frm, XlFmt.f_ov_euro)
    xlu.write(ws, r, 7, to, XlFmt.f_ov_euro)
    xlu.write(ws, r, 8, percent/100, XlFmt.f_percent_c)
    if to is not None:
      yes = f'{ws.title}!{xlu.rowcol_to_cell(r+1,8,True,True)}'
      no = formula if formula else  f'{ws.title}!{xlu.rowcol_to_cell(r,8,True,True)}' 
      formula = f'IF({{revenue}}>{ws.title}!{xlu.rowcol_to_cell(r,7,True,True)},{yes},{no})'
      # ~ ic(formula)
  xl.ref(ESA_UPLIFT = formula)

  # ~ ic(formula)
  xlu.set_column_width(ws,6,12)  
  xlu.set_column_width(ws,7,12)
  xlu.set_column_width(ws,8,10)

