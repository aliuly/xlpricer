#!/usr/bin/env python3
''' Proxy configuration options '''
try:
  import winreg
  import requests
  has_winreg = True
except ModuleNotFoundError:
  has_winreg = False

import re
import sys
import os


def proxy_auto_cfg():
  ''' Configure PROXY from Windows registry AutoConfigURL

  :returns tupple: (None,None,None) on error.  (proxy_ip:port, autocfg_url, autocfg_url text)

  Looks-up the AutoConfigURL from the Windows registry and tries to
  find a valid proxy setting from the returned text.
  '''
  if not has_winreg:
    sys.stderr.write('No proxy_auto_cfg possible\n')
    return None, None, None
  REG_PATH = r'Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  REG_KEY_NAME = 'AutoConfigURL'
  registry_key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0,
                                       winreg.KEY_READ)
  value, regtype = winreg.QueryValueEx(registry_key, REG_KEY_NAME)
  winreg.CloseKey(registry_key)

  if not value: return None, None, None

  # Remove proxy configurations temporarily
  save={}
  for proxy in ('http_proxy', 'https_proxy'):
    save[proxy] = os.getenv(proxy)
    if save[proxy]: os.environ[proxy] = ''

  resp = requests.get(value)

  # Restore proxy config
  for proxy in ('http_proxy', 'https_proxy'):
    if save[proxy]: os.environ[proxy] = save[proxy]

  if not resp.ok: return None, value, None

  mv = re.search(r'PROXY (\d+\.\d+\.\d+\.\d+:\d+);', resp.text)
  proxy = mv[1] if mv else None

  return proxy, value, resp.text

def show_autocfg(opts = None):
  ''' Print the proxy auto configuration results

  :param namespace opts: (optional) Namepsace containing a debug variable which indicates if the contents of the URL script should be shown
  '''
  proxy, url, jstext = proxy_auto_cfg()

  if url: print('// AutoConfigURL: {url}'.format(url=url))
  if proxy: print('// Recognized proxy: {proxy}'.format(proxy=proxy))
  if jstext and not opts is None and opts.debug:
    print('// Contents:')
    print(jstext)

def proxy_cfg(debug=False):
  ''' Configure proxy

  :param bool debug: (optional) Show the proxy being used

  Configure proxy as needed.  If needed, will configure the proxy
  by setting the environment.
  '''
  if not has_winreg: return
  proxy, url, jstext = proxy_auto_cfg()
  if not proxy: return

  os.environ['http_proxy'] = f'http://{proxy}/'
  os.environ['https_proxy'] = f'http://{proxy}/'
  if debug: sys.stderr.write(f'Using proxy: {proxy}\n')


def autocfg_vars():
  '''Print the output of proxy autoconfiguration'''

  proxy, url, jstext = proxy_auto_cfg()

  if url: print(f'REM AutoConfigURL: {url}')
  if proxy: print(f'SET proxy={proxy}')

if __name__ == '__main__':
  if not has_winreg: sys.exit(1)
  autocfg_vars()
