
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

***

- Disabled pricing tiers
- [ ] reprice command to update tiering table.
  - scan the other sheets.  Finding relevant columns.
    - tier calc, description, region, vCPU, Price
  - look down and find the cells with "Tier", which are the ones that
    need updating.
  - search the price in the apidat, and update
