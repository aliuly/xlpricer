#!/usr/bin/env python3
'''
Include pricing data from json files...
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import json
import os
import sys

from .constants import K
DEFAULTS = {
  'R12': 0.0,
  'R24': 0.0,
  'R36': 0.0,
  'RU12': 0.0,
  'RU24': 0.0,
  'RU36': 0.0,
  'currency': 'EUR',
  'fromOn': 0,
  'isMRC': False,
  'minAmount': 0,
  'ram': 0,
  'vCpu': 0,
}


def inc_records(records:list, recgrp:str ,apidat:dict) -> None:
  '''Merge records into the results
  
  :param records: records to merge
  :param recgrp: record grouip ID to merge to
  :param apidat: results of API queries
  '''
  if not recgrp in apidat['records']: apidat['records'][recgrp] = list()
  for rec in records:    
    if not '_idGroup' in rec: rec['_idGroup'] = recgrp
    for c in apidat['columns']:
      if not c in rec:
        rec[c] = DEFAULTS[c] if c in DEFAULTS else ''
    if rec['region'] == '*':
      for region in ['eu-nl','eu-de']:
        rec['region'] = region
        apidat['records'][recgrp].append(rec.copy())
    else:
      apidat['records'][recgrp].append(rec)

def json_prices(include:str, apidat:dict) -> None:
  '''Include prices from file
  
  :param include: JSON file to read
  :param apidat: result set to modify
  '''
  sys.stderr.write(f'Including {include}..')
  with open(include) as fp:
    jsdat = json.load(fp)  
  if not isinstance(jsdat,list): raise TypeError(f'{include} must contain a list\n')
  recgrp = os.path.basename(include)
  if recgrp.lower().endswith('.json'): recgrp = recgrp[:-5]
  inc_records(jsdat, recgrp, apidat)
  sys.stderr.write('.OK\n')
  if not 'includes' in apidat: apidat['includes'] = list()
  apidat['includes'].append([recgrp, include, os.path.getmtime(include)])

def fixed_prices(apidat:dict) -> None:
  '''Add fixed prices
  
  :param apidat: result set to modify
  '''
  
  inc_records([
    { # Anti DDOS
      'id': 'FREE_ANTI_DDOS',
      'productName': 'Anti-DDOS',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_CES',
      'productName': 'Cloud Eye Service',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_CTS',
      'productName': 'Cloud Trace Service',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_IAM',
      'productName': 'Identity and Access Management',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'OTC_SWR_TRAFFIC',
      'productName': 'Software Repository Traffic for Containers',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'OTC_SWR_SIZE',
      'productName': 'Software Repository Storage for Containers',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_VPC_PEER',
      'productName': 'VPC peering',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_VPC',
      'productName': 'Virtual Private Cloud (VPC)',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_VPCFW',
      'productName': 'VPC Basic Firewall',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },
    {
      'id': 'FREE_ASM',
      'productName': 'Application Service Mesh (ASM)',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },    
    {
      'id': 'FREE_AS',
      'productName': 'Auto Scaling',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },    
    {
      'id': 'FREE_IMS',
      'productName': 'Image Management Service',
      'productFamily': K.FAMILY,
      'unit': 'item',
      'region': '*',
    },    
  ], K.FAMILY, apidat)
  
  
