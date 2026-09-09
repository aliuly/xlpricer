@echo off
setlocal
REM Python version config
call %~dp0\python-ver.bat

if EXIST %~dp0%WPYDIR%\scripts\env.bat (
  call %~dp0\%WPYDIR%\scripts\env.bat
  goto :SKIP
)
  REM
  REM How to reach the Internet
  REM
  call %~dp0\proxy.bat
  if NOT "%proxy%"=="" (
    set http_proxy=http://%proxy%/
    set https_proxy=http://%proxy%/
    set pipproxy=--proxy=%proxy%
  ) else (
    set pipproxy=
  )
  
  REM
  REM Install WinPython
  REM
  if NOT EXIST %WPYDIST% (
    wget.exe -S https://github.com/winpython/winpython/releases/download/%WPYREL%/%WPYDIST%
  )
  echo Running SFX
  %WPYDIST% -o"%~dp0" -y
  echo Clean-up archive
  del %WPYDIST%

  call %~dp0\%WPYDIR%\scripts\env.bat

  REM ~ pip install %pipproxy% icecream
  REM ~ pip install %pipproxy% pyinstaller
:SKIP
python.exe %*




