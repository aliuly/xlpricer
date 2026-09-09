# Decisions

* Backup options only STD or None.  CRR was removed as it would to
  know what is the replication region storage tariff.  (Not difficult
  for now, but if another region is added, it will become complicated).
  Also, this is only available for ECS at the moment (No SFS or Volume)
  Lastly, it is not clear how to configure CRR.
* Replicated storage (SDRS) was not implemented because it is not that
  commonly used.
* Pre-compute whenever we can, this to reduce the time spent
  calculating in Excel.
  * Price list - Backup Index
  * Volume Tiers Pricing
* Pipeline split to its own project.  Only fetches data.  This is
  really a work around the CORS restriction on the pricing API.
