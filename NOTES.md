# Release procedure

Create a branch "prerel" or "prerel-number" to test pre-releases.
Just push to create artifacts that can be downloaded, or tag with
"x.y.z-dev" or "x.y.z-rcN" or 'x.y.z-pre' for create pre-releases.

Once ready, merge everything to main.  And commit. The final commit message
will be used for the release text body.

Create a tag with a "x.y.z" or "x.y.z-rel".  This will be the release
name.  Once pushed to github, it will automatically create the release.

To delete tags use:

- `git tag -d tagname` : deletes locally
- `git push origin --delete tagname` : deletes remotely


# TODO

- [x] Load some settings from file
  - proxy settings
  - API URL
  - API language
  - swiss
- [x] Allow for additional JSON files containing pricing data
- [x] Added support for Item/ot (setup/one time) charges
  - ~~Add setup costs: unit == Item/ot (to a different sheet)~~
  - ~~xlbom, should make Item/ot set to zero~~
  - ~~Non Recurrent costs use a format:~~
    - ~~`=FILTER(Components!$B$5:$V$20,Components!$V$5:$V$20="Item/ot")`~~
    - ~~B = Qty, V = unit~~
  - ~~This requires a dynamic array formula which openpyxl is not generating~~
    ~~properly.~~
- [x] Add a scrapper run-time and the ability to run scrapper scripts
- [x] Price formula should show 0 instead "" when not available
- [x] Cloud Desc losing Validation list when repricing
  - workaround ... create a Name for the pricelist
- [ ] As the BOM grows, performance suffers
- [ ] Styles get lost after one run
  - run using UI to generate a xlsx.
  - If an error happens and the user is sent back to the build menu
  - Clicking on "Run" again will not work because styles are no longer
    definable.
- [ ] sphinx docs


```python
ic| pkg['response']['columns']: {'R12': 'Reserved (12 months)',
                                 'R24': 'Reserved (24 months)',
                                 'R36': 'Reserved (36 months)',
                                 'RU12': 'Reserved upfront (12 months)',
                                 'RU24': 'Reserved upfront (24 months)',
                                 'RU36': 'Reserved upfront (36 months)',
                                 'additionalText': 'Additional information',
                                 'currency': 'Currency',
                                 'description': 'Description',
                                 'fromOn': 'From on',
                                 'id': 'ID',
                                 'idGroupTiered': 'Tiered prices group',
                                 'isMRC': 'is MRC',
                                 'maxAmount': 'Maximum amount',
                                 'minAmount': 'Minimum amount',
                                 'opiFlavour': 'Flavor',
                                 'osUnit': 'OS unit',
                                 'priceAmount': 'Price amount',
                                 'productCategory': 'Product category',
                                 'productFamily': 'Product family',
                                 'productId': 'Service ID',
                                 'productIdParameter': 'Product ID (Parameter)',
                                 'productName': 'Product name',
                                 'productSection': 'Product section',
                                 'productType': 'Product type',
                                 'ram': 'RAM',
                                 'region': 'Region',
                                 'serviceType': 'Service type',
                                 'storageType': 'Storage type',
                                 'storageVolume': 'Storage volume',
                                 'unit': 'Unit',
                                 'upTo': 'Up to',
                                 'vCpu': 'vCpu'}


```

