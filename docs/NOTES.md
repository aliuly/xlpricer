# NOTES

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

## TODO

- [x] sphinx docs

## Ideas for SPA

* Pre-loads
  - New tab on SPA
  - User can select other pre-load profiles
  - User can edit pre-load profiles
* Component tabs
  - Build screen lets you specify additional component tabs
  - Add a Button to add component tabs
* Additional pricing files
  - edit current pricing files
  - add more pricing files
* authentication

Libraries:

- edit preloads and additions
  - [tabulator](https://tabulator.info/)
  - [handsontable](https://github.com/handsontable/handsontable)
- for simplicity, use [bottle](https://github.com/bottlepy/bottle)
  - [cork - authentication](https://github.com/FedericoCeratto/bottle-cork) ... probably
    requires beaker
  - [beaker - sessions](https://github.com/bottlepy/bottle-beaker)
  - [jwt](https://github.com/agile4you/bottle-jwt/)

## Decisions

* Backup options only STD or None.  CRR was removed as it would to
  know what is the replication region storage tariff.  (Not difficult
  for now, but if another region is added, it will become complicated).
  Also, this is only available for ECS at the moment (No SFS or Volume)
  Lastly, it is not clear how to configure CRR.
* Replicated storage (SDRS) was not implemented because it is not that
  commonly used.


