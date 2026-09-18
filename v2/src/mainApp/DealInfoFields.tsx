import { useDealInfo } from './useDealInfo'
import type { DealInfo } from './useDealInfo'

/**
 * Deal info form fields (Deal ID / Customer / Seq No).
 *
 * Shared by BasicView and HomeTab; values are persisted to
 * localStorage via useDealInfo so both views always agree.
 */

const FIELDS: { key: keyof DealInfo; label: string; placeholder: string }[] = [
  { key: 'dealId', label: 'Deal ID', placeholder: '100XXXXXXX' },
  { key: 'customer', label: 'Customer', placeholder: 'customer name' },
  { key: 'seqNo', label: 'Seq No', placeholder: '1 of 1' },
]

export default function DealInfoFields() {
  const { info, setField, clear } = useDealInfo()
  const isEmpty = info.dealId === '' && info.customer === '' && info.seqNo === ''

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-magenta-dark dark:text-magenta-light flex items-center gap-2">
          📇 Deal info
        </h2>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          title="Clear Deal info"
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Clear
        </button>
      </div>
      <div className="space-y-3">
        {FIELDS.map(({ key, label, placeholder }) => (
          <label key={key} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm font-medium text-gray-600 dark:text-gray-400">
              {label}
            </span>
            <input
              type="text"
              value={info[key]}
              onChange={e => setField(key, e.target.value)}
              placeholder={placeholder}
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-magenta focus:ring-1 focus:ring-magenta transition-colors"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
