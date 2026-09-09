#!python
#
# Grab tables
#
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import os
import pdfplumber
import re
import sys

from .constants import K

def process_pdf(pdfname:str) -> dict:
  '''Process a single PDF extracting tables
  
  :param pdfname: string containing the file path to pdf file
  :returns: dict containing scrapped data
  '''

  result = {
    K.KW_meta: {
      K.KW_input: pdfname,
    },
    K.KW_content: list(),
  }
  
  sys.stderr.write(f'Opening {pdfname}..')
  RE_MATCH_REVISED = re.compile(r'(^|\s)last\s+revised:\s+(\d\d)\.(\d\d)\.(\d\d\d\d)(\s|$)', re.IGNORECASE)
  result[K.KW_meta][K.KW_mtime] = os.path.getmtime(pdfname)
  
  with pdfplumber.open(pdfname) as pdf:
    sys.stderr.write('..OK\n')
    for pg in pdf.pages:
      sys.stderr.write(f'Processing {pg}..')
      txt = pg.extract_text_simple()
      cpage = {
        K.KW_page: f'{pg}',
        K.KW_text: txt,
        K.KW_tables: [],
      }
      if not 'revised' in result[K.KW_meta]:
        if mv := RE_MATCH_REVISED.search(txt):
          result[K.KW_meta][K.KW_revised] = f'{mv.group(4)}-{mv.group(3)}-{mv.group(2)}'
          result[K.KW_meta][K.KW_revised_] = [mv.group(2),mv.group(3),mv.group(4)]
          sys.stderr.write(f'Revision date: {result[K.KW_meta][K.KW_revised]}\n')
        
      tabs = pg.find_tables()
      for tabobj in tabs:
        sys.stderr.write('.')
        tab = tabobj.extract()
        cpage[K.KW_tables].append(tab)
        # ~ ic(tab, type(tab))
        # ~ result[K.KW_tables][-1].append(tab)
      # ~ result[K.KW_tables].append(tabs)
      
      result[K.KW_content].append(cpage)
      sys.stderr.write('.OK\n')
  return result

STR_MATCHES = [
  'price EU-DE\nin Euro',
  'EU-DE Open\nElastic in\nEuro/hour',
  'price in Euro',
  'price EU-DE\nin euro/\nmonth',
  'price EU-NL\nin Euro',
  'EU-NL Open\nElastic in\nEuro/hour',
  'price EU-NL\nin euro/\nmonth',
]
'''Strings used to identify price tables'''

def check_hdrsig(header:list[str]) -> bool:
  '''Check if a table is a pricing table
  
  :param header: list containing the header row
  :returns: True if match is found, False otherwise

  This functions checks the table header looking for the STR_MATCHES
  strings.  
  '''
  for key in STR_MATCHES:
    if key in header: return True
  return False

RE_MATCH_FROM = re.compile(r'^(.*)\s+from\s+([^:]+):\s*(.*)$')
'''Regular expression matching prices with a starting date'''

def transform_from_date(tab:dict) -> None:
  '''Normalize prices with "from dates"
  
  Splits the rows contining "from" qualifiers into additional rows.
  
  :param tab: dictionary containing the extracted tables
  '''
  #
  # Handle price from date: price conversions
  #  
  for i in range(len(tab)-1,0,-1):
    mvs = dict()
    for c in range(0,len(tab[i])):
      if not isinstance(tab[i][c],str) or not (mv:=RE_MATCH_FROM.search(tab[i][c].replace("\n","\t"))): continue
      if not mv.group(2) in mvs: mvs[mv.group(2)] = dict()
      mvs[mv.group(2)][c] = [mv.group(1).replace('\t','\n'),mv.group(3).replace('\t','\n')]
    if len(mvs) == 0: continue

    for k,v in mvs.items():
      xrow = tab[i].copy()
      xrow[0] += f' (from {k})'
      for c,price in v.items():
        tab[i][c] = price[0]
        xrow[c] = price[1]
      tab.insert(i+1,xrow)
    tab[i][0] += ' ()'

def transform_w_charging_unit(tab:dict) -> None:
  '''Normalize tables containing charging units
  
  On table that have charging unit columns, make sure that all
  rows contain a charging unit entry.
  
  :param tab: dictionary containing the extracted tables.  This is modified.
  '''
  last_good = None
  for i in range(1,len(tab)):
    good = True
    for c in range(1,len(tab[i])):
      if tab[i][c] is None:
        good = False
        break
    if good: 
      last_good = i
      continue
    for c in range(1,len(tab[i])):
      if tab[i][c] is None: tab[i][c] = tab[last_good][c]

def transform_rownames(tab:dict) -> None:
  '''Normalize tables missing row names
  
  On table that have charging unit columns, make sure that all
  rows contain a name in column 0
  
  :param tab: dictionary containing the extracted tables.  This is modified.
  '''
  last_good = None
  for i in range(1,len(tab)):
    if tab[i][0] is None:
      # OK, we need to fix columns...
      if last_good is None: continue
      for c in range(0,len(tab[0])):
        if tab[i][c] is None: tab[i][c] = tab[last_good][c]      
    else:
      last_good = i

RE_MATCH_TIER_LINE = re.compile(r'^(.*)\s+to\s+(.*)$')
'''Regular expression matching tier lines '''
def transform_tier(tab:dict,revmap:dict) -> None:
  '''Normalize tables containing tiered pricing
  
  Parses the tier description rows and splits them into different line.
  Parses the ranges for tier prices to its own columns.
  
  :param tab: dictionary containing the extracted tables
  :param revmap: dict containing a mapping from column name to column index  
  '''
  for i in ['Tmin','Tmax']:
    revmap[len(tab[0])] = i
    revmap[i] = len(tab[0])
    tab[0].append(i)

  for i in range(len(tab)-1, 0, -1):
    tab[i].append('n.a.')
    tab[i].append('n.a.')
    if not ('\n' in tab[i][revmap['Tier']]): continue

    tiers = tab[i][revmap['Tier']].split('\n')
    # ~ ic(tiers)
    tier_rows = list()
    for _ in tiers:
      tier_rows.append(list(tab[i]))
    for j in range(0,len(tier_rows)):
      if mv:=RE_MATCH_TIER_LINE.search(tiers[j]):
        tier_rows[j][revmap['Tmin']] = mv.group(1)
        tier_rows[j][revmap['Tmax']] = mv.group(2)
      elif tiers[j].startswith('from '):
        tier_rows[j][revmap['Tmin']] = tiers[j][5:].replace(',','')
      tier_rows[j][0] = f'{tier_rows[j][0]} [T{j+1}] ({tiers[j]})'
    for c in range(1,len(tab[0])):
      if not '\n' in tab[i][c]: continue
      rs = tab[i][c].split('\n')
      if len(rs) != len(tiers): continue
      for j in range(0,len(tier_rows)): tier_rows[j][c] = rs[j]

    for j in range(0,len(tier_rows)):
      tab.insert(i+j+1,tier_rows[j])
    for j in range(1,len(tab[i])):
      tab[i][j] = 'n.a.' # Gets converted to None later...
    tab[i][revmap['charging unit']] = 'Tiered' 

RE_MATCH_NUM = re.compile(r'^\d{1,3}(?:,\d{3})*\.\d+$')
'''Regular expression to detect numbers (with decimals)'''
RE_MATCH_NUM2 = re.compile(r'^\d+\.\d+$')
'''Regular expression to detect numbers (with decimals) but no commas (since RE_MATCH_NUM will miss them!)'''
RE_MATCH_INT = re.compile(r'^\d{1,3}(?:,\d{3})*$')
'''Regular expression to detect integers'''
RE_MATCH_INT2 = re.compile(r'^\d+$')
'''Regular expression to detect integers without commas (since RE_MATCH_INT misses them)'''
def transform_types(tab:dict) -> None:
  '''Normalize strings into the correct data types
  
  This also removes new lines, and converts `n.a.`'s to `None`s.
  
  :param tab: dictionary containing the extracted tables
  '''
  for i in range(0,len(tab)):
    for c in range(0,len(tab[i])):
      if tab[i][c] is None: continue
      if tab[i][c] in ['n.a.','n. a.']:
        tab[i][c] = None
      elif RE_MATCH_NUM.search(tab[i][c]):
        tab[i][c] = float(tab[i][c].replace(',',''))
      elif RE_MATCH_NUM2.search(tab[i][c]):
        tab[i][c] = float(tab[i][c])
      elif RE_MATCH_INT.search(tab[i][c]):
        tab[i][c] = int(tab[i][c].replace(',',''))
      elif RE_MATCH_INT2.search(tab[i][c]):
        tab[i][c] = int(tab[i][c])
      elif '\n' in tab[i][c]:
        tab[i][c] = tab[i][c].replace('\n',' ')


def normalize_table(tab:list[list]) -> list|None:
  '''Does basic table normalization
  
  Will check the table using `check_hdrsig`, and if succesful, it
  will do simple generic normalizations....
  
  :param tab: table to normalize
  :returns: None, if not a price table.  Otherwise normalized table
  '''
  if not check_hdrsig(tab[0]): return None
  tab[0] = [item.replace('\n',' ') for item in tab[0]]

  #
  # Create a column map
  #
  colmap = dict()
  for i in range(0,len(tab[0])):
    colmap[i] = tab[0][i]
    colmap[tab[0][i]] = i

  #
  # Make sure that column 1 to 3 are always populated....
  #
  transform_rownames(tab)  
  transform_w_charging_unit(tab)
  transform_from_date(tab)
  if 'Tier' in tab[0]: transform_tier(tab, colmap)
  transform_types(tab)
  
  tab = split_records(tab)
  
  return tab

REGIONS = [ 'EU-DE', 'EU-NL' ]
'''Defined regions'''

def match_region(x:str) -> str|None:
  '''Check if a string refers to a region
  
  :param x: string to check
  :returns: Identified region, None if not found.
  '''
  for r in REGIONS:
    if r in x: return r
  return None

def split_records(tab:list[list]) -> list:
  '''Split records into per-region records
  
  :param tab: table to process
  :returns: translated page
  '''
  srcmap = dict()
  for i in range(0,len(tab[0])):
    srcmap[i] = tab[0][i]
    srcmap[tab[0][i]] = i

  found = False
  dstmap = dict()
  h = list()
  for i in range(0,len(tab[0])):
    r = match_region(tab[0][i])
    if r is None:
      j = tab[0][i]
    else:
      found = True
      j = tab[0][i].replace(r,'').strip()
    if not j in h:
      k = len(h)
      dstmap[j] = k
      dstmap[k] = j
      h.append(j)
  dstmap['region'] = len(h)
  dstmap[len(h)] = 'region'
  h.append('region')

  if not found: return tab # Do not do anything

  res = list([h])
  for i in range(1,len(tab)):
    for r in REGIONS:
      found = 0
      for c in range(0,len(tab[0])):
        if not r in tab[0][c]: continue
        if tab[i][c] is None: continue
        found += 1
      # Found {found} prices for region {r}
      if found == 0: continue
      
      newrow = [None]*len(h)
      for c in range(0,len(tab[0])):
        dname = tab[0][c].replace(r,'').strip()
        if not dname in dstmap: continue
        dcol = dstmap[dname]
        newrow[dcol] = tab[i][c]
      newrow[dstmap['region']] = r.lower()
      res.append(newrow)

  if len(res) == 1: return None
  
  return res



if __name__ == '__main__':
  # ~ data = process_pdf('files/open-telekom-cloud-servicedescription.pdf')
  # ~ with open('pdfdata.json','w') as fp:
    # ~ fp.write(json.dumps(data, indent=2))

  ...
  
