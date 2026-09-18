/**
 * Shared request/response types for the XLSX generation worker.
 *
 * Kept free of React/DOM dependencies so both the worker and the
 * React hook in `mainApp/useXlsxGenerator.ts` can import it.
 */
import type { AppMeta } from '../xlsx/writer'

export interface UploadedInclude {
  name: string
  version: string
  records: Record<string, unknown>[]
}

/** The message shape sent from the main thread to the worker. */
export interface WorkerRequest {
  assumptions: unknown
  components: Record<string, unknown>
  dataUrl: string
  includeUrls?: string[]
  uploadedIncludes?: UploadedInclude[]
  appMeta: AppMeta
  /** Generation options (format, macro template, …). */
  options?: WorkerGenerateOptions
}

/** Options that control how the worker builds the output workbook. */
export interface WorkerGenerateOptions {
  /** Output format.  Defaults to `'xlsx'` when omitted. */
  format?: 'xlsx' | 'xlsm'
  /** Absolute URL of the macro host template; required for XLSM. */
  vbaTemplateUrl?: string
}

/** The message shape posted back by the worker. */
export interface WorkerResponse {
  type: 'ok' | 'err'
  buffer?: ArrayBuffer
  message?: string
  stack?: string
}
