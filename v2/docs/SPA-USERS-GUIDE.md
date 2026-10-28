# XLpricer v2 — SPA User's Guide

How to use the web app.  The generated Excel workbook is covered in
[WORKBOOK-USERS-GUIDE.md](WORKBOOK-USERS-GUIDE.md).

The app has four modes (selector at the top): **Basic**, **Custom**,
and **Conversion**.

## Basic mode

One-click generation from the standard pricing data:

- **Deal info** — Deal ID / Customer / Seq No.  They build the
  download filename:
  `TCP_<deal-id>_<customer>_<seq-no>_<YYYY-MM-DD>.xlsx`.
- **Options** — workbook format (**XLSX** or macro-enabled **XLSM**),
  whether the **ESA** (Enterprise Support Agreement) tab is generated,
  and **Custom pricing** (see below).
- **Generate pricing spreadsheet** — fetches the pricing pipeline
  (your Includes-tab configuration when Custom pricing is on, the
  default standard includes when off), applies the standard
  assumptions/components, and downloads the workbook.
- **Pricing data** card — date, version and MD5 of the
  `prices-latest.json` the workbook is generated from.

## Custom mode

Tabbed editors for your own data, persisted in the browser
(localStorage):

- **Home** — the same deal-info/options/generate flow as Basic, but
  the workbook is built from your tab data instead of the standard
  data.
- **Assumptions** — the assumption values (default region, hours,
  backup class/factor, …).
- **Includes** — enable/disable the standard includes and upload
  custom pricing CSVs (see below).
- **Components** — one or more bill-of-materials tabs, edited as
  grids; the **+** button adds another tab.  Each tab becomes a
  Components sheet in the generated workbook.

### Includes and custom pricing

The pricing pipeline ships standard include files.  In the Includes
tab you can:

- enable/disable individual standard includes (checkboxes),
- upload your own CSV pricing files.

An uploaded file **overrides** a standard include of the same name
and is merged into the pricing data.

The **Custom pricing** checkbox in Gen Options — one shared setting
across Basic, Custom and Conversion mode — decides which
configuration is used everywhere:

- **On** — pricing uses the Includes-tab configuration: the enabled
  standard includes plus any uploaded custom CSVs.  In Custom and
  Conversion mode it also enables the Includes tab.
- **Off** (default) — pricing uses the system defaults: *all*
  standard includes, ignoring the enabled subset and any uploaded
  CSVs.  The Includes tab is disabled.

Only pricing is affected: in Custom mode, assumptions and components
always come from their own tabs.

## Conversion mode (Workbook tab)

Work on an existing workbook:

1. **Upload** a generated workbook (`.xlsx`/`.xlsm`, up to 32 MB).
2. The app inspects it and shows a "Detected: …" line plus a
   **staleness** verdict against the live pricing pipeline —
   *pricing up to date* or *pricing out of date*.  The check compares
   pipeline data only; the Custom pricing checkbox never affects it.
3. Pick an operation:
   - **Convert only** — XLSX → XLSM (adds the macro template) or
     XLSM → XLSX (strips the macros).
   - **Update pricing tables / Force repricing** — rebuilds the
     pricing sheets (Prices, Volumes, Finder) and the T metadata from
     the current pipeline, leaving all of your sheets untouched.
     Includes follow the Custom pricing checkbox, exactly like
     generation.  The label follows the staleness verdict; a trimmed
     workbook shows **Rebuild full workbook** (always forced).
   - **Trim workbook** — produces a macro-free XLSX with every
     formula that references the Prices sheet frozen to its current
     value, so the file no longer needs the pricing sheets.  The T
     and `_Frozen` sheets remain as hidden machinery: `_Frozen`
     remembers each frozen formula so a later **Force repricing** of
     the trimmed file can restore and update it.
4. **Process workbook** downloads the result
   (`<name>-converted`, `-reprice` or `-trimmed`).

Legacy **v1 workbooks** are detected on upload ("legacy v1 workbook")
and offer **Convert to v2** instead: the user-owned Components tabs
are extracted and the file is rebuilt in the v2 format from the
current pricing.  Tiered group-level descriptions gain the price
list's unit suffix (`Network: Internet Traffic Outbound` → `… (GiB)`)
so they keep matching; tariff-level `[Tn]` rows are preserved as-is,
and descriptions with no price-list match are kept and listed in the
warnings for manual review.

> **Re-energizing a trimmed workbook:** upload it and pick
> *Rebuild full workbook* — the SPA revives the frozen formulas from
> `_Frozen` and reprices them against the current pipeline.
