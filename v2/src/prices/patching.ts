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
  apply: PatchFn;
  disabled?: boolean;
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
];

export function applyPatches(
  data: PricesData,
  x: Record<string,number>,
): void {
  data.patches = {};

  for (const patch of PATCHES) {
    if (patch.disabled) continue;
    let count = 0;
    for (const rec of data.records) {
      if (patch.apply(rec, x)) count++;
    }
    if (count > 0) {
      data.patches[patch.name] = {
	count: count,
	description: patch.description,
      };
    }
  }
}

