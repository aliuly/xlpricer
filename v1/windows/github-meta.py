'''
Play around with github meta data
'''
try:
  from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
  ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa


import os
import re
import sys
import subprocess

class K:
  prerelease_tag = 'PRERELEASE_TAG'
  release_body = 'RELEASE_BODY'


def gitrun(cmd:list[str], wd:str =".") -> str:
  try:
    result = subprocess.run(cmd,
                            cwd=wd,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            text=True,
                            check=True,
                            )
    return result.stdout.strip()
  except subprocess.CalledProcessError as e:
    sys.stderr.write(f"Cmmand error: {e.stderr.strip()}\n")
  except Exception as e:
    sys.stderr.write(f'Unexpected error: {e}\n')
  return None
  
def sanitize(text:str) -> str:
  return text.replace('%','%25').replace('\n','%0A').replace('\r','%0D')

def main():
  if (github_output := os.getenv('GITHUB_OUTPUT',None)) is None:
    sys.stderr.write("No GITHUB_OUTPUT found\n")
    sys.exit(0)

  output_lines = dict()

  ref_type = os.getenv('GITHUB_REF_TYPE','unknown')
  ref_name = os.getenv('GITHUB_REF_NAME',None)

  output_lines[K.prerelease_tag] = 'false'
  if ref_type == 'tag':
    if re.search(r'-rc[0-9]+$', ref_name) or re.search(r'-dev[0-9]*$', ref_name) or re.search(r'-pre[0-9]*$', ref_name):
      output_lines[K.prerelease_tag] = 'true'
    relbody = gitrun(['git','show','-s','--format=%B',ref_name,'--'])
    if relbody is not None: output_lines[K.release_body] = relbody

  if len(output_lines) > 0:
    with open(github_output,'a') as fp:
      for k,v in output_lines.items():
        print(f'{k}={sanitize(v)}')
        fp.write(f'{k}={sanitize(v)}\n')

main()
