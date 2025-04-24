@echo off

REM ~ call %~dp0pys.bat %~dp0try.py
REM ~ call %~dp0pys.bat -m xlpricer -V
REM ~ call %~dp0pys.bat %~dp0xlpricer\__main__.py -V

REM ~ call %~dp0pys.bat -m xlpricer --save %~dp0prices.json
REM ~ call %~dp0pys.bat %~dp0xlpricer\__main__.py --save %~dp0xscr.json

call %~dp0pys.bat -m xlpricer --load %~dp0prices.json %*
REM ~ call %~dp0pys.bat %~dp0xlpricer\__main__.py --load %~dp0xscr.json %~dp0xout.xlsx



