@echo off
setlocal

if EXIST %~dp0%env.bat (
  call %~dp0%env.bat 
)
if EXIST %~dp0%..\env.bat (
  call %~dp0%..\env.bat
)
if NOT "%proxy%"=="" (
  set http_proxy=http://%proxy%/
  set https_proxy=http://%proxy%/
  set pipproxy=--proxy=%proxy%
) else (
  set pipproxy=
)

set VENV=%~dp0.venv
set command=python
set mode=
if NOT EXIST %VENV%\Scripts\activate.bat (
  @REM set-up a virtual python environment
  for %%p in ("%PATH:;=" "%") do (
    if exist "%%~p\%command%.bat" (
      set mode=bat
      goto :FOUND
    )
  )
  if exist %command%.bat (
    set mode=bat
  )
  :FOUND
  echo mode=%mode%
  if "%mode%"=="bat" (
    echo Setting VENV-bat
    call %command%.bat -m venv --system-site-packages %VENV%
  ) else (
    echo Setting VENV
    %command% -m venv --system-site-packages %VENV%
  )
  if NOT EXIST %VENV%\Scripts\activate.bat (
    echo.
    echo FAILED setting up VENV
    echo Python missing?
    goto :EOF
  )
)

call %VENV%\Scripts\activate.bat


python -m pip install %pipproxy% --requirement %~dp0%requirements.txt
python -m pip install %pipproxy% icecream
