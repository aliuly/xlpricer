import { useState, useCallback, useRef, useEffect } from 'react'
import Papa from 'papaparse'

/* ── Types ─────────────────────────────────── */

interface UploadedFile {
  id: string
  displayName: string
  rowCount: number
  uploadedAt: string
}

interface Props {
  tabId: string
  config?: Record<string, unknown>
  visible: boolean
}

/* ── localStorage helpers ──────────────────── */

const STORAGE_ENABLED = 'xlpricer-includes-enabled'
const STORAGE_UPLOADS  = 'xlpricer-includes-uploaded'

function loadEnabled(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_ENABLED)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveEnabled(urls: string[]) {
  localStorage.setItem(STORAGE_ENABLED, JSON.stringify(urls))
}

function loadUploads(): UploadedFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_UPLOADS)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveUploads(files: UploadedFile[]) {
  localStorage.setItem(STORAGE_UPLOADS, JSON.stringify(files))
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ── Component ─────────────────────────────── */

export default function IncludesTab({ tabId: _tabId, config: tabConfig, visible }: Props) {
  const standardIncludes: string[] = (tabConfig?.standardIncludes as string[]) ?? []

  const [enabled, setEnabled] = useState<string[]>(() => {
    const saved = loadEnabled()
    return saved.length > 0 ? saved : [...standardIncludes]
  })

  const [uploads, setUploads] = useState<UploadedFile[]>(loadUploads)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadsRef = useRef(uploads)
  uploadsRef.current = uploads

  // Sync enabled with standardIncludes changes
  useEffect(() => {
    setEnabled(prev => {
      const filtered = prev.filter(u => standardIncludes.includes(u))
      for (const url of standardIncludes) {
        if (!filtered.includes(url)) filtered.push(url)
      }
      if (filtered.length !== prev.length || filtered.some((u, i) => u !== prev[i])) {
        saveEnabled(filtered)
        return filtered
      }
      return prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardIncludes])

  const toggleInclude = useCallback((url: string) => {
    setEnabled(prev => {
      const next = prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
      saveEnabled(next)
      return next
    })
  }, [])

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(`"${file.name}" is not a CSV file.`)
      return
    }
    if (uploadsRef.current.some(u => u.displayName === file.name)) {
      setError(`"${file.name}" has already been uploaded.`)
      return
    }
    if (file.size > 64 * 1024) {
      setError(`"${file.name}" is too large (${(file.size / 1024).toFixed(0)} KB). Maximum size is 64 KB.`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        transform: (v: string) => v.trim(),
      })
      if (parsed.errors.length > 0) {
        setError(`Parse error in "${file.name}": ${parsed.errors[0].message}`)
        return
      }
      if (parsed.data.length === 0) {
        setError(`"${file.name}" is empty.`)
        return
      }
      const id = genId()
      const data = parsed.data as unknown as Record<string, unknown>[]
      localStorage.setItem(`xlpricer-includes-${id}`, JSON.stringify(data))
      const newFile: UploadedFile = {
        id,
        displayName: file.name,
        rowCount: data.length,
        uploadedAt: new Date().toISOString(),
      }
      setUploads(prev => {
        const next = [...prev, newFile]
        saveUploads(next)
        return next
      })
      setError(null)
    }
    reader.onerror = () => setError(`Failed to read "${file.name}".`)
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    for (const file of Array.from(e.dataTransfer.files)) processFile(file)
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) processFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [processFile])

  const handleDelete = useCallback((id: string) => {
    setUploads(prev => {
      const next = prev.filter(f => f.id !== id)
      saveUploads(next)
      localStorage.removeItem(`xlpricer-includes-${id}`)
      return next
    })
  }, [])

  const displayName = (url: string) => url.split('/').pop() ?? url

  if (!visible) {
    return <div className="h-full" style={{ display: 'none' }} />
  }

  return (
    <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-6">
        Includes
      </h2>

      {error && (
        <div className="mb-4 px-4 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-300 cursor-pointer shrink-0">
            ✕
          </button>
        </div>
      )}

      {/* Standard includes */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Standard includes
        </h3>
        {standardIncludes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            No standard includes configured.
          </p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {standardIncludes.map(url => (
              <label key={url}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <input type="checkbox" checked={enabled.includes(url)}
                  onChange={() => toggleInclude(url)}
                  className="w-4 h-4 text-magenta border-gray-300 rounded focus:ring-magenta shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300 break-all">
                  {displayName(url)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto shrink-0">
                  {url}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Additional includes */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Additional includes
        </h3>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            dragOver
              ? 'border-magenta bg-magenta/5'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-magenta/50',
          ].join(' ')}
        >
          <div className="text-2xl mb-2 text-gray-300 dark:text-gray-600">📄</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drop CSV files here or click to upload
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.csv only</p>
          <input ref={fileInputRef} type="file" accept=".csv" multiple
            onChange={handleFileSelect} className="hidden" />
        </div>

        {uploads.length > 0 && (
          <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {uploads.map(file => (
              <div key={file.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">
                  {file.displayName}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {file.rowCount} row{file.rowCount !== 1 ? 's' : ''}
                </span>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(file.id) }}
                  className="px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded cursor-pointer shrink-0 transition-colors"
                  title={`Remove ${file.displayName}`}>
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
