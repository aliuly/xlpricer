# xlpricer

Open Telekom Cloud API pricing client

This script uses the API as defined by https://docs.otc.t-systems.com/price-calculator/api-ref/
to create a Excel template to be used as a pricing calculator.

## Using the Components tab

This spreadsheet is used for calculations.  The normalized table
is good for finding components if you know what you are looking
for.  If you are browsing for services, it is better to use the
service description or other documentation.

Column titled "Cloud Desc" can be filled in with the "Name" of the
component as defined in the "Prices" sheet.  The cells are restricted
to values there.  This makes sure that the Component names are exact
and also let's you search components by name.

If you need to add more customer friendly descriptions, insert an
additional column.  I usually would add columns between the "Qty" and
the "Cloud Desc" columns.

The "Assumptions" tab contains values that are used through the
different cell calculations, such as "H/R", "Region", "EVS Class",
"Backup Class", "Backup Factor".  However, these can be overriden
by modifying that individual cell in the relevant row.

It is recommended that instead of modifying those columns in the
Components tab, create a new row in the Assumptions tab and refer
to that cell.

"H/R" column you be filled with the number of Hours in a month or
the strings "R12M" or "R24M".  These strings are for Reserved 12
month and 24 months prices.  Note if the price you select does
not have Reserved pricing, the monthly pricing or the hourly pricing
with 730 hours will be used.

Region will accept "eu-de", "eu-nl".

In general, the following columns need to be tailored:

- Qty : number of sold items
- Cloud Desc : the item being sold
- Storage (GB) : For ECS items, the amount of storage to be attached.

These items are pre-configured to references to the Assumption table
but can be modified:

- H/R : Number of hours or "R12M or "R24M".
- Region : From where the component is being consumed.
- EVS Class: EVS storage class used for storage (for components
  that use Block storage)
- Persist? : Y or N.  If Y, storage persist even if VMs are off.
  N assumes that storage gets discarded when VMs are off, so the
  storage will be reduced to a fraction of the total number of hours.
- Backup class : CBR class being used.  At the moment all CBR classes
  have the same price.

For prices that have Tiered volume discounts such as OBS storage, or
Internet traffic, you can select the Tiered volume item (they are
label "[T#]") from the prices sheet.  This will not calculate
discounts automatically.  If you want to calculate the Tiered volume
discount select the item from the Prices table that does **NOT**
include the tiers (No "[T#]" in description).  These lines do
not have prices, so the Sub-total for that line will be zero.

At the bottom of the sheet, there is a section "Tiered Volume Pricing"
which will add up all the tiered volume entries and distributed into
the different price bands.

# Sharing with Customers

When sharing the spreadsheet with the customer, you may want to remove
the "Prices" tab before hand.  This will break calculations, so
before you do that go to the "Components" tab.  Expand all column
groups as some columns are hidden by default.

Copy the columns highligted with *RED* column headers and paste them
as "Values".  Afterwards, you may safely delete the "Prices" tab.

Doing this keeps the pricing information for the relevant items
and removes all other prices.  But it also keeps most formulas
in working condition.

# Developer Notes

- No Science pricing
- No Oracle Optimized pricing

# TODO

- [ ] Switch to openpyxl, to remove Prices sheet ... removing references
  to it from the components tab
- [ ] subcommand - sanitize
- [ ] subcommand - reprice




