# xlpricer

T-Cloud Public API, offline pricing calculator.

This script uses the API as defined by
https://docs.otc.t-systems.com/price-calculator/api-ref/
to create an Excel template to be used as a pricing calculator.

Spreadsheets are generated weekly and posted on this project's
[github pages](https://aliuly.github.io/xlpricer/).

# Installation

Python 3.10 or later is required.

```sh
pip install -r requirements.txt
```

Or download a Windows executable from the releases page:
https://github.com/aliuly/xlpricer/releases

# Usage

## Graphical User Interface (GUI)

Launch the wizard by running `python -m xlpricer` with no arguments.
The main menu offers three operations:

- **Build** — generate a fresh pricing workbook from API data.
- **Reprice** — update prices in an existing workbook.
- **Prep** — sanitize a workbook for external sharing (removes
  internal price tables).

Each screen lets you choose input/output files, toggle proxy
auto-configuration, and use cached API data when available.

## Command Line Interface (CLI)

Four subcommands are available.  Run any with `--help` for the
full option list.

| Subcommand    | Description |
|---------------|-------------|
| `build`       | Generate a new pricing workbook |
| `reprice`     | Update prices in an existing workbook |
| `prep`        | Sanitize a workbook for external sharing |
| `showproxy`   | Display the current proxy configuration |

### Common options

These options are shared by `build` and `reprice`:

| Flag                      | Description |
|---------------------------|-------------|
| `-A` / `-a`              | Enable/disable automatic proxy configuration via Windows Registry |
| `--url URL`              | Specify the API endpoint URL |
| `--lang-de`              | Use the German-language API endpoint |
| `--lang-en`              | Use the English-language API endpoint |
| `--load FILE`            | Load previously saved API data instead of querying the API |
| `--save FILE`            | Save API query results to a JSON file |
| `--swiss`                | Keep Swiss region (eu-ch2) entries (filtered out by default) |
| `-I, --include FILE`     | Include additional pricing data from a JSON file |

### build

```
python -m xlpricer build [options] [output.xlsx]
```

Creates a new pricing workbook.  If no filename is given, a
default name `INTERNAL-t-cloud-public-prices-YYYY-MM-DD.xlsx`
is used.

### reprice

```
python -m xlpricer reprice [options] <file.xlsx>
```

Updates the Prices and Volumes tabs in an existing workbook
with the latest API data.  Other tabs (Components, Overview,
Assumptions, etc.) are left untouched.

### prep

```
python -m xlpricer prep <input.xlsx> [output.xlsx]
```

Removes the Prices and Volumes tabs and replaces cell references
to them with their last-calculated values.  Use this before
distributing a workbook externally.

If no output filename is given, `INTERNAL` in the input filename
is replaced with `PUBLIC`.  For example:

```
python -m xlpricer prep INTERNAL-my-deal.xlsx
# produces PUBLIC-my-deal.xlsx
```

### showproxy

```
python -m xlpricer showproxy [-A | -a]
```

Prints the proxy configuration that will be used for API
requests.  Useful for troubleshooting connectivity issues.

## Settings File

Default settings are loaded from a YAML file named after the
script or executable (e.g. `xlpricer-settings.yaml`).  A
settings file may contain:

```yaml
proxy: true             # Auto-configure proxy from Windows Registry
api: https://...        # Custom API endpoint URL
swiss: false            # Keep Swiss region entries (default: filter out)
use_cache: true         # Cache API responses locally
cache_file: /path/to/file  # Override the default cache location
include:                # Additional pricing JSON files to merge
  - path/to/prices.json
```

Command-line flags override settings from this file.

## Generated Spreadsheet

See **[USERS-GUIDE.md](USERS-GUIDE.md)** for a detailed walkthrough
of each tab: Overview, Components, Prices, Volumes, Assumptions,
ESA, and Services.

## Preparing sheet for sharing

The sub-command `prep` is available to prepare the file for sharing.

The `prep` sub-command will remove the "Prices" and "Volumes" tabs,
and remove references to them in the different formulas.  Make sure
that the Excel file has been re-calculated before running `prep` as
it will use the values from this last calculation to replace formulas
referencing those tables.

You can do this manually too, by copying the columns highlighted
with *RED* column headers and paste them as "Values".  Afterwards, you
may safely delete the "Prices" and "Volumes" tabs.  Make sure that
there are no broken calculations by expanding all groups as some
columns/rows are hidden by default.

Doing this keeps the pricing information for the relevant items
and removes all other prices.  But it also keeps most formulas
in working condition.  Specially, it reduces the file size
significantly.

# Automated Builds

Price sheets are automatically rebuilt every Monday via a GitHub
Actions workflow (`.github/workflows/weekly-prices.yml`).  The
workflow:

1. Checks out the repository and installs dependencies.
2. Runs `python -m xlpricer build` to generate a fresh workbook.
3. Preserves the last 12 builds (older ones are pruned).
4. Deploys the workbook and a `builds.json` manifest to GitHub Pages.

The latest workbook is always available at the project's GitHub Pages
site.  Previous versions are retained for reference.

You can also trigger a build manually from the Actions tab in GitHub.

