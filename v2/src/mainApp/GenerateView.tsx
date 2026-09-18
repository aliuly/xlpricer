import { useCallback, useEffect, useState } from 'react'
import DealInfoFields from './DealInfoFields'
import GenOptions from './GenOptions'
import type { GenOptions as GenOptionsState } from './GenOptions'
import { AppHeader, BusyOverlay } from './AppChrome'
import {
  collectDefaultIncludePayload,
  collectIncludePayload,
  useXlsxGenerator,
} from './useXlsxGenerator'
import {
  loadServerAssumptions,
  loadServerComponents,
  loadTabAssumptions,
  loadTabComponents,
} from './generateData'

declare const __GIT_VERSION__: string

export type GenerateViewDataSource = 'server' | 'tabs'

export interface GenerateViewProps {
  pricesUrl?: string
  includes?: string[]
  /** Only used when `dataSource` is `'server'`. */
  assumptionsDataUrl?: string
  /** Only used when `dataSource` is `'server'`. */
  componentsDataUrl?: string
  /** Macro host template URL for XLSM output (from config.json). */
  vbaTemplateUrl?: string
  /**
   * `'server'` — fetch assumptions/components from the configured CSV
   * (basic mode).  `'tabs'` — read the rows edited in the custom-mode
   * tabs from localStorage.
   */
  dataSource: GenerateViewDataSource
  /** Generate options, lifted to App so all modes share one state. */
  genOptions: GenOptionsState
  setGenOptions: (next: GenOptionsState) => void
}

interface SumData {
  cksum: string
  datetime: string
  version: string
}

function parseSum(text: string): SumData | null {
  // Format: cksum date time timestamp version...
  const parts = text.trim().split(/\s+/)
  if (parts.length < 5) return null
  return {
    cksum: parts[0],
    datetime: `${parts[1]} ${parts[2]}`,
    version: parts.slice(4).join(' '),
  }
}

export default function GenerateView({
  pricesUrl,
  includes,
  assumptionsDataUrl,
  componentsDataUrl,
  vbaTemplateUrl,
  dataSource,
  genOptions,
  setGenOptions,
}: GenerateViewProps) {
  const { busy, generate } = useXlsxGenerator()
  const [sum, setSum] = useState<SumData | null>(null)

  const templateUrl = (() => {
    if (!vbaTemplateUrl) return undefined
    try {
      return new URL(vbaTemplateUrl, window.location.href).href
    } catch { return undefined }
  })()

  const sumUrl = pricesUrl
    ? pricesUrl.replace(/prices-latest\.json$/, 'sum.txt')
    : null

  useEffect(() => {
    if (!sumUrl) return
    let cancelled = false
    fetch(sumUrl)
      .then(res => res.text())
      .then(text => {
        if (!cancelled) setSum(parseSum(text))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [sumUrl])

  const handleGenerate = useCallback(async () => {
    if (!pricesUrl) return

    if (genOptions.format === 'xlsm' && !templateUrl) {
      alert('XLSM generation is not configured — missing vbaTemplateUrl.')
      return
    }

    const request = {
      dataUrl: pricesUrl,
      ...(genOptions.customPricing
        ? collectIncludePayload(includes)
        : collectDefaultIncludePayload(includes)),
      sourceUrl: pricesUrl,
      enableEsa: genOptions.enableEsa,
      options: {
        format: genOptions.format,
        ...(genOptions.format === 'xlsm' ? { vbaTemplateUrl: templateUrl } : {}),
      },
    }

    if (dataSource === 'server') {
      /* Always fetch from server data — never use localStorage */
      const assumptions = await loadServerAssumptions(assumptionsDataUrl)
      const components: Record<string, unknown> = {}
      if (componentsDataUrl) {
        const componentRows = await loadServerComponents(componentsDataUrl)
        if (componentRows !== null) components['Components'] = componentRows
      }
      generate({
        ...request,
        assumptions,
        components,
      })
      return
    }

    generate({
      ...request,
      assumptions: loadTabAssumptions(),
      components: loadTabComponents(),
    })
  }, [pricesUrl, includes, assumptionsDataUrl, componentsDataUrl, dataSource, genOptions, templateUrl, generate])

  return (
    <div className="relative h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      {/* ── Header ──────────────────────────── */}
      <AppHeader />

      {/* ── Cards ───────────────────────────── */}
      <div className="max-w-2xl mx-auto -mt-6 px-4 pb-8">

        {/* Generate */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_4px_16px_rgba(226,0,116,0.08)] dark:shadow-none border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-magenta-dark dark:text-magenta-light mb-4 flex items-center gap-2">
            ✨ Generate
          </h2>
          <button
            onClick={handleGenerate}
            disabled={busy || !pricesUrl}
            className="block w-full text-left rounded-xl border border-gray-200 dark:border-gray-600 p-4
              bg-[#ffe6f2] dark:bg-gray-700
              hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(226,0,116,0.18)]
              transition-all duration-150 cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            <span className="block font-semibold text-magenta-dark dark:text-magenta-light mb-1">
              📥 Generate pricing spreadsheet
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {(() => {
                const pricing = genOptions.customPricing
                  ? 'your custom pricing data'
                  : 'standard pricing data'
                const data = dataSource === 'server'
                  ? 'standard assumptions & components'
                  : 'your assumptions & components from the tabs'
                return (
                  <>
                    Ready-to-use Excel workbook with{' '}
                    <strong className="font-semibold text-magenta-dark dark:text-magenta-light">
                      {pricing}, {data}
                    </strong>.
                  </>
                )
              })()}
            </span>
          </button>
        </div>

        {/* Deal info */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_4px_16px_rgba(226,0,116,0.08)] dark:shadow-none border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <DealInfoFields />
        </div>

        {/* Options */}
        <GenOptions options={genOptions} onChange={setGenOptions} />

        {/* Pricing data */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_4px_16px_rgba(226,0,116,0.08)] dark:shadow-none border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-magenta-dark dark:text-magenta-light mb-4 flex items-center gap-2">
            📦 Pricing data
          </h2>
          {sum ? (
            <div className="text-sm space-y-1">
              <div className="font-medium text-gray-800 dark:text-gray-200">
                prices-latest.json
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {sum.datetime} · {sum.version}
              </div>
              <div className="text-gray-500 dark:text-gray-400 font-mono text-xs break-all">
                MD5 {sum.cksum}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              Loading pricing metadata…
            </p>
          )}
        </div>

        {/* ── Links ──────────────────────────── */}
        <hr className="border-gray-200 dark:border-gray-700 my-6" />
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-x-2">
          <a href="https://docs.otc.t-systems.com/price-calculator/api-ref/"
             className="text-magenta-dark dark:text-magenta-light hover:underline font-medium">
            API docs
          </a>
          <span>·</span>
          <a href="https://www.t-cloud-public.com/en"
             className="text-magenta-dark dark:text-magenta-light hover:underline font-medium">
            T Cloud Public
          </a>
          <span>·</span>
          <a href="https://aliuly.github.io/pipeline/"
             className="text-magenta-dark dark:text-magenta-light hover:underline font-medium">
            Price data
          </a>
          <span>·</span>
          <a href="https://github.com/aliuly/xlpricer/blob/main/v2/docs/USERS-GUIDE.md"
             className="text-magenta-dark dark:text-magenta-light hover:underline font-medium">
            Usage
          </a>
        </div>

        {/* ── Footer ──────────────────────────── */}
        <footer className="text-center py-6 text-xs text-gray-400 dark:text-gray-600">
          <a href="https://github.com/aliuly/xlpricer"
             className="text-gray-400 dark:text-gray-500 hover:text-magenta dark:hover:text-magenta-light">
            aliuly/xlpricer
          </a>
          <span> · version {__GIT_VERSION__}</span>
        </footer>
      </div>

      {/* ── Busy overlay ────────────────────── */}
      {busy && <BusyOverlay />}
    </div>
  )
}
