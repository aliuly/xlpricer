#!/usr/bin/env python3
'''Write to assumptions tab
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import openpyxl

from . import whoami
from . import xlu
from .constants import K
from .xlfmt import XlFmt
from .version import VERSION

def write_row(xl:xlu.XlUtils, r:int, row:list|str, vx:dict) -> None:
  '''Write one row in the assumptions
  :param xl: xl utility object
  :param row: in spreadsheet
  :param row: row definition to write
  :param vx: variable state
  '''
  ws = xl.ws(K.WS_ASSUMPTIONS)
  if isinstance(row,str):
    xlu.write(ws,r,2,row, XlFmt.f_hr1)
    for c in range(3,8):
      xlu.write(ws,r, c, None, XlFmt.f_hr1)
  else:
    xlu.write(ws,r,2, None, XlFmt.f_def_data)
    xlu.write(ws,r,3, row[0], XlFmt.f_def_data)
    xlu.write(ws,r,4,
              row[1].format(**vx) if isinstance(row[1],str) else row[1],
              row[2])
    vx[row[0]] = xlu.rowcol_to_cell(r,4)
    if row[4]:
      xlu.data_validation_list(ws,r,4, row[4])
      # ~ ws.data_validation(xlu.rowcol_to_cell(r,4),{
          # ~ 'validate': 'list',
          # ~ 'source': row[4],
        # ~ })
    xlu.write(ws,r,5, None, XlFmt.f_date_c)
    xlu.write(ws,r,6, '*by script*' if row[0] else None, XlFmt.f_def_data)
    xlu.write(ws,r,7, None, XlFmt.f_comment)
    if row[3]: xl.ref(**{row[3]: f'{ws.title}!{xlu.rowcol_to_cell(r,4,True,True)}'})


def ws_ass(xl:xlu.XlUtils, apidat:dict) -> None:
  '''Write to assumptions tab
  :param xl: xl utility object
  '''

  ws = xl.ws(K.WS_ASSUMPTIONS)

  r = 1
  xlu.write(ws,r,1, 'Assumptions', XlFmt.f_title)

  col_widths = [3,3,42,15,10,16,50]
  for c in range(1,len(col_widths)+1):
    xlu.set_column_width(ws,c,col_widths[c-1])

  r += 1
  c = 1
  xlu.write(ws,r,c := c +1,'#',XlFmt.f_header)
  xlu.write(ws,r,c := c +1,'Assumption',XlFmt.f_header)
  xlu.write(ws,r,c := c +1,'Value',XlFmt.f_header)
  xlu.write(ws,r,c := c +1,'When',XlFmt.f_header)
  xlu.write(ws,r,c := c +1,'Who',XlFmt.f_header)
  xlu.write(ws,r,c := c +1,'Comment',XlFmt.f_header)

  vx = dict()
  # ~ if len(self.choices['EVS']) == 0: self.choices['EVS'].append('')
  # ~ if len(self.choices['CBR']) == 0: self.choices['CBR'].append('')
  me = whoami.whoami()
  
  write_row(xl, r:=r+1, 'Meta data', vx)
  write_row(xl, r:=r+1,
      ['Generated', me.username, XlFmt.f_text_c, None, None],
      vx)
  xlu.write(ws,r, 5, xlu.today(), XlFmt.f_date_c)
  if me.fullname != whoami.ERROR_STR and me.email != whoami.ERROR_STR:
    xlu.write(ws,r, 6, f'{me.fullname} <{me.email}>', XlFmt.f_def_data)
  elif me.fullname != whoami.ERROR_STR and me.email == whoami.ERROR_STR:
    xlu.write(ws,r, 6, me.fullname, XlFmt.f_def_data)
  elif me.fullname == whoami.ERROR_STR and me.email != whoami.ERROR_STR:
    xlu.write(ws,r, 6, me.email, XlFmt.f_def_data)
  write_row(xl, r:=r+1,
      ['Script version',VERSION, XlFmt.f_text_c, None, None ],
      vx)
  write_row(xl, r:=r+1,
      ['Format version',K.FORMAT_VERSION, XlFmt.f_text_c, None, None ],
      vx)
  write_row(xl, r:=r+1, 
      [ 'Non-recurrent items', K.AS_ONE_TIME, XlFmt.f_text_c, K.RF_ONE_TIME_ITEM, None ],
      vx)

  if 'includes' in apidat and len(apidat['includes']) > 0:
    write_row(xl, r:=r+1, 'Include files', vx)
    for s in apidat['includes']:
      grp, fpath, mtime = s
      write_row(xl, r:=r+1, [grp, xlu.datestr(mtime), XlFmt.f_date_c, None, None ], vx)
      xlu.write(ws,r,7, fpath, XlFmt.f_def_data)

  for row in [
    'General',
    [ 'Annual inflation rate', K.AS_ANNUAL_INFLATION, XlFmt.f_percent_c, K.RF_INFLATION, None ],
    [ 'Default Region', xlu.pick_default(xl.vlist(K.VL_REGIONS), K.DEFAULT_REGION), XlFmt.f_text_c, K.RF_DEF_REGION, xl.vlist(K.VL_REGIONS)  ],
    [ 'Default EVS', xlu.pick_default(xl.vlist(K.VL_EVS),K.DEFAULT_EVS), XlFmt.f_text_c, K.RF_DEF_EVS,  xl.vlist(K.VL_EVS) ],
    [ 'Default CBR', xlu.pick_default(xl.vlist(K.VL_CBR),K.DEFAULT_CBR), XlFmt.f_text_c, K.RF_DEF_CBR, xl.vlist(K.VL_CBR) ],
    'Backups',
    ['Daily change rate', K.AS_DAILY_CHANGE_RATE, XlFmt.f_percent_c, None, None ],
    ['Number of full', K.AS_NUM_FULL_BACKUPS, XlFmt.f_num_c, None, None ],
    ['Number of Incrementals', K.AS_NUM_INC_BACKUPS, XlFmt.f_num_c, None, None ],
    ['Backup factor',
      '={Number of full}+(1+{Daily change rate})^{Number of Incrementals}',
      XlFmt.f_float_c, 'BACKUP_FACT', None ],
    'Hours',
    ['Full Time (24x7)',K.AS_FT_HOURS, XlFmt.f_num_c, 'FT_HOURS', None ],
    ['Working Hours (10x5)', K.AS_WK_HOURS, XlFmt.f_num_c, None, None ],
    ['Default Hours', '={Full Time (24x7)}', XlFmt.f_num_c, 'DEF_HOURS', None ],
    ['Default Reserved Pkg', 'R24M', XlFmt.f_text_c, 'DEF_RXM', ['','R12M','R24M'] ],
    '',
    ['', '', XlFmt.f_def_data, None, None],
    ['', '', XlFmt.f_def_data, None, None],
  ]:
    write_row(xl, r:=r+1, row, vx)

