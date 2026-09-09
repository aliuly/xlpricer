import { useCallback, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import { classifyAssumptions, classifyComponents } from '../editorTab/classify'
import DealInfoFields from './DealInfoFields'
import { loadDealInfo, dealInfoFilename } from './useDealInfo'
import type { AssumptionsRow, ComponentsRow } from '../editorTab/classify'

declare const __GIT_VERSION__: string

interface Props {
  pricesUrl?: string
  includes?: string[]
  assumptionsDataUrl?: string
  componentsDataUrl?: string
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

export default function BasicView({ pricesUrl, includes, assumptionsDataUrl, componentsDataUrl }: Props) {
  const [busy, setBusy] = useState(false)
  const [sum, setSum] = useState<SumData | null>(null)
  const workerRef = useRef<Worker | null>(null)

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
    setBusy(true)

    /* Always fetch from server data — never use localStorage */
    const base = window.location.href

    let assumptions: AssumptionsRow[] = []
    let components: Record<string, ComponentsRow[]> = {}

    if (assumptionsDataUrl) {
      try {
        const url = new URL(assumptionsDataUrl, base).href
        const res = await fetch(url)
        if (res.ok) {
          const text = await res.text()
          const parsed = Papa.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h: string) => h.trim(),
            transform: (v: string) => v.trim(),
          })
          assumptions = parsed.data.map(classifyAssumptions)
        }
      } catch { /* proceed without assumptions */ }
    }

    if (componentsDataUrl) {
      try {
        const url = new URL(componentsDataUrl, base).href
        const res = await fetch(url)
        if (res.ok) {
          const text = await res.text()
          const parsed = Papa.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h: string) => h.trim(),
            transform: (v: string) => v.trim(),
          })
          components['Components'] = parsed.data.map(classifyComponents)
        }
      } catch { /* proceed without components */ }
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../homeTab/xlsxWorker.ts', import.meta.url),
        { type: 'module' },
      )
    }

    workerRef.current.onmessage = (e: MessageEvent<{ type: string; buffer?: ArrayBuffer; message?: string; stack?: string }>) => {
      setBusy(false)
      if (e.data.type === 'err') {
        const msg = e.data.stack
          ? `${e.data.message}\n\n${e.data.stack}`
          : (e.data.message ?? 'Unknown error')
        alert(`Failed to generate XLSX:\n${msg}`)
        return
      }
      if (!e.data.buffer) return
      const blob = new Blob([e.data.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = dealInfoFilename(loadDealInfo())
      a.click()
      URL.revokeObjectURL(url)
    }

    workerRef.current.onerror = () => {
      setBusy(false)
      alert('Failed to generate XLSX.')
    }

    // Read enabled standard includes (checkbox state)
    const enabled = (() => {
      try {
        const raw = localStorage.getItem('xlpricer-includes-enabled')
        return raw ? (JSON.parse(raw) as string[]) : (includes ?? [])
      } catch { return includes ?? [] }
    })()

    const includeUrls = (includes ?? [])
      .filter(u => enabled.includes(u))
      .map(u => new URL(u, base).href)

    // Read uploaded includes
    const uploadedIncludes = (() => {
      try {
        const raw = localStorage.getItem('xlpricer-includes-uploaded')
        if (!raw) return []
        const files: { id: string; displayName: string; uploadedAt: string }[] = JSON.parse(raw)
        return files.map(f => {
          const dataRaw = localStorage.getItem(`xlpricer-includes-${f.id}`)
          return {
            name: f.displayName,
            version: f.uploadedAt,
            records: dataRaw ? JSON.parse(dataRaw) : [],
          }
        })
      } catch { return [] }
    })()

    workerRef.current.postMessage({
      assumptions,
      components,
      dataUrl: pricesUrl,
      includeUrls,
      uploadedIncludes,
      appMeta: {
        version: __GIT_VERSION__,
        spaUrl: window.location.origin + window.location.pathname,
      },
    })
  }, [pricesUrl, includes, assumptionsDataUrl, componentsDataUrl])

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      {/* ── Header ──────────────────────────── */}
      <header className="bg-gradient-to-br from-magenta to-magenta-dark text-white py-10 px-6 text-center">
        <h1 className="text-3xl font-bold mb-2 tracking-wide">
          📊 XLpricer V2
        </h1>
        <p className="text-pink-200 text-base">
          T-Cloud Public pricing spreadsheet generator
        </p>
      </header>

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
              Ready-to-use XLSX with standard pricing data,
              assumptions &amp; components.
            </span>
          </button>
        </div>

        {/* Deal info */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_4px_16px_rgba(226,0,116,0.08)] dark:shadow-none border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-magenta-dark dark:text-magenta-light mb-4 flex items-center gap-2">
            📇 Deal info
          </h2>
          <DealInfoFields />
        </div>

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
          <a href="https://github.com/aliuly/xlpricer/blob/main/docs/USERS-GUIDE.md"
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
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-magenta border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Generating spreadsheet…
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
