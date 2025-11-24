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
  if not recID.startswith(groupID) or recID == groupID: return False
  l = len(groupID)
  if recID != groupID and recID[l] != '_':  return False
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
        # For some reason, the productFamily is empty here
        rec['productFamily'] = 'Management'

      if rec['productName'] == '' or rec['productFamily'] == '':
        # Show on the screen items that do not have productName and productFamily (if debugging)
        # and skip them
        ic(rec['productName']+rec['productFamily'])
        continue

      if rec['productFamily'] == 'Application' and rec['productIdParameter'] == 'dmsvol':
        # We remove these, as it refers to storage to DMS instances, but the prices are
        # actually the same as EVS storage, so there is no need to confuse people
        # with multiple sets of prices that amount to the same thing.
        continue
      elif rec['productFamily'] == 'Compute':
        if rec['productId'] == 'Function Graph':
          # Makes sure that "Function Graph" products have their own category
          rec['productFamily'] = rec['productId']
        elif rec['productIdParameter'] == 'dehl':
          # This seems to duplicate what is in 'productIdParameter' == 'deh'
          continue
        elif rec['serviceType'] == 'Dedicated Host':
          # Make sure that 'Dedicate Hosts' is its own category separate from compute...
          rec['productFamily'] = rec['serviceType']
      elif rec['productFamily'] == 'Container' and rec['productId'] == 'Cloud Container Instance':
        # Makes sure that "Cloud Container Instance" products have their own category
        rec['productFamily'] = rec['productId']
      elif rec['productFamily'] == 'Database' and (
          not rec['id'].startswith('OTC_') 
          or rec['id'].endswith('_LEGACY')
          or rec['id'].endswith('_LEGACY-'+rec['region'])
        ):
        # Remove legacy records
        continue
      elif rec['productFamily'] == 'Storage' and rec['opiFlavour'].startswith('vss.') and rec['productIdParameter'] != 'evs':
        # These seems to be duplicate
        continue
      elif rec['productFamily'] == 'Network':
        if rec['productSection'] == 'eip' or rec['productIdParameter'] == 'drs':
          # This seems duplicate.
          continue
        if rec['productIdParameter'] == 'elb' and rec['unit'] == 'GB':
          # Dedicated load balancer have GB as unit, but it should be 'h'.
          rec['unit'] = 'h'
        
      # Normalize data a bit...
      for k in rec:
        if k.startswith('_') or not k in apidat['columns']:
          # Make sure these are properly defined columns or not
          # the ones generated internally
          # Internal columns start with "_".  Anything else
          # would be a column that should not be there.
          if not k.startswith('_'): ic(k)
          continue
        v = rec[k]
        if v == 999999999999 or v == 999999999999999:
          # These are the max values in the "upTo" and "maxAmount"
          # columns.  We change them to "" so the spreadsheet formulas
          # can detect them more easily.
          v = ''
        if isinstance(v,str):
          if v.endswith(' GiB'):
            # If the value ends with " GiB", we turn it into
            # a proper number. This makes number formatting and
            # calculations in spreadsheets easier.
            v = v[0:len(v)-4]
            if '.' in v:
              v = float(v)
            elif v != '':
              v = int(v)
          elif v.endswith(' '+rec['currency']):
            # If the value ends with currency like for example "EUR",
            # turn it into a proper number.  Makes number formatting
            # and calculations in spreadsheet easier.
            v = float(v[0:len(v)-len(rec['currency'])-1].replace(',',''))
          elif RE_ISINT.search(v):
            # If the value "looks" like an integer, convert to integer,
            # despite being a string.
            v = int(v)
          elif RE_ISFLOAT.search(v):
            # If the value "looks" like an floag, convert to integer,
            # despite being a string.
            v = float(v)
        rec[k] = v

      # Filter-out non-tiered items with tiered data!
      if rec['idGroupTiered'] == '' and (rec['upTo'] != '' or rec['fromOn'] > 1):
        # This records probably are erroneous.
        continue
        
      # Make it easier to identify PayG units...
      #
      # Make sure that prices that require to be multipled by the number
      # of hours always have an "h" at the beginning.  This makes the
      # formulas simpler.
      #
      if rec['unit'].startswith('h'):
        if not rec['unit'].startswith('h/') and rec['unit'] != 'h':
          rec['unit'] = '/'+rec['unit']
      elif rec['unit'].endswith('/h'):
        rec['unit'] = 'h:'+rec['unit']

      # Find items to add to validation lists.
      # - EVS class list
      # - CBR class list
      # - Region list
      if rec['productIdParameter'] == 'evs' and rec['productName'].startswith(K.EVS_PREFIX):
        apidat['choices'][K.VL_EVS].add(rec['productName'][len(K.EVS_PREFIX):])
      if rec['productIdParameter'] == 'cbr' and rec['productName'].startswith(K.CBR_PREFIX) and rec['productName'] != 'CBR Cross Region Traffic Outbound':
        t = rec['productName'][len(K.CBR_PREFIX):len(rec['productName'])-len(' Backup')]
        # ~ ic(rec['productName'],t)
        apidat['choices'][K.VL_CBR].add(t)
      apidat['choices'][K.VL_REGIONS].add(rec['region'])

      # Internally calculated column.  COL_IDG records the result's grouping
      # that was used
      rec[K.COL_IDG] = rid
      
      # Title column.  This is the column used by the spreadsheet to 
      # lookup prices.  It is meant to be unique (if you also include
      # regions) and easy to find items by typing some choice keywords.
      rec[K.COL_XLTITLE] = f'{rec["productFamily"]}: {rec["productName"]}'

      if rec['idGroupTiered'] != '':
        # Create a tiered product item
        #
        # This is used to facilitate the creation of formulas
        # to calculate tiered volumes
        #
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
        # Add GPU specifications to the title column
        rec[K.COL_XLTITLE] += f' {rec["additionalText"]}'

      if (rec['serviceType'] in ['cluster','single']) and (rec['productIdParameter'] == 'dmsk'):
        # For some DMS products, add description column to the title.
        if rec["description"].startswith('DMS Kafka'):
          # Special for DMS Kafka, we remove the "DMS" text from the front as
          # it is already there.
          rec[K.COL_XLTITLE] += f' {rec["description"][4:]}'
        else:
          rec[K.COL_XLTITLE] += f' {rec["description"]}'

      # For prices that have vCPU and RAM configuration we add these
      # to the title column (to make them easier to find).  Also, the
      # flavor is appended.  So you can type for example "1 vcpu 1 GB s3"
      # and Excel will quickly find the right S3 flavor.
      if rec['vCpu'] and rec['vCpu'] != '0': rec[K.COL_XLTITLE] += f' {rec["vCpu"]} vcpu'
      if rec['ram'] and rec['ram'] != '0': rec[K.COL_XLTITLE] += f' {rec["ram"]} GB'
      if (rec['vCpu'] and rec['vCpu'] != '0') and (rec['ram'] and rec['ram'] != '0') and rec['opiFlavour'] != '' and rec['serviceType'] != 'CSS':
        if mv := RE_OPIFLAVOR.search(rec['opiFlavour']):
          rec[K.COL_XLTITLE] += f' {mv.group(1)}'
        else:
          rec[K.COL_XLTITLE] += f' {rec["opiFlavour"]}'


      if rec["additionalText"] != '':
        # For some product lines, it is useful to add the "additionalText" to the title.
        if rec['productFamily'] == 'Container' and isinstance(rec['additionalText'],int):
          rec[K.COL_XLTITLE] += f' (max {rec["additionalText"]} nodes)'
        elif rec['serviceType'] in ['DWS', 'd2', 'i3']:
          rec[K.COL_XLTITLE] += f' {rec["additionalText"]}'
        elif rec['productIdParameter'] == 'gpu':
          rec[K.COL_XLTITLE] += f' - {rec["additionalText"]}'

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
        # Special rules for storage products
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

  
  
