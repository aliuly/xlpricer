# Versions

- Next:
  - Fixed a bug where random prices were being pulled in for items
    without backup items.
- 1.8.0:
  - Added a temp fix for wrong m9 productName's
  - tweak the headings on overview tab inflation tables
  - re-order columns
  - Added a percentage calculation from FT to Office hours
  - Better handle partial year calculation.
- 1.7.1:
  - Finishing GB to GiB transition
  - Added preload file configuration
- 1.7.0:
  - Backup selection simplified to STD/None (CRR removed for now)
  - Added backup product cross-reference columns in Prices tab
  - Added Replicated Storage columns in Prices tab (EVS mapping)
  - Normalized "GB/month" and "GB/Month" units to "GiB", also
    all text that mentions GB transformed to GiB.
  - Added factors to convert GB to/from GiB.
- 1.6.0:
  - Total row configures from header row. (Breaks less if the user
    deletes rows from the BOM)
  - Links for more Information
  - Added Enterprise Support Agreement calculation
- 1.5.0:
  - Adding R36M support
  - Removing scrapping code (too buggy)
  - Unprotect volumes column
- 1.4.1: Bugfix
- 1.4.0:
  - Added CBR no backup option
  - Added a shared EVS volume entry
  - Adding Tiered Volume pricing calculation
  - Overview tab shows next year (during the last quarter of this year)
- 1.3.1:
  - Added some error checking to overview.
  - Group to hide EVS/CBR columns when not in use.
  - Tweaked backup factor calculation
- 1.3.0:
  - On components sheet, default region, pricing model, EVS and CBR classes.
  - Added overview page
  - Re-worked total calculations to include group sub-totals
  - Wording of platform services.
  - Added example contents and example Outbound Internet traffic
    assumption
  - Fully removed tier calculation
- 1.2.3:
  - Add set-up column to inflation forecast
  - Update proxy settings
  - Change
- 1.2.2:
  - GPU flavors to description
  - Price API module debug code
  - Tweaked language settings
- 1.2.1: bugfix
  - Services tab only gets generated if data is found.  Latest API
    change does not return sevices records.
- 1.2.0:
  - Added support for settings file
  - Include prices by additional JSON files
  - Added Non-recurrent charges calculations
  - Added scrapping run-time
  - Bugfixes and tweaks
- 1.1.0:
  - Added tiered price support
  - Added simple wizard-like UI
  - Other tweaks and bugfixes
- 1.0.0:
  - Initial release


