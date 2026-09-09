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

# ~ import datetime
# ~ import re
# ~ import yaml

def http_logging(level:int = 1) -> None:
  '''Enable HTTP request logging

  :param level: Debug level (defaults to `1`)
  '''
  import http.client
  http.client.HTTPConnection.debuglevel = level

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


def fetch_prices(url:str,verbose:bool = True,**params) -> dict:
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
  :param verbose: show verbose messages
  :param params: kwargs to be passed as HTTP query
  :returns: A dict containing results.
  '''
  if verbose: sys.stderr.write('Querying API..')
  r = fetch(url, limitMax=1, **params)
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
    r = fetch(url, limitMax=limit_max,limitFrom=offset, **params)
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
  
if __name__ == '__main__':
  import argparse
  from constants import K
  import proxycfg
  import yaml

  cli = argparse.ArgumentParser(description='Pricing API test')
  cli.add_argument('-d', '--debug', help='Turn on debugging options', action='store_true', default = False)
  cli.add_argument('-v','--verbose', action='store_true', default=True)
  cli.add_argument('-q','--quite', action='store_false', dest='verbose')
  cli.add_argument('-A','--autocfg',help='Use WinReg to configure proxy (default)', action='store_true', default = True)
  cli.add_argument('-a','--no-autocfg',help='Skip proxy autoconfig', action='store_false', dest = 'autocfg')
  cli.add_argument('--url', help='Specify the API URL format', default = K.DEF_API_ENDPOINT, type=str)
  cli.add_argument('params',help='Additional parameters',nargs='*')
  args = cli.parse_args()
  ic(args)
  params = dict()
  for i in args.params:
    if '=' in i:
      k,v = i.split('=',1)
      params[k] = v
    else:
      params[i] = i
  ic(params)

  if args.debug: http_logging()
  if args.autocfg: proxycfg.proxy_cfg(args.debug)
  prices = fetch_prices(args.url,args.verbose,**params)
  print(yaml.dump(prices))
