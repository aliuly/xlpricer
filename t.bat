@echo off

call %~dp0pys.bat %~dp0xlpricer\__main__.py %*
REM ~ call %~dp0pys.bat -m xlpricer build --load %~dp0xlpricer-cache.json %*

REM ~ call %~dp0pys.bat %~dp0try.py
REM ~ call %~dp0pys.bat -m xlpricer %*

REM ~ call %~dp0pys.bat -m xlpricer build --save %~dp0xlpricer-cache.json

REM ~ call %~dp0pys.bat -m xlpricer reprice --load %~dp0prices.json open-telekom-cloud-prices-2025-05-01.xlsx
REM ~ call %~dp0pys.bat -m xlpricer prep INTERNAL-open-telekom-cloud-prices-2025-05-12.xlsx  non.xlsx
REM ~ call %~dp0pys.bat -m xlpricer run flex.py
REM ~ call %~dp0pys.bat -m xlpricer run ora.py


REM ~ setlocal
REM ~ set GITHUB_OUTPUT=output.env
REM ~ set GITHUB_REF_TYPE=tag
REM ~ set GITHUB_REF_NAME=1.0.0-rc1
REM ~ call %~dp0pys.bat %~dp0windows\github-meta.py

