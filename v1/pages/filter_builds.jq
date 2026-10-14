# Only v1 builds belong on the /v1 pages.  Keep entries whose version
# is absent (pre-versioning history) or starts with "1."; entries
# wrongly tagged 2.x.x are discarded.
[.[] | select(
  (.version == null) or
  ((.version | type == "string") and (.version | startswith("1.")))
)]
