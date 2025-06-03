#!/usr/bin/env python3
'''Write XLSX with prices
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import os
import sys


from . import xlass
from . import xlbom
from . import xlprice
from . import xlsrv
from . import xlu
from . import xltier
from .constants import K
from .xlfmt import XlFmt

def xlsx_write(xlfile:str, apidat:dict) -> None:
  '''Create Pricing template

  :param xlfile: File to write to
  :param apidat: API data read
  '''
  while True:
    try:
      if os.path.isfile(xlfile): os.unlink(xlfile)
    except PermissionError as e:
      decision = input("Exception caught : %s\n"
                       "Please close the file if it is open in Excel.\n"
                       "Try to write file again? [Y/n]: " % e)
      if decision != 'n': continue
      sys.stderr.write(str(e)+'\n')
      sys.exit(1)
    break

  xl = xlu.XlUtils(xlfile)
  xl.add_worksheet(K.WS_COMPONENT)
  xl.add_worksheet(K.WS_PRICES)
  xl.add_worksheet(K.WS_ASSUMPTIONS)
  if len(apidat['services']): xl.add_worksheet(K.WS_SERVICES)
  

  for lst in [K.VL_EVS, K.VL_CBR, K.VL_REGIONS]:
    xl.add_vlist(lst)
    for item in apidat['choices'][lst]:
      xl.vlist(lst,item)

  xl.load_fmt(XlFmt)
  if len(apidat['services']): xlsrv.ws_services(xl, apidat)
  xlass.ws_ass(xl, apidat)
  xlprice.ws_prices(xl, apidat)
  # ~ ic(xl.ref())
  xlbom.ws_bom(xl, apidat)

  xl.close()

def xlsx_refresh(xlfile:str, apidat:dict, xlout:str|None = None) -> None:
  '''Update workbook with latest pricing
  :param xlfile: File to reprice
  :param apidat: API data read
  '''
  xl = xlu.XlUtils(xlfile)
  sys.stderr.write('Nuke prices..')
  xlu.nuke_ws(xl.ws(K.WS_PRICES))
  sys.stderr.write('.OK\n')
  xl.load_fmt(XlFmt)
  xlprice.ws_prices(xl, apidat)
  xltier.reprice_tiers(xl, apidat)
  xl.close(xlout)

def xlsx_sanitize(xlin:str, xlout:str) -> None:

  # First read values from workbook...
  xd = xlu.XlUtils(xlin, rdonly=True, data=True)
  data = dict()

  sys.stderr.write('Reading values..')
  for ws in xd.xl:
    if ws.title == K.WS_PRICES: continue
    data[ws.title] = dict()
    for row in ws.iter_rows():
      for cell in row:
        if cell.value is None: continue
        pos = cell.coordinate
        data[ws.title][pos] = cell.value
  del xd
  sys.stderr.write('.OK\n')


  # Load the workbook for updating
  xd = xlu.XlUtils(xlin)

  sys.stderr.write('Sanitizing...')
  # Delete defined names... currently only price description list..
  xd.delete_name(K.XLN_PRICES_DESCS)

  # Iterate over all sheets
  for ws in xd.xl:
    if ws.title == K.WS_PRICES: continue
    sys.stderr.write(f' {ws.title}')

    dv_victims = list()
    for dv in ws.data_validations.dataValidation:
      if dv.type != 'list' or not (dv.formula1.startswith(K.WS_PRICES+'!') or (K.XLN_PRICES_DESCS in str(dv.formula1))): continue
      dv_victims.append(dv)
    for dv in dv_victims:
      ws.data_validations.dataValidation.remove(dv)
  
      # ~ ic(dv.cells, dv.formula1)
      # ~ for i in dv.cells.ranges:
        # ~ pos = i.coord
        # ~ f1 = data[ws.title][pos] if pos in data[ws.title]: data[ws.title][pos]
        # ~ ic(i,type(i),i.coord)
      # ~ c = [[dv.cells.ranges][0]][0]
      # ~ ic(c,type(c),c.coord)

    for row in ws.iter_rows():
      for cell in row:
        if cell.value is None: continue
        # ~ ic(cell)
          # ~ ic(pos)
          # ~ ic(cell.value)
        pos = cell.coordinate
        if cell.data_type != 'f': continue
        if isinstance(cell.value,str) and not (K.WS_PRICES in cell.value): continue
        if not pos in data[ws.title]:
          data_value = None
        else:
          data_value = data[ws.title][pos]
        cell.value = data_value
  sys.stderr.write('. OK\n')

  sys.stderr.write('Finalizing..')
  ws = xd.ws(K.WS_PRICES)
  xd.xl.remove(ws)
  sys.stderr.write('.OK\n')

  xd.close(xlout)


