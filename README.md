# xlpricer

Open Telekom Cloud API, offline pricing calculator.

This script uses the API as defined by
https://docs.otc.t-systems.com/price-calculator/api-ref/
to create a Excel template to be used as a pricing calculator.

# Usage

The xlpricer has a very simple Graphics Interface and a
command line interface.  You can use it to create 
pricing sheets and update them accordingly.

## Graphics User Interface (GUI)

The GUI, can let you generate a sample worksheet, re-price an
existing worksheet and the 

## Command Line Interface (CLI)

## Using the generated spreadsheet

The generated spreadsheet has several tabs:

- Overview : a multi-year/category summary
- Components : detailed list of components
- Prices : this is the list prices as queried via the API
- Assumptions : some meta data and assumptions taken by this calculation

### Components tab

This is where most of the action takes place.  The generated
spreadsheet will be prepopulated with components suitable for a
Containarized application.

The header contains some basic characteristics for this component
list such as the default region, and the pricing model which defaults
to reserved 24 months.  Other options are 12 months reserved, Pay per
use 24x7 and office hours operations.  Note these are the default
values but each row can be overriden if necessary.

The header will also calculate any set-up costs, and the monthly
total price.

The columns themselves are arranged in to two sides, left side
(shaded light brown) contains cells where input is expected, whereas
the right side (white cells) are calculated automatically.

Column titled "Qty" is the amount of a given component.  Note that
for components charged per hour, this is the number of components,
and *not* the hours.  The hours are registed in the "H/R" column.

The Column titled "Function" is not used in any calculations
and can be used to describe the component being used.  Any
free form text can be used here.

Column titled "Cloud Desc" can be filled in with the "Name" of the
component as defined in the "Prices" sheet.  The cells are restricted
to values there.  This makes sure that the Component names are exact
and also let's you search components by name.

This means for example if you are looking for a Windows sytem with
4 vcpu and 8 GB memory you can type:

`Windows 4 vcpu 8 gb`

and Excel will show all the matching options.  Simlarly, you could
go to a cell and start typing

`SFS`

and the matching options will be selected for you.

The next column is the `Group` column, and it is used to create
component groups and calculate sub-totals for them.  To create
a group, you need a header row (highlighted green), component rows
(in grey and white) and footer row (highlighted magenta) where
sub-totals are calculated.

In the header row, enter the _group title_ in column `B`.  This
is a free form text.  In Column `E`, enter the _group id_.  This
can be any string.  My preference is to keep the _id_ short and
sweet.  For the remaining component rows and footer row, place in
the _Group_ column a reference to the previous cell.  For example,
in Cell `E8`, you would enter `=E7`.  This way if you want
to change the _group id_ you only need to change the entry in the
header row.

The footer row, is used to calculate totals and will use the contents
of the `Group` column to select the numbers to add.  Note that the
title cell in column `B` should always start with the text `Total`
as this text is used to filter out the sub-totals from further
calculations.

If you need to add more rows, rather than inserting them, copy them
from an existing component, header or footer rows.  That way the
formulas will be copied together.

The next column after the `Group` is the `Storage` column.  This
is to add a storage ocmponent to an specific function.  Obviously
you could add another "component" row for the storage.  This `Storage`
column has a built-in backup calculation that uses values from the
assumptions sheet.

The remaining columns are prefilled with default values that come
from the _Assumptions tab_.  You can override the defaults on a 
per-row basis, or for the whole tab on the top header rows.  Note,
the majority of these columns are hidden, but can easily be exposed
by clicking on the corresponding `+` (plus) button.

In general, the following columns need to be tailored:

- Qty : number of sold items
- Cloud Desc : the item being sold
- Storage (GB) : For ECS items, the amount of storage to be attached.

These items are pre-configured to references to the Assumption table
or from the top of the components tab, but can be modified:

- H/R : Number of hours or "R12M or "R24M".
- Region : From where the component is being consumed.
- EVS Class: EVS storage class used for storage (for components
  that use Block storage)
- Persist? : Y or N.  If Y, storage persist even if VMs are off.
  N assumes that storage gets discarded when VMs are off, so the
  storage will be reduced to a fraction of the total number of hours.
- Backup class : CBR class being used.  At the moment all CBR classes
  have the same price.
- Backup factor : Storage multiplier to calculate the backup volumes.

For multi year calculations, Inflation is computed on the columsn 
`AR` and onwards look for the title
"Future Price Forecast (Adjusted for Inflation)".
These columns are hidden by default, but can be exposed by clicking
on the corresponding `+` (plus) button.

Inflation is added anually, except for reserved 24 month packages,
where the inflation is adjusted every two years.

### Volume based discounts

Some prices get reductions based on volumes.  For example,
Object Storage, or Outbound Internet traffic, the more MB you
consume, the cheaper it gets.  These discounts are calculated
automatically.  For example, OBS Standard Space, has the
following entries in the Price list:

- Storage: OBS Standard Space
- Storage: OBS Standard Space [T1] (until 5)
- Storage: OBS Standard Space [T2] (6 to 1,000)
- Storage: OBS Standard Space [T3] (1,001 to 50,000)
- Storage: OBS Standard Space [T4] (50,001 to 500,000)
- Storage: OBS Standard Space [T5] (from 500,001)

If you use the entry "Storage: OBS Standard Space", in the components
tab, the price will be adjusted according to the volume.  If you
instead use one of the entries with *T1*, *T2*, *T3*, *T4* or *T5*,
the price will be fixed to that price band and the volume calculation
will not be used.

This automatic project adjustment due to volume is in the *Volumes*
tab.  It pulls the volumes from the components tab.  So if you 
have additional calculations spread across multiple tabs, you must
make sure to update the *Volumes* tab, so that the total is calculated
properly.  You can easily do this by Copying and Inserting column
"C" into column "D" on-wards.  Then use the Find and Replace 
Excel functionality to replace "Components" with the name of the
tab.


### Assumptions tab

The "Assumptions" tab contains values that are used through the
different cell calculations, such as "H/R", "Region", "EVS Class",
"Backup Class", "Backup Factor", etc.  However, these can be overriden
by modifying that individual cell in the relevant row or on the
header of the components tab.

"H/R" column you be filled with the number of Hours in a month or
the strings "R12M" or "R24M".  These strings are for Reserved 12
month and 24 months prices.  Note if the price you select does
not have Reserved pricing, the monthly pricing or the hourly pricing
with 730 hours will be used.

Region will accept "eu-de", "eu-nl".


### Prices tab

The normalized table in the "Prices" tab is good for finding
components if you know what you are looking for.  If you are
browsing for services, it is better to use the service description
or other documentation.

### Overview tab

The overview tab has a multi-year view of the deal.  The calculations
uses the "Header/Footer/Group" settings together with the Inflation
Adjusted forecast columns.  Set-up costs are only added to the first
year.



## Preparing sheet for sharing

The sub-command `prep` is available to prepare the file for sharing.

The `prep` sub-command will remove the "Prices" tab, and remove
references to "Prices" in the different formulas.  Make sure that
the Excel file has been re-calculated before running `prep` as it
will use the values from this last calculation to replace formulas
referencing the "Prices" table.

You can do this manually too, by copying the columns highligted
with *RED* column headers and paste them as "Values".  Afterwards, you
may safely delete the "Prices" tab.  Make sure that there are no
broken calculations by expanding all groups as some columns/rows are
hidden by default.

Doing this keeps the pricing information for the relevant items
and removes all other prices.  But it also keeps most formulas
in working condition.  Specially, it reduces the file size
significantly.

# Known issues

- No Science pricing

# Versions

- 1.4.0:
  - Added CBR no backup option
  - Added a shared EVS volume entry
  - Adding Tiered Volume pricing calculation
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


