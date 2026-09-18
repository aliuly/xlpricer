import Papa from 'papaparse'
import { processPricingData } from '../prices/index'
import type { PricesData, IncludeMeta } from '../prices/types'
import type { UploadedInclude } from './xlsxWorkerProtocol'

/** Include payload shared by the generate and workbook workers. */
export interface IncludePayload {
  includeUrls?: string[]
  uploadedIncludes?: UploadedInclude[]
}

/**
 * Fetch the pricing JSON, fetch/parse the optional include CSVs, merge
 * uploaded includes, and run the pricing pipeline.
 *
 * Shared by `xlsxWorker.ts` (generate) and `workbookWorker.ts`
 * (Conversion mode refresh/inspect).
 */
export async function loadPricedData(
  dataUrl: string,
  payload: IncludePayload = {},
): Promise<PricesData> {
  /* ── Fetch pricing JSON ── */
  const pricingRes = await fetch(dataUrl)
  if (!pricingRes.ok) {
    throw new Error(`Failed to fetch ${dataUrl}: HTTP ${pricingRes.status}`)
  }
  const pricingData: PricesData = await pricingRes.json()

  /* ── Fetch include manifests from unique directories ── */
  const manifestMap: Record<string, IncludeMeta> = {}
  const dirs = new Set<string>()
  for (const url of (payload.includeUrls ?? [])) {
    const lastSlash = url.lastIndexOf('/')
    if (lastSlash > 0) dirs.add(url.substring(0, lastSlash))
  }
  for (const dir of dirs) {
    try {
      const mfUrl = dir + '/manifest.json'
      const mfRes = await fetch(mfUrl)
      if (mfRes.ok) {
        const mf: Record<string, IncludeMeta> = await mfRes.json()
        Object.assign(manifestMap, mf)
        console.log(`Loaded manifest from ${mfUrl}:`, mf)
      }
    } catch { /* ignore — manifest is optional */ }
  }

  /* ── Fetch & parse include CSVs, then run the pipeline ── */
  const includes: Record<string, IncludeMeta & { records: Record<string, unknown>[] }> = {}
  for (const url of (payload.includeUrls ?? [])) {
    const csvRes = await fetch(url)
    if (!csvRes.ok) {
      throw new Error(`Failed to fetch include ${url}: HTTP ${csvRes.status}`)
    }
    const raw = await csvRes.text()
    const stem = url.replace(/\.csv$/i, '').split('/').pop()!
    // Resolve version: manifest → Last-Modified → now
    const manifestEntry = manifestMap[stem + '.csv']
    const fallbackVersion = csvRes.headers.get('Last-Modified') ?? new Date().toISOString()
    const version = manifestEntry?.version ?? fallbackVersion
    const sha = manifestEntry?.sha
    const message = manifestEntry?.message
    const parsed = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      transform: (v: string) => v.trim(),
    })
    includes[stem] = {
      version,
      ...(sha ? { sha } : {}),
      ...(message ? { message } : {}),
      records: parsed.data as unknown as Record<string, unknown>[],
    }
    console.log(`Include ${stem}: ${parsed.data.length} records (${version})${sha ? ' [' + sha + ']' : ''}`)
  }

  /* ── Merge uploaded includes (overrides standard on stem match) ── */
  for (const uf of (payload.uploadedIncludes ?? [])) {
    const stem = uf.name.replace(/\.csv$/i, '')
    includes[stem] = { version: uf.version, records: uf.records }
    console.log(`Uploaded include ${stem}: ${uf.records.length} records (${uf.version})`)
  }

  processPricingData(pricingData, { includes })
  return pricingData
}
