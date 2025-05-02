'''
Report my module version information
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

import argparse
import os
import sys
import subprocess

ERROR_STR = 'vExp'

def get_git_description(file:str) -> str:
  try:
    # Get the directory where this script is located
    env_type = os.getenv('GITHUB_REF_TYPE','unknown')
    if env_type == 'tag':
      env = os.getenv('GITHUB_REF_NAME',None)
      if not env is None: return env

    script_directory = os.path.dirname(os.path.abspath(file))
      
    # Run the command with subprocess.run in the script's directory
    result = subprocess.run(
        ['git', 'describe'],
        cwd=script_directory,     # Set the current working directory
        stdout=subprocess.PIPE,   # Capture standard output
        stderr=subprocess.PIPE,   # Capture standard error (optional)
        text=True,                # Decode bytes to string
        check=True                # Raise a CalledProcessError for non-zero exit codes
    )
      
    # The output is available in result.stdout
    return result.stdout.strip()  
  except subprocess.CalledProcessError as e:
    sys.stderr.write(f"An error occurred while running git describe: {e.stderr.strip()}\n")
    return ERROR_STR
  except Exception as e:
    sys.stderr.write(f"Unexpected error: {e}\n")
    return ERROR_STR

def make_parser():
  ''' Command Line Interface argument parser '''
  cli = argparse.ArgumentParser(prog=sys.argv[0],description="program description")
  cli.add_argument('-w', '--write', help='Update file', action='store_true', default = False)
  cli.add_argument('version_py', help = 'Version file to write',nargs=1)
  return cli

if __name__ == '__main__':
  cli = make_parser()
  args = cli.parse_args()
  if isinstance(args.version_py,list): args.version_py = args.version_py[0]
  ic(args)
  print(args)

  text = '''
VERSION = "{version}"
'''.format(version = get_git_description(args.version_py))

  if args.write:
    with open(args.version_py,'w') as fp:
      fp.write(text)
  else:    
    print(text)
