#!/usr/bin/env python3
'''Write XLSX with service information
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import openpyxl
from . import xlu
from .constants import K
from .xlfmt import XlFmt

def ws_services(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Write to services tab

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''

  ws = xl.ws(K.WS_SERVICES)
  r = 1

  xlu.write(ws, r, 1, 'Open Telekom Cloud services', XlFmt.f_title)

  r += 1
  xlu.write(ws, r, 1, 'ID', XlFmt.f_header)
  xlu.set_column_width(ws, 1, 10)
  xlu.write(ws, r, 2, 'Service', XlFmt.f_header)
  xlu.set_column_width(ws, 2, 20)
  xlu.write(ws, r, 3, 'Description', XlFmt.f_header)
  xlu.set_column_width(ws, 3, 80)

  for i in apidat['services'].values():
    r += 1
    xlu.write(ws, r, 1, i['parameterIdentifier'], XlFmt.f_txtid)
    xlu.write(ws, r, 2, i['title'], XlFmt.f_txtname)
    xlu.write(ws, r, 3, i['description'], XlFmt.f_txtdesc)




