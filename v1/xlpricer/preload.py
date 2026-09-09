#
# Pre-loaded items
#
# ~ from constants import K
from .constants import K
from typing import Any
import yaml

try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa


class H:
  def __init__(self, name:str, grp:str|None = None):
    self.name = name
    self.grp = grp
  def __str__(self):
    return f'H: {self.name} - {self.grp}'
  def __repr__(self):
    return f'Header(name={self.name}, grp={self.grp})'
class Total:
  def __init__(self, grp:str|None = None):
    self.grp = grp
  def __repr__(self):
    return f'Total({self.grp})'

DGRP = '={prev}'

ITEMS = [
  H('Base Infrastructure','base'),
  [ 1, None, K.FAMILY + ': Virtual Private Cloud (VPC)', None ],
  [ 1, None, K.FAMILY + ': VPC Basic Firewall', None ],
  [ 1, None, K.FAMILY + ': Anti-DDOS', None ],
  [ 1, None, 'Network: NAT Gateway extra small', None ],
  [ 2, None, 'Network: Elastic IP', None ],
  [ 0, None, 'Network: Shared Elastic Loadbalancer', None ],
  [ 0, None, 'Network: Virtual Private Cloud VPN', None ],
  [ '={DEF_OUTBOUND_TRAFFIC}', None, 'Network: Internet Traffic Outbound', None ],
  Total(),
  H('Compute','com'),
  [ 1, None, 'Container: CCE VM Cluster small (max 50 nodes)', None ],
  [ 1, None, K.FAMILY + ': Auto Scaling', None],
  [ 1, None, K.FAMILY + ': Software Repository Storage for Containers', None],
  [ 1, None, K.FAMILY + ': Image Management Service', None],
  [ 1, 'normal', 'Compute: General Purpose s3.xl.2 Windows 4 vcpu 8 GiB s3', None],
  [ 1, 'burst', 'Compute: Flexible purpose x1.xlarge.2 Linux 4 vcpu 8 GiB x1', None],
  Total(),
  H('Managed Infrastructure', 'mgm'),
  [ 1, None, K.FAMILY + ': Cloud Eye Service', None],
  [ 1, None, K.FAMILY + ': Cloud Trace Service', None],
  [ 0, None, 'Application: LTS Log Storage Data Ingested', None],
  [ 0, None, 'Application: LTS Log index Traffic', None],
  [ 0, None, 'Application: LTS Log read write Traffic', None],
  Total(),
  H('Other','(none)'),
  *([None] * 10),
  Total(),
]
GROUPS = []

def init_groups() -> None:
  '''Initialize the GROUPS list from ITEMS'''
  GROUPS.clear()
  for i in ITEMS:
    if isinstance(i, H):
      GROUPS.append([i.grp, i.name])

def load_items(filename:str|None = None):
  if filename is None: return  # Do not make any changes
  with open(filename) as fp:
    data = yaml.safe_load(fp)

  ITEMS.clear()
  COLS = [ 'qty', 'func', 'desc', 'stor' ]
  last_grp = None

  for entry in data:
    if 'grp' in entry:
      if last_grp is not None:
        ITEMS.append(Total())
      last_grp = entry['grp']
      ITEMS.append(H(entry['desc'],entry['grp']))
      continue

    if 'qty' in entry:
      item = [None]*4
      for i in range(len(COLS)):
        if COLS[i] in entry:
          item[i] = entry[COLS[i]]
      ITEMS.append(item)
      continue

    ITEMS.append(None)

  if last_grp is not None:
    ITEMS.append(Total())
  init_groups()

init_groups() # Make sure GROUPs is initialized


