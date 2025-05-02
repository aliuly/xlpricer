'''
Wizard UI
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import tkinter as tk

class WizUI:
  def __init__(self, master):
    self.command = None
    self.master = master
    self.master.title("xlpricer Wizard")        
    self.base_ui()
    self.initial_screen()

  def on_cancel(self,*args):
    self.master.destroy()

  def base_ui(self):
    self.main_frame = tk.LabelFrame(self.master, text='main', padx=10, pady=10)
    self.main_frame.pack(fill='both', expand=True, side='top', padx=5, pady=5)    
    bot_frame = tk.Frame(self.master)
    bot_frame.pack(fill='x',side='bottom')
    self.cancel_button = tk.Button(bot_frame, text='Cancel', command=self.on_cancel)
    self.cancel_button.pack(anchor='center', padx=5, pady=5)
    self.master.bind('<Escape>', self.on_cancel)

  def clear_ui(self):
    for widget in self.main_frame.winfo_children():
      widget.destroy()

  def initial_screen(self):
    button_frame = self.main_frame
    button_frame.config(text='Commands')

    bp_opts = {
        'side': 'top',
        'expand': True,
        'padx': 10,
        'pady': 5,
        'fill': 'x',
      }
    build_cmd = tk.Button(button_frame, text='Build', command=self.on_build)
    build_cmd.pack(**bp_opts)
    reprice_cmd = tk.Button(button_frame, text='Reprice', command=self.on_reprice)
    reprice_cmd.pack(**bp_opts)
    prep_cmd = tk.Button(button_frame, text = 'Prep', command=self.on_prep)
    prep_cmd.pack(**bp_opts)

  def on_build(self):
    self.clear_ui()
    # - output file name
    # - cache
    # - autoproxy cfg
    # - open xlsx file (cmd /c start xlsfile)
    print('build')

  def on_reprice(self):
    # - cache
    # - autoproxy cfg
    # - input file name
    # - output file name
    # - open xlsx file (cmd /c start xlsfile)
    self.clear_ui()
    print('reprice')
  
  def on_prep(self):
    # - input file name
    # - output file name
    # - open xlsx file (cmd /c start xlsfile)
    self.clear_ui()
    print('prep')
    


    # ~ top_frame = tk.Frame(self.master)
    # ~ top_frame.pack(fill='both', expand=True, side='top')
    # ~ # options
    # ~ self.caching = tk.IntVar(value=0)
    # ~ self.autocfg_var = tk.IntVar(value=1)
    # ~ self.caching_chkbox = None
    # ~ self.cache_file = None
    # ~ opts_frame = tk.LabelFrame(top_frame, text='Options', padx=10, pady=10)
    # ~ opts_frame.pack(fill='both', side='right', padx=5, pady=5)
    
    # ~ chkbox_opts = {
        # ~ 'side': 'top',
        # ~ 'padx': 10,
        # ~ 'pady': 5,
        # ~ 'fill': 'x',
      # ~ }
    # ~ caching_chkbox = tk.Checkbutton(opts_frame, text='Caching', variable=self.caching, command=self.on_caching)
    # ~ caching_chkbox.pack(**chkbox_opts)
    # ~ self.caching_chkbox = caching_chkbox
    # ~ autocfg_chkbox = tk.Checkbutton(opts_frame, text='Auto proxy cfg', variable=self.autocfg_var)
    # ~ autocfg_chkbox.pack(**chkbox_opts)
        


def run_ui():
  # Create the main window
  root = tk.Tk()
  app = WizUI(root)
  # Start the Tkinter event loop
  root.mainloop()


