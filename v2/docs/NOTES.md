# xlpricer v2

## Release procedure

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

## Special Pricing

Special pricing can be added by uploading "csv" files in the custom
UI.

## TODO
* [ ] be more compatible with V1... use similar file naming.
* Option:
  * xlsx/xlsm
* Tool convert xlsx <-> xlsm and (optional) reprice
* Macros
  * Remove prices, (volume, tab?)
  * Add new Components tab (modifies volume tab)
  * Find VMs and adds them (Shortcut)
***
* ~~Wizard:~~
  * ~~Generate~~
    * ~~ESA on/off~~
  * ~~Update prices tab.~~
  * ~~Prep - removes "prices" and "volume" tabs.~~
* Save configuration
  * Export/import to JSON
  * ~~Import from XLSX~~
* UX
  * Enter on Last row adds a new empty row
  * Other preload templates.  Add a "bare.csv"
  * Edit includes

***

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.


***
* Vite + TypeScript + React Framework
* xlpricer - pricer_api
* In-browser cache
* Browse using tabulator
