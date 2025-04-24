@echo off

REM ~ call pys.bat src\price-api.py %*
REM ~ call pys.bat src\price-api.py --save prices.json
REM ~ call pys.bat src\price-api.py --load prices.json

call pys.bat src\xlsw.py -d --load prices.json %*



REM ~ call pys.bat price-api.py

REM ~ call pys.bat prcgrabber.py -f xlsx pricing.yaml
REM ~ start open-telekom-cloud-prices-2025-02-11.xlsx

REM normal parse
REM ~ call pys.bat prcgrabber.py -p pricing.yaml open-telekom-cloud-servicedescription.pdf

REM ~ call pys.bat prcgrabber.py ^
    REM ~ -p fullprc1.yaml ^
    REM ~ open-telekom-cloud-servicedescription.pdf ^
    REM ~ --science "Science Pricing T-Systems International GmbH EN - 08.04.2024 16_24_03.pdf"

REM ~ call pys.bat prcgrabber.py fullprc1.yaml    
REM ~ call pys.bat prcgrabber.py open-telekom-cloud-servicedescription.pdf

REM ~ call pys.bat prcgrabber.py -f yaml fullprc1.yaml    
REM ~ call pys.bat prcgrabber.py -f xlsx fullprc1.yaml    
