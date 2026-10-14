/* ── Shared pricing-data loading (CLI tools) ─────────────
 *
 * Fetch the raw pricing JSON, merge the include CSVs (keyed by
 * filename stem, version = file mtime) and run the full pipeline —
 * the same load path used by the pipeline and duplicates CLIs.
 */

import { readFileSync, statSync } from 'fs';
import Papa from 'papaparse';

import { processPricingData } from './index.ts';
import type { PricesData, PipelineOptions } from './types.ts';

export async function loadPipelineData(
  url: string,
  includeFiles: string[],
  verbose = false,
): Promise<PricesData> {
  if (verbose) {
    console.error(`Fetching pricing data from: ${url}`)
  }
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
  }
  const data: PricesData = await res.json()

  // Parse include CSV files
  const includes: PipelineOptions['includes'] = {}
  for (const file of includeFiles) {
    const raw = readFileSync(file, 'utf-8')
    const { mtime } = statSync(file)
    const parsed = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      transform: (v: string) => v.trim(),
    })
    const stem = file.replace(/\.csv$/i, '').split('/').pop()!
    includes[stem] = {
      version: mtime.toISOString(),
      records: parsed.data as unknown as Record<string, unknown>[],
    }
    if (verbose) {
      console.error(`Loaded ${parsed.data.length} includes from ${file} (key: ${stem}, mtime: ${mtime.toISOString()})`)
    }
  }

  processPricingData(data, { includes, verbose })
  return data
}
