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

import { generatePricingXlsx } from '../xlsx/writer'
import type { PricingData } from '../xlsx/writer'
import type { WorkerRequest } from './xlsxWorkerProtocol'
import { loadPricedData } from './loadPricing'
import { mergeIntoMacroWorkbook } from '../xlsx/vba'

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data

    const pricingData = await loadPricedData(req.dataUrl, {
      includeUrls: req.includeUrls,
      uploadedIncludes: req.uploadedIncludes,
    })

    const out: PricingData = {
      assumptions: req.assumptions,
      components: req.components,
      pricingData,
      appMeta: req.appMeta,
    }

    const format = req.options?.format ?? 'xlsx'
    const buffer = await generatePricingXlsx(out, {
      vbaTemplate: format === 'xlsm',
    })

    /* ── Merge into the macro host for XLSM output ── */
    if (format === 'xlsm') {
      const templateUrl = req.options?.vbaTemplateUrl
      if (!templateUrl) throw new Error('XLSM generation requires vbaTemplateUrl')
      const templateRes = await fetch(templateUrl)
      if (!templateRes.ok) {
        throw new Error(`Failed to fetch ${templateUrl}: HTTP ${templateRes.status}`)
      }
      const xlsm = await mergeIntoMacroWorkbook(
        new Uint8Array(await templateRes.arrayBuffer()),
        buffer,
      )
      self.postMessage({ type: 'ok', buffer: xlsm }, { transfer: [xlsm] })
      return
    }

    self.postMessage({ type: 'ok', buffer }, { transfer: [buffer] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('XLSX generation failed:', err)
    self.postMessage({ type: 'err', message, stack })
  }
}
