import { useCallback, useRef, useState } from 'react'
import type { WorkerRequest, WorkerResponse, UploadedInclude } from '../homeTab/xlsxWorkerProtocol'
import { dealInfoFilename, loadDealInfo } from './useDealInfo'

declare const __GIT_VERSION__: string

/* ── Shared include payload ─────────────────── */

const INCLUDES_ENABLED_KEY = 'xlpricer-includes-enabled'
const INCLUDES_UPLOADED_KEY = 'xlpricer-includes-uploaded'
const INCLUDES_DATA_PREFIX = 'xlpricer-includes-'

/**
 * Resolve the standard includes and uploaded includes from the state
 * maintained by IncludesTab into the payload expected by the worker.
 *
 * BasicView and HomeTab both generate workbooks, so this logic must
 * stay in one place.
 */
export function collectIncludePayload(includes: string[] = []) {
  const base = window.location.href

  // Read enabled standard includes (checkbox state)
  const enabled = (() => {
    try {
      const raw = localStorage.getItem(INCLUDES_ENABLED_KEY)
      return raw ? (JSON.parse(raw) as string[]) : includes
    } catch { return includes }
  })()

  const includeUrls = includes
    .filter(url => enabled.includes(url))
    .map(url => new URL(url, base).href)

  // Read uploaded includes
  const uploadedIncludes: UploadedInclude[] = (() => {
    try {
      const raw = localStorage.getItem(INCLUDES_UPLOADED_KEY)
      if (!raw) return []
      const files: { id: string; displayName: string; uploadedAt: string }[] = JSON.parse(raw)
      return files.map(file => {
        const dataRaw = localStorage.getItem(`${INCLUDES_DATA_PREFIX}${file.id}`)
        return {
          name: file.displayName,
          version: file.uploadedAt,
          records: dataRaw ? (JSON.parse(dataRaw) as Record<string, unknown>[]) : [],
        }
      })
    } catch { return [] }
  })()

  return { includeUrls, uploadedIncludes }
}

/**
 * The system-default include payload: ALL standard includes, ignoring
 * the Includes-tab enabled subset and any uploaded CSVs.  Used when
 * custom pricing is off.
 */
export function collectDefaultIncludePayload(includes: string[] = []) {
  const base = window.location.href
  return { includeUrls: includes.map(url => new URL(url, base).href) }
}

/* ── Hook ───────────────────────────────────── */

export type GenerateRequest = Omit<WorkerRequest, 'appMeta'> & {
  /** Recorded in the workbook's T sheet. */
  sourceUrl?: string
  /** Passed through to `AppMeta.enableEsa` (defaults to on). */
  enableEsa?: boolean
}

/**
 * Own the XLSX worker, the busy flag, and the download handling so
 * every generate button has identical behaviour.
 */
export function useXlsxGenerator() {
  const [busy, setBusy] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  const generate = useCallback((request: GenerateRequest) => {
    if (!request.dataUrl) return
    setBusy(true)

    const format = request.options?.format ?? 'xlsx'

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../homeTab/xlsxWorker.ts', import.meta.url),
        { type: 'module' },
      )
    }

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      setBusy(false)
      if (e.data.type === 'err') {
        const msg = e.data.stack
          ? `${e.data.message}\n\n${e.data.stack}`
          : (e.data.message ?? 'Unknown error')
        alert(`Failed to generate workbook:\n${msg}`)
        return
      }
      if (!e.data.buffer) return
      const blob = new Blob([e.data.buffer], {
        type: format === 'xlsm'
          ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = dealInfoFilename(loadDealInfo(), format)
      a.click()
      URL.revokeObjectURL(url)
    }

    workerRef.current.onerror = () => {
      setBusy(false)
      alert('Failed to generate workbook.')
    }

    const payload: WorkerRequest = {
      assumptions: request.assumptions,
      components: request.components,
      dataUrl: request.dataUrl,
      includeUrls: request.includeUrls,
      uploadedIncludes: request.uploadedIncludes,
      options: request.options,
      appMeta: {
        version: __GIT_VERSION__,
        spaUrl: window.location.origin + window.location.pathname,
        ...(request.sourceUrl ? { sourceUrl: request.sourceUrl } : {}),
        ...(request.enableEsa !== undefined ? { enableEsa: request.enableEsa } : {}),
      },
    }
    workerRef.current.postMessage(payload)
  }, [])

  return { busy, generate }
}
