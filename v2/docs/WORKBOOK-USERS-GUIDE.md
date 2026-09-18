# XLpricer v2 — Workbook User's Guide

How to use the generated Excel workbook.  The web app itself is
covered in [SPA-USERS-GUIDE.md](SPA-USERS-GUIDE.md).

## Tabs

The generated workbook has these tabs:

- **Overview** — multi-year/category summary with hyperlinks to
  service documentation and the optional ESA section.
- **Components** — the bill of materials (one sheet per custom
  components tab); this is where you tailor the deal.
- **Volumes** — tiered/volume-based pricing adjustments.
- **Prices** — the full normalized price list from the pipeline.
- **Finder** — searchable filter interface over the Prices list.
- **Assumptions** — metadata and assumptions behind the calculation.
- **ESA** — Enterprise Support Agreement calculator (only when ESA
  is enabled).
- **T** — Internal data used by the XLpricer tooling

Macro-enabled (XLSM) workbooks additionally show a **Tools** tab with
buttons — see [Macros](#macros-xlsm).

## Components tab

This is where most of the action takes place.  The generated workbook
is prepopulated with components suitable for a containerized
application.

The header holds the tab-wide defaults — default **Region**, pricing
model (reserved **R12M/R24M/R36M**, **Elastic-FT** 24×7 or
**Elastic-Office** office hours), **EVS Class**, **Backup Class** and
**Set-up** — and calculates any set-up costs and the monthly total.
Each row can override the defaults.

Input cells are shaded light brown; calculated cells are white.  The
main columns:

- **Qty** — the number of units.  For hourly-billed components this
  is the number of components; the hours live in **H/R**.
- **Function** — free text, not used in any calculation.
- **Description** — the component's exact name from the Prices
  sheet.  The cells carry a dropdown restricted to the price list,
  and typing filters the list (start typing `SFS`…).  This makes
  sure the component names are exact.
- **Storage (GiB)** — storage attached to the component, with a
  built-in backup calculation that uses values from the Assumptions
  tab.
- **H/R** — hours per month, or `R12M`/`R24M`/`R36M` for reserved
  pricing.  If the selected component has no price for the requested
  reservation, the next shorter reservation is tried, falling back to
  hourly pricing.
- **Group** — component grouping with sub-totals.  A group is a
  header row (green) with the *group title* and a free-form *group
  id*, component rows (grey/white), and a footer row (magenta) where
  the sub-totals are calculated.  Component and footer rows reference
  the previous row's group cell (e.g. `=E8`), so changing the group
  id only requires editing the header row.  The footer title cell
  must start with `Total` — that text filters sub-totals out of
  further calculations.

The remaining columns (Region, EVS Class, Persist?, Backup?, Backup
factor, …) are prefilled from the Assumptions tab or the tab header
and can be overridden per row.  Most of them are hidden; expose them
with the **+** (plus) buttons.

Add rows by copying an existing component/header/footer row — that
copies the formulas along.

Multi-year inflation lives in the hidden columns under
"Future Price Forecast (Adjusted for inflation)".  Inflation is added
annually; reserved 24-month packages adjust every two years,
36-month packages every three years.

## Finder

A searchable view over the full Prices list, for browsing and
comparing products (requires Excel 2021/365):

- **Filters** — dropdowns for productFamily (always applied — it has
  no "(all)" option), Region, productId, storageType, serviceType,
  osUnit and Description.  The Description dropdown only lists the
  descriptions that match your *other* filters.  Leaving a dropdown
  blank is the same as selecting `(all)` — no filter.
- **vCpu / RAM min/max boxes** — type a **min** only for an exact
  match (the max mirrors the min); type a **max** to set a range.
- **Results** — "Results (N matches)" counter and the columns
  Description (formatted like the BOM description column), Region,
  vCpu, RAM, priceAmount, unit, R12/R24/R36 — sorted by priceAmount,
  cheapest first.

The result cells are fixed array formulas — they are read-only
("You can't change part of an array" is expected there); edit the
filter cells instead.  Copy the Cell with the in Column B
with whatever product you want to use and paste it as a **VALUE**
on a Components tab in column D.

## Volume based discounts

Some prices are reduced by volume: the more you consume of Object
Storage or Outbound Internet traffic, for example, the cheaper the
unit gets.  These discounts are calculated automatically.  Tiered
entries in the price list are marked `[T1]`, `[T2]`, … — using the
plain entry lets the volume calculation pick the right band, while a
`[Tn]` entry pins the price to that band.

The *Volumes* tab pulls the volumes from the components tabs and
computes the tier adjustments.  It is generated from all BOM tabs;
when you add or rename a BOM tab in Excel, run a repricing (Force
repricing in the SPA) so Volumes is rebuilt with a column per tab.

## Prices tab

The normalized full price list — 5,000+ rows, one column per pricing
attribute.  For browsing and searching, the **Finder** is usually the
better tool; use Prices when you know exactly what you are looking
for.

## Overview tab

The overview tab has a multi-year view of the deal.  The calculations
use the group header/footer settings together with the inflation
adjusted forecast columns.  Set-up costs are only added to the first
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

## Assumptions tab

The Assumptions tab contains values used throughout the calculations,
such as "H/R", "Region", "EVS Class", "Backup Class", "Backup
Factor", "Used Storage", etc.  These can be overridden per cell, per
row or on the components tab header.

- "H/R" can be filled with the number of hours in a month or the
  strings "R12M", "R24M" or "R36M" (see the Components tab).
- "Region" accepts the regions present in the pricing snapshot
  (e.g. `eu-de`, `eu-nl`); the cells carry dropdowns.
- "Used Storage" is a multiplier (default 70 %) that scales the
  backup volume calculation to reflect actual storage utilization
  rather than allocated capacity.

## T tab

This is considered for XLpricer tooling only and should be ignored
for most practical purpose.

It contains: the app version, source URL, pricing data date and
the params/includes/patches the workbook was built from.  The SPA
uses it for the staleness check.  It is machinery, not input.

## Macros (XLSM)

XLSM workbooks include VBA macros and a **Tools** tab:

- **Add Components** — appends a new BOM (Components) tab.  This
  also adds a sample row in the "Overview" tab and add volume
  totals calculation to the "Volumes" tab.
- **Trim Workbook** — lets you create a trimmed version of the
  Workbook.  This creates a macro-free copy with the full
  pricelist and other calculation related tabs removed.

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
