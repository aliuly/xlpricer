/*
 * This file contains code that wouldn't be needed if the upstream
 * API produced perfect data
 */


import type { PricesData } from './types';

/* ── Patch registry ──────────────────────── */
/** Signature: mutate the record, return `true` if a change was made. */
type PatchFn = (rec: unknown[], x: Record<string,number>) => boolean

interface PatchDef {
  name: string;
  description: string;
  /** Per-record mutation — `true` if the record changed. */
  apply?: PatchFn;
  /** Dataset-level mutation (merges/removals) — number of records changed. */
  applyData?: (data: PricesData, x: Record<string,number>) => number;
  disabled?: boolean;
}

/**
 * Drop rows whose id matches `re` — group 1 is the base id, group 3
 * an optional `-eu-<region>` suffix to reattach (it belongs to the
 * base id, e.g. `OTC_C_2XL2_MRS_CN-eu-nl` → `OTC_C_2XL2_MRS-eu-nl`)
 * — when their pricing is identical to the base row in the same
 * region: `priceAmount` and the R12/R24/R36 reserved columns.  Rows
 * with no base row, or with any differing price, are left for the
 * duplicates report.  Returns the number of rows removed.
 */
function dropPricedDuplicates(
  data: PricesData,
  x: Record<string,number>,
  re: RegExp,
): number {
  const variants: Array<{ rec: unknown[]; baseId: string; region: string }> = [];
  for (const rec of data.records) {
    const id = String(rec[x.id] ?? '');
    const m = re.exec(id);
    if (!m) continue;
    variants.push({
      rec,
      baseId: m[1] + (m[3] ?? ''),
      region: String(rec[x.region] ?? ''),
    });
  }
  if (variants.length === 0) return 0;

  // Base rows indexed by lowercase id + region.
  const baseByKey = new Map<string, unknown[]>();
  for (const rec of data.records) {
    const key = `${String(rec[x.id] ?? '').toLowerCase()}\u0000${String(rec[x.region] ?? '')}`;
    if (!baseByKey.has(key)) baseByKey.set(key, rec);
  }

  // Numeric value of a price-like cell ('' parses as 0).
  const priceOf = (v: unknown): number | null => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return null;
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const remove = new Set<unknown[]>();
  let removed = 0;
  for (const v of variants) {
    const base = baseByKey.get(`${v.baseId.toLowerCase()}\u0000${v.region}`);
    if (!base || base === v.rec) continue;

    // Delete only when the suffixed row carries exactly the same
    // pricing as the base row; anything that differs stays for the
    // duplicates report.
    let same = true;
    for (const col of ['priceAmount', 'R12', 'R24', 'R36']) {
      if (x[col] === undefined) continue;
      const a = priceOf(base[x[col]]);
      const b = priceOf(v.rec[x[col]]);
      if (a === null || b === null || a !== b) {
        same = false;
        break;
      }
    }
    if (!same) continue;

    remove.add(v.rec);
    removed++;
  }

  if (removed > 0) {
    data.records = data.records.filter(rec => !remove.has(rec));
  }
  return removed;
}

/** Ordered list of patches. Name + description act as documentation. */
const PATCHES: PatchDef[] = [

  // ── Missing productFamily ──────────────

  {
    name: 'findash',
    description: 'Financial Dashboard fixups',
    apply(rec,x) {
      if (rec[x.productName] !== 'Enterprise Dashboard Small') return false;
      rec[x.productFamily] = 'Management';
      return true;
    },
  },
  {
    name: 'DDS-family',
    description: 'DDS missing product families',
    apply(rec,x) {
      if (rec[x._apiGrp] !== 'ddsog') return false;
      if (rec[x.productFamily] !== '' || !String(rec[x.productName]).startsWith('DDS ')) return false;
      rec[x.productFamily] = 'Database'
      return true
    },
  },

  // ── Garbled product names ─────────────

  {
    disabled: true,
    name: 'm9',
    description: 'm9.l8. Linux data',
    apply(rec,x) {
      const name = String(rec[x.productName]);
      if (!name.includes('m9.l.8 Linux')) return false;

      let os: string;
      if (rec[x.osUnit] === 'Open Linux')       os = 'Linux';
      else if (rec[x.osUnit] === 'SUSE for SAP') os = 'SUSE/SAP';
      else                                    os = String(rec[x.osUnit]).split(' ')[0];

      rec[x.productName] = `Memory-optim. ${rec[x.opiFlavour]} ${os}`
      return true
    },
  },
  // ── Leaked region suffixes ────────────

  {
    name: 'regdesc',
    description: 'Region descriptors',
    apply(rec,x) {
      const name = String(rec[x.productName]);
      if (!name.endsWith(' EU-NL') && !name.endsWith(' EU-DE')) return false;
      rec[x.productName] = name.slice(0, -6);
      return true;
    },
  },

  // ── mis‑categorised product families ───

  {
    name: 'recategorise',
    description: 'Reassign wrong productFamily',
    apply(rec,x) {
      if (rec[x.productFamily] === 'Compute' && rec[x.productId] === 'Function Graph') {
        rec[x.productFamily] = rec[x.productId];
	return true
      }
      if (rec[x.productFamily] === 'Compute' && rec[x.serviceType] === 'Dedicated Host') {
        rec[x.productFamily] = rec[x.serviceType];
	return true;
      }
      if (rec[x.productFamily] === 'Container' && rec[x.productId] === 'Cloud Container Instance') {
        rec[x.productFamily] = rec[x.productId];
	return true;
      }
      return false;
    },
  },
  // ── wrong unit ─────────────────────────

  {
    name: 'elb-unit',
    description: 'Dedicated load balancer unit fix (upstream GiB→h)',
    apply(rec,x) {
      if (rec[x.productIdParameter] !== 'elb' || rec[x.unit] !== 'GiB') return false;
      rec[x.unit] = 'h';
      return true;
    },
  },

  // ── Reserved prices split into sibling rows ──

  {
    name: 'DWS-M3XLarge-split',
    description: 'DWS M3XLarge (dws.m3.xl) data issue: R12/R24/R36 reserved prices are shipped as _R12/_R24/_R36 sibling rows — merge their prices into the base row',
    applyData(data, x) {
      // Upstream ships some reserved prices as separate rows whose id
      // is the base id plus a _R12/_R24/_R36 suffix (e.g.
      // OTC_DWS_M3XLARGE_R12 belongs to base OTC_DWS_M3XLarge — note
      // the case difference — in the same region).  Their priceAmount
      // is really the base row's reserved price, so fold it into the
      // base row's R12/R24/R36 column and drop the sibling row.
      const variantCols: Array<[suffix: string, col: string]> = [
        ['_R12', 'R12'],
        ['_R24', 'R24'],
        ['_R36', 'R36'],
      ];

      const variants: Array<{ rec: unknown[]; baseId: string; region: string; col: string }> = [];
      for (const rec of data.records) {
        const id = String(rec[x.id] ?? '');
        for (const [suffix, col] of variantCols) {
          if (!id.toLowerCase().endsWith(suffix.toLowerCase())) continue;
          variants.push({
            rec,
            baseId: id.slice(0, -suffix.length),
            region: String(rec[x.region] ?? ''),
            col,
          });
        }
      }
      if (variants.length === 0) return 0;

      // Base rows indexed by lowercase id + region.
      const baseByKey = new Map<string, unknown[]>();
      for (const rec of data.records) {
        const key = `${String(rec[x.id] ?? '').toLowerCase()}\u0000${String(rec[x.region] ?? '')}`;
        if (!baseByKey.has(key)) baseByKey.set(key, rec);
      }

      // Only fill a reserved column that is blank/zero — never
      // clobber a value the base row already carries.
      const isZero = (v: unknown): boolean => {
        if (v === '' || v === null || v === undefined) return true;
        const n = Number(String(v).replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) && n === 0;
      };

      const remove = new Set<unknown[]>();
      let merged = 0;
      for (const v of variants) {
        const base = baseByKey.get(`${v.baseId.toLowerCase()}\u0000${v.region}`);
        if (!base || base === v.rec) continue;
        if (x[v.col] === undefined || !isZero(base[x[v.col]])) continue;
        base[x[v.col]] = v.rec[x.priceAmount];
        remove.add(v.rec);
        merged++;
      }

      if (merged > 0) {
        data.records = data.records.filter(rec => !remove.has(rec));
      }
      return merged;
    },
  },

  // ── MRS node-type rows duplicating the base row ──

  {
    name: 'MRS-CN-N-dupes',
    description: 'Analytics MRS node data issue: _CN/_N node-type rows duplicate the base row at the same price — drop the suffixed rows',
    applyData(data, x) {
      // Upstream ships the same MRS node three ways: the base id and
      // _CN/_N-suffixed ids, e.g. OTC_C_2XL2_MRS, OTC_C_2XL2_MRS_CN,
      // OTC_C_2XL2_MRS_N-eu-nl.
      return dropPricedDuplicates(data, x, /^(.*?_MRS.*?)(_CN|_N)(-eu-\w+)?$/i);
    },
  },

  // ── Loadbalancer availability-zone rows duplicating the base row ──

  {
    name: 'LBV3-AZ-dupes',
    description: 'Loadbalancer LBV3_B_PRO data issue: _AZ2/_AZ3 availability-zone rows duplicate the base row at the same price — drop the suffixed rows',
    applyData(data, x) {
      // Upstream ships the same LCU row three ways: the base id and
      // _AZ2/_AZ3-suffixed ids, e.g. OTC_LBV3_B_PRO,
      // OTC_LBV3_B_PRO_AZ2, OTC_LBV3_B_PRO_AZ3-eu-nl.
      return dropPricedDuplicates(data, x, /^(.*?)(_AZ[23])(-eu-\w+)?$/i);
    },
  },

  // ── Open Gauss Config rows colliding with DDS Config ──

  {
    name: 'DDS-OG-config-dupes',
    description: 'Database DDS Config data issue: the OTC_OGCN Open Gauss row duplicates the OTC_OGGTM row — drop OGCN and add (Open Gauss) to the survivor name',
    applyData(data, x) {
      let changed = 0;

      // Drop the OGCN Open Gauss Config row — a pure duplicate of the
      // OGGTM row at the same price (the OGCN EVS storage rows are
      // untouched; enrichment prunes them via the vss.* rule anyway).
      const remove = new Set<unknown[]>();
      for (const rec of data.records) {
        const id = String(rec[x.id] ?? '');
        const name = String(rec[x.productName] ?? '');
        if (
          String(rec[x.productIdParameter] ?? '') === 'ddsog' &&
          /^OTC_OGCN/i.test(id) &&
          name.startsWith('DDS Config')
        ) {
          remove.add(rec);
        }
      }
      if (remove.size > 0) {
        data.records = data.records.filter(rec => !remove.has(rec));
        changed += remove.size;
      }

      // Mark the surviving Open Gauss Config rows so their name (and
      // hence the BOM Description column) no longer collides with the
      // regular DDS Config rows.
      for (const rec of data.records) {
        const id = String(rec[x.id] ?? '');
        const name = String(rec[x.productName] ?? '');
        if (
          String(rec[x.productIdParameter] ?? '') === 'ddsog' &&
          /^OTC_OG/i.test(id) &&
          name.startsWith('DDS Config') &&
          !name.includes('(Open Gauss)')
        ) {
          rec[x.productName] = `${name} (Open Gauss)`;
          changed++;
        }
      }

      return changed;
    },
  },

  // ── BM General Purpose PHYSICAL rows duplicating the bare-metal row ──

  {
    name: 'C7-PHYSICAL-dupes',
    description: 'Compute BM General Purpose data issue: OTC_C7*_PHYSICAL rows duplicate the bare-metal row at the same price — drop the PHYSICAL rows',
    applyData(data, x) {
      // Upstream ships the same BM row twice, e.g.
      // OTC_C7T28XL4_P_LI and OTC_C7T28XL4_P_LI_PHYSICAL (identical
      // priceAmount and reserved columns).  The trailing suffix is the
      // optional region marker, so the drop keeps working when
      // upstream introduces new regions (…_PHYSICAL-eu-nl, …-ap-…).
      return dropPricedDuplicates(data, x, /^(OTC_C7.*)(_PHYSICAL)(-[a-z0-9-]+)?$/i);
    },
  },

  // ── DMS storage engine rows sharing a title ──

  {
    name: 'DMS-STO-engine',
    description: 'DMS storage data issue: Kafka (_KP) and RocketMQ (_RMQ) rows share the base title — spell the engine out in the name',
    apply(rec, x) {
      const id = String(rec[x.id] ?? '');
      const m = /^OTC_DMS_STO.*?_(KP|RMQ)(-[a-z0-9-]+)?$/i.exec(id);
      if (!m) return false;

      const engine = m[1].toUpperCase() === 'KP' ? 'Kafka' : 'RocketMQ';
      const name = String(rec[x.productName] ?? '');
      const suffix = ` (${engine})`;
      if (name.endsWith(suffix)) return false; // idempotent
      rec[x.productName] = name + suffix;
      return true;
    },
  },

];

export function applyPatches(
  data: PricesData,
  x: Record<string,number>,
): void {
  data.patches = {};

  for (const patch of PATCHES) {
    if (patch.disabled) continue;
    let count = 0;
    if (patch.applyData) {
      count = patch.applyData(data, x);
    } else if (patch.apply) {
      for (const rec of data.records) {
        if (patch.apply(rec, x)) count++;
      }
    }
    if (count > 0) {
      data.patches[patch.name] = {
	count: count,
	description: patch.description,
      };
    }
  }
}

