#!/usr/bin/env python3
'''Filter out Swiss region
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import sys

def filter(apidat:dict) -> None:
  '''Filter records for Swiss region

  :param apidat: API data
  '''
  region = 'eu-ch2'
  count = 0
  for idg in apidat['records']:
    r = 0
    while r < len(apidat['records'][idg]):
      if 'region' in apidat['records'][idg][r] and apidat['records'][idg][r]['region'] == region:
        del apidat['records'][idg][r]
        count += 1
      else:
        r += 1
  if count == 1:
    sys.stderr.write('One record removed\n')
  else:
    sys.stderr.write(f'{count} records removed\n')




