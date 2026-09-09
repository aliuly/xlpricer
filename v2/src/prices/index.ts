/* ── Pricing pipeline entry point ────────── */

import type { PricesData, PipelineOptions } from './types';
import { applyPatches } from './patching';
import { normalize } from './normalize';
import { enrich } from './enrich';


// This is before data type normalization!
const INCLUDE_DEFAULTS : Record<string,unknown> = {
    'R12': '0.0 EUR',
    'R24': '0.0 EUR',
    'R36': '0.0 EUR',
    'RU12': '0.0 EUR',
    'RU24': '0.0 EUR',
    'RU36': '0.0 EUR',
    'currency': 'EUR',
    'fromOn': 0,
    'isMRC': false,
    'minAmount': 0,
    'ram': '0 GiB',
    'vCpu': '0',
    'region': '*',
}

/**
 * process pricing data
 */
export function processPricingData(
  data: PricesData,
  options: PipelineOptions = {},
): PricesData {
  // Basic validation
  if (!data.keys || !Array.isArray(data.keys)) {
    throw new Error('Invalid pricing data: missing "keys" array')
  }
  if (!data.records || !Array.isArray(data.records)) {
    throw new Error('Invalid pricing data: missing "records" array')
  }
  if (!data.records || !Array.isArray(data.columns)) {
    throw new Error('Invalid pricing data: missing "columns" array')
  }

  if (options.verbose) {
    const rows = data.count ?? data.records[0]?.length ?? 0
    console.error(
      `Loaded ${rows} records across ${data.keys.length} columns`,
    )
    if (data.schema) {
      console.error(`Schema: ${data.schema}`)
    }
  }
  const x : Record<string,number> = {};
  for (let i = 0; i < data.keys.length ; i++) {
  	x[data.keys[i]] = i;
  }

  // INCLUDE handling
  if (! data.includes) data.includes = {};
  if (options.includes) {
    for (const [grp, { version, sha, message, records }] of Object.entries(options.includes)) {
      // Store full metadata when available, otherwise just the version string
      if (sha || message) {
        data.includes[grp] = { version, ...(sha ? { sha } : {}), ...(message ? { message } : {}) };
      } else {
        data.includes[grp] = version;
      }
      for (const rec of records) {
        for (const [k, v] of Object.entries(INCLUDE_DEFAULTS)) {
          if (k in rec) continue;
          rec[k] = v;
        }
        rec._apiGrp = grp;
        rec._version = version;
        const newrec = data.keys.map(k => rec[k] ?? '');
        if (rec.region === '*') {
          newrec[x.region] = 'eu-de';
          data.records.push([...newrec]);
          newrec[x.region] = 'eu-nl';
          data.records.push([...newrec]);
        } else {
          data.records.push([...newrec]);
        }
      }
    }
  }

  applyPatches(data, x);
  normalize(data, x);
  enrich(data, x);

  // Natural sort records by _XlTitle_
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  data.records.sort((a, b) => collator.compare(a[x._XlTitle_] as string, b[x._XlTitle_] as string));

  return data
}
