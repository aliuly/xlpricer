#!/usr/bin/env python3
'''Strip sheet document modules from the template VBA project.

The template workbook's VBA project contains a ``Sheet1`` document
module bound to the template's own sheet.  The final workbooks built
by the TypeScript side have different sheet names, so that module can
never bind — leave it in and Excel re-reconciles the project on open
(orphaned/renamed document modules, ``Workbook_Open`` never firing).

Removes every document module except ``ThisWorkbook`` and saves in
place.  pyOpenVBA rewrites the project streams and invalidates the
``_VBA_PROJECT`` performance cache on save.
'''
from __future__ import annotations

import sys

from pyopenvba import ExcelFile
from pyopenvba.vba import VBAModuleKind


def main() -> None:
    path = sys.argv[1]
    with ExcelFile(path) as xf:
        project = xf.vba_project()
        removed = []
        for module in list(project.modules):
            if module.kind == VBAModuleKind.other and module.name.lower() != 'thisworkbook':
                project.delete_module(module.name)
                removed.append(module.name)
        if removed:
            print(f'stripped sheet document modules: {", ".join(removed)}')
            xf.save()
        else:
            print('no sheet document modules to strip')


if __name__ == '__main__':
    main()
