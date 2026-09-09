import { useEffect, useState, useCallback, useRef } from 'react'
import type { ComponentType } from 'react'
import { useTheme } from '../themes/useTheme'
import DefaultTab from '../defaultTab/DefaultTab'
import HomeTab from '../homeTab/HomeTab'
import AssumptionsTab from '../editorTab/AssumptionsTab'
import ComponentsTab from '../editorTab/ComponentsTab'
import IncludesTab from '../editorTab/IncludesTab'
import ModeSelector from './ModeSelector'
import BasicView from './BasicView'
import type { AppMode } from './ModeSelector'

interface TabProps {
  tabId: string
  config?: Record<string, unknown>
  visible: boolean
}

interface TabDef {
  id: string
  label: string
  Component: ComponentType<TabProps>
  config?: Record<string, unknown>
}

const tabRegistry: Record<string, { label: string; Component: ComponentType<TabProps> }> = {
  default:      { label: 'Default',      Component: DefaultTab },
  home:         { label: 'Home',         Component: HomeTab },
  assumptions:  { label: 'Assumptions',  Component: AssumptionsTab },
  includes:     { label: 'Includes',     Component: IncludesTab },
}

const fallbackTabs: TabDef[] = [
  { id: 'default', label: 'Default Tab', Component: DefaultTab },
]

/* ── Component‑tab helpers ──────────────────── */

const COMP_PREFIX = 'components-'
const COMP_TABS_KEY = 'xlpricer-components-tabs'

interface CompTabMeta { id: string; label: string }

function loadCompTabMetas(): CompTabMeta[] {
  try {
    const raw = localStorage.getItem(COMP_TABS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCompTabMetas(metas: CompTabMeta[]) {
  localStorage.setItem(COMP_TABS_KEY, JSON.stringify(metas))
}

function nextCompId(metas: CompTabMeta[]): string {
  let max = 0
  for (const m of metas) {
    const match = m.id.match(/^components-(\d+)$/)
    if (match) max = Math.max(max, parseInt(match[1]))
  }
  return `${COMP_PREFIX}${max + 1}`
}

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('xlpricer-mode')
    if (saved === 'basic' || saved === 'custom' || saved === 'includes') return saved
    return 'basic'
  })

  const [tabs, setTabs] = useState<TabDef[]>(fallbackTabs)
  const [active, setActive] = useState(fallbackTabs[0].id)
  const [loading, setLoading] = useState(true)
  const [editingTab, setEditingTab] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  useTheme() // still needed — keeps ThemeProvider wired

  const [homeConfig, setHomeConfig] = useState<{ pricesUrl?: string; includes?: string[] }>({})
  const [assumptionsDataUrl, setAssumptionsDataUrl] = useState<string | undefined>()
  const [componentsDataUrl, setComponentsDataUrl] = useState<string | undefined>()

  const handleSetAppMode = useCallback((m: AppMode) => {
    setAppMode(m)
    localStorage.setItem('xlpricer-mode', m)
  }, [])

  const compConfigRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    let cancelled = false
    const configUrl = new URL('./config.json', window.location.href).href
    fetch(configUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`config not found (${res.status})`)
        return res.json()
      })
      .then((config) => {
        if (cancelled) return
        const names: unknown = config?.tabs
        if (!Array.isArray(names) || names.length === 0) {
          console.warn('[App] Config tabs is not a valid array — using fallback')
          return
        }

        compConfigRef.current = (config?.components as Record<string, unknown>) ?? {}
        const includesFiles: string[] = (config?.includes as Record<string, unknown>)?.files as string[] ?? []
        setHomeConfig({
          ...(config?.home as { pricesUrl?: string }),
          includes: includesFiles,
        })
        setAssumptionsDataUrl((config?.assumptions as { dataUrl?: string })?.dataUrl)
        setComponentsDataUrl((config?.components as { dataUrl?: string })?.dataUrl)

        const resolved: TabDef[] = []
        for (const name of names) {
          if (name === 'components') {
            let compTabs = loadCompTabMetas()
            if (compTabs.length === 0) {
              compTabs = [{ id: nextCompId([]), label: 'Components' }]
              saveCompTabMetas(compTabs)
            }
            for (let i = 0; i < compTabs.length; i++) {
              const ct = compTabs[i]
              resolved.push({
                id: ct.id,
                label: ct.label,
                Component: ComponentsTab,
                config: { ...compConfigRef.current, label: ct.label, seed: i === 0 },
              })
            }
          } else if (typeof name === 'string') {
            const entry = tabRegistry[name]
            if (entry) {
              let tabConfig = config[name]
              if (name === 'home') {
                tabConfig = { ...(tabConfig as Record<string, unknown>), includes: includesFiles }
              } else if (name === 'includes') {
                tabConfig = { ...(tabConfig as Record<string, unknown>), standardIncludes: includesFiles }
              }
              resolved.push({
                id: name,
                label: entry.label,
                Component: entry.Component,
                config: tabConfig,
              })
            } else {
              console.warn(`[App] Unknown tab "${name}" — skipping`)
            }
          }
        }
        if (resolved.length > 0) {
          setTabs(resolved)
          setActive(resolved[0].id)
        }
      })
      .catch((err) => {
        console.error('[App] Config load failed:', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  /* ── Component‑tab actions ────────────────── */

  const handleAddCompTab = useCallback(() => {
    const metas = loadCompTabMetas()
    const newId = nextCompId(metas)
    const existingLabels = new Set(metas.map(m => m.label))
    let n = metas.length
    let newLabel = `Components${n}`
    while (existingLabels.has(newLabel)) {
      newLabel = `Components${++n}`
    }
    saveCompTabMetas([...metas, { id: newId, label: newLabel }])

    setTabs(prev => {
      const newTab: TabDef = {
        id: newId,
        label: newLabel,
        Component: ComponentsTab,
        config: { ...compConfigRef.current, label: newLabel, seed: false },
      }
      const lastIdx = prev.findLastIndex(t => t.id.startsWith(COMP_PREFIX))
      const idx = lastIdx >= 0 ? lastIdx + 1 : prev.length
      const next = [...prev]
      next.splice(idx, 0, newTab)
      return next
    })
  }, [])

  const handleDeleteCompTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const compCount = prev.filter(t => t.id.startsWith(COMP_PREFIX)).length
      if (compCount <= 1) return prev

      const metas = loadCompTabMetas().filter(m => m.id !== tabId)
      saveCompTabMetas(metas)
      try { localStorage.removeItem(`xlpricer-components-${tabId}`) } catch {}

      const next = prev.filter(t => t.id !== tabId)
      if (active === tabId) {
        setActive(next[0]?.id ?? 'default')
      }
      return next
    })
  }, [active])

  const startRename = useCallback((tabId: string, currentLabel: string) => {
    if (!tabId.startsWith(COMP_PREFIX)) return
    setEditingTab(tabId)
    setEditValue(currentLabel)
  }, [])

  const RESERVED_NAMES = new Set(['T', 'Assumptions', 'Prices', 'Overview', 'Volumes', 'ESA'])

  const commitRename = useCallback((tabId: string) => {
    const newLabel = editValue.trim()
    setEditingTab(null)
    if (!newLabel) return

    if (RESERVED_NAMES.has(newLabel)) {
      alert(`"${newLabel}" is a reserved sheet name and cannot be used.`)
      return
    }

    const otherLabels = loadCompTabMetas()
      .filter(m => m.id !== tabId)
      .map(m => m.label)
    if (otherLabels.includes(newLabel)) {
      alert(`A tab named "${newLabel}" already exists.`)
      return
    }

    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, label: newLabel, config: { ...t.config, label: newLabel } } : t
    ))
    saveCompTabMetas(loadCompTabMetas().map(m =>
      m.id === tabId ? { ...m, label: newLabel } : m
    ))
  }, [editValue])

  const cancelRename = useCallback(() => {
    setEditingTab(null)
  }, [])

  /* ── Derived values ───────────────────────── */

  const tab = tabs.find((t) => t.id === active)
  const ActiveComponent = tab?.Component ?? DefaultTab
  const compEnabled = tabs.some(t => t.id.startsWith(COMP_PREFIX))
  const compCount = tabs.filter(t => t.id.startsWith(COMP_PREFIX)).length

  const showTabs = appMode === 'custom' || appMode === 'includes'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <ModeSelector mode={appMode} onSelectMode={handleSetAppMode} />
        {showTabs && (
          <>
            {tabs.map((t) => {
              const isCompTab = t.id.startsWith(COMP_PREFIX)
              const isEditing = editingTab === t.id

              return (
                <div key={t.id} className="relative flex items-center">
                  {isCompTab && compCount > 1 && (
                    <button
                      onClick={() => handleDeleteCompTab(t.id)}
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none text-gray-400 hover:text-red-500 bg-white dark:bg-gray-800 rounded-full cursor-pointer"
                      title="Delete tab"
                    >
                      ✕
                    </button>
                  )}
                  {isEditing ? (
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(t.id)
                        if (e.key === 'Escape') cancelRename()
                      }}
                      onBlur={() => commitRename(t.id)}
                      autoFocus
                      className="mx-2 px-2 py-1 text-sm border border-magenta rounded bg-white dark:bg-gray-700 dark:text-gray-100 w-40"
                    />
                  ) : (
                    <button
                      onClick={() => setActive(t.id)}
                      onDoubleClick={() => startRename(t.id, t.label)}
                      className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer
                        ${active === t.id
                          ? 'border-magenta text-magenta dark:border-magenta-light dark:text-magenta-light'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                      {t.label}
                    </button>
                  )}
                </div>
              )
            })}
            {compEnabled && (
              <button
                onClick={handleAddCompTab}
                className="px-3 py-3 text-sm text-gray-400 hover:text-magenta cursor-pointer"
                title="Add component tab"
              >
                +
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex-1 p-0 overflow-hidden">
        {loading ? null : appMode === 'basic' ? (
          <BasicView pricesUrl={homeConfig.pricesUrl} includes={homeConfig.includes} assumptionsDataUrl={assumptionsDataUrl} componentsDataUrl={componentsDataUrl} />
        ) : appMode === 'includes' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <h2 className="text-2xl font-medium text-gray-800 dark:text-gray-100">
              Includes
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              Yet to be implemented.
            </p>
          </div>
        ) : (
          <ActiveComponent
            key={tab?.id ?? 'default'}
            tabId={tab?.id ?? 'default'}
            config={tab?.config}
            visible={true}
          />
        )}
      </div>
    </div>
  )
}
