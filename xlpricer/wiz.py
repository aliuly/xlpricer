'''
Wizard UI
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

from argparse import Namespace
import os
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog, messagebox

import xlpricer.cache as cache
import xlpricer.normalize as normalize
import xlpricer.noswiss as noswiss
import xlpricer.proxycfg as proxycfg
import xlpricer.price_api as price_api
import xlpricer.xlsw as xlsw

from xlpricer.constants import K
from xlpricer.xlu import today

class RedirOutput:
  '''Class used to redirect stdio to our UI'''
  def __init__(self,log_function):
    self.log_function = log_function
  def write(self, message):
    self.log_function(message)
  def flush(self):
    pass

class RepriceScr:
  '''Repricing screen'''
  def __init__(self, parent):
    '''Constructor

    :parent WizUI: main window content
    '''
    self.parent = parent
    self.screen_ui()

  def screen_ui(self):
    '''Create the screen UI'''
    # - cache
    # - autoproxy cfg
    # - input file name
    # - output file name
    # - open xlsx file (cmd /c start xlsfile)
    # ~ self.clear_ui()
    main_frame = self.parent.main_frame
    self.parent.title('Reprice calculator')
    main_frame.columnconfigure(1, weight=1)

    if self.parent.ui_data is None or self.parent.ui_data.screen != 'reprice':
      self.parent.ui_data = Namespace(
          screen = 'reprice',
          inputname = tk.StringVar(value=""),
          outputname = tk.StringVar(value=""),
          cache = tk.IntVar(value=1),
          autocfg = tk.IntVar(value=1),
      )

    row = 0
    input_file_cmd = tk.Button(main_frame, text='Input', command=self.on_input_cmd)
    input_file_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='ew')
    input_name = tk.Entry(main_frame, width=30, textvariable=self.parent.ui_data.inputname, state='readonly')
    input_name.grid(row=row, column=1, padx=5, pady=5, sticky='ew')

    row += 1

    output_file_cmd = tk.Button(main_frame, text='Output', command=self.on_output_cmd)
    output_file_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='ew')
    output_name = tk.Entry(main_frame, width=30, textvariable=self.parent.ui_data.outputname, state='readonly')
    output_name.grid(row=row, column=1, padx=5, pady=5, sticky='ew')

    row += 1
    proxycfg_chkbox = tk.Checkbutton(main_frame, text='Auto config proxy', variable=self.parent.ui_data.autocfg)
    proxycfg_chkbox.grid(row=row, column=0, columnspan=2, padx=5, pady=5, sticky='w')

    row += 1
    proxycfg_chkbox = tk.Checkbutton(main_frame, text='Use cache when available...', variable=self.parent.ui_data.cache)
    proxycfg_chkbox.grid(row=row, column=0, columnspan=2, padx=5, pady=5, sticky='w')

    row += 1
    run_cmd = tk.Button(main_frame, text='Run...', command=self.do_reprice, state='disabled')
    run_cmd.grid(row=row, column=1, padx=5, pady=5, sticky='se')
    back_cmd = tk.Button(main_frame, text='<< Back', command=self.parent.on_back_cmd)
    back_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='sw')
    self.run_cmd = run_cmd
    if self.parent.ui_data.inputname.get() != '': run_cmd.config(state='normal')

  def do_open_xlsx(self):
    xlfile = self.parent.ui_data.outputname.get()
    self.parent.open_xlsx(xlfile)

  def do_reprice(self):
    # - output file name
    # - cache
    # - autoproxy cfg
    # - open xlsx file (cmd /c start xlsfile)
    if (xofile := self.parent.ui_data.outputname.get()) == '':
      self.parent.ui_data.outputname.set(xofile := f'open-telekom-cloud-prices-{today()}.xlsx')
    xifile = self.parent.ui_data.inputname.get()

    self.parent.start_task('Re-price XLSX...', self.do_open_xlsx)
    print('start repricing...')

    use_cache = bool(self.parent.ui_data.cache.get())
    apidat = cache.validate_cache(cache.default_cache(), use_cache)
    if apidat is None:
      if self.parent.ui_data.autocfg.get(): proxycfg.proxy_cfg(True)
      apidat = price_api.fetch_prices(K.DEF_API_ENDPOINT.format(lang='en'))
      if use_cache: cache.save(cache.default_cache(),apidat)
    print(apidat.keys())

    noswiss.filter(apidat)
    normalize.normalize(apidat)

    try:
      xlsw.xlsx_refresh(xifile, apidat, xofile)
    except Exception as e:
      print(str(e))
      messagebox.showinfo('Error',str(e))
      self.parent.end_task(False)
      self.parent.clear_ui()
      self.screen_ui()
      return


    self.parent.end_task(True)

  def on_input_cmd(self):
    filename = filedialog.askopenfilename(
                  title='Enter a filename',
                  initialfile=self.parent.ui_data.inputname.get(),
                  filetypes=[
                    ('Excel files', '*.xlsx'),
                    ('All Files', '*.*'),
                  ],
                  parent=self.parent.master,
                )
    self.parent.ui_data.inputname.set(filename)
    self.run_cmd.config(state='normal' if filename else 'disabled')

  def on_output_cmd(self):
    filename = filedialog.asksaveasfilename(
                  title='Enter a filename',
                  initialfile=self.parent.ui_data.outputname.get(),
                  filetypes=[
                    ('Excel files', '*.xlsx'),
                    ('All Files', '*.*'),
                  ],
                  parent=self.parent.master,
                )
    self.parent.ui_data.outputname.set(filename)


class BuildScr:
  def __init__(self, parent):
    self.parent = parent
    self.screen_ui()

  def screen_ui(self):
    main_frame = self.parent.main_frame
    self.parent.title('Build config')
    main_frame.columnconfigure(1, weight=1)

    if self.parent.ui_data is None or self.parent.ui_data.screen != 'build':
      self.parent.ui_data = Namespace(
          screen = 'build',
          filename = tk.StringVar(value=""),
          cache = tk.IntVar(value=1),
          autocfg = tk.IntVar(value=1),
      )

    row = 0
    output_file_cmd = tk.Button(main_frame, text='File...', command=self.on_output_cmd)
    output_file_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='ew')
    file_name = tk.Entry(main_frame, width=30, textvariable=self.parent.ui_data.filename, state='readonly')
    file_name.grid(row=row, column=1, padx=5, pady=5, sticky='ew')

    row += 1
    proxycfg_chkbox = tk.Checkbutton(main_frame, text='Auto config proxy', variable=self.parent.ui_data.autocfg)
    proxycfg_chkbox.grid(row=row, column=0, columnspan=2, padx=5, pady=5, sticky='w')

    row += 1
    proxycfg_chkbox = tk.Checkbutton(main_frame, text='Use cache when available...', variable=self.parent.ui_data.cache)
    proxycfg_chkbox.grid(row=row, column=0, columnspan=2, padx=5, pady=5, sticky='w')

    row += 1
    run_cmd = tk.Button(main_frame, text='Run...', command=self.do_build)
    run_cmd.grid(row=row, column=1, padx=5, pady=5, sticky='se')
    back_cmd = tk.Button(main_frame, text='<< Back', command=self.parent.on_back_cmd)
    back_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='sw')

  def do_open_xlsx(self):
    xlfile = self.parent.ui_data.filename.get()
    self.parent.open_xlsx(xlfile)

  def do_build(self):
    # - output file name
    # - cache
    # - autoproxy cfg
    # - open xlsx file (cmd /c start xlsfile)
    if (xlfile := self.parent.ui_data.filename.get()) == '':
      self.parent.ui_data.filename.set(xlfile := f'open-telekom-cloud-prices-{today()}.xlsx')

    while True:
      try:
        if os.path.isfile(xlfile): os.unlink(xlfile)
      except PermissionError as e:
        yesno = messagebox.askyesno('Exception caught',
                  '%s\n'
                  'Please close the file if it is open in Excel.\n'
                  'Do you want to try again?' %e)
        if yesno: continue
        return
      except Exception as e:
        messagebox.showinfo('Error',str(e))
      break

    self.parent.start_task('Building XLSX...', self.do_open_xlsx)
    print('start build')
    print('Will write to:',xlfile)


    use_cache = bool(self.parent.ui_data.cache.get())
    apidat = cache.validate_cache(cache.default_cache(), use_cache)
    if apidat is None:
      if self.parent.ui_data.autocfg.get(): proxycfg.proxy_cfg(True)
      apidat = price_api.fetch_prices(K.DEF_API_ENDPOINT.format(lang='en'))
      if use_cache: cache.save(cache.default_cache(),apidat)
    print(apidat.keys())

    noswiss.filter(apidat)
    normalize.normalize(apidat)

    try:
      xlsw.xlsx_write(xlfile,apidat)
    except Exception as e:
      print(str(e))
      messagebox.showinfo('Error',str(e))
      self.parent.end_task(False)
      self.parent.clear_ui()
      self.screen_ui()
      return

    self.parent.end_task(True)


  def on_output_cmd(self):
    filename = filedialog.asksaveasfilename(
                  title='Enter a filename',
                  initialfile=self.parent.ui_data.filename.get(),
                  filetypes=[
                    ('Excel files', '*.xlsx'),
                    ('All Files', '*.*'),
                  ],
                  parent=self.parent.master,
                )
    self.parent.ui_data.filename.set(filename)

class PrepScr:
  def __init__(self, parent):
    self.parent = parent
    self.screen_ui()

  def screen_ui(self):
    # - input file name
    # - output file name
    # - open xlsx file (cmd /c start xlsfile)
    # ~ self.clear_ui()
    main_frame = self.parent.main_frame
    self.parent.title('XLSX preparer')
    main_frame.columnconfigure(1, weight=1)

    if self.parent.ui_data is None or self.parent.ui_data.screen != 'prep':
      self.parent.ui_data = Namespace(
          screen = 'prep',
          inputname = tk.StringVar(value=""),
          outputname = tk.StringVar(value=""),
      )

    row = 0
    msg = tk.Label(main_frame, text = 'Make sure that you have re-calculated\n'
                                      'the input spreadsheet before preping')
    msg.grid(row=row, column=0, columnspan=2, padx=5, pady=5)


    row += 1
    input_file_cmd = tk.Button(main_frame, text='Input', command=self.on_input_cmd)
    input_file_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='ew')
    input_name = tk.Entry(main_frame, width=30, textvariable=self.parent.ui_data.inputname, state='readonly')
    input_name.grid(row=row, column=1, padx=5, pady=5, sticky='ew')


    row += 1

    output_file_cmd = tk.Button(main_frame, text='Output', command=self.on_output_cmd)
    output_file_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='ew')
    output_name = tk.Entry(main_frame, width=30, textvariable=self.parent.ui_data.outputname, state='readonly')
    output_name.grid(row=row, column=1, padx=5, pady=5, sticky='ew')

    row += 1
    run_cmd = tk.Button(main_frame, text='Run...', command=self.do_prep,state='disabled')
    run_cmd.grid(row=row, column=1, padx=5, pady=5, sticky='se')
    back_cmd = tk.Button(main_frame, text='<< Back', command=self.parent.on_back_cmd)
    back_cmd.grid(row=row, column=0, padx=5, pady=5, sticky='sw')
    self.run_cmd = run_cmd
    if self.parent.ui_data.inputname.get() != '': run_cmd.config(state='normal')

  def do_open_xlsx(self):
    xlfile = self.parent.ui_data.outputname.get()
    self.parent.open_xlsx(xlfile)

  def do_prep(self):
    if (xofile := self.parent.ui_data.outputname.get()) == '':
      self.parent.ui_data.outputname.set(xofile := f'open-telekom-cloud-prices-{today()}.xlsx')
    xifile = self.parent.ui_data.inputname.get()

    self.parent.start_task('Prep XLSX...', self.do_open_xlsx)
    print('start preping...')
    print('input ', xifile)
    print('output', xofile)

    try:
      xlsw.xlsx_sanitize(xifile, xofile)
    except Exception as e:
      print(str(e))
      messagebox.showinfo('Error',str(e))
      self.parent.end_task(False)
      self.parent.clear_ui()
      self.screen_ui()
      return


    self.parent.end_task(True)

  def on_input_cmd(self):
    filename = filedialog.askopenfilename(
                  title='Enter a filename',
                  initialfile=self.parent.ui_data.inputname.get(),
                  filetypes=[
                    ('Excel files', '*.xlsx'),
                    ('All Files', '*.*'),
                  ],
                  parent=self.parent.master,
                )
    self.parent.ui_data.inputname.set(filename)
    self.run_cmd.config(state='normal' if filename else 'disabled')


  def on_output_cmd(self):
    filename = filedialog.asksaveasfilename(
                  title='Enter a filename',
                  initialfile=self.parent.ui_data.outputname.get(),
                  filetypes=[
                    ('Excel files', '*.xlsx'),
                    ('All Files', '*.*'),
                  ],
                  parent=self.parent.master,
                )
    self.parent.ui_data.outputname.set(filename)


class MainMenuScr:
  def __init__(self, parent):
    self.parent = parent
    self.screen_ui()

  def on_build(self):
    self.parent.clear_ui()
    BuildScr(self.parent)

  def on_reprice(self):
    self.parent.clear_ui()
    RepriceScr(self.parent)


  def on_prep(self):
    self.parent.clear_ui()
    PrepScr(self.parent)

  def screen_ui(self):
    button_frame = self.parent.main_frame
    self.parent.title('Commands')

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



class WizUI:
  def __init__(self, master):
    self.command = None
    self.master = master
    self.ui_data = None
    self.stdio = None
    self.master.title("xlpricer Wizard")
    self.base_ui()

  def on_cancel(self,*args):
    if self.stdio is not None:
      sys.stdout =self.stdio.stdout
      sys.stderr =self.stdio.stderr

    self.master.destroy()

  def on_back_cmd(self):
    self.clear_ui()
    MainMenuScr(self)

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

  def title(self, title):
    self.main_frame.config(text=title)

  def add_message(self,txt):
    prev = self.messages.get(tk.END)
    self.messages.delete(tk.END)
    self.messages.insert(tk.END, prev+txt)

  def logmsg(self,message):
    self.stdio.stderr.write(message)
    self.main_frame.update()
    while (nl := message.find('\n')) != -1:
      self.add_message(message[:nl])
      self.messages.insert(tk.END,'')
      message = message[nl+1:]
    if message != '': self.add_message(message)
    self.messages.see(tk.END)
    self.main_frame.update()

  def start_task(self,title, callback=None, open_text = 'Open file...'):
    self.title(title)
    if self.stdio is None:
      self.stdio = Namespace(stdout = sys.stdout, stderr = sys.stderr)

    self.clear_ui()
    sys.stdout = RedirOutput(self.logmsg)
    sys.stderr = RedirOutput(self.logmsg)
    self.run_ui(title, callback, open_text)

  def end_task(self, ok):
    sys.stdout =self.stdio.stdout
    sys.stderr =self.stdio.stderr
    if ok and self.do_open is not None: self.do_open.config(state='normal')

  def run_ui(self, title:str, callback=None, open_text = 'Open file...'):
    main_frame = self.main_frame
    main_frame.config(text=title)

    self.messages = tk.Listbox(main_frame, width=80, height=20)
    self.messages.pack(fill='both', expand=True, side='top', padx=5, pady=5)
    if not callback is None:
      self.do_open = tk.Button(main_frame,state='disabled', text=open_text, command=callback)
      self.do_open.pack(side='bottom',padx=5,pady=5, anchor='e')
    else:
      self.do_open = None

  def open_xlsx(self, xlfile:str):
    subprocess.run(['cmd','/c',os.path.normpath(xlfile)],
        stdout=subprocess.PIPE,   # Capture standard output
        stderr=subprocess.PIPE,   # Capture standard error (optional)
        text=True,                # Decode bytes to string
        check=True                # Raise a CalledProcessError for non-zero exit codes
      )
    sys.exit(0)

def run_ui():
  # Create the main window
  root = tk.Tk()
  app = WizUI(root)
  MainMenuScr(app)
  # Start the Tkinter event loop
  root.mainloop()


