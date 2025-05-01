#!/usr/bin/env python3
'''Write XLSX with prices
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import os

from . import xlass
from . import xlbom
from . import xlprice
from . import xlsrv
from . import xlu
from .constants import K
from .xlfmt import XlFmt

def xlsx_write(xlfile:str, apidat:dict) -> None:
  '''Create Pricing template

  :param xlfile: File to write to
  :param apidat: API data read
  '''
  if os.path.isfile(xlfile): os.unlink(xlfile)
  xl = xlu.XlUtils(xlfile)
  xl.add_worksheet(K.WS_COMPONENT)
  xl.add_worksheet(K.WS_PRICES)
  xl.add_worksheet(K.WS_ASSUMPTIONS)
  xl.add_worksheet(K.WS_SERVICES)

  for lst in [K.VL_EVS, K.VL_CBR, K.VL_REGIONS]:
    xl.add_vlist(lst)
    for item in apidat['choices'][lst]:
      xl.vlist(lst,item)

  xl.load_fmt(XlFmt)
  xlsrv.ws_services(xl, apidat)
  xlass.ws_ass(xl)
  xlprice.ws_prices(xl, apidat)
  ic(xl.ref())
  xlbom.ws_bom(xl, apidat)

  xl.close()



