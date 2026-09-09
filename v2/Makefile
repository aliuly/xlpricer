PRICES_URL = https://aliuly.github.io/pipeline/prices-latest.json
PRICE_INCLUDES = public/includes/*
XLSX_ASSUMPTIONS = public/assumptions.csv
XLSX_COMPONENTS = public/preload.csv
XLSX_OUTPUT = pricing.xlsx
PIPELINE_OUTPUT = out.json
BASE ?= /


.PHONY: help install ci dev build preview test pipeline xlsx manifest test


help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' Makefile | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'

node_modules: package.json
	npm install
	@touch $@

lint: node_modules ## run linting
	npm run lint

test: node_modules ## run tests
	: no tests currently available

install: node_modules ## Install npm dependencies

ci: package-lock.json ## Clean install npm dependencies (for CI/CD)
	npm ci
	@touch node_modules

manifest: ## Generate includes/manifest.json from git history
	@echo "Generating includes manifest…"
	@for f in public/includes/*.csv; do \
		[ -f "$$f" ] || continue; \
		name=$$(basename "$$f"); \
		ts=$$(git log -1 --format=%cI -- "$$f"); \
		sha=$$(git log -1 --format=%h -- "$$f"); \
		msg=$$(git log -1 --format=%s -- "$$f"); \
		echo "  $$name -> $$ts ($$sha) $$msg"; \
	done
	@python3 -c '\
	import json, subprocess, os, glob; \
	out={}; \
	[out.update({os.path.basename(f):{"version":subprocess.check_output(["git","log","-1","--format=%cI","--",f]).decode().strip(),"sha":subprocess.check_output(["git","log","-1","--format=%h","--",f]).decode().strip(),"message":subprocess.check_output(["git","log","-1","--format=%s","--",f]).decode().strip()}} if os.path.isfile(f) else None) for f in sorted(glob.glob("public/includes/*.csv"))]; \
	json.dump(out, open("public/includes/manifest.json","w"), indent=2); \
	print("Wrote public/includes/manifest.json")'

dev: manifest node_modules ## Start Vite dev server
	npm run dev

build: manifest node_modules ## Build for production (use BASE=./ for GH Pages)
	npm run build -- --base=$(BASE)

preview: build ## Preview production build locally
	npm run preview

pipeline: node_modules ## Test pricing pipeline from CLI.  use PRICES_URL to change targets
	npx tsx src/prices/cli.ts $(PRICES_URL) -o $(PIPELINE_OUTPUT) --verbose $(PRICE_INCLUDES)

xlsx: node_modules ## Generate XLSX workbook from local data.  Override vars as needed
	npx tsx src/xlsx/cli.ts $(PRICES_URL) $(PRICE_INCLUDES) \
		-o $(XLSX_OUTPUT) \
		--assumptions $(XLSX_ASSUMPTIONS) \
		--components Components=$(XLSX_COMPONENTS) \
		--verbose


