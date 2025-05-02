@echo off

REM ~ call %~dp0pys.bat %~dp0try.py
call %~dp0pys.bat -m xlpricer %*
REM ~ call %~dp0pys.bat %~dp0xlpricer\__main__.py %*

REM ~ call %~dp0pys.bat -m xlpricer --save %~dp0prices.json
REM ~ call %~dp0pys.bat %~dp0xlpricer\__main__.py --save %~dp0xscr.json

REM ~ call %~dp0pys.bat -m xlpricer build --load %~dp0prices.json %*
REM ~ call %~dp0pys.bat -m xlpricer reprice --load %~dp0prices.json open-telekom-cloud-prices-2025-05-01.xlsx
REM ~ call %~dp0pys.bat %~dp0xlpricer\__main__.py --load %~dp0xscr.json %~dp0xout.xlsx
REM ~ call %~dp0pys.bat t.py


REM ~ setlocal
REM ~ set GITHUB_OUTPUT=output.env
REM ~ set GITHUB_REF_TYPE=tag
REM ~ set GITHUB_REF_NAME=1.0.0-rc1
REM ~ call %~dp0pys.bat %~dp0windows\github-meta.py

REM ~ call %~dp0pys.bat %~dp0xlpricer\wiz.py 
