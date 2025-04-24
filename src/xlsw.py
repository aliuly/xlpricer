#!/usr/bin/env python3
'''Write XLSX with prices
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import datetime
import json
import re
import sys
import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell, xl_cell_to_rowcol

import normalize
import xlass
import xlbom
import xlprice
import xlsrv
import xlu
from constants import K
from xlfmt import XlFmt

    
def xlsx_main(argv:list[str]) -> None:
  '''Main script entry point

  :param argv: Command line arguments
  '''
  cli = xlsx_make_parser()
  args = cli.parse_args(argv)
  ic(args)

  if args.load:
    sys.stderr.write(f'Loading prices from {args.load}..')
    with open(args.load, 'r') as fp:
      res = json.load(fp)
    sys.stderr.write('..OK\n')
  else:
    sys.stderr.write('No price file specified.\n')
    sys.exit(1)

  normalize.normalize(res)
  ic(res.keys())
  ic(res['choices'])
  
  xl = xlu.XlUtils('prc.xlsx' if args.xlsx is None else args.xlsx)
    
  xl.add_worksheet(K.WS_COMPONENT)
  xl.add_worksheet(K.WS_PRICES)
  xl.add_worksheet(K.WS_ASSUMPTIONS)
  xl.add_worksheet(K.WS_SERVICES)

  for lst in [K.VL_EVS, K.VL_CBR, K.VL_REGIONS]:
    xl.add_vlist(lst)
    for item in res['choices'][lst]:
      xl.vlist(lst,item)

  xl.load_fmt(XlFmt)
  xlsrv.ws_services(xl, res)
  xlass.ws_ass(xl)  
  xlprice.ws_prices(xl, res)
  xlbom.ws_bom(xl, res)

  xl.close()

def xlsx_make_parser():
  ''' Command Line Interface argument parser '''
  cli = argparse.ArgumentParser(prog=sys.argv[0],description="Retrieve consumption data")

  cli.add_argument('-V','--version', action='version', version='%(prog)s '+ VERSION)
  cli.add_argument('-d', '--debug', help='Turn on debugging options', action='store_true', default = False)
  cli.add_argument('--load',help='Do not query API, but load from file', type=str, default = "prices.json")
  cli.add_argument('xlsx', help = 'File to create',nargs='?')
  return cli


if __name__ == '__main__':
  import argparse
  from __meta__ import VERSION

  xlsx_main(sys.argv[1:])
  
