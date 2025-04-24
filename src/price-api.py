#!/usr/bin/env python3
'''Fetch Price data via API

Based on: https://docs.otc.t-systems.com/price-calculator/api-ref/
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import json
import os
import requests
import sys

DEF_API_ENDPOINT = 'https://calculator.otc-service.com/{lang}/open-telekom-price-api/'
SHOWPROXY = 'showproxy'

# ~ import datetime
# ~ import re
# ~ import yaml

def http_logging(level:int = 1) -> None:
  '''Enable HTTP request logging

  :param level: Debug level (defaults to `1`)
  '''
  import http.client
  http.client.HTTPConnection.debuglevel = level

def show_proxy(autocfg:bool, debug:bool = False) -> None:
  '''Handle show proxy sub-command

  :param autocfg: Perform auto configuration
  :param debug: Show extra details
  '''
  if autocfg:
    proxy, url, jstext = proxycfg.proxy_auto_cfg()
    print(f'Auto config URL: {url}')
    print(f'Proxy: {proxy}')
    if debug: print(f'Javascript:\n{jstext}')
  else:
    print('No proxy autoconfiguration')
    if 'http_proxy' in os.environ: print('http_proxy:  {http_proxy}'.format(http_proxy=os.environ['http_proxy']))
    if 'https_proxy' in os.environ: print('https_proxy: {https_proxy}'.format(https_proxy=os.environ['https_proxy']))


def fetch(url:str, **params) -> dict:
  '''Fetch API results
  
  :param url: URL for API end-point format
  :param params: kwargs to be passed as HTTP query
  :returns: A dict containing the parsed JSON response
  '''
  res = requests.get(url,
                      params = params)
  res.raise_for_status()  

  js = json.loads(res.text)
  if js['response']['httpCode'] != 200:
    raise requests.exceptions.HTTPError(f'JSON HTTP Error, httpCode: {js["response"]["httpCode"]}')
  return js['response']


def fetch_prices(url:str,verbose:bool = True) -> dict:
  '''Fetch API results
  
  Handles pagination and initial data normalization
  
  The results is a dict with the following elements:
  
  - `columns` : Column names and their decriptions
  - `services` : Service names and their descriptions
  - `count` : number of records found
  - `records` : A dict containing price records.  Each key of the
     dict is the service key (from the `services` dict.).  Each
     value in the dict is a list of records.
  
  :param url: URL for API end-point format
  :returns: A dict containing results.
  '''
  if verbose: sys.stderr.write('Querying API..')
  r = fetch(url, limitMax=1)
  res = {
    'columns': r['columns'],
    'services': r['services']['records'],
    'count': r['stats']['count'],
    'records': {},
  }
  if verbose: sys.stderr.write(f'..OK\nRecord count: {res["count"]}\n')
  
  limit_max = 499
  offset = 0
  while True:
    if verbose: sys.stderr.write(f'Query offset {offset}..')
    r = fetch(url, limitMax=limit_max,limitFrom=offset)
    if verbose: sys.stderr.write('Ok\n')

    if len(r['result']) == 0: break
    for k,v in r['result'].items():
      if k in res['records']:
        res['records'][k].extend(v)
      else:
        res['records'][k] = v
    if r['stats']['currentPage'] > r['stats']['maxPages']: break
    offset += limit_max   
  
  return res
  

def main(argv:list[str]) -> None:
  '''Main script entry point

  :param argv: Command line arguments
  '''
  cli = make_parser()
  args = cli.parse_args(argv)
  ic(args)

  if args.showproxy:
    show_proxy(args.autocfg, args.debug)
    sys.exit(0)
  if args.debug: http_logging()

  if args.load:
    sys.stderr.write(f'Loading prices from {args.load}..')
    with open(args.load, 'r') as fp:
      res = json.load(fp)
    sys.stderr.write('..OK\n')
  else:
    if args.autocfg: proxycfg.proxy_cfg(args.debug)
    res = fetch_prices(args.url.format(lang = args.lang))

  if args.save:
    sys.stderr.write(f'Saving prices to {args.save}..')
    with open('prices.json','w') as fp:
      fp.write(json.dumps(res,indent=2))
    sys.stderr.write('..OK\n')


  sets = dict()

  for k,v in res['records'].items():
    ic(k)
    for row in v:
      for sk,sv in row.items():
        if not sk in sets: sets[sk] = set()
        sets[sk].add(sv)

  ic(sets)


    


def make_parser():
  ''' Command Line Interface argument parser '''
  cli = argparse.ArgumentParser(prog=sys.argv[0],description="Retrieve consumption data")

  cli.add_argument('-A','--autocfg',help='Use WinReg to configure proxy (default)', action='store_true', default = True)
  cli.add_argument('-a','--no-autocfg',help='Skip proxy autoconfig', action='store_false', dest = 'autocfg')
  cli.add_argument('-V','--version', action='version', version='%(prog)s '+ VERSION)
  cli.add_argument('-d', '--debug', help='Turn on debugging options', action='store_true', default = False)
  cli.add_argument('--showproxy', help = 'Show proxy configuration',action='store_true')
  cli.add_argument('--url', help='Specify the API URL format', default = DEF_API_ENDPOINT, type=str)
  cli.add_argument('-l','--lang', help='Select language API',type=str, default = 'en', choices=['en','de']) 
  cli.add_argument('--load',help='Do not query API, but load from file', type=str, default =None)
  cli.add_argument('--save',help='Save the results of the API queries to a file', type=str, default =None)
  cli.add_argument('files', help = 'Read requests',nargs='*')
  return cli


if __name__ == '__main__':
  import argparse
  import proxycfg
  from __meta__ import VERSION

  main(sys.argv[1:])
  
