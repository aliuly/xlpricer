import { Fragment, useState, useRef, useEffect } from 'react'
import { useTheme } from '../themes/useTheme'
import type { ThemeMode } from '../themes/types'

export type AppMode = 'basic' | 'custom' | 'includes'

const MODES: { id: AppMode; label: string }[] = [
  { id: 'basic',    label: 'Basic' },
  { id: 'custom',   label: 'Custom' },
  // { id: 'includes', label: 'Includes' },
]

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light',  label: 'Light' },
  { id: 'dark',   label: 'Dark' },
]

interface Props {
  mode: AppMode
  onSelectMode: (m: AppMode) => void
}

function sectionLabel(text: string) {
  return (
    <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {text}
    </div>
  )
}

function modeItem(props: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={props.onClick}
      className={`block w-full text-left px-4 py-1.5 text-sm transition-colors cursor-pointer
        ${props.active
          ? 'text-magenta dark:text-magenta-light font-medium'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
    >
      {props.active ? '● ' : '  '}{props.label}
    </button>
  )
}

export default function ModeSelector({ mode, onSelectMode }: Props) {
  const [open, setOpen] = useState(false)
  const [themeSub, setThemeSub] = useState(false)
  const { mode: theme, setMode: setTheme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setThemeSub(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        onClick={() => { setOpen(!open); setThemeSub(false) }}
        title="Settings"
        className="px-3 py-3 text-gray-400 hover:text-magenta dark:hover:text-magenta-light transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black/5 z-50 py-1">
          {sectionLabel('Mode')}
          {MODES.map((m) => (
            <Fragment key={m.id}>
              {modeItem({
                active: mode === m.id,
                label: m.label,
                onClick: () => { onSelectMode(m.id); setOpen(false) },
              })}
            </Fragment>
          ))}
          <div className="mx-4 my-1 border-t border-gray-200 dark:border-gray-700" />
          <div className="relative">
            <button
              onClick={() => setThemeSub(!themeSub)}
              onMouseEnter={() => setThemeSub(true)}
              className={`flex items-center justify-between w-full px-4 py-1.5 text-sm transition-colors cursor-pointer
                ${themeSub
                  ? 'text-magenta dark:text-magenta-light bg-gray-100 dark:bg-gray-700'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              <span>Theme</span>
              <svg className="w-3 h-3 ml-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {themeSub && (
              <div
                onMouseLeave={() => setThemeSub(false)}
                className="absolute left-full top-0 ml-1 w-32 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black/5 z-50 py-1"
              >
                {THEMES.map((t) => (
                  <Fragment key={t.id}>
                    {modeItem({
                      active: theme === t.id,
                      label: t.label,
                      onClick: () => { setTheme(t.id); setThemeSub(false); setOpen(false) },
                    })}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
