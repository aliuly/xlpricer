import { useCallback, useRef, useState } from 'react'
import { sanitizeFilenamePart } from '../mainApp/useDealInfo'
import type { WorkbookFormat } from '../mainApp/GenOptions'
import type {
  WorkbookOp,
  WorkbookRequest,
  WorkbookResponse,
  WorkbookInspectResult,
} from './workbookProtocol'

declare const __GIT_VERSION__: string

const SOFT_WARNING_BYTES = 3 * 1024 * 1024
const HARD_LIMIT_BYTES = 32 * 1024 * 1024

export type OperationKind = 'convert' | 'refresh' | 'trim' | 'from-v1'

export interface UploadedWorkbook {
  name: string
  size: number
  bytes: Uint8Array
}

export interface InspectPricing {
  dataUrl?: string
}

interface PendingDownload {
  suffix: 'converted' | 'trimmed' | 'reprice' | 'v2'
  ext: 'xlsx' | 'xlsm'
}

function errorMessage(message: string, stack?: string): string {
  return stack ? `${message}\n\n${stack}` : message
}

function download(buffer: ArrayBuffer, pending: PendingDownload, fileName: string) {
  const stem = sanitizeFilenamePart(fileName.replace(/\.(xlsx|xlsm)$/i, '')) || 'workbook'
  const blob = new Blob([buffer], {
    type: pending.ext === 'xlsm'
      ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${stem}-${pending.suffix}.${pending.ext}`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Owns the Conversion-mode workbook worker, the uploaded file, and the
 * inspect/process results.  Kept at App level so the upload survives
 * Workbook ↔ Includes tab switches.
 */
export function useWorkbookOps() {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<UploadedWorkbook | null>(null)
  const [inspection, setInspection] = useState<WorkbookInspectResult | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [caveat, setCaveat] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opKind, setOpKind] = useState<OperationKind>('convert')
  const [convertFormat, setConvertFormat] = useState<WorkbookFormat>('xlsm')
  const [refreshFormat, setRefreshFormat] = useState<WorkbookFormat>('xlsx')
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<PendingDownload | null>(null)
  const requestSeqRef = useRef(0)

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('./workbookWorker.ts', import.meta.url),
        { type: 'module' },
      )
    }
    return workerRef.current
  }, [])

  const clear = useCallback(() => {
    requestSeqRef.current++
    setBusy(false)
    setFile(null)
    setInspection(null)
    setStatus(null)
    setWarnings([])
    setCaveat(null)
    setError(null)
  }, [])

  const upload = useCallback(async (uploaded: File, pricing?: InspectPricing) => {
    if (busy) return

    if (!/\.(xlsx|xlsm)$/i.test(uploaded.name)) {
      setFile(null)
      setInspection(null)
      setStatus(null)
      setWarnings([])
      setError('Only .xlsx or .xlsm workbooks are supported.')
      return
    }

    if (uploaded.size > HARD_LIMIT_BYTES) {
      setFile(null)
      setInspection(null)
      setStatus(null)
      setWarnings([])
      setError(`"${uploaded.name}" is larger than 32 MB.`)
      return
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await uploaded.arrayBuffer())
    } catch {
      setFile(null)
      setInspection(null)
      setStatus(null)
      setWarnings([])
      setError('Failed to read the selected file.')
      return
    }

    setFile({ name: uploaded.name, size: uploaded.size, bytes })
    setInspection(null)
    setStatus(null)
    setError(null)
    setCaveat(null)
    setWarnings(uploaded.size > SOFT_WARNING_BYTES
      ? ['Large file — processing may be slow.']
      : [])

    const worker = getWorker()
    const id = ++requestSeqRef.current
    setBusy(true)

    worker.onmessage = (e: MessageEvent<WorkbookResponse>) => {
      if (id !== requestSeqRef.current) return
      setBusy(false)
      const msg = e.data
      if (msg.type === 'inspect') {
        const result = msg.result
        if (!result.isXlpricer && !result.isV1) {
          setFile(null)
          setInspection(null)
          // Near-miss v1 files carry the gate's reason (missing
          // Overview, non-v1 Assumptions, …); everything else gets
          // the generic message.
          setError(result.v1Error ?? 'This file is not an XLPricer workbook (v1 or v2).')
          return
        }
        if (result.trimmed && !result.hasFrozen) {
          setFile(null)
          setInspection(null)
          setError('This trimmed workbook has no revival markers and cannot be processed.')
          return
        }
        setInspection(result)
        return
      }
      if (msg.type === 'err') {
        setError(errorMessage(msg.message, msg.stack))
      }
    }
    worker.onerror = () => {
      if (id !== requestSeqRef.current) return
      setBusy(false)
      setError('Failed to inspect the workbook.')
    }

    const request: WorkbookRequest = {
      file: bytes.slice().buffer as ArrayBuffer,
      ...(pricing?.dataUrl ? { pricing } : {}),
    }
    worker.postMessage(request)
  }, [busy, getWorker])

  const process = useCallback((op: WorkbookOp) => {
    if (!file || busy) return

    const suffix: PendingDownload['suffix'] = op.kind === 'trim'
      ? 'trimmed'
      : op.kind === 'convert'
        ? 'converted'
        : op.kind === 'from-v1'
          ? 'v2'
          : 'reprice'
    const ext: PendingDownload['ext'] = op.kind === 'trim'
      ? 'xlsx'
      : op.kind === 'convert'
        ? op.format
        : op.outputFormat
    pendingRef.current = { suffix, ext }

    const requestOp: WorkbookOp = op.kind === 'refresh' || op.kind === 'from-v1'
      ? {
          ...op,
          appMeta: {
            version: __GIT_VERSION__,
            spaUrl: window.location.origin + window.location.pathname,
            sourceUrl: op.dataUrl,
          },
        }
      : op

    const worker = getWorker()
    const id = ++requestSeqRef.current
    setBusy(true)
    setError(null)
    setStatus(null)
    setWarnings([])

    worker.onmessage = (e: MessageEvent<WorkbookResponse>) => {
      if (id !== requestSeqRef.current) return
      setBusy(false)
      const msg = e.data
      if (msg.type === 'ok') {
        if (msg.buffer && pendingRef.current) {
          download(msg.buffer, pendingRef.current, file.name)
        }
        setWarnings(msg.warnings ?? [])
        setCaveat(msg.caveat ?? null)
        return
      }
      if (msg.type === 'unchanged') {
        setStatus('Workbook is already up to date — no changes made.')
        setWarnings(msg.warnings)
        return
      }
      if (msg.type === 'err') {
        setError(errorMessage(msg.message, msg.stack))
      }
    }
    worker.onerror = () => {
      if (id !== requestSeqRef.current) return
      setBusy(false)
      setError('Failed to process the workbook.')
    }

    const request: WorkbookRequest = {
      file: file.bytes.slice().buffer as ArrayBuffer,
      op: requestOp,
    }
    worker.postMessage(request)
  }, [file, busy, getWorker])

  return {
    busy,
    file,
    inspection,
    status,
    warnings,
    caveat,
    error,
    opKind,
    setOpKind,
    convertFormat,
    setConvertFormat,
    refreshFormat,
    setRefreshFormat,
    upload,
    process,
    clear,
  }
}
