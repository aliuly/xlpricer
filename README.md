# XLpricer

**T-Cloud Public pricing spreadsheet generator**

A tool that fetches cloud service pricing data and generates ready-to-use
Excel workbooks with multi-year cost projections, volume-based discounts, and
Enterprise Support Agreement (ESA) calculations.

## Versions

| Version | Status | Description |
|---------|--------|-------------|
| [v2](./v2/README.md) | Testing | TypeScript/React single-page app with interactive assumption/component editors and XLSX export |
| [v1](./v1/README.md) | Current | Self-contained Pricing workbooks generated using a python script |

## GitHub Pages

The site is published at <https://aliuly.github.io/xlpricer/>:

- `/` — version picker (this page, see [`index.html`](./index.html))
- [`/v2/`](https://aliuly.github.io/xlpricer/v2/) — testing SPA build
- [`/v1/`](https://aliuly.github.io/xlpricer/v1/) — the v1 price sheet download page
  with build history (`builds.json`, `prices-*.xlsx`) and project docs

The site layout is assembled by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
on every push and weekly (Mondays).

## Docs

- [v2 user's guide](./v2/docs/USERS-GUIDE.md)
- [v1 user's guide](./v1/docs/USERS-GUIDE.md)

## License

See [LICENSE](./LICENSE)
