# Release procedure

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

# TODO

- [ ] sphinx docs
- [x] handle RDS backups (backup idx columns in Prices tab)
- [x] Add Replicated storage columns to components (idx columns in Prices tab)
- [x] Can we normalize Unit column "GB /month" to "GB"
- [x] Add links to service descriptions in the Overview tab
- [x] Add ESA tables
  - Calculate total volumes for % selection
- [x] Fix the tables so that total line always copies from top line.
  This makes the totals break less if user deletes BOM rows.
- [x] Remove buggy scrapper code
- [x] R36M reserved pricing support
- [x] Volume-based tiered pricing (Volumes tab)
- [x] CBR no-backup option and shared EVS volume
- [x] Overview shows next year during Q4
- [x] "Used Storage" assumption in backup calculation
- [x] Automated weekly builds via CI
- [x] Public download page (GitHub Pages)

# Ideas for SPA

* Pre-loads
  - New tab on SPA
  - User can select other pre-load profiles
  - User can edit pre-load profiles
- Component tabs
  - Build screen lets you specify additional component tabs
  - Add a Button to add component tabs
- Additional pricing files
  - edit current pricing files
  - add more pricing files
- authentication

Libraries:

- edit preloads and additions
  - [tabulator](https://tabulator.info/)
  - [handsontable](https://github.com/handsontable/handsontable)
- for simplicity, use [bottle](https://github.com/bottlepy/bottle)
  - [cork - authentication](https://github.com/FedericoCeratto/bottle-cork) ... probably
    requires beaker
  - [beaker - sessions](https://github.com/bottlepy/bottle-beaker)
  - [jwt](https://github.com/agile4you/bottle-jwt/)

# Decisions

* Backup options only STD or None.  CRR was removed as it would to
  know what is the replication region storage tariff.  (Not difficult
  for now, but if another region is added, it will become complicated).
  Also, this is only available for ECS at the moment (No SFS or Volume)
  Lastly, it is not clear how to configure CRR.
* Replicated storage (SDRS) was not implemented because it is not that
  commonly used.


