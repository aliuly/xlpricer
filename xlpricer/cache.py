'''
Cache pricing data
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import json
import os
import sys
from time import time

MAX_CACHE_AGE = 86400

def load(cache_file:str) -> dict:
  '''Load a cache file

  :param cache_file: path to cache file
  '''
  sys.stderr.write(f'Loading prices from {cache_file}..')
  with open(cache_file, 'r') as fp:
    res = json.load(fp)
  sys.stderr.write('..OK\n')
  return res

def save(cache_file:str, apidata:dict) -> None:
  '''Save a cache file

  :param cache_file: path to cache file
  :param apidata: api data to save
  '''
  sys.stderr.write(f'Saving prices to {cache_file}..')
  with open(cache_file,'w') as fp:
    fp.write(json.dumps(apidata,indent=2))
  sys.stderr.write('..OK\n')

def default_cache() -> str:
  '''Generate a default cache file name
  :returns: string with a path to the cache file
  '''
  if len(sys.argv[0]) == 0: return 'prices.json'

  argv0 = sys.argv[0]
  if os.path.basename(argv0) == '__main__.py': argv0 = os.path.dirname(argv0)
  if argv0.lower().endswith('.py'):
    argv0 = argv0[0:-3]
  elif argv0.lower().endswith('.exe'):
    argv0 = argv0[0:-4]
  return f'{argv0}-c.json'

def validate_cache(cache_file:str,use_cache:bool=True) -> dict|None:
  '''Validate cache data

  :param cache_file: path to cache file
  :param use_cache: if true, will try cache, if false, it will always return None

  Will check if the cache file exists and it is not older than `MAX_CACHE_AGE`.
  It will return the cache contents if cache is valid.

  `None` is returned if the cache is invalid.
  '''
  if not use_cache: return None
  if not os.path.isfile(cache_file): return None

  file_time = os.path.getmtime(cache_file)
  if time() - file_time > MAX_CACHE_AGE:
    # Expire the cache file
    os.unlink(cache_file)
    return None

  return load(cache_file)



if __name__ == '__main__':
  print(sys.argv[0])
  ic(default_cache())
