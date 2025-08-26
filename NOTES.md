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



- [ ] Add function column
- [ ] move grouping to the left
  - Rows 3 and 4 show: Total (gg) and Set-up (gg)
  - grouping by default has (gg)
  - Write grouping formulas
- [ ] move columns vCPU and RAM to the right
- [ ] Create per-group totals -- import sample BOM
  - rethink total calculations
  - Added column f_grouping for doing per-group total.
  - Row with "Total XXX" is used to sum total
  - Row with "XXX" is the item for that group
  - Row with "Total XXX" should have:
            ('=SUMIFS({cn}:{cn},'                       # Column to sum
              '{f_qty}:{f_qty},"<>"&{f_qty}{r1},'       # We are on the same row
              '{f_grouping}:{f_grouping},"="&MID({#f_grouping},{totln}+1,LEN({#f_grouping})-{totln}),'
                                                        # Match group items
              '{f_tier_calc}:{f_tier_calc},"=")'        # Select the valid tiered calculation rows
            ).format(totln=len('Total '),cn=cn,r1=r,**xl.ref()),
- [ ] Add Forecast tab
  - In Inflation calculations, add a column for setup charges
  - Add sample sum calculation with Column D
- [ ] Add discount calculator
- [ ] As the BOM grows, performance suffers
  - make tier pricing formulas optional
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



