import type { AppMeta } from '../xlsx/writer'
import type { SourceCompare } from '../xlsx/staleness'
import type { UploadedInclude } from '../homeTab/xlsxWorkerProtocol'

/** Include payload shared with the generate worker. */
export interface IncludePayload {
  includeUrls?: string[]
  uploadedIncludes?: UploadedInclude[]
}

export interface WorkbookInspectRequest {
  file: ArrayBuffer
  /**
   * Present when the upload should also run a staleness check.
   * No include payload: the check compares pipeline state only
   * (`compareSourceMeta` excludes `includes|*` keys).
   */
  pricing?: {
    dataUrl?: string
  }
}

export interface WorkbookInspectResult {
  sheets: string[]
  /** Has a `T` sheet with a `Format version` row (XLPricer v2). */
  isXlpricer: boolean
  /** Has `xl/vbaProject.bin` (macro-enabled). */
  hasMacros: boolean
  /** Has the veryHidden `_Frozen` sheet (trim markers). */
  hasFrozen: boolean
  /** Missing Prices/Volumes. */
  trimmed: boolean
  /** Staleness check; absent for incompatible files or fetch failures. */
  pricing?: {
    stale: boolean
    reason?: string
    warnings: string[]
  }
}

export type WorkbookOp =
  | { kind: 'convert'; format: 'xlsx' | 'xlsm'; vbaTemplateUrl?: string }
  | { kind: 'trim' }
  | {
      kind: 'refresh'
      outputFormat: 'xlsx' | 'xlsm'
      dataUrl: string
      includePayload?: IncludePayload
      vbaTemplateUrl?: string
      /** Output xlsm from an xlsm input → reuse the input as macro host. */
      useInputAsTemplate?: boolean
      /** Filled by the SPA hook when omitted. */
      appMeta?: AppMeta
      force?: boolean
    }

export interface WorkbookRequest {
  file: ArrayBuffer
  /** Absent → inspect. */
  op?: WorkbookOp
  /** Pricing spec for the upload-time staleness check. */
  pricing?: WorkbookInspectRequest['pricing']
}

export type WorkbookResponse =
  | { type: 'inspect'; result: WorkbookInspectResult }
  | { type: 'ok'; buffer: ArrayBuffer; warnings?: string[] }
  | { type: 'unchanged'; check: SourceCompare; warnings: string[] }
  | { type: 'err'; message: string; stack?: string }
