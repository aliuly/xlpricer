/**
 * Web Worker for Conversion mode workbook operations.
 *
 * Handles upload inspection (compatibility + staleness) and the
 * convert / trim / refresh operations on the uploaded workbook.
 * ExcelJS + JSZip keep it browser-safe.
 */

import ExcelJS from 'exceljs'
import type { Workbook } from 'exceljs'
import JSZip from 'jszip'

import { FROZEN_SHEET_NAME, META_SHEET_NAME } from '../xlsx/constants'
import { toXlsm, toXlsx, trimWorkbook, TrimError } from '../xlsx/convert'
import { refreshWorkbook } from '../xlsx/reprice'
import { loadPricedData } from '../homeTab/loadPricing'
import type {
  WorkbookInspectResult,
  WorkbookRequest,
} from './workbookProtocol'

async function loadWorkbook(file: ArrayBuffer): Promise<Workbook> {
  const wb = new ExcelJS.Workbook()
  await (wb.xlsx.load as unknown as (data: Uint8Array) => Promise<Workbook>)(new Uint8Array(file))
  return wb
}

async function hasMacros(file: ArrayBuffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(new Uint8Array(file))
    return Boolean(zip.file('xl/vbaProject.bin'))
  } catch { return false }
}

/** True when the workbook has a T sheet with a non-empty Format version. */
function isXlpricer(wb: Workbook): boolean {
  const meta = wb.getWorksheet(META_SHEET_NAME)
  if (!meta) return false
  let found = false
  meta.eachRow({ includeEmpty: false }, row => {
    if (found) return
    if (row.getCell(2).value === 'Format version') {
      const value = row.getCell(3).value
      if (value !== null && value !== undefined && String(value) !== '') found = true
    }
  })
  return found
}

async function inspect(req: WorkbookRequest): Promise<WorkbookInspectResult> {
  const bytes = new Uint8Array(req.file)
  const wb = await loadWorkbook(req.file)
  const hasPrices = Boolean(wb.getWorksheet('Prices'))
  const hasVolumes = Boolean(wb.getWorksheet('Volumes'))

  const result: WorkbookInspectResult = {
    sheets: wb.worksheets.map(w => w.name),
    isXlpricer: isXlpricer(wb),
    hasMacros: await hasMacros(req.file),
    hasFrozen: Boolean(wb.getWorksheet(FROZEN_SHEET_NAME)),
    trimmed: !hasPrices && !hasVolumes,
  }

  if (req.pricing?.dataUrl && result.isXlpricer && !result.trimmed) {
    // No include payload: the staleness comparison is pipeline-only
    // (compareSourceMeta excludes `includes|*` keys), so fetching
    // the include CSVs here would be wasted work.  Trimmed workbooks
    // are skipped entirely — they have no pricing sheets to compare,
    // and their rebuild is always forced.
    try {
      const pricingData = await loadPricedData(req.pricing.dataUrl)
      const res = await refreshWorkbook(bytes, pricingData, {
        checkOnly: true,
        appMeta: {},
      })
      result.pricing = {
        stale: res.check.stale,
        reason: res.check.reason,
        warnings: res.warnings,
      }
    } catch { result.pricing = undefined }
  }

  return result
}

async function fetchBytes(url?: string): Promise<Uint8Array> {
  if (!url) throw new Error('macro template URL is not configured')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

self.onmessage = async (e: MessageEvent<WorkbookRequest>) => {
  try {
    const req = e.data
    const bytes = new Uint8Array(req.file)

    /* ── Inspect (no op) ── */
    if (!req.op) {
      self.postMessage({ type: 'inspect', result: await inspect(req) })
      return
    }

    const op = req.op

    /* ── Convert ── */
    if (op.kind === 'convert') {
      const buffer = op.format === 'xlsm'
        ? await toXlsm(bytes, await fetchBytes(op.vbaTemplateUrl))
        : await toXlsx(bytes)
      self.postMessage({ type: 'ok', buffer }, { transfer: [buffer] })
      return
    }

    /* ── Trim ── */
    if (op.kind === 'trim') {
      try {
        const buffer = await trimWorkbook(bytes)
        self.postMessage({ type: 'ok', buffer }, { transfer: [buffer] })
      } catch (err) {
        if (err instanceof TrimError) {
          // TrimError messages are user-facing (no cached results,
          // unreadable shared formula, …) — pass them through as-is.
          self.postMessage({ type: 'err', message: err.message })
          return
        }
        throw err
      }
      return
    }

    /* ── Refresh / reprice ── */
    if (op.kind === 'refresh') {
      const pricingData = await loadPricedData(op.dataUrl, op.includePayload)

      let xlsmTemplate: Uint8Array | undefined
      if (op.outputFormat === 'xlsm') {
        xlsmTemplate = op.useInputAsTemplate
          ? bytes
          : await fetchBytes(op.vbaTemplateUrl)
      }

      const res = await refreshWorkbook(bytes, pricingData, {
        force: op.force,
        appMeta: op.appMeta ?? {},
        xlsmTemplate,
      })

      if (!res.buffer) {
        self.postMessage({ type: 'unchanged', check: res.check, warnings: res.warnings })
        return
      }
      self.postMessage({ type: 'ok', buffer: res.buffer, warnings: res.warnings }, { transfer: [res.buffer] })
      return
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('Workbook operation failed:', err)
    self.postMessage({ type: 'err', message, stack })
  }
}
