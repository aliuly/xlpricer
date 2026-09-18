import { useState } from 'react'

export type WorkbookFormat = 'xlsx' | 'xlsm'

export interface GenOptions {
  format: WorkbookFormat
  enableEsa: boolean
  /**
   * Use the user's Includes-tab configuration (enabled standard
   * includes + uploaded custom CSVs).  When off, generation and
   * repricing use the system default prices and ALL standard
   * includes, ignoring the Includes-tab state.
   */
  customPricing: boolean
}

export const DEFAULT_GEN_OPTIONS: GenOptions = {
  format: 'xlsx',
  enableEsa: true,
  customPricing: false,
}

const STORAGE_KEY = 'xlpricer-gen-options'
/** Pre-consolidation key: the checkbox used to live in Conversion mode only. */
const LEGACY_CUSTOM_PRICING_KEY = 'xlpricer-conversion-custom-pricing'

export function loadGenOptions(): GenOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_GEN_OPTIONS }
    const parsed = JSON.parse(raw) as Partial<GenOptions>
    return {
      format: parsed.format === 'xlsm' ? 'xlsm' : 'xlsx',
      enableEsa: parsed.enableEsa !== false,
      customPricing:
        parsed.customPricing !== undefined
          ? parsed.customPricing === true
          : localStorage.getItem(LEGACY_CUSTOM_PRICING_KEY) === 'true',
    }
  } catch { return { ...DEFAULT_GEN_OPTIONS } }
}

export function saveGenOptions(options: GenOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {}
}

/** Generate options state, persisted to localStorage across modes/reloads. */
export function useGenOptions() {
  const [options, setOptions] = useState<GenOptions>(loadGenOptions)

  const setOptionsPersisted = (next: GenOptions) => {
    setOptions(next)
    saveGenOptions(next)
  }

  return { options, setOptions: setOptionsPersisted }
}

interface Props {
  options: GenOptions
  onChange: (next: GenOptions) => void
}

/** ⚙️ Options card: workbook format (XLSX/XLSM) and ESA on/off. */
export default function GenOptions({ options, onChange }: Props) {
  const isDefault = options.format === DEFAULT_GEN_OPTIONS.format
    && options.enableEsa === DEFAULT_GEN_OPTIONS.enableEsa
    && options.customPricing === DEFAULT_GEN_OPTIONS.customPricing

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-[0_4px_16px_rgba(226,0,116,0.08)] dark:shadow-none border border-gray-200 dark:border-gray-700 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-magenta-dark dark:text-magenta-light flex items-center gap-2">
          ⚙️ Options
        </h2>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_GEN_OPTIONS })}
          disabled={isDefault}
          title="Reset options"
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Format */}
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Format
          </span>
          <select
            value={options.format}
            onChange={e => onChange({ ...options, format: e.target.value as WorkbookFormat })}
            className="w-64 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-magenta focus:ring-1 focus:ring-magenta transition-colors cursor-pointer"
          >
            <option value="xlsx">XLSX</option>
            <option value="xlsm">XLSM</option>
          </select>
        </label>

        {/* ESA */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            ESA
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={options.enableEsa}
            onClick={() => onChange({ ...options, enableEsa: !options.enableEsa })}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0
              ${options.enableEsa ? 'bg-magenta' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
              ${options.enableEsa ? 'translate-x-4' : ''}`} />
          </button>
        </div>

        {/* Custom pricing */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Custom pricing
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={options.customPricing}
            onClick={() => onChange({ ...options, customPricing: !options.customPricing })}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0
              ${options.customPricing ? 'bg-magenta' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
              ${options.customPricing ? 'translate-x-4' : ''}`} />
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        {options.format === 'xlsx' ? 'Excel workbook' : 'Macro-enabled workbook'} ·{' '}
        {options.customPricing
          ? 'pricing uses your Includes tab configuration'
          : 'system default prices and standard includes'}
      </p>
    </div>
  )
}
