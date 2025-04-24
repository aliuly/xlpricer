#!/usr/bin/env python3
'''Format Defintions
'''

class XlFmt:
  '''format defintions'''

  # Common formats
  f_def_data = {
                'border': 1,
                }
  f_title = {
                'bold': True,
                'font_size': 18,
                'font_color': 'red',
                }
  f_header = {
                'bold': True,
                'font_color': 'white',
                'bg_color': 'blue',
                'text_wrap': True,
                'border': 1,
                }

  # Services tab formats
  f_txtid = {'border': 1,
          'align': 'center',
          }
  f_txtname = {'border': 1,
              'align': 'center',
              'text_wrap': True,
              }
  f_txtdesc = {'border': 1,
              'text_wrap': True,
              }

  # Assumption specific formats
  f_hr1 = {
                'bold': True,
                'font_color': 'black',
                'bg_color': '#89f572',
                'text_wrap': False,
                }
  f_percent_c = {
                'border': 1,
                'num_format': '0.00%',
                'align': 'center',
                }
  f_text_c = {
                'border': 1,
                'align': 'center',
                }
  f_num_c= {
                'border': 1,
                'num_format': '#,##0',
                'align': 'center',
                }
  f_float_c = {
                'border': 1,
                'num_format': '#,##0.0000',
                'align': 'center',
                }
  f_date_c = {
                'border': 1,
                'num_format': 'dd-mm-yyyy',
                'align': 'center',
                }
  f_comment = {
                'border': 1,
                'text_wrap': True,
                }

  # Price lists

  f_lst_price2 = {
                'border': 1,
                'num_format': '#,##0.00',
                }
  f_lst_price1 = {
                'border': 1,
                'num_format': '0.00000',
                }
  f_lst_num = {
                'border': 1,
                'num_format': '#,##0',
                }


  # Component list
  f_sumline = {
                  'bold': True,
                  'font_color': 'white',
                  'bg_color': 'pink',
                  'text_wrap': False,
                  }
  f_sumline_total = {
                  'bold': True,
                  'font_color': 'white',
                  'bg_color': 'pink',
                  'text_wrap': False,
                  'num_format': '#,##0.00 €',
                  }
  f_qty = {
                  'border': 1,
                  'num_format': '#,##0',
                  'align': 'center',
                  'bg_color': '#f0f0f0',
                  }
  f_desc = {
                  'border': 1,
                  'text_wrap': True,
                  'font_size': 10,
                  'bg_color': '#f0f0f0',
                  }
  f_float_in = {
                'border': 1,
                'num_format': '#,##0.0000',
                'align': 'center',
                'bg_color': '#f0f0ff',
                }
  f_num_in = {
                'border': 1,
                'num_format': '#,##0',
                'align': 'center',
                'bg_color': '#f0f0ff',
                }
  f_text = {
                  'border': 1,
                  'bg_color': '#f0f0ff',
                  }
  f_euro = {
                  'border': 1,
                  'num_format': '#,##0.00 €'
                  }
  f_syshdr = {
                  'bold': True,
                  'font_color': 'white',
                  'bg_color': 'red',
                  'text_wrap': True,
                  'border': 1,
                  }
  f_refhdr = {
                  'bold': True,
                  'font_color': 'white',
                  'bg_color': 'gray',
                  'text_wrap': True,
                  'border': 1,
                  }

    # ~ self.xlu.fmt('dat_vram1', {
                  # ~ 'border': 1,
                  # ~ 'num_format': '#,##0',
                  # ~ })
    # ~ self.xlu.fmt('dat_vram2', {
                  # ~ 'border': 1,
                  # ~ 'num_format': '0.000',
                  # ~ })


    # ~ self.xlu.fmt('meta2', {
                  # ~ 'font_size': 8,
                  # ~ })


    # ~ self.xlu.fmt('percent', {
                  # ~ 'border': 1,
                  # ~ 'num_format': '0.00%'
                  # ~ })
    # ~ self.xlu.fmt('float', {
                  # ~ 'border': 1,
                  # ~ 'num_format': '#,##0.000'
                  # ~ })
    # ~ self.xlu.fmt('float2', {
                  # ~ 'border': 1,
                  # ~ 'num_format': '#,##0.00'
                  # ~ })


