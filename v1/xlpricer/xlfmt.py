#!/usr/bin/env python3
'''Format Defintions
'''

class XlFmt:
  '''format defintions'''

  # Common formats
  f_def_data = {
                'border': 'thin',
                }
  f_title = {
              'font': {
                'bold': True,
                'size': 16,
                'color': 'FF0000',
              },
            }
  f_header = {
              'font': {
                'bold': True,
                'color': 'FFFFFF',
              },
              'text_wrap': True,
              'fill': '0000FF',
            }
  # Services tab formats
  f_txtid = {
              'border': 'thin',
              'align': 'center',
          }
  f_txtname = {
                'border': 'thin',
                'align': 'center',
                'text_wrap': True,
              }
  f_txtdesc = {
                'border': 'thin',
                'text_wrap': True,
              }

  # Assumption specific formats
  f_hr1 = {
              'font': {
                'bold': True,
                'color': '000000',
              },
              'text_wrap': False,
              'fill': '89f572',
            }
  f_hr1_c = {
              'font': {
                'bold': True,
                'color': '000000',
              },
              'text_wrap': False,
              'fill': '89f572',
              'align': 'center',
            }

                
  f_percent_c = {
              'border': 'thin',
              'align': 'center',
              'num_format': '0.00%',
            }
  f_text_c = {
                  'border': 'thin',
                  'align': 'center',
              }
  f_num_c= {
                'border': 'thin',
                'num_format': '#,##0',
                'align': 'center',
            }
  f_float_c = {
                'border': 'thin',
                'num_format': '#,##0.0000',
                'align': 'center',
              }
  f_date_c = {
                'border': 'thin',
                'num_format': 'dd-mm-yyyy',
                'align': 'center',
              }
  f_comment = {
                'border': 'thin',
                'text_wrap': True,
              }

  # Price lists

  f_lst_price2 = {
                'border': 'thin',
                'num_format': '#,##0.00',
                }
  f_lst_price1 = {
                'border': 'thin',
                'num_format': '0.00000',
                }
  f_lst_num = {
                'border': 'thin',
                'num_format': '#,##0',
                }


  # Component list
  f_sumline = {
                'font': {
                  'bold': True,
                  'color': 'FFFFFF',
                },
                'fill': 'E20074',
              }
  f_sumline_c = {
                'font': {
                  'bold': True,
                  'color': 'FFFFFF',
                },
                'fill': 'E20074',
                'align': 'center',
              }
  f_sumline_total = {
                'font': {
                  'bold': True,
                  'color': 'FFFFFF',
                },
                'fill': 'E20074',
                'num_format': '#,##0.00 €',
              }
  f_qty = {
                'border': 'thin',
                'num_format': '#,##0',
                'fill': 'F0F0F0',
                'align': 'center',
            }
  f_desc = {
                'border': 'thin',
                'num_format': '#,##0',
                'fill': 'F0F0F0',
                'text_wrap': True,
            }
  f_info = {
                'border': 'thin',
                'num_format': '#,##0',
                'fill': 'F0F0F0',
                'text_wrap': True,
                'align': 'center',
            }
  f_float_in = {
                'border': 'thin',
                'num_format': '#,##0.0000',
                'fill': 'F0F0F0',
                'align': 'center',
              }
  f_num_in = {
                'border': 'thin',
                'num_format': '#,##0',
                'fill': 'F0F0F0',
                'align': 'center',
              }
  f_text = {
                'border': 'thin',
                'fill': 'f0f0ff'
            }
  f_euro = {
                  'border': 'thin',
                  'num_format': '#,##0.00 €'
                  }
  f_euro_4d = {
                  'border': 'thin',
                  'num_format': '#,##0.0000 €'
                  }
  f_syshdr = {
                'font': {
                  'bold': True,
                  'color': 'FFFFFF',
                },
                'fill': 'FF0000',
                'text_wrap': True,
              }
  f_refhdr = {
                'font': {
                  'bold': True,
                  'color': 'FFFFFF',
                },
                'fill': '808080',
                'text_wrap': True,
              }

  # Components settings
  f_key = {
    'font': {
      'bold': True,
      'color': '0000FF',
    },
    'align': 'right',
    'border': 'thin',
  }
  f_key_hdr = {
    'font': {
      'bold': True,
      'color': '0000FF',
    },
  }
  f_val = {
    'align': 'left',
    'border': 'thin',
  }
  
  # Formats for overview
  f_ov_center = {
    'align': 'center',
    'border': 'thin',
  }
  f_ov_percent = {
    'align': 'center',
    'border': 'thin',
    'num_format': '0%'
  }
  f_ov_euro = {
    'border': 'thin',
    'num_format': '#,##0.00 €'
  }
