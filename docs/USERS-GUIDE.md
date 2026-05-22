# Using the generated spreadsheet

The generated spreadsheet has several tabs:

- Overview : a multi-year/category summary with hyperlinks to service
  documentation and an optional Enterprise Support Agreement (ESA) section
- Components : detailed list of components
- Prices : this is the list prices as queried via the API
- Volumes : tiered/volume-based pricing adjustments
- Assumptions : some meta data and assumptions taken by this calculation
- ESA : Enterprise Support Agreement calculator (optional, generated if
  ESA is enabled)
- Services : service descriptions (only generated if service data is
  available from the API)

## Components tab

This is where most of the action takes place.  The generated
spreadsheet will be prepopulated with components suitable for a
Containerized application.

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
and *not* the hours.  The hours are registered in the "H/R" column.

The Column titled "Function" is not used in any calculations
and can be used to describe the component being used.  Any
free form text can be used here.

Column titled "Cloud Desc" can be filled in with the "Name" of the
component as defined in the "Prices" sheet.  The cells are restricted
to values there.  This makes sure that the Component names are exact
and also let's you search components by name.

This means for example if you are looking for a Windows system with
4 vcpu and 8 GB memory you can type:

`Windows 4 vcpu 8 gb`

and Excel will show all the matching options.  Similarly, you could
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
is to add a storage component to an specific function.  Obviously
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

- H/R : Number of hours or "R12M", "R24M" or "R36M".
- Region : From where the component is being consumed.
- EVS Class: EVS storage class used for storage (for components
  that use Block storage)
- Persist? : Y or N.  If Y, storage persist even if VMs are off.
  N assumes that storage gets discarded when VMs are off, so the
  storage will be reduced to a fraction of the total number of hours.
- Backup? : STD or None. STD uses the standard backup tariff;
  None excludes backup costs.
- Backup factor : Storage multiplier to calculate the backup volumes.

For multi year calculations, Inflation is computed on the columns
`AR` and onwards look for the title
"Future Price Forecast (Adjusted for Inflation)".
These columns are hidden by default, but can be exposed by clicking
on the corresponding `+` (plus) button.

Inflation is added annually.  Reserved 24-month packages have their
inflation adjusted every two years; reserved 36-month packages are
adjusted every three years.

## Volume based discounts

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


## Assumptions tab

The "Assumptions" tab contains values that are used through the
different cell calculations, such as "H/R", "Region", "EVS Class",
"Backup Class", "Backup Factor", "Used Storage", etc.  However, these
can be overriden by modifying that individual cell in the relevant
row or on the header of the components tab.

"H/R" column can be filled with the number of Hours in a month or
the strings "R12M", "R24M" or "R36M".  These strings are for Reserved
12 month, 24 month and 36 month prices respectively.  If the selected
component does not have the requested reserved pricing, the next
shorter reservation is tried, falling back to hourly or monthly
pricing.

"Region" will accept "eu-de", "eu-nl".

"Used Storage" is a multiplier (default 70 %) that scales the backup
volume calculation to reflect actual storage utilization rather than
allocated capacity.


## Prices tab

The normalized table in the "Prices" tab is good for finding
components if you know what you are looking for.  If you are
browsing for services, it is better to use the service description
or other documentation.

## Overview tab

The overview tab has a multi-year view of the deal.  The calculations
use the "Header/Footer/Group" settings together with the Inflation
Adjusted forecast columns.  Set-up costs are only added to the first
year.

The Overview also includes:

- **Hyperlinks** to T-Cloud Public, Managed Services, and Enterprise
  Support documentation for quick reference.
- **Enterprise Support Agreement (ESA) section** (when enabled),
  showing uplift percentages, fixed and variable charges, and total
  ESA per year.  This section is collapsed by default.



## ESA tab

When ESA is enabled, a dedicated **ESA** tab is generated for the
Enterprise Support Agreement calculation.  It includes:

- **Base Fee** — a mandatory €2,500/month flat fee.
- **Optional Components** — Service Credits on ECS/EVS/OBS
  (€1,000/mo), Dedicated Service Delivery Manager (€3,000/mo),
  and SD Manager on Duty (€6,000/mo).  Each can be toggled Y/N.
- **Uplift Bands** — a tiered percentage applied to total annual
  revenue (0–5k: 10 %, 5k–100k: 4 %, 100k–200k: 3 %, 200k–500k:
  2 %, 500k+: 1 %).  The uplift rate is calculated automatically
  based on the total spend from the Overview.

The Overview tab pulls the ESA fixed price and uplift formula from
this sheet and displays the resulting yearly ESA charges alongside
the regular totals.

## GB and GiB

T-Cloud Public uses GiB instead of GB for its standard unit of
measure where applicable.

### **1. GiB (Gibibyte)**
- **Definition**: GiB stands for **Gibibyte**, which is based on
  binary measurement (base-2).
- **1 GiB** = ( 2^{30} ) bytes = **1,073,741,824 bytes**.
- GiB is part of the **IEC binary standard** and is commonly used in
  computing applications where data is measured in powers of 2, such
  as memory sizes.
- Prefix: Gi (Gibi-) means binary-based, e.g., Kibibyte (KiB),
  Mebibyte (MiB), Gibibyte (GiB), etc.
### **2. GB (Gigabyte)**
- **Definition**: GB stands for **Gigabyte**, which is based on
  decimal measurement (base-10).
- **1 GB** = ( 10^9 ) bytes = **1,000,000,000 bytes**.
- GB is commonly used in the marketing of storage devices like hard
  drives, SSDs, and USB drives, as manufacturers use the base-10
  definition to advertise larger capacities.

As a convenience, the spreadsheet defines two names:

* `GB_TO_GiB`
* `GiB_TO_GB`

Use these to convert units from one to the other.  For example:

Converting from GB to GiB you can have in your formula:

```text
= 2000 * GB_TO_GiB
```

And viceversa, going from GiB to GB you can have a formula:

```text
= 4000 * GiB_TO_GB
```
