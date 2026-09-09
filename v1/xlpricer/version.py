'''
Report my module version information
'''
import os
import sys
import subprocess

ERROR_STR = 'unknown'

def get_git_description():
  try:
    # Get the directory where this script is located
    env_type = os.getenv('GITHUB_REF_TYPE','unknown')
    if env_type == 'tag':
      env = os.getenv('GITHUB_REF_NAME',None)
      if not env is None: return env

    script_directory = os.path.dirname(os.path.abspath(__file__))
      
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

VERSION = get_git_description()
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

if __name__ == '__main__':
  try:
    from icecream import ic
  except ImportError:  # Graceful fallback if IceCream isn't installed.
    ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa
  ic(VERSION)
