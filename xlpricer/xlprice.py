#!/usr/bin/env python3
'''Write XLSX with prices
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import re

from . import xlu
from .constants import K
from .xlfmt import XlFmt

def ws_prices(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Write to prices tab

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''
  ws = xl.ws(K.WS_PRICES)
  r = 1

  xlu.write(ws,r,1, 'Price List', XlFmt.f_title)

  colmap = dict()
  c = 2
  r += 1

  overrides = {
    'id': 20,
    'idGroupTiered': 10,
    'productId': 16,
    'opiFlavour': 20,
    'productName': 37,
    'description': 30,
    'ram': 7,
    'fromOn': 10.5,
    'upTo': 10.5,
  }
  xlu.set_column_width(ws,1,50)

  for k,h in apidat['columns'].items():
    colmap[c] = k
    colmap[k] = c
    xlu.write(ws,r,c, f'{h}\n({k})', XlFmt.f_header)
    xlu.set_column_width(ws,c,overrides[k] if (k in overrides) else len(h)*1.25)
    c += 1

  colmap[K.COL_LAST] = c

  xlu.freeze_panes(ws, r+1, 2)
  top = r

  RE_ISINT = re.compile(r'^[0-9]+$')
  RE_ISFLOAT = re.compile(r'^[0-9]+\.[0-9]+$')

  for rec in apidat['flatten']:
    if rec['productName'] == '': continue

    r += 1
    xlu.write(ws,r,1, rec[K.COL_XLTITLE], XlFmt.f_def_data)

    for k in apidat['columns']:
      if not k in rec: continue
      v = rec[k]
      if isinstance(v,float) or (isinstance(v,str) and RE_ISFLOAT.search(v)):
        fmt = XlFmt.f_lst_price2 if float(v) >= 1000 else XlFmt.f_lst_price1
      elif isinstance(v,int) or (isinstance(v,str) and RE_ISINT.search(v)):
        fmt = XlFmt.f_lst_num
      else:
        fmt = XlFmt.f_def_data

      xlu.write(ws,r,colmap[k], v, fmt)

  xlu.autofilter(ws, top,1, r, colmap[K.COL_LAST]-1)

  xl.ref(**{
    K.RF_PRICES_DESCS: f'{ws.title}!{xlu.col_to_name(1,True)}:{xlu.col_to_name(1,True)}',
    K.RF_PRICES_REGION: f'{ws.title}!{xlu.col_to_name(colmap["region"],True)}:{xlu.col_to_name(colmap["region"],True)}',
    K.RF_PRICES_TABLE: f'{ws.title}!{xlu.col_to_name(1,True)}:{xlu.col_to_name(colmap[K.COL_LAST],True)}',
  })
  for k in apidat['columns'].keys():
    xl.ref(**{ 'cm_' + k : colmap[k] })






