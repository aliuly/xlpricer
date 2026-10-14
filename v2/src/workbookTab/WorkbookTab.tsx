import { useEffect, useRef, useState } from 'react'
import { BusyOverlay } from '../mainApp/AppChrome'
import { collectDefaultIncludePayload, collectIncludePayload } from '../mainApp/useXlsxGenerator'
import { loadTabAssumptions } from '../mainApp/generateData'
import type { WorkbookFormat } from '../mainApp/GenOptions'
import type { UploadedWorkbook, OperationKind } from './useWorkbookOps'
import type { WorkbookInspectResult, WorkbookOp } from './workbookProtocol'

interface Props {
  busy: boolean
  file: UploadedWorkbook | null
  inspection: WorkbookInspectResult | null
  status: string | null
  warnings: string[]
  caveat: string | null
  error: string | null
  opKind: OperationKind
  setOpKind: (kind: OperationKind) => void
  convertFormat: WorkbookFormat
  setConvertFormat: (format: WorkbookFormat) => void
  refreshFormat: WorkbookFormat
  setRefreshFormat: (format: WorkbookFormat) => void
  customPricing: boolean
  onCustomPricingChange: (value: boolean) => void
  onUpload: (file: File) => void
  onClear: () => void
  onProcess: (op: WorkbookOp) => void
  pricesUrl?: string
  standardIncludes?: string[]
  vbaTemplateUrl?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function WorkbookTab({
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
  customPricing,
  onCustomPricingChange,
  onUpload,
  onClear,
  onProcess,
  pricesUrl,
  standardIncludes,
  vbaTemplateUrl,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const templateUrl = (() => {
    if (!vbaTemplateUrl) return undefined
    try {
      return new URL(vbaTemplateUrl, window.location.href).href
    } catch { return undefined }
  })()

  useEffect(() => {
    if (!inspection) {
      setOpKind('convert')
      setConvertFormat('xlsm')
      setRefreshFormat('xlsx')
      return
    }
    if (inspection.isV1) {
      setOpKind('from-v1')
      setConvertFormat('xlsx')   // v1 conversion defaults to xlsx
      setRefreshFormat('xlsx')
      return
    }
    setOpKind(inspection.trimmed ? 'refresh' : 'convert')
    setConvertFormat(inspection.hasMacros ? 'xlsx' : 'xlsm')
    setRefreshFormat('xlsx')
  }, [inspection])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)[0]
    if (dropped) onUpload(dropped)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])[0]
    if (selected) onUpload(selected)
    if (inputRef.current) inputRef.current.value = ''
  }

  const trimmed = inspection?.trimmed ?? false
  const isV1 = inspection?.isV1 ?? false
  const pricingStale = inspection?.pricing?.stale
  const refreshLabel = trimmed
    ? 'Rebuild full workbook'
    : pricingStale === false
      ? 'Force repricing'
      : 'Update pricing tables'

  const convertXlsmAvailable = Boolean(templateUrl) && !trimmed
  // Trimmed workbooks skip the staleness check entirely (no pricing
  // sheets to compare) — repricing only needs the pipeline URL then.
  const refreshAvailable = Boolean(pricesUrl)
    && (Boolean(inspection?.pricing) || Boolean(inspection?.trimmed))
  // v1 conversion needs the pipeline and, for xlsm, the macro template.
  const fromV1Available = Boolean(pricesUrl)
    && (convertFormat === 'xlsx' || Boolean(templateUrl))

  const canProcess = Boolean(file && inspection && !busy) && (
    opKind === 'from-v1'
      ? fromV1Available
      : opKind === 'convert'
        ? !trimmed && !isV1 && (convertFormat === 'xlsx' || convertXlsmAvailable)
        : opKind === 'trim'
          ? !trimmed && !isV1
          : !isV1 && refreshAvailable && (refreshFormat === 'xlsx'
            || inspection?.hasMacros
            || Boolean(templateUrl))
  )

  const handleProcess = () => {
    if (!inspection) return

    if (opKind === 'from-v1') {
      onProcess({
        kind: 'from-v1',
        outputFormat: convertFormat,
        dataUrl: pricesUrl ?? '',
        // Same include rule as refresh: custom pricing → the user's
        // Includes-tab configuration; otherwise the standard includes.
        includePayload: customPricing
          ? collectIncludePayload(standardIncludes ?? [])
          : collectDefaultIncludePayload(standardIncludes ?? []),
        assumptions: loadTabAssumptions(),
        vbaTemplateUrl: templateUrl,
      })
      return
    }

    if (opKind === 'convert') {
      onProcess({
        kind: 'convert',
        format: convertFormat,
        ...(convertFormat === 'xlsm' ? { vbaTemplateUrl: templateUrl } : {}),
      })
      return
    }

    if (opKind === 'trim') {
      onProcess({ kind: 'trim' })
      return
    }

    onProcess({
      kind: 'refresh',
      outputFormat: refreshFormat,
      dataUrl: pricesUrl ?? '',
      // Custom pricing on → the user's Includes-tab configuration
      // (enabled standard includes + uploaded CSVs); off → the system
      // default: all standard includes, no uploads.  Same rule as
      // generation — both follow the shared Gen-Options checkbox.
      includePayload: customPricing
        ? collectIncludePayload(standardIncludes ?? [])
        : collectDefaultIncludePayload(standardIncludes ?? []),
      vbaTemplateUrl: templateUrl,
      useInputAsTemplate: Boolean(inspection.hasMacros && refreshFormat === 'xlsm'),
      force: Boolean(trimmed || pricingStale === false),
    })
  }

  const detected: string[] = []
  if (inspection) {
    if (inspection.isV1) {
      const v1 = inspection.v1
      detected.push('legacy v1 workbook')
      if (v1) {
        detected.push(`${v1.tabs.length} Components tab${v1.tabs.length === 1 ? '' : 's'}`)
        detected.push(`${v1.notes} note${v1.notes === 1 ? '' : 's'}`)
        if (v1.dropped.length > 0) detected.push(`${v1.dropped.length} dropped tab${v1.dropped.length === 1 ? '' : 's'}`)
      }
    } else {
      detected.push(trimmed ? 'trimmed workbook' : 'full workbook')
      if (inspection.hasMacros) detected.push('macro-enabled')
      if (inspection.hasFrozen) detected.push('has _Frozen')
      // Trimmed workbooks have no pricing data — the staleness check is
      // skipped for them, so no pricing verdict is shown.
      if (!trimmed) {
        if (inspection.pricing) {
          detected.push(pricingStale ? 'pricing out of date' : 'pricing up to date')
        } else {
          detected.push('pricing check unavailable')
        }
      }
    }
  }

  return (
    <div className="relative h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-6">

        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-6">
          📁 Workbook
        </h2>

        {/* Upload */}
        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className={[
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-magenta bg-magenta/5'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-magenta/50',
            ].join(' ')}
          >
            <div className="text-2xl mb-2 text-gray-300 dark:text-gray-600">📄</div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Drop an XLPricer workbook here or click to upload
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              .xlsx or .xlsm · up to 32 MB
            </p>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm"
              onChange={handleFileSelect} className="hidden" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">
                {file.name}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {formatSize(file.size)}
              </span>
              <button
                onClick={onClear}
                className="px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded cursor-pointer shrink-0 transition-colors"
                title="Remove workbook"
              >
                Remove
              </button>
            </div>
            {inspection && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Detected: {detected.join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Operation */}
        {file && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Operation
            </h3>

            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {isV1 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="wb-op" checked={opKind === 'from-v1'}
                    onChange={() => setOpKind('from-v1')} />
                  Convert to v2
                  <select
                    value={convertFormat}
                    onChange={e => setConvertFormat(e.target.value as WorkbookFormat)}
                    disabled={opKind !== 'from-v1'}
                    className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-40"
                  >
                    <option value="xlsx">XLSX</option>
                    <option value="xlsm">XLSM</option>
                  </select>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    (rebuilds the workbook in the v2 format from the current pricing)
                  </span>
                </label>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="wb-op" checked={opKind === 'convert'}
                  onChange={() => setOpKind('convert')} disabled={trimmed || isV1} />
                Convert only
                <select
                  value={convertFormat}
                  onChange={e => setConvertFormat(e.target.value as WorkbookFormat)}
                  disabled={opKind !== 'convert' || trimmed || isV1}
                  className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-40"
                >
                  <option value="xlsx">XLSX</option>
                  <option value="xlsm">XLSM</option>
                </select>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="wb-op" checked={opKind === 'refresh'}
                  onChange={() => setOpKind('refresh')} disabled={!refreshAvailable || isV1} />
                {refreshLabel}
                <select
                  value={refreshFormat}
                  onChange={e => setRefreshFormat(e.target.value as WorkbookFormat)}
                  disabled={opKind !== 'refresh' || !refreshAvailable || isV1}
                  className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-40"
                >
                  <option value="xlsx">XLSX</option>
                  <option value="xlsm">XLSM</option>
                </select>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="wb-op" checked={opKind === 'trim'}
                  onChange={() => setOpKind('trim')} disabled={trimmed || isV1} />
                Trim workbook <span className="text-xs text-gray-400 dark:text-gray-500">(outputs XLSX)</span>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={customPricing}
                onChange={e => onCustomPricingChange(e.target.checked)} />
              Custom pricing <span className="text-xs text-gray-400 dark:text-gray-500">(enables Includes tab)</span>
            </label>

            <button
              onClick={handleProcess}
              disabled={!canProcess}
              className="mt-4 block w-full text-left rounded-xl border border-gray-200 dark:border-gray-600 p-4
                bg-[#ffe6f2] dark:bg-gray-700 hover:-translate-y-0.5
                transition-all duration-150 cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <span className="block font-semibold text-magenta-dark dark:text-magenta-light">
                Process workbook
              </span>
            </button>
          </div>
        )}

        {/* Status / warnings / errors */}
        {error && (
          <div className="mb-4 px-4 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg whitespace-pre-line">
            {error}
          </div>
        )}
        {(caveat || inspection?.v1?.caveat) && (
          <div className="mb-4 px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border-2 border-rose-400 dark:border-rose-600 rounded-lg shadow-sm whitespace-pre-line">
            ⚠️ {caveat ?? inspection?.v1?.caveat}
          </div>
        )}
        {status && (
          <div className="mb-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            {status}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="mb-4 px-4 py-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
      </div>

      {busy && <BusyOverlay />}
    </div>
  )
}
