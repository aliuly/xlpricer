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
- [ ] handle RDS backups
- [ ] Add Replicated storage columns to components.
- [x] Add links to service descriptions in the Overview tab
- [x] Add ESA tables
  - Calculate total volumes for % selection
- [x] Fix the tables so that total line always copies from top line.
  This makes the totals break less if user deletes BOM rows.
- v2.0
  - turn into a web service
  - when generating pricing sheet, allow the user to specify additional
    component tabs (and its names) so they are properly referenced in
    the Volumes Tab.
  - edit preloads and additions
    - [tabulator](https://tabulator.info/)
    - [handsontable](https://github.com/handsontable/handsontable)
  - for simplicity, use [bottle](https://github.com/bottlepy/bottle)
    - [cork - authentication](https://github.com/FedericoCeratto/bottle-cork) ... probably
      requires beaker
    - [beaker - sessions](https://github.com/bottlepy/bottle-beaker)
    - [jwt](https://github.com/agile4you/bottle-jwt/)


