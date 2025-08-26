'''
Constant definitions
'''
class K:
  FORMAT_VERSION ='1.2.0'
  # - 1.2.0 : Added grouping and set-up calc columns
  # - 1.1.1 : Added GPU type to title
  # - 1.1.0 : Introduces defined name PriceListNames to workaround an
  #   unsupported feature in OpenPyxl w.r.t data validation.
  # - 1.0.2 : First "complete" version

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
  RF_ONE_TIME_ITEM = 'ONE_TIME_ITEM'
  XLN_PRICES_DESCS = 'PriceListDescs'

  AS_ANNUAL_INFLATION = 0.02
  AS_DAILY_CHANGE_RATE = 0.03
  AS_NUM_FULL_BACKUPS = 1
  AS_NUM_INC_BACKUPS = 30
  AS_FT_HOURS = 730
  AS_WK_HOURS = 174
  AS_ONE_TIME = 'Item/ot'

  YEAR_MAX = 6

  DEF_API_ENDPOINT = 'https://calculator.otc-service.com/en/open-telekom-price-api/'
  DE_API_ENDPOINT = 'https://calculator.otc-service.com/de/open-telekom-price-api/'
  EN_API_ENDPOINT = 'https://calculator.otc-service.com/en/open-telekom-price-api/'
  DEF_BUILD_FILENAME = 'INTERNAL-open-telekom-cloud-prices-{date}.xlsx' 
  DEF_BUILD_RENAME_TAG = 'INTERNAL'
  DEF_BUILD_RENAME_NEW = 'PUBLIC'

  CN_QTY = 'Qty'
  CN_DESC = 'Cloud Desc'
  CN_REGION = 'Region'
  CN_TIER_CALC = 'Tier Calc'
  CN_GROUPING = 'Grouping'
  CN_SUBTOTAL_UNIT = 'Sub-total per unit'

  KW_meta = 'meta'
  KW_input = 'input'
  KW_content = 'content'
  KW_text = 'text'
  KW_tables = 'tables'
  KW_revised = 'revised'
  KW_revised_ = '_revised_'
  KW_mtime = 'mtime'
  KW_mdate = 'mdate'
  KW_page = 'page'
