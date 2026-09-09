#!/usr/bin/env python3
'''
Dynamic patching

Patches input data to fix possible upstream data errors
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import sys
from .xlfmt import XlFmt

NOTES = list()

def annotate() -> list[list|str]:
  '''Create an annotation to include in the assumptions tab
  '''
  if not NOTES: return []
  res = [ 'Patches' ]
  for x,y in NOTES:
    res.append([x, y, XlFmt.f_num_c, None, None])
  return res

def apply(apidat:dict) -> None:
  '''Patches data

  :param apidat: API data
  '''
  count = 0
  fixes = {
    'm9': 0,
  }
  for idg in apidat['records']:
    for rec in apidat['records'][idg]:
      ##############################################################
      # FIXING WRONG M9 Data -- GIGO
      ##############################################################
      if 'm9.l.8 Linux' in rec['productName']:
        count += 1
        fixes['m9'] += 1
        was = rec['productName']
        if rec['osUnit'] == 'Open Linux':
          os = 'Linux'
        elif rec['osUnit'] == 'SUSE for SAP':
          os = 'SUSE/SAP'
        else:
          os = rec['osUnit'].split()[0]
        rec['productName'] = f'Memory-optim. {rec["opiFlavour"]} {os}'
        now = rec['productName']
        ic(was, now)
      ##############################################################
      # END OF GIGO FIX!
      ##############################################################
  if count:
    if count == 1:
      sys.stderr.write('One record patched\n')
    else:
      sys.stderr.write(f'{count} records patched\n')
    if fixes['m9']:
      NOTES.append([ 'm9.l8 Linux data -- Applied Fixes', fixes['m9'] ])

