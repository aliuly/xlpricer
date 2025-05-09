#!/usr/bin/env python3
'''Do normalization and transformation of REST API data

'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa


import re

from .constants import K

def validate_tier(groupID:str, recID:str, region:str):
  '''Make sure that the groupID and recordID match correctly
  :param groupID: Group ID to match
  :param recID: Record ID to match
  :param region: region check
  '''
  if not recID.startswith(groupID): return False
  l = len(groupID)
  if recID[l] != '_': return False
  for i in range(l+1,len(recID)):
    if '0' > recID[i] or recID[i] > '9':
      return recID[i:] == ('-'+region)
  return True

def normalize(apidat:dict):
  '''Normalize api data
  
  :param apidat: API retrieved data
  '''
  RE_ISINT = re.compile(r'^[0-9]+$')
  RE_ISFLOAT = re.compile(r'^[0-9]+\.[0-9]+$')
  RE_OPIFLAVOR = re.compile(r'^([^\.]+)\.')

  apidat['tiers'] = dict()
  apidat['choices'] = {
    K.VL_EVS: set(),
    K.VL_CBR: set(),
    K.VL_REGIONS: set(),
  }
  # ~ apidat['flatten'] = dict()
  apidat['flatten'] = list()

  for rid,rlst in apidat['records'].items():
    for rec in rlst:
      # Some fixups...
      if rec['productName'] == 'Enterprise Dashboard Small':
        rec['productFamily'] = 'Management'
      if rec['productName'] == '' or rec['productFamily'] == '':
        ic(rec['productName']+rec['productFamily'])
        continue
      if rec['productFamily'] == 'Application' and rec['productIdParameter'] == 'dmsvol':
        continue
      elif rec['productFamily'] == 'Compute':
        if rec['productId'] == 'Function Graph':
          rec['productFamily'] = rec['productId']
        elif rec['productIdParameter'] == 'dehl':
          continue
      elif rec['productFamily'] == 'Container' and rec['productId'] == 'Cloud Container Instance':
        rec['productFamily'] = rec['productId']
      elif rec['productFamily'] == 'Database' and (
          not rec['id'].startswith('OTC_') 
          or rec['id'].endswith('_LEGACY')
          or rec['id'].endswith('_LEGACY-'+rec['region'])
        ):
        continue
      elif rec['productFamily'] == 'Storage' and rec['opiFlavour'].startswith('vss.') and rec['productIdParameter'] != 'evs':
        continue
      elif rec['productFamily'] == 'Network':
        if rec['productSection'] == 'eip' or rec['productIdParameter'] == 'drs': continue
        if rec['productIdParameter'] == 'elb' and rec['unit'] == 'GB':
          rec['unit'] = 'h'
      
        
      # Normalize data a bit...
      for k in rec:
        if k.startswith('_') or not k in apidat['columns']:
          if not k.startswith('_'): ic(k)
          continue
        v = rec[k]
        if v == 999999999999 or v == 999999999999999: v = ''
        if isinstance(v,str):
          if v.endswith(' GiB'):
            v = v[0:len(v)-4]
            if '.' in v:
              v = float(v)
            elif v != '':
              v = int(v)
          elif v.endswith(' '+rec['currency']):
            v = float(v[0:len(v)-len(rec['currency'])-1].replace(',',''))
          elif RE_ISINT.search(v):
            v = int(v)
          elif RE_ISFLOAT.search(v):
            v = float(v)
        rec[k] = v

      # Filter-out non-tiered items with tiered data!
      if rec['idGroupTiered'] == '' and (rec['upTo'] != '' or rec['fromOn'] > 1): continue
        
      # Make it easier to identify PayG units...
      if rec['unit'].startswith('h'):
        if not rec['unit'].startswith('h/') and rec['unit'] != 'h':
          rec['unit'] = '/'+rec['unit']
      elif rec['unit'].endswith('/h'):
        rec['unit'] = 'h:'+rec['unit']

      if rec['productIdParameter'] == 'evs' and rec['productName'].startswith(K.EVS_PREFIX):
        apidat['choices'][K.VL_EVS].add(rec['productName'][len(K.EVS_PREFIX):])
      if rec['productIdParameter'] == 'cbr' and rec['productName'].startswith(K.CBR_PREFIX) and rec['productName'] != 'CBR Cross Region Traffic Outbound':
        apidat['choices'][K.VL_CBR].add(rec['productName'][len(K.CBR_PREFIX):])
      apidat['choices'][K.VL_REGIONS].add(rec['region'])

      rec[K.COL_XLTITLE] = f'{rec["productFamily"]}: {rec["productName"]}'
      rec[K.COL_IDG] = rid

      if rec['idGroupTiered'] != '':
        # Create a tiered product item
        
        if rec['productFamily'] == 'Security' and rec['productName'] == 'WAF Domain':
          rec[K.COL_XLTITLE] = f'{rec["productFamily"]}: {rec["productId"]}'
          if rec['serviceType'] != '':
            rec[K.COL_XLTITLE] += f' {rec["serviceType"]}'

        if not validate_tier(rec['idGroupTiered'],rec['id'], rec['region']):
          # Skip these as they are all the same
          continue
        
        tierID = f'{rec["idGroupTiered"]}-{rec["region"]}'
        if not tierID in apidat['tiers']:
          apidat['tiers'][tierID] = dict()
          for tc in apidat['columns'].keys():
            apidat['tiers'][tierID][tc] = None
          for tc in ('idGroupTiered', 'region',
                      'productId', 'productName',
                      'osUnit', 'unit', 'description',
                      'productIdParameter', 'productSection',
                      'productType', 'productFamily', 'productCategory',
                      ):
            apidat['tiers'][tierID][tc] = rec[tc]
          apidat['tiers'][tierID][K.COL_XLTIERS] = 0
          apidat['tiers'][tierID][K.COL_XLTITLE] = rec[K.COL_XLTITLE]
          apidat['tiers'][tierID][K.COL_XLTARIFFS] = list()
          apidat['flatten'].append(apidat['tiers'][tierID])
          # ~ if '\n'.join([rec[K.COL_XLTITLE],rec['region']]) in apidat['flatten']:
            # ~ ic('Duplicate',rec[K.COL_XLTITLE])
          # ~ else:
            # ~ apidat['flatten']['\n'.join([rec[K.COL_XLTITLE],rec['region']])] = apidat['tiers'][tierID]

        apidat['tiers'][tierID][K.COL_XLTIERS] += 1
        apidat['tiers'][tierID][K.COL_XLTARIFFS].append(rec)
        rec[K.COL_XLTITLE] += f' [T{apidat["tiers"][tierID][K.COL_XLTIERS]}]'
        # ~ unit = f' {rec["unit"]}' if rec['unit'] != 'h' else ''
        unit = ''
        
        if not rec['fromOn']:
          rec[K.COL_XLTITLE] += f' (until {rec["upTo"]:,}{unit})'
        elif not rec['upTo']:
          rec[K.COL_XLTITLE] += f' (from {rec["fromOn"]:,}{unit})'
        else:
          rec[K.COL_XLTITLE] += f' ({rec["fromOn"]:,} to {rec["upTo"]:,}{unit})'

      if rec["additionalText"] != '' and rec['productId'] == 'GPU Server':
        rec[K.COL_XLTITLE] += f' {rec["additionalText"]}'

      if (rec['serviceType'] in ['cluster','single']) and (rec['productIdParameter'] == 'dmsk'):
        if rec["description"].startswith('DMS Kafka'):
          # Special for DMS
          rec[K.COL_XLTITLE] += f' {rec["description"][4:]}'
        else:
          rec[K.COL_XLTITLE] += f' {rec["description"]}'

      if rec['vCpu'] and rec['vCpu'] != '0': rec[K.COL_XLTITLE] += f' {rec["vCpu"]} vcpu'
      if rec['ram'] and rec['ram'] != '0': rec[K.COL_XLTITLE] += f' {rec["ram"]} GB'
      if (rec['vCpu'] and rec['vCpu'] != '0') and (rec['ram'] and rec['ram'] != '0') and rec['opiFlavour'] != '' and rec['serviceType'] != 'CSS':
        if mv := RE_OPIFLAVOR.search(rec['opiFlavour']):
          rec[K.COL_XLTITLE] += f' {mv.group(1)}'
        else:
          rec[K.COL_XLTITLE] += f' {rec["opiFlavour"]}'
      if rec["additionalText"] != '':
        if rec['productFamily'] == 'Container' and isinstance(rec['additionalText'],int):
          rec[K.COL_XLTITLE] += f' (max {rec["additionalText"]} nodes)'
        elif rec['serviceType'] in ['DWS', 'd2', 'i3']:
          rec[K.COL_XLTITLE] += f' {rec["additionalText"]}'

      if rec['productFamily'] == 'AI':
        # Special rules for AI products
        rec[K.COL_XLTITLE] += f' {rec["serviceType"]}'
      elif rec['productFamily'] == 'Analytics':
        # Special rules for Analytics products
        if rec['serviceType'] == 'CSS':
          rec[K.COL_XLTITLE] += f' {rec["productIdParameter"]}'
        elif rec['serviceType'] == 'PaaS' and rec['productIdParameter'] == 'mrs':
          if rec["productSection"] != 'main': continue
      elif rec['productFamily'] == 'Database':
        # Special rules from database products
        if rec['productIdParameter'] == 'drs' and rec['storageType'] != '':
          rec[K.COL_XLTITLE] += f' ({rec["storageType"]})'
        elif rec['productIdParameter'] == 'rds' and rec['storageType'] != '':
          rec[K.COL_XLTITLE] += f' ({rec["storageType"]})'
      elif rec['productFamily'] == 'Storage':
        if rec['opiFlavour'] == 'obs.crr.outbound':
          rec[K.COL_XLTITLE] += f' ({rec["productId"]})'
        elif rec['_idGroup'].endswith('_PERF'):
          rec[K.COL_XLTITLE] += f' Enhanced'

          
      apidat['flatten'].append(rec)
      # ~ if '\n'.join([rec[K.COL_XLTITLE],rec['region']]) in apidat['flatten']:
        # ~ ic('Duplicate',rec[K.COL_XLTITLE])
      # ~ else:
        # ~ apidat['flatten']['\n'.join([rec[K.COL_XLTITLE],rec['region']])] = rec

      apidat['flatten'].sort(key = lambda d: d[K.COL_XLTITLE])

  
  
