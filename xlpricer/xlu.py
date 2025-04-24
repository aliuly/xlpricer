#!/usr/bin/env python3
'''My Excel helper functions
'''

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import datetime
import sys
import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell, xl_cell_to_rowcol


# ~ import re
# ~ import sys
class XlUtils():
  '''Basic Excel class utilities'''
  def __init__(self, xlfile:str):
    '''Constructor
    :param xlfile: Path to excel file to create
    '''   
    self.vlists = dict()
    self.refs = dict()
    self.xl = xlsxwriter.Workbook(xlfile)

  def close(self) -> None:
    '''Finalize writing to the created XLSX file'''
    while True:
      try:
        sys.stderr.write('Writing XLSX file..')
        self.xl.close()
      except xlsxwriter.exceptions.FileCreateError as e:
        decision = input("Exception caught in workbook.close(): %s\n"
                         "Please close the file if it is open in Excel.\n"
                         "Try to write file again? [Y/n]: " % e)
        if decision != 'n': continue
      break
    sys.stderr.write('.OK\n')

  def add_vlist(self, name:str) -> None:
    '''Create a new validation list
    :param name: vlist to create
    '''
    if name in self.vlists: raise KeyError(f'Duplicate vlist {name}')
    self.vlists[name] = list()

  def vlist(self, name:str, value:str|None = None) -> None|list:
    '''Access to validation list
    
    :param name: vlist to access
    :param value: If specified, value is added to the list.  Otherwise the list is returned
    :returns: if no value was specified, returns the validation list
    '''
    if value is None: return self.vlists[name]
    if not value in self.vlists[name]:
      self.vlists[name].append(value)
      self.vlists[name].sort
    
  def ref(self, *args, **kwargs) -> dict|str:
    '''Access to references
    
    If positional parameters are specified, it will return the references
    specified there.
    If kwargs are spcified, these will be used to define references.
    If nothing is specified, returns the refs dictionary
    '''
    if len(args) == 0 and len(kwargs) == 0: return self.refs
    for k,v in kwargs.items():
      self.refs[k] = v
    if len(args) == 1: return self.refs[args[0]]
    res = list()
    for i in args: res.append(self.refs[i])
    return res

  def rowrefs(self, r:int)->None:
    '''Update row references
    :param r: current row
    '''
    for f in list(self.refs.keys()):
      if not f.startswith('f_'): continue
      self.refs['#'+f] = self.refs[f] + str(r)
    self.refs['#'] = str(r)
    
  def ws(self, name:str) -> xlsxwriter.worksheet.Worksheet:
    '''Accesor for the get_worksheet_by_name() function
    
    :param name: name of worksheet to get
    :returns: the given worksheept
    '''
    return self.xl.get_worksheet_by_name(name)
  def add_worksheet(self, name:str) -> xlsxwriter.worksheet.Worksheet:
    '''Accesor for the add_worksheet() function
    
    :param name: name of worksheet to get
    :returns: the given worksheept
    '''
    return self.xl.add_worksheet(name)

  def load_fmt(self, ref:type, prefix = 'f_') -> None:
    '''Loads the defined formats into the open XLSX objec
    
    :param ref: class containing formats
    '''
    for k,v in ref.__dict__.items():
      if not k.startswith(prefix) or not isinstance(v,dict): continue      
      fmt = self.xl.add_format(v)
      setattr(ref,k,fmt)

def today(fmt:str = '%Y-%m-%d') -> str:
  ''' Return today's date as a string
  
  This function is here because I didn't know where else to put it...
  :param fmt: Date format to use
  :returns: a string with today's date formated as YYYY-MM-DD (or as specified by format)
  '''
  return datetime.datetime.today().strftime(fmt)

def pick_default(opts:list, pref:str) -> str:  
  ''' Helper function, select a suitable default from a choice list
  :param opts: list with option strings
  :param pref: Preferred value
  :returns: default value from the list of options
  '''
  if len(opts) == 0: return ''
  if pref in opts: return pref
  return opts[0]
