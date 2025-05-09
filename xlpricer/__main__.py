'''
Pricer entry point
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import argparse
import json
import os
import sys

import xlpricer.cache as cache
import xlpricer.normalize as normalize
import xlpricer.noswiss as noswiss
import xlpricer.proxycfg as proxycfg
import xlpricer.price_api as price_api
import xlpricer.xlsw as xlsw
import xlpricer.wiz as wiz
from xlpricer.constants import K
from xlpricer.version import VERSION
from xlpricer.xlu import today


def make_parser():
  ''' Command Line Interface argument parser '''
  name = sys.argv[0]
  if os.path.basename(name) == '__main__.py':
    name = os.path.basename(os.path.dirname(name))

  cli = argparse.ArgumentParser(prog=name,description="Offline pricing calculator builder")
  cli.add_argument('-d', '--debug', help='Turn on debugging options', action='store_true', default = False)
  cli.add_argument('-V','--version', action='version', version='%(prog)s '+ VERSION)

  subs = cli.add_subparsers(dest='command', help='Available subcommands')

  sub0 = subs.add_parser('showproxy',help ='Show proxy configuration')
  sub0.add_argument('-A','--autocfg',help='Use WinReg to configure proxy (default)', action='store_true', default = True)
  sub0.add_argument('-a','--no-autocfg',help='Skip proxy autoconfig', action='store_false', dest = 'autocfg')

  sub1 = subs.add_parser('build',help='Build a pricing calculator')
  sub2 = subs.add_parser('reprice',help='Update prices of an existing sheet')
  for pp in [sub1,sub2]:
    pp.add_argument('-A','--autocfg',help='Use WinReg to configure proxy (default)', action='store_true', default = True)
    pp.add_argument('-a','--no-autocfg',help='Skip proxy autoconfig', action='store_false', dest = 'autocfg')
    pp.add_argument('--url', help='Specify the API URL format', default = K.DEF_API_ENDPOINT, type=str)
    pp.add_argument('-l','--lang', help='Select language API',type=str, default = 'en', choices=['en','de'])
    pp.add_argument('--load',help='Do not query API, but load from file', type=str, default =None)
    pp.add_argument('--save',help='Save the results of the API queries to a file', type=str, default =None)
    pp.add_argument('--swiss',help='Do not filter eu-ch2 entries', default=False,action='store_true')

  sub1.add_argument('xlsx', help = 'File to create',nargs='?')
  sub2.add_argument('xlsx', help = 'File to modify')

  sub3 = subs.add_parser('prep', help = 'Prepare file for release')
  sub3.add_argument('input_xlsx', help = 'Input file')
  sub3.add_argument('output_xlsx', help = 'Output file',nargs='?')

  return cli


if __name__ == '__main__':
  cli = make_parser()
  args = cli.parse_args()
  if args.command is None:
    cli.print_help()
    sys.stderr.write('Running Wizard interface...\nPrese ESC to exit\n')
    wiz.run_ui()
    sys.exit(0)
  ic(args)
  if args.command == 'showproxy':
    proxycfg.show_proxy(args.autocfg, args.debug)
    sys.exit(0)
  if args.debug: price_api.http_logging()

  if args.command == 'build' or args.command == 'reprice':
    if args.load:
      res = cache.load(args.load)
    else:
      if args.autocfg: proxycfg.proxy_cfg(args.debug)
      res = price_api.fetch_prices(args.url.format(lang = args.lang))

    if args.save: cache.save(args.save, res)

    if not args.swiss:
      # Filter swiss entries...
      noswiss.filter(res)

    sys.stderr.write('Normalizing prices..')
    normalize.normalize(res)
    sys.stderr.write('..OK\n')

    # Check for duplicates
    sys.stderr.write('Dup check\n')
    dups = dict()
    for r in range(0, len(res['flatten'])):
      rowid = '\n'.join([res['flatten'][r][K.COL_XLTITLE],res['flatten'][r]['region']])
      if rowid in dups:
        dups[rowid].append(r)
      else:
        dups[rowid] = [r]
    for dup,rows in dups.items():
      if len(rows) == 1: continue
      if args.debug:
        ic(dup)
        for r in rows:
          ic(r,res['flatten'][r])
      else:
        rows = ','.join(map(str,rows))
        ic(dup,rows)
    sys.stderr.write('Done!\n')

    if args.command == 'build':
      xlsw.xlsx_write(K.DEF_BUILD_FILENAME.format(date=today()) if args.xlsx is None else args.xlsx, res)
      sys.exit(0)
    elif args.command == 'reprice':
      xlsw.xlsx_refresh(args.xlsx, res)
      sys.exit(0)
  elif args.command == 'prep':
    if args.output_xlsx is None:
      args.output_xlsx = args.input_xlsx.replace(K.DEF_BUILD_RENAME_TAG,K.DEF_BUILD_RENAME_NEW)
      if args.output_xlsx == args.input_xlsx: args.output_xlsx = f'{K.DEF_BUILD_RENAME_NEW} {args.input_xlsx}'
    xlsw.xlsx_sanitize(args.input_xlsx,args.output_xlsx)
    sys.exit(0)

  raise RuntimeError(f'Command {args.command} not implemented')

