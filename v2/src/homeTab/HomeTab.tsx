import GenerateView from '../mainApp/GenerateView'
import type { GenOptions } from '../mainApp/GenOptions'

interface Props {
  config?: Record<string, unknown>
}

/**
 * Home tab (custom mode): the unified generate view backed by the
 * assumptions/components rows edited in the tab bar.
 */
export default function HomeTab({ config }: Props) {
  return (
    <GenerateView
      dataSource="tabs"
      pricesUrl={(config?.pricesUrl as string) ?? undefined}
      includes={(config?.includes as string[]) ?? undefined}
      vbaTemplateUrl={(config?.vbaTemplateUrl as string) ?? undefined}
      genOptions={config?.genOptions as GenOptions}
      setGenOptions={config?.setGenOptions as (next: GenOptions) => void}
    />
  )
}
