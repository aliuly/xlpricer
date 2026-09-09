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

def _is_backup_product(rec: dict) -> bool:
    '''Is this record itself a backup product?'''
    pname = rec['productName']
    fam = rec['productFamily']

    # CBR backup services — skip cross-region traffic and "No Backup"
    if fam == 'Storage' and pname.startswith('CBR '):
        if pname in ('CBR Cross Region Traffic Outbound', 'CBR No Backup'):
            return False
        if pname.endswith(' Backup'):      # CBR Server / Volume / SFS Backup
            return True
        return False

    # Database / Analytics backup spaces (case-insensitive)
    if 'backup space' in pname.lower():
        return True

    # Legacy backup products
    if pname in ('Cloud Server Backup Service', 'Volume Backup Service'):
        return True

    return False


def _source_to_backup(rec: dict) -> tuple | None:
    '''For a source product, return (productFamily, productName) of its backup.

    Returns None if no backup product applies.
    '''
    fam = rec['productFamily']
    pname = rec['productName']
    pidpar = rec.get('productIdParameter', '')

    # Backup products themselves are not backed up
    if _is_backup_product(rec):
        return None
    # Also skip CBR aux products
    if fam == 'Storage' and pname.startswith('CBR '):
        return None

    # Compute instances → CBR Server Backup
    if fam == 'Compute':
        return ('Storage', 'CBR Server Backup')

    # Storage
    if fam == 'Storage':
        if pname.startswith('EVS '):
            return ('Storage', 'CBR Volume Backup')
        if pname.startswith('SFS '):
            return ('Storage', 'CBR SFS Backup')
        return None

    # Database
    if fam == 'Database':
        if pidpar == 'rds' and 'Backup' not in pname:
            return ('Database', 'RDS Backup Space')
        if pidpar == 'dds':
            return ('Database', 'DDS Backup Space')
        if pidpar == 'dcs':
            return ('Database', 'DCS Backup Space')
        if 'GeminiDB' in pname and 'Backup' not in pname:
            return ('Database', 'GeminiDB backup space')
        if 'TaurusDB' in pname and 'Backup' not in pname:
            return ('Database', 'Backup Space TaurusDB')
        return None

    # Analytics — DWS
    if fam == 'Analytics' and 'DWS' in pname and 'Backup' not in pname:
        return ('Analytics', 'DWS Backup Space')

    return None


def _evs_to_replicated_type(evs_type: str) -> str | None:
    '''Map an EVS type to its corresponding Replicated Storage type name.

    Returns the Replicated Storage type string (e.g. "High I/O"),
    or None if no mapping applies.
    '''
    if evs_type == 'Common I/O':
        return 'Common I/O'
    elif evs_type == 'High I/O':
        return 'High I/O'
    else:
        return 'Ultra-High I/O'


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

  # Two extra columns: backup product row index + its title
  colmap['_backup_idx'] = c
  xlu.write(ws, r, c, 'Backup Idx', XlFmt.f_header)
  xlu.set_column_width(ws, c, 8)
  c += 1
  colmap['_backup_title'] = c
  xlu.write(ws, r, c, 'Backup Title', XlFmt.f_header)
  xlu.set_column_width(ws, c, 35)
  c += 1

  # Three Replicated Storage columns: normal idx, shared idx, then normal title.
  colmap['_repl_normal_idx'] = c
  xlu.write(ws, r, c, 'Repl Normal Idx', XlFmt.f_header)
  xlu.set_column_width(ws, c, 8)
  c += 1
  colmap['_repl_shared_idx'] = c
  xlu.write(ws, r, c, 'Repl Shared Idx', XlFmt.f_header)
  xlu.set_column_width(ws, c, 8)
  c += 1
  colmap['_repl_normal_title'] = c
  xlu.write(ws, r, c, 'Repl Normal Title', XlFmt.f_header)
  xlu.set_column_width(ws, c, 35)
  c += 1

  colmap[K.COL_LAST] = c

  xlu.freeze_panes(ws, r+1, 2)
  top = r

  RE_ISINT = re.compile(r'^[0-9]+$')
  RE_ISFLOAT = re.compile(r'^[0-9]+\.[0-9]+$')

  # Build lookup: (family, productName, region) -> (row_number, title)
  # for every backup product so we can cross-reference it from source products.
  backup_lookup = {}
  for idx, rec in enumerate(apidat['flatten']):
    if _is_backup_product(rec):
      key = (rec['productFamily'], rec['productName'], rec['region'])
      backup_lookup[key] = (3 + idx, rec[K.COL_XLTITLE])

  # Build lookup for Replicated Storage products (skip the "base" entry).
  repl_lookup = {}
  for idx, rec in enumerate(apidat['flatten']):
    pname = rec['productName']
    if rec['productFamily'] == 'Storage' and pname.startswith('Replicated Storage ') and pname != 'Replicated Storage base':
      key = (rec['productFamily'], rec['productName'], rec['region'])
      repl_lookup[key] = (3 + idx, rec[K.COL_XLTITLE])

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

    # Write backup product cross-reference
    criteria = _source_to_backup(rec)
    if criteria:
      bak_fam, bak_name = criteria
      key = (bak_fam, bak_name, rec['region'])
      if key in backup_lookup:
        bak_row, bak_title = backup_lookup[key]
        xlu.write(ws, r, colmap['_backup_idx'], bak_row, XlFmt.f_num_c)
        xlu.write(ws, r, colmap['_backup_title'], bak_title, XlFmt.f_def_data)

    # Write Replicated Storage cross-reference (EVS products only)
    if rec['productFamily'] == 'Storage':
      pname = rec['productName']
      if pname.startswith('EVS '):
        repl_type = _evs_to_replicated_type(pname[4:])
        if repl_type:
          # Normal (non-shared)
          key = ('Storage', f'Replicated Storage {repl_type}', rec['region'])
          if key in repl_lookup:
            rr, rt = repl_lookup[key]
            xlu.write(ws, r, colmap['_repl_normal_idx'], rr, XlFmt.f_num_c)
            xlu.write(ws, r, colmap['_repl_normal_title'], rt, XlFmt.f_def_data)
          # Shared
          key = ('Storage', f'Replicated Storage {repl_type} shared', rec['region'])
          if key in repl_lookup:
            rr, _ = repl_lookup[key]
            xlu.write(ws, r, colmap['_repl_shared_idx'], rr, XlFmt.f_num_c)

  xlu.autofilter(ws, top,1, r, colmap[K.COL_LAST]-1)

  #
  # Define a name for Price descs.  This makes datavalidation support
  # work properly when re-pricing.
  #
  desc = f'{ws.title}!{xlu.col_to_name(1,True)}:{xlu.col_to_name(1,True)}'
  xl.define_name(K.XLN_PRICES_DESCS, desc)
  xl.ref(**{
    K.RF_PRICES_DESCS: desc,
    K.RF_PRICES_REGION: f'{ws.title}!{xlu.col_to_name(colmap["region"],True)}:{xlu.col_to_name(colmap["region"],True)}',
    K.RF_PRICES_TABLE: f'{ws.title}!{xlu.col_to_name(1,True)}:{xlu.col_to_name(colmap[K.COL_LAST],True)}',
    'LAST_SKU': r,
  })
  for k in apidat['columns'].keys():
    xl.ref(**{ 'cm_' + k : colmap[k] })

  # Register backup reference column indices so xlbom formulas can use them.
  xl.ref(cm_backup_idx = colmap['_backup_idx'])
  xl.ref(cm_backup_title = colmap['_backup_title'])

  # Register Replicated Storage column indices.
  xl.ref(cm_repl_normal_idx = colmap['_repl_normal_idx'])
  xl.ref(cm_repl_normal_title = colmap['_repl_normal_title'])
  xl.ref(cm_repl_shared_idx = colmap['_repl_shared_idx'])






