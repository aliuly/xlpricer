#!/usr/bin/env python3
'''Write XLSX with service information
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell, xl_cell_to_rowcol
import xlu
from constants import K
from xlfmt import XlFmt

def ws_services(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Write to services tab

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''
  
  ws = xl.ws(K.WS_SERVICES)
  r = 0
  ws.write(r,0, 'Open Telekom Cloud services', XlFmt.f_title)

  r += 1
  ws.write(r,0, 'ID', XlFmt.f_header)    
  ws.set_column(0,0, 10)
  ws.write(r,1, 'Service', XlFmt.f_header)
  ws.set_column(1,1, 20)
  ws.write(r,2, 'Description', XlFmt.f_header)
  ws.set_column(2,2, 80)

  for i in apidat['services'].values():
    r += 1
    ws.write(r,0, i['parameterIdentifier'], XlFmt.f_txtid)
    ws.write(r,1, i['title'], XlFmt.f_txtname)
    ws.write(r,2, i['description'], XlFmt.f_txtdesc)




