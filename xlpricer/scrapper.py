'''
Implements a Scrapper Run-time environmen
'''
import argparse
import os
import sys
import re
import requests
import tempfile
import yaml

from . import cache
from . import pdf

from .constants import K

def print_yaml(*args):
  for arg in args:
    print(yaml.dump(arg))

def save_url(url:str, params:dict=dict(), savepath:str|None = None) -> str:
  '''Save URL to a file
  
  If no file is specifed, it will create one in the temp directory
  
  :param url: URL to fetch
  :param params: query parameters
  :param savepath: None, otherwise specify a new file name
  
  '''
  if savepath is None:
    base = os.path.basename(url)
    ext = ''
    if '.' in base:
      i = base.rindex('.')
      ext = base[i:]
      base = base[:i]
    i = 0
    tempdir = tempfile.gettempdir()
    savepath = os.path.join(tempdir,base+ext)
    while os.path.isfile(savepath):
      i += 1
      savepath = os.path.join(tempdir,f'{base}{i}{ext}')

  res = requests.get(url, params=params)
  res.raise_for_status()
  
  with open(savepath,'wb') as fp:
    fp.write(res.content)

  return savepath

def make_api_record(row:list,hdr:list, colmap:dict, fixed:dict) -> dict:
  '''Translate a table to an API compatible record
  
  :param row: row to convert
  :param hdr: header row
  :param colmap: map column names
  :param fixed: Additional fixed fields
  :returns: returns converted record
  '''
  rec = dict()
  for c in range(0,len(hdr)):
    if hdr[c] in colmap:
      rec[colmap[hdr[c]]] = row[c]
  rec.update(fixed)
  return rec


def run(script:str,args:list[str]) -> None:
  '''Run the given script
  
  :param args: arguments from command line
  '''
  
  with open(script,'r') as fp:
    src = fp.read()

  exec(src,dict(
      # Global namespace
      K = K,
      args = args,
      argparse = argparse,
      cache = cache,
      make_api_record = make_api_record,
      os = os,
      pdf = pdf,
      re = re,
      save_url = save_url,
      ic = print_yaml,
      ))

