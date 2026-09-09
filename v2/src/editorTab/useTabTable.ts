import { useRef, useEffect } from 'react'

interface TabTableHandle {
  containerRef: React.RefObject<HTMLDivElement | null>
  tableRef: React.MutableRefObject<unknown>
}

/**
 * Manages a Tabulator container ref and instance ref.
 * Destroys the table when the owning component unmounts.
 */
export function useTabTable(): TabTableHandle {
  const containerRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<unknown>(null)

  useEffect(() => {
    return () => {
      if (tableRef.current) {
        ;(tableRef.current as { destroy?: () => void }).destroy?.()
        tableRef.current = null
      }
    }
  }, [])

  return { containerRef, tableRef }
}
