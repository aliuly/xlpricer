#!/usr/bin/env python3
'''Write XLSX with prices
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import re
import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell, xl_cell_to_rowcol

import xlu
from constants import K
from xlfmt import XlFmt

def ws_prices(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Write to prices tab

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''
  ws = xl.ws(K.WS_PRICES)
  r = 0

  ws.write(r,0, 'Price List', XlFmt.f_title)

  colmap = dict()
  c = 1
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
  ws.set_column(0,0, 50)

  for k,h in apidat['columns'].items():
    colmap[c] = k
    colmap[k] = c
    ws.write(r,c, f'{h}\n({k})', XlFmt.f_header)
    ws.set_column(c,c,overrides[k] if (k in overrides) else len(h)*1.25)
    c += 1

  colmap[K.COL_LAST] = c

  ws.freeze_panes(r+1, 1)
  top = r

  RE_ISINT = re.compile(r'^[0-9]+$')
  RE_ISFLOAT = re.compile(r'^[0-9]+\.[0-9]+$')

  for rec in apidat['flatten']:
    if rec['productName'] == '': continue

    r += 1
    ws.write(r,0, rec[K.COL_XLTITLE], XlFmt.f_def_data)

    for k in apidat['columns']:
      if not k in rec: continue
      v = rec[k]
      if isinstance(v,float) or (isinstance(v,str) and RE_ISFLOAT.search(v)):
        fmt = XlFmt.f_lst_price2 if float(v) >= 1000 else XlFmt.f_lst_price1
      elif isinstance(v,int) or (isinstance(v,str) and RE_ISINT.search(v)):
        fmt = XlFmt.f_lst_num
      else:
        fmt = XlFmt.f_def_data

      ws.write(r,colmap[k], v, fmt)
        
  ws.autofilter(top,0, r, colmap[K.COL_LAST]-1)
  
  xl.ref(**{
    K.RF_PRICES_DESCS: f'{ws.name}!{xl_col_to_name(0,True)}:{xl_col_to_name(0,True)}',
    K.RF_PRICES_REGION: f'{ws.name}!{xl_col_to_name(colmap["region"],True)}:{xl_col_to_name(colmap["region"],True)}',
    K.RF_PRICES_TABLE: f'{ws.name}!{xl_col_to_name(0,True)}:{xl_col_to_name(colmap[K.COL_LAST],True)}',
  })
  for k in apidat['columns'].keys():
    xl.ref(**{ 'cm_' + k : colmap[k]+1 })

    
    

    
    
