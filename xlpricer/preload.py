#
# Pre-loaded items
#
from .constants import K

ITEMS = [
  'Base Infrastructure',
  [ 1, None, K.FAMILY + ': Virtual Private Cloud (VPC)', 'base' ],
  [ 1, None, K.FAMILY + ': VPC Basic Firewall', 'base' ],
  [ 1, None, K.FAMILY + ': Anti-DDOS', 'base' ],
  [ 1, None, 'Network: NAT Gateway extra small', 'base' ],
  [ 2, None, 'Network: Elastic IP', 'base' ],
  [ 0, None, 'Security: Cloud WAF Domain 1 [T1] (until 2,000)', 'base' ],
  [ 0, None, 'Network: Shared Elastic Loadbalancer', 'base' ],
  [ 0, None, 'Network: Virtual Private Cloud VPN', 'base' ],
  [ '={DEF_OUTBOUND_TRAFFIC}', None, 'Network: Internet Traffic Outbound [T2] (2 to 1,000)', 'base' ],
  'Total base',
  'Compute',
  [ 1, None, 'Container: CCE VM Cluster small (max 50 nodes)', 'com' ],
  [ 1, None, K.FAMILY + ': Auto Scaling', 'com' ],
  [ 1, None, K.FAMILY + ': Software Repository Storage for Containers', 'com' ],
  [ 1, None, K.FAMILY + ': Image Management Service', 'com' ],
  [ 1, 'normal', 'Compute: General Purpose s3.xl.2 Windows 4 vcpu 8 GB s3', 'com', None, 50 ],
  [ 1, 'burst', 'Compute: Flexible purpose x1.xlarge.2 Linux 4 vcpu 8 GB x1', 'com', None, 50 ],
  'Total com',
  'Managed Infrastructure',
  [ 1, None, K.FAMILY + ': Cloud Eye Service', 'mgm'],
  [ 1, None, K.FAMILY + ': Cloud Trace Service', 'mgm'],
  [ 0, None, 'Application: LTS Log Storage Data Ingested', 'mgm'],
  [ 0, None, 'Application: LTS Log index Traffic', 'mgm'],
  [ 0, None, 'Application: LTS Log read write Traffic', 'mgm'],
  'Total mgm',
  'Other',
  *([None] * 10),
]

GROUPS = [
  ['base', 'Base Infrastructure'],
  ['com', 'Compute' ],
  ['mgm', 'Managed Infra' ],
]
