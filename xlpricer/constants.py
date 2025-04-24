'''
Constant definitions
'''
class K:
  WS_COMPONENT = 'Components'
  WS_PRICES = 'Prices'
  WS_ASSUMPTIONS = 'Assumptions'
  WS_SERVICES = 'Services'

  VL_EVS = 'EVS'
  VL_CBR = 'CBR'
  VL_REGIONS = 'REGIONS'

  DEFAULT_REGION = 'eu-de'
  DEFAULT_EVS = 'High I/O'
  DEFAULT_CBR = 'Server Backup'

  EVS_PREFIX = 'EVS '
  CBR_PREFIX = 'CBR '

  COL_XLTITLE = '_XlTitle_'
  COL_XLTIERS = '_tiers'
  COL_XLTARIFFS = '_tariffs_'
  COL_IDG = '_IDG'
  COL_LAST = '_XlLast_'

  RF_INFLATION = 'INFLATION'
  RF_DEF_REGION = 'DEF_REGION'
  RF_DEF_EVS = 'DEF_EVS'
  RF_DEF_CBR = 'DEF_CBR'
  RF_PRICES_DESCS = 'PRICES_DESCS'
  RF_PRICES_REGION = 'PRICES_REGION'
  RF_PRICES_TABLE = 'PRICES_TABLE'

  AS_ANNUAL_INFLATION = 0.02
  AS_DAILY_CHANGE_RATE = 0.03
  AS_NUM_FULL_BACKUPS = 1
  AS_NUM_INC_BACKUPS = 30
  AS_FT_HOURS = 730
  AS_WK_HOURS = 174
  
  YEAR_MAX = 6

  DEF_API_ENDPOINT = 'https://calculator.otc-service.com/{lang}/open-telekom-price-api/'
