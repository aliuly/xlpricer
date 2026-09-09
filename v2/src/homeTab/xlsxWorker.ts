/**
 * Web Worker entry point for XLSX generation.
 *
 * This file exists because Vite requires a separate entry point to detect
 * and bundle a Web Worker (via `new URL('./xlsxWorker.ts', import.meta.url)`).
 * That pattern also enables lazy-loading — the worker and its ExcelJS
 * dependency are code-split and only downloaded on first click.
 *
 * This worker handles data acquisition (fetch + parse) then calls the
 * pure workbook builder in ../xlsx/writer.ts.
 */

import Papa from 'papaparse'
import { generatePricingXlsx } from '../xlsx/writer'
import type { PricingData, AppMeta } from '../xlsx/writer'
import { processPricingData } from '../prices/index'
import type { PricesData, IncludeMeta } from '../prices/types'

/** The message shape sent from the main thread (HomeTab). */
interface WorkerRequest {
  assumptions: unknown
  components: Record<string, unknown>
  dataUrl: string
  includeUrls?: string[]
  uploadedIncludes?: {
    name: string
    version: string
    records: Record<string, unknown>[]
  }[]
  appMeta: AppMeta
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data

    /* ── Fetch pricing JSON ── */
    const pricingRes = await fetch(req.dataUrl)
    if (!pricingRes.ok) {
      throw new Error(`Failed to fetch ${req.dataUrl}: HTTP ${pricingRes.status}`)
    }
    const pricingData: PricesData = await pricingRes.json()

    /* ── Fetch include manifests from unique directories ── */
    const manifestMap: Record<string, IncludeMeta> = {}
    const dirs = new Set<string>()
    for (const url of (req.includeUrls ?? [])) {
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
    for (const url of (req.includeUrls ?? [])) {
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
    for (const uf of (req.uploadedIncludes ?? [])) {
      const stem = uf.name.replace(/\.csv$/i, '')
      includes[stem] = { version: uf.version, records: uf.records }
      console.log(`Uploaded include ${stem}: ${uf.records.length} records (${uf.version})`)
    }

    processPricingData(pricingData, { includes })

    const out: PricingData = {
      assumptions: req.assumptions,
      components: req.components,
      pricingData,
      appMeta: req.appMeta,
    }

    const buffer = await generatePricingXlsx(out)
    self.postMessage({ type: 'ok', buffer }, { transfer: [buffer] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('XLSX generation failed:', err)
    self.postMessage({ type: 'err', message, stack })
  }
}
