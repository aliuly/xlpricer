try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import sys

from . import xlbom
from . import xlu

from .constants import K
from .xlfmt import XlFmt

#
# Repricing...
#
# For each sheet
#   For each row... find:
#       - Qty
#       - Cloud Desc
#       - Region
#       - Tier Calc
#       - Sub-total per unit
#   If not found, we exit...
#
#   For each row ... With Tier in Tier Calc
#     Get Cloud Desc, Region, find the price in tiers
#     Update Sub-total per unit
#
# Make Header Columns protected using data validation without dropbox
#
def reprice_tiers(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Reprice tier tables

  :param xl: xl utility object
  :param apidat: dictionary with results from API queries
  '''
  columns = [ K.CN_QTY, K.CN_DESC, K.CN_REGION, K.CN_TIER_CALC, K.CN_SUBTOTAL_UNIT ]
  scanning = True
  tier_index = None

  for ws in xl.xl:
    if ws.title == K.WS_PRICES: continue
    sys.stderr.write(f'Tier repricing {ws.title}..')
    count = 0
    for row in ws.iter_rows():
      if scanning:
        found = [False]*len(columns)
        colmap = dict()
        for cell in row:
          if not (value := str(cell.value)) in columns: continue
          i = columns.index(value)
          found[i] = True
          colmap[value] = cell.col_idx
        if all(found):
          scanning = False
          sys.stderr.write('. Fixing..')
      else:
        if len(row) == 0: continue
        r = row[0].row
        if ws.cell(r,colmap[K.CN_TIER_CALC]).value != 'Tier': continue
        if tier_index is None: tier_index = index_tiers(apidat)
        region = ws.cell(r,colmap[K.CN_REGION]).value
        if region.startswith('=$'): region = ws[region[2:]].value
        tid = f'{ws.cell(r,colmap[K.CN_DESC]).value}\n{region}'
        if not tid in tier_index:
          sys.stderr.write('!\n')
          sys.stderr.write(f'Missing entry for: {tid.replace('\n',':')}\n')
          continue
        sys.stderr.write('.')
        count += 1
        if (count % 40) == 0: sys.stderr.write('\n')
        ws.cell(r,colmap[K.CN_SUBTOTAL_UNIT]).value = tier_index[tid]

    sys.stderr.write('.OK\n')
    if count == 1:
      sys.stderr.write('one price updated\n')
    elif count > 1:
      sys.stderr.write(f'{count} prices updated\n')

def index_tiers(apidat:dict) -> dict:
  idx = dict()
  for tid,vv in apidat['tiers'].items():
    for tariff in vv[K.COL_XLTARIFFS]:
      k = f'{tariff[K.COL_XLTITLE]}\n{tariff["region"]}'
      idx[k] = tariff['priceAmount']
  return idx


def bom_tiers(xl:xlu.XlUtils, apidat:dict, r:int, yearrow:int, yrmx:int, COLUMNS:list) -> None:
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

  xlu.write(ws, r,2,'Tiered Volume Pricing', XlFmt.f_sumline)
  for c in range(3,coloffs+1): xlu.write(ws, r, c, None, XlFmt.f_sumline)

  # ~ n = dict()
  # ~ for i in range(0,len(COLUMNS)): n[COLUMNS[i]] = i

  _, desc_col = xlu.cell_to_rowcol(xl.ref('#f_desc'))
  _, qty_col = xlu.cell_to_rowcol(xl.ref('#f_qty'))
  _, vcpu_col = xlu.cell_to_rowcol(xl.ref('#f_vcpu'))
  _, tier_col = xlu.cell_to_rowcol(xl.ref('#f_tier_calc'))
  _, region_col = xlu.cell_to_rowcol(xl.ref('#f_reg'))
  _, up_col = xlu.cell_to_rowcol(xl.ref('#f_pmonth'))
  _, tot_col = xlu.cell_to_rowcol(xl.ref('#f_tot_qty'))
  _, sku_col = xlu.cell_to_rowcol(xl.ref('#f_sku'))
  _, tot1_col = xlu.cell_to_rowcol(xl.ref('#f_tot_1'))
  _, totqty_col = xlu.cell_to_rowcol(xl.ref('#f_tot_qty'))

  xlu.write(ws, r, tier_col, 'Total', XlFmt.f_sumline)
  r += 1
  sum_row = r

  tiers = list(apidat['tiers'].keys())
  tiers.sort()

  for ttariff in tiers:
    r += 2+len(apidat['tiers'][ttariff][K.COL_XLTARIFFS])
  # ~ ic(sum_row,r)
  xlu.group_rows(ws, sum_row, r, level=1,hide=True)
  r = sum_row

  for ttariff in tiers:
    # ~ ws.set_row(r,None,None,{'level':1, 'hidden': 1})

    xl.rowrefs(r)
    for c in range(1,len(COLUMNS)+1):
      xlbom.ws_bom_cell(xl,r,c, COLUMNS[c-1],'')
    xlbom.ws_bom_cell(xl,r,vcpu_col, COLUMNS[region_col-1], apidat['tiers'][ttariff]['region'])
    xlbom.ws_bom_cell(xl,r,desc_col, COLUMNS[desc_col-1],apidat['tiers'][ttariff][K.COL_XLTITLE])
    xlbom.ws_bom_cell(xl,r,tier_col, COLUMNS[tier_col-1],'Vol')
    xlu.data_validation_list(ws, r,tier_col, ['Vol'], True)
    xlbom.ws_bom_cell(xl,r,qty_col, COLUMNS[qty_col-1], '=SUMIFS({f_qty}:{f_qty},{f_desc}:{f_desc},"="&{#f_desc},{f_tier_calc}:{f_tier_calc},"=",{f_reg}:{f_reg},"="&{#f_reg})')
    xlbom.ws_bom_cell(xl,r,region_col, COLUMNS[region_col-1],apidat['tiers'][ttariff]['region'])

    # ~ XlBomCols.cell(ws,r,1,R,
        # ~ '=SUMIFS({f_qty}:{f_qty},{f_desc}:{f_desc},"="&{#f_desc},{f_tier_calc}:{f_tier_calc},"=",{f_reg}:{f_reg},"="&{#f_reg})'.format(**R))
    xl.ref(**{
        '#volcell': xlu.rowcol_to_cell(r,2,False,True),
        '#region': xl.ref('#f_reg'),
    })
    r += 1
    first = None
    gstart = r
    for tariff in apidat['tiers'][ttariff][K.COL_XLTARIFFS]:
      # ~ ws.set_row(r,None,None,{'level':2, 'hidden': 1})
      xl.rowrefs(r)
      last = xl.ref('#f_tot_qty')
      if first is None: first = last

      for c in range(1,len(COLUMNS)+1):
        xlbom.ws_bom_cell(xl,r,c, COLUMNS[c-1], '')
      xlbom.ws_bom_cell(xl,r,tier_col, COLUMNS[tier_col-1],'Tier')
      xlu.data_validation_list(ws, r,tier_col, ['Tier'], True)
      xlbom.ws_bom_cell(xl,r,desc_col, COLUMNS[desc_col-1], tariff[K.COL_XLTITLE])

      xl.ref(Tmin = 0 if tariff['fromOn'] == 0 else tariff['fromOn']-1,
             Tmax = tariff['upTo'])
      f = 'IF({#volcell}>={Tmin},{#volcell}-{Tmin},0)'
      if tariff['upTo']: f = 'IF({#volcell}>{Tmax},{Tmax}-{Tmin},'+f+')'
      # ~ if not R['Tmax'] is None: f = 'IF({#volcell}>{Tmax},{Tmax}-{Tmin},'+f+')'
      xlbom.ws_bom_cell(xl,r,qty_col, COLUMNS[qty_col-1], '='+f)
      xlbom.ws_bom_cell(xl,r,region_col, COLUMNS[region_col-1], '={#region}')
      xlbom.ws_bom_cell(xl,r,tot1_col, COLUMNS[tot1_col-1], tariff['priceAmount'])
      xlbom.ws_bom_cell(xl,r,totqty_col, COLUMNS[totqty_col-1])

      r += 1
    # ~ ic(gstart,r)
    xlu.group_rows(ws, gstart, r-1, level=2,hide=True)

    xlbom.ws_bom_cell(xl,r, tot_col, COLUMNS[tot_col-1], f'=SUM({first}:{last})')
    # ~ XlBomCols.cell(ws,r,tot_col,R,f)
    # ~ ws.set_row(r,None,None,{'level':1, 'hidden': 1})
    xlbom.ws_inflation(xl, r, yrmx, yearrow, COLUMNS, True)

    r+=1

  xlu.write(ws, sum_row-1, totqty_col, '=SUMIFS({start}:{end},{cstart}:{cend},"=")'.format(
    start = xlu.rowcol_to_cell(sum_row,totqty_col,False,True),
    end = xlu.rowcol_to_cell(r,totqty_col,False,True),
    cstart = xlu.rowcol_to_cell(sum_row,tier_col,False,True),
    cend = xlu.rowcol_to_cell(r,tier_col,False,True),
  ), XlFmt.f_sumline_total)

