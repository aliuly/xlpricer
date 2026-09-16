VBABB	= ./pys.sh vbabb

# Deliverable consumed by v2: the stripped macro-enabled host workbook.
# The generated pricing content is merged INTO this workbook (see
# v2/src/xlsx/vba.ts), so its VBA project stays natively bound.
VBA_TEMPLATE = ../public/vba/template.xlsm

.DEFAULT_GOAL := build

.PHONY: help build clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' Makefile | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'

clean:  ## Clean build
	rm -f project.xlsm $(VBA_TEMPLATE)

build: $(VBA_TEMPLATE) ## Build VBA host workbook (public/vba/template.xlsm)

# Intermediate xlsm (also handy for debugging the VBA directly in Excel)
project.xlsm: handlers.vba ui.vba bom.vba prep.vba
	$(VBABB) \
		--output project.xlsm \
		handlers.vba \
		ui.vba \
		bom.vba \
		prep.vba

# Strip the template's Sheet1 document module — its own sheet is
# replaced by the generated workbook's sheets during the merge, and an
# orphaned sheet module would make Excel re-reconcile the project.
# Then publish the host workbook where Vite will pick it up.
$(VBA_TEMPLATE): project.xlsm strip_doc_sheets.py
	./pys.sh strip_doc_sheets.py project.xlsm
	mkdir -p ../public/vba
	cp project.xlsm $@
