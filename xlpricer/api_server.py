#!/usr/bin/env python3
'''REST API server for xlpricer

Exposes the pricing-data pipeline (fetch, normalize, filter, Excel generation)
over HTTP.  Run with:

    python -m xlpricer server
'''

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import cache as cache_mod
from . import includes as includes_mod
from . import normalize as normalize_mod
from . import noswiss as noswiss_mod
from . import price_api
from . import proxycfg as proxycfg_mod
from . import xlsw
from .constants import K
from .version import VERSION

logger = logging.getLogger("xlpricer-api")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BuildRequest(BaseModel):
    '''Parameters for the ``/api/v1/build`` endpoint.'''
    api_url: str = K.DEF_API_ENDPOINT
    use_cache: bool = True
    swiss: bool = False
    includes: list[str] = []
    output_file: str = ''  # client-side filename hint; unused by the server


# ---------------------------------------------------------------------------
# In-memory state (lazy-loaded, shared across requests)
# ---------------------------------------------------------------------------

class AppState:
    '''Shared application state, held in app.state.'''

    def __init__(self) -> None:
        self.pricedata: dict | None = None
        self.last_fetch: float = 0.0
        self.cache_file: str = cache_mod.default_cache()

    def invalidate(self) -> None:
        self.pricedata = None
        self.last_fetch = 0.0
        # Also remove the on-disk cache so the next CLI invocation gets fresh data.
        try:
            if os.path.isfile(self.cache_file):
                os.unlink(self.cache_file)
        except OSError:
            pass


def _load_or_fetch(
    *,
    api_url: str = K.DEF_API_ENDPOINT,
    use_cache: bool = True,
    swiss: bool = False,
    includes: list[str] | None = None,
    refresh: bool = False,
    state: AppState | None = None,
) -> dict:
    '''Return normalized pricing data, using the in-memory cache when possible.

    This is the same pipeline the CLI ``build`` / ``reprice`` commands run.
    '''
    # Try in-memory cache first.
    if state is not None and state.pricedata is not None and not refresh:
        return state.pricedata

    # On-disk cache (respects MAX_CACHE_AGE internally).
    apidat: dict | None = None
    if not refresh and use_cache and state is not None:
        apidat = cache_mod.validate_cache(state.cache_file, use_cache=True)

    if apidat is None:
        # Fetch from the upstream API.
        proxycfg_mod.proxy_cfg(debug=False)
        apidat = price_api.fetch_prices(api_url, verbose=False)
        if use_cache and state is not None:
            cache_mod.save(state.cache_file, apidat)

    # Post-processing.
    includes_mod.fixed_prices(apidat)
    for inc in (includes or []):
        includes_mod.json_prices(inc, apidat)

    if not swiss:
        noswiss_mod.filter(apidat)

    normalize_mod.normalize(apidat)

    # Populate the in-memory cache.
    if state is not None:
        state.pricedata = apidat
        state.last_fetch = time.time()

    return apidat


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing to do — data is lazy-loaded on first request.
    logger.info("xlpricer API server starting")
    yield
    # Shutdown: release the cached data.
    app.state.pricedata = None
    logger.info("xlpricer API server stopped")


app = FastAPI(
    title="xlpricer API",
    description="Price-calculator workbook generator for Open Telekom Cloud",
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state = AppState()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _ensure_pricedata(refresh: bool = False) -> dict:
    '''Convenience wrapper that raises HTTPException on failure.'''
    try:
        return _load_or_fetch(refresh=refresh, state=app.state)
    except Exception as exc:
        logger.exception("Failed to load pricing data")
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/v1/health")
async def health():
    '''Health check.'''
    return {"status": "ok"}


@app.get("/api/v1/version")
async def version():
    '''Return the xlpricer version string.'''
    return {"version": VERSION}


@app.get("/api/v1/prices")
async def get_prices(refresh: bool = Query(False, description="Bypass cache and re-fetch from upstream")):
    '''Return the full normalized pricing dataset.'''
    data = _ensure_pricedata(refresh=refresh)
    return JSONResponse(content=data)


@app.get("/api/v1/prices/flatten")
async def get_prices_flatten(refresh: bool = Query(False)):
    '''Return just the flattened price list (the array written into the Prices sheet).'''
    data = _ensure_pricedata(refresh=refresh)
    return JSONResponse(content=data.get("flatten", []))


@app.get("/api/v1/prices/services")
async def get_prices_services(refresh: bool = Query(False)):
    '''Return the service catalog (IDs, titles, descriptions).'''
    data = _ensure_pricedata(refresh=refresh)
    return JSONResponse(content=data.get("services", {}))


@app.get("/api/v1/prices/records")
async def get_prices_records(refresh: bool = Query(False)):
    '''Return raw records grouped by service ID.'''
    data = _ensure_pricedata(refresh=refresh)
    return JSONResponse(content=data.get("records", {}))


@app.get("/api/v1/prices/choices")
async def get_prices_choices(refresh: bool = Query(False)):
    '''Return the validation lists used by the Excel workbook (EVS types, regions).'''
    data = _ensure_pricedata(refresh=refresh)
    return JSONResponse(content=data.get("choices", {}))


@app.get("/api/v1/prices/tiers")
async def get_prices_tiers(refresh: bool = Query(False)):
    '''Return all tiered pricing groups.'''
    data = _ensure_pricedata(refresh=refresh)
    return JSONResponse(content=data.get("tiers", {}))


@app.get("/api/v1/prices/query")
async def query_prices(
    region: Optional[str] = Query(None, description="Filter by region (e.g. eu-de)"),
    family: Optional[str] = Query(None, description="Filter by product family (e.g. Compute)"),
    product: Optional[str] = Query(None, description="Filter by product name (substring match)"),
    service: Optional[str] = Query(None, description="Filter by service ID"),
    refresh: bool = Query(False),
):
    '''Search/filter the flattened price list.'''
    data = _ensure_pricedata(refresh=refresh)
    results = data.get("flatten", [])

    if region:
        results = [r for r in results if r.get("region") == region]
    if family:
        results = [r for r in results if r.get("productFamily") == family]
    if product:
        results = [r for r in results if product.lower() in r.get("productName", "").lower()]
    if service:
        results = [r for r in results if r.get("_idGroup") == service]

    return JSONResponse(content=results)


@app.post("/api/v1/build")
async def build_xlsx(req: BuildRequest):
    '''Build a new Excel workbook and return it as a file download.

    Accepts a JSON body with the same parameters the CLI ``build`` command
    accepts.  The *includes* field is a JSON array of filenames.
    '''
    from .xlu import today

    try:
        proxycfg_mod.proxy_cfg(debug=False)
        apidat = price_api.fetch_prices(req.api_url, verbose=False)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upstream API error: {exc}")

    includes_mod.fixed_prices(apidat)
    for inc in req.includes:
        includes_mod.json_prices(inc, apidat)

    if not req.swiss:
        noswiss_mod.filter(apidat)

    normalize_mod.normalize(apidat)

    # Write to a temporary file so we can stream it back.
    filename = req.output_file or K.DEF_BUILD_FILENAME.format(date=today())
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    try:
        xlsw.xlsx_write(tmp.name, apidat)
        tmp.close()
        return FileResponse(
            tmp.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        logger.exception("Failed to build XLSX")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/reprice")
async def reprice_xlsx(
    file: UploadFile = File(...),
    api_url: str = Form(K.DEF_API_ENDPOINT),
    use_cache: bool = Form(True),
    swiss: bool = Form(False),
    includes: str = Form("[]"),
):
    '''Upload an existing xlpricer workbook and download an updated version.'''
    try:
        inc_list = json.loads(includes) if isinstance(includes, str) else (includes or [])
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="includes must be a JSON array of filenames")

    # Save the uploaded file to disk.
    suffix = Path(file.filename or "input.xlsx").suffix or ".xlsx"
    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_in.write(await file.read())
    tmp_in.close()

    try:
        proxycfg_mod.proxy_cfg(debug=False)
        apidat = price_api.fetch_prices(api_url, verbose=False)
    except Exception as exc:
        os.unlink(tmp_in.name)
        raise HTTPException(status_code=502, detail=f"Upstream API error: {exc}")

    includes_mod.fixed_prices(apidat)
    for inc in inc_list:
        includes_mod.json_prices(inc, apidat)

    if not swiss:
        noswiss_mod.filter(apidat)

    normalize_mod.normalize(apidat)

    tmp_out = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    try:
        xlsw.xlsx_refresh(tmp_in.name, apidat, tmp_out.name)
        os.unlink(tmp_in.name)
        out_name = file.filename or "repriced.xlsx"
        tmp_out.close()
        return FileResponse(
            tmp_out.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_name,
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
        )
    except Exception as exc:
        logger.exception("Failed to reprice XLSX")
        os.unlink(tmp_in.name)
        try:
            os.unlink(tmp_out.name)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/prep")
async def prep_xlsx(file: UploadFile = File(...)):
    '''Upload an xlpricer-generated workbook and download a sanitised copy.

    Strips the Prices and Volumes sheets, removes data-validation rules that
    reference the price list, and replaces formula cells with their cached
    values.  This is the HTTP equivalent of the ``prep`` CLI command.
    '''
    suffix = Path(file.filename or "input.xlsx").suffix or ".xlsx"
    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_in.write(await file.read())
    tmp_in.close()

    tmp_out = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    try:
        xlsw.xlsx_sanitize(tmp_in.name, tmp_out.name)
        os.unlink(tmp_in.name)
        out_name = file.filename or "prepared.xlsx"
        tmp_out.close()
        return FileResponse(
            tmp_out.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=out_name,
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
        )
    except Exception as exc:
        logger.exception("Failed to prep XLSX")
        os.unlink(tmp_in.name)
        try:
            os.unlink(tmp_out.name)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/v1/cache/status")
async def cache_status():
    '''Show whether cached pricing data is available and its age.'''
    state = app.state
    return {
        "cached": state.pricedata is not None,
        "age_seconds": int(time.time() - state.last_fetch) if state.pricedata else 0,
        "cache_file": state.cache_file,
    }


@app.post("/api/v1/cache/clear")
async def cache_clear():
    '''Invalidate the in-memory and on-disk cache.'''
    app.state.invalidate()
    return {"status": "cache cleared"}
