import GenerateView from './GenerateView'
import type { GenerateViewProps } from './GenerateView'

interface Props extends Pick<GenerateViewProps,
  'pricesUrl' | 'includes' | 'assumptionsDataUrl' | 'componentsDataUrl'
  | 'vbaTemplateUrl' | 'genOptions' | 'setGenOptions'> {}

/**
 * Basic mode: the unified generate view backed by the configured
 * server CSVs (no tab-editor customization).
 */
export default function BasicView(props: Props) {
  const viewProps: GenerateViewProps = { ...props, dataSource: 'server' }
  return <GenerateView {...viewProps} />
}
