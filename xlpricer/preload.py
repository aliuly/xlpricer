#
# Pre-loaded items
#
from .constants import K
from typing import Any
class H:
  def __init__(self, name:str, grp:str|None = None):
    self.name = name
    self.grp = grp
class Total:
  def __init__(self, grp:str|None = None):
    self.grp = grp

DGRP = '={prev}'

ITEMS = [
  H('Base Infrastructure','base'),
  [ 1, None, K.FAMILY + ': Virtual Private Cloud (VPC)' ],
  [ 1, None, K.FAMILY + ': VPC Basic Firewall' ],
  [ 1, None, K.FAMILY + ': Anti-DDOS' ],
  [ 1, None, 'Network: NAT Gateway extra small' ],
  [ 2, None, 'Network: Elastic IP' ],
  [ 0, None, 'Network: Shared Elastic Loadbalancer' ],
  [ 0, None, 'Network: Virtual Private Cloud VPN' ],
  [ '={DEF_OUTBOUND_TRAFFIC}', None, 'Network: Internet Traffic Outbound [T2] (2 to 1,000)' ],
  Total(),
  H('Compute','com'),
  [ 1, None, 'Container: CCE VM Cluster small (max 50 nodes)' ],
  [ 1, None, K.FAMILY + ': Auto Scaling'],
  [ 1, None, K.FAMILY + ': Software Repository Storage for Containers'],
  [ 1, None, K.FAMILY + ': Image Management Service'],
  [ 1, 'normal', 'Compute: General Purpose s3.xl.2 Windows 4 vcpu 8 GB s3'],
  [ 1, 'burst', 'Compute: Flexible purpose x1.xlarge.2 Linux 4 vcpu 8 GB x1'],
  Total(),
  H('Managed Infrastructure', 'mgm'),
  [ 1, None, K.FAMILY + ': Cloud Eye Service'],
  [ 1, None, K.FAMILY + ': Cloud Trace Service'],
  [ 0, None, 'Application: LTS Log Storage Data Ingested'],
  [ 0, None, 'Application: LTS Log index Traffic'],
  [ 0, None, 'Application: LTS Log read write Traffic'],
  Total(),
  H('Other','(none)'),
  *([None] * 10),
]

GROUPS = [
  ['base', 'Base Infrastructure'],
  ['com', 'Compute' ],
  ['mgm', 'Managed Infra' ],
]
