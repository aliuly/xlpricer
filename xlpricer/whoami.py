'''
Return the current user's name
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa
# ~ import os
# ~ import sys

import argparse
import subprocess
import os
import sys

ERROR_STR = 'unknown'

def whoami():
  login = os.getlogin()
  try:
    res = subprocess.run(
        ['whoami'],
        stdout=subprocess.PIPE,   # Capture standard output
        stderr=subprocess.PIPE,   # Capture standard error (optional)
        text=True,                # Decode bytes to string
        check=True                # Raise a CalledProcessError for non-zero exit codes
    )
    if res.stderr != '': sys.stderr.write(res.stderr)
    username = res.stdout.strip() if res.stdout != '' else ERROR_STR
  except:
    username = ERROR_STR

  try:
    res = subprocess.run(
        ['whoami','/fqdn'],
        stdout=subprocess.PIPE,   # Capture standard output
        stderr=subprocess.PIPE,   # Capture standard error (optional)
        text=True,                # Decode bytes to string
        check=True                # Raise a CalledProcessError for non-zero exit codes
    )
    if res.stderr != '': sys.stderr.write(res.stderr)
    fullname = res.stdout.strip() if res.stdout != '' else ERROR_STR
  except:
    fullname = ERROR_STR
  for i in fullname.split(','):
    if not i.startswith('CN='): continue
    fullname = i[3:].replace(login,'').strip('.')
    break

  try:
    res = subprocess.run(
        ['whoami','/upn'],
        stdout=subprocess.PIPE,   # Capture standard output
        stderr=subprocess.PIPE,   # Capture standard error (optional)
        text=True,                # Decode bytes to string
        check=True                # Raise a CalledProcessError for non-zero exit codes
    )
    if res.stderr != '': sys.stderr.write(res.stderr)
    email = res.stdout.strip() if res.stdout != '' else ERROR_STR
  except:
    email = ERROR_STR

  return argparse.Namespace(username=username,fullname=fullname,email=email,login=login)


if __name__ == '__main__':
  ic(whoami())
