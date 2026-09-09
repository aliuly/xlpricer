@echo off
setlocal
set PYTHONPATH=%PYTHONPATH%;%~dp0
set VENV=%~dp0.venv
call %VENV%\Scripts\activate.bat

python.exe %*
