import type { ComponentProps } from 'react'
import IncludesTab from '../editorTab/IncludesTab'
import WorkbookTab from './WorkbookTab'

interface Props {
  active: 'workbook' | 'includes'
  standardIncludes?: string[]
  workbookTab: Omit<ComponentProps<typeof WorkbookTab>, 'standardIncludes'>
}

/**
 * Content for the Conversion mode's two tabs.  The tab bar itself is
 * rendered by App (top-level Option B layout).
 */
export default function WorkbookMode({ active, standardIncludes, workbookTab }: Props) {
  if (active === 'includes') {
    return (
      <IncludesTab
        tabId="conversion-includes"
        config={{ standardIncludes }}
        visible={true}
      />
    )
  }

  return <WorkbookTab {...workbookTab} standardIncludes={standardIncludes} />
}
