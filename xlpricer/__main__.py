'''
Pricer entry point
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import argparse
import json
import sys

import xlpricer.normalize as normalize
import xlpricer.noswiss as noswiss
import xlpricer.proxycfg as proxycfg
import xlpricer.price_api as price_api
import xlpricer.xlsw as xlsw
from xlpricer.constants import K
from xlpricer.version import VERSION
from xlpricer.xlu import today


def make_parser():
  ''' Command Line Interface argument parser '''
  cli = argparse.ArgumentParser(prog=sys.argv[0],description="Retrieve consumption data")

  cli.add_argument('-A','--autocfg',help='Use WinReg to configure proxy (default)', action='store_true', default = True)
  cli.add_argument('-a','--no-autocfg',help='Skip proxy autoconfig', action='store_false', dest = 'autocfg')
  cli.add_argument('-V','--version', action='version', version='%(prog)s '+ VERSION)
  cli.add_argument('-d', '--debug', help='Turn on debugging options', action='store_true', default = False)
  cli.add_argument('--showproxy', help = 'Show proxy configuration',action='store_true')
  cli.add_argument('--url', help='Specify the API URL format', default = K.DEF_API_ENDPOINT, type=str)
  cli.add_argument('-l','--lang', help='Select language API',type=str, default = 'en', choices=['en','de']) 
  cli.add_argument('--load',help='Do not query API, but load from file', type=str, default =None)
  cli.add_argument('--save',help='Save the results of the API queries to a file', type=str, default =None)
  cli.add_argument('--swiss',help='Do not filter eu-ch2 entries', default=False,action='store_true')
  cli.add_argument('xlsx', help = 'File to create',nargs='?')
  return cli


if __name__ == '__main__':
  cli = make_parser()
  args = cli.parse_args()
  ic(args)

  if args.showproxy:
    proxycfg.show_proxy(args.autocfg, args.debug)
    sys.exit(0)
  if args.debug: price_api.http_logging()

  if args.load:
    sys.stderr.write(f'Loading prices from {args.load}..')
    with open(args.load, 'r') as fp:
      res = json.load(fp)
    sys.stderr.write('..OK\n')
  else:
    if args.autocfg: proxycfg.proxy_cfg(args.debug)
    res = price_api.fetch_prices(args.url.format(lang = args.lang))

  if args.save:
    sys.stderr.write(f'Saving prices to {args.save}..')
    with open(args.save,'w') as fp:
      fp.write(json.dumps(res,indent=2))
    sys.stderr.write('..OK\n')

  if not args.swiss:
    # Filter swiss entries...
    noswiss.filter(res)

  # ~ sets = dict()
  # ~ for k,v in res['records'].items():
    # ~ ic(k)
    # ~ for row in v:
      # ~ for sk,sv in row.items():
        # ~ if not sk in sets: sets[sk] = set()
        # ~ sets[sk].add(sv)
  # ~ ic(sets)

  normalize.normalize(res)
  # Check for duplicates
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

  # ~ ic(res.keys())
  # ~ ic(res['choices'])  
  xlsw.xlsx_write(f'open-telekom-cloud-prices-{today()}.xlsx' if args.xlsx is None else args.xlsx,res)
