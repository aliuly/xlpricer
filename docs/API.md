# REST API Reference

xlpricer can run as an HTTP server, exposing its pricing-data pipeline (fetch,
normalize, filter, and Excel generation) over REST.  This allows integration
with CI/CD pipelines, web front-ends, or any tool that speaks HTTP.

---

## Starting the Server

```bash
python -m xlpricer server
```

This starts the server at `http://127.0.0.1:8000`.

| Option | Default | Description |
|---|---|---|
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `8000` | Port number |
| `--reload` | off | Auto-restart on file changes (development) |

Example (listening on all interfaces, port 8080):

```bash
python -m xlpricer server --host 0.0.0.0 --port 8080
```

### Swagger UI

Once the server is running, visit:

```
http://localhost:8000/docs
```

for the interactive OpenAPI documentation.  You can try every endpoint from
your browser.

---

## API Endpoints

All endpoints live under `/api/v1/`.

### `GET /api/v1/health`

Health check.

```bash
curl http://localhost:8000/api/v1/health
```

Response:

```json
{
  "status": "ok"
}
```

---

### `GET /api/v1/version`

Show the xlpricer version.

```bash
curl http://localhost:8000/api/v1/version
```

Response:

```json
{
  "version": "1.7.0"
}
```

---

### `GET /api/v1/prices`

Return the full normalized pricing dataset as JSON.  This is the same data
that the `build` command writes into the Prices tab of the Excel workbook.

| Query param | Default | Description |
|---|---|---|
| `refresh` | `false` | If `true`, bypass the cache and re-fetch from the upstream API |

```bash
curl http://localhost:8000/api/v1/prices
```

Response (abbreviated):

```json
{
  "columns": { ... },
  "services": { ... },
  "count": 1427,
  "records": { ... },
  "tiers": { ... },
  "choices": {
    "EVS": ["Common I/O", "High I/O", "Ultra-High I/O"],
    "REGIONS": ["eu-de", "eu-nl"]
  },
  "flatten": [ ... ]
}
```

Force a refresh (ignore cache):

```bash
curl "http://localhost:8000/api/v1/prices?refresh=true"
```

---

### `GET /api/v1/prices/flatten`

Return just the flattened price list (the array that gets written into
the Prices sheet).  Each element is a single SKU or tier.

```bash
curl http://localhost:8000/api/v1/prices/flatten
```

Response:

```json
[
  {
    "_XlTitle_": "AI: LLAMA3-70B",
    "region": "eu-de",
    "productName": "LLAMA3-70B",
    "productFamily": "AI",
    "unit": "h",
    "price": 2.45,
    ...
  },
  ...
]
```

---

### `GET /api/v1/prices/services`

Return the service catalog (IDs, titles, descriptions).

```bash
curl http://localhost:8000/api/v1/prices/services
```

Response:

```json
{
  "OTC_SERVER_COMPUTE": {
    "parameterIdentifier": "OTC_SERVER_COMPUTE",
    "title": "Compute",
    "description": "Elastic Cloud Server (ECS) ..."
  },
  ...
}
```

---

### `GET /api/v1/prices/records`

Return raw records grouped by service ID.

```bash
curl http://localhost:8000/api/v1/prices/records
```

---

### `GET /api/v1/prices/choices`

Return the validation lists used by the Excel workbook (EVS types, regions).

```bash
curl http://localhost:8000/api/v1/prices/choices
```

Response:

```json
{
  "EVS": ["Common I/O", "High I/O", "Ultra-High I/O"],
  "REGIONS": ["eu-de", "eu-nl"]
}
```

---

### `GET /api/v1/prices/tiers`

Return all tiered pricing groups.

```bash
curl http://localhost:8000/api/v1/prices/tiers
```

---

### `GET /api/v1/prices/query`

Search/filter the flattened price list.

| Query param | Description |
|---|---|
| `region` | Filter by region (e.g. `eu-de`) |
| `family` | Filter by product family (e.g. `Compute`) |
| `product` | Filter by product name (substring match) |
| `service` | Filter by service ID |

```bash
curl "http://localhost:8000/api/v1/prices/query?family=Compute&region=eu-de"
```

Response: an array of matching flattened records.

---

### `POST /api/v1/build`

Build a new Excel workbook with the latest pricing data and return it as
a file download.

| Request body field | Default | Description |
|---|---|---|
| `api_url` | default endpoint | Override the API endpoint |
| `use_cache` | `true` | Use cached data if available |
| `swiss` | `false` | Keep `eu-ch2` entries |
| `includes` | `[]` | Additional JSON price files to merge |
| `output_file` | auto-generated | Client-side filename hint |

```bash
curl -X POST http://localhost:8000/api/v1/build -o prices.xlsx
```

With custom options:

```bash
curl -X POST http://localhost:8000/api/v1/build \
  -H "Content-Type: application/json" \
  -d '{"use_cache": false, "includes": ["my-prices.json"]}' \
  -o my-prices.xlsx
```

The response is an `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
binary stream.

---

### `POST /api/v1/reprice`

Upload an existing xlpricer-generated workbook and download an updated
version with refreshed prices.  This is the HTTP equivalent of the
`reprice` CLI command.

The request must be a `multipart/form-data` upload:

```bash
curl -X POST -F "file=@INTERNAL-t-cloud-public-prices-2026-05-06.xlsx" \
  http://localhost:8000/api/v1/reprice \
  -o updated.xlsx
```

Optional form fields (sent alongside the file):

| Field | Default | Description |
|---|---|---|
| `api_url` | default endpoint | Override the API endpoint |
| `use_cache` | `true` | Use cached data if available |
| `swiss` | `false` | Keep `eu-ch2` entries |
| `includes` | (none) | Additional JSON price files |

```bash
curl -X POST \
  -F "file=@old.xlsx" \
  -F "use_cache=false" \
  http://localhost:8000/api/v1/reprice \
  -o refreshed.xlsx
```

The response is an updated XLSX file.

---

### `POST /api/v1/prep`

Upload an xlpricer-generated workbook and download a sanitised copy ready for
public release.  Strips the Prices and Volumes sheets, removes data-validation
rules that reference the price list, and replaces formula cells with their
cached values.  This is the HTTP equivalent of the `prep` CLI command.

```bash
curl -X POST -F "file=@INTERNAL-t-cloud-public-prices-2026-05-06.xlsx" \
  http://localhost:8000/api/v1/prep \
  -o PUBLIC-t-cloud-public-prices-2026-05-06.xlsx
```

The response is a sanitised XLSX file.

---

### `GET /api/v1/cache/status`

Show whether the cached pricing data is available and its age.

```bash
curl http://localhost:8000/api/v1/cache/status
```

Response:

```json
{
  "cached": true,
  "age_seconds": 12345,
  "cache_file": "~/.xlpricer-cache.json"
}
```

---

### `POST /api/v1/cache/clear`

Invalidate the on-disk cache so the next request re-fetches from the
upstream API.

```bash
curl -X POST http://localhost:8000/api/v1/cache/clear
```

Response:

```json
{
  "status": "cache cleared"
}
```

---

## Examples

### Python (using `requests`)

```python
import requests

BASE = "http://localhost:8000/api/v1"

# Check health
r = requests.get(f"{BASE}/health")
print(r.json())

# Get all prices
r = requests.get(f"{BASE}/prices")
data = r.json()
print(f"Got {data['count']} records")

# Query compute prices in eu-de
r = requests.get(f"{BASE}/prices/query", params={
    "family": "Compute",
    "region": "eu-de",
})
for sku in r.json():
    print(sku["_XlTitle_"], sku["price"])

# Build an Excel workbook
r = requests.post(f"{BASE}/build")
with open("prices.xlsx", "wb") as f:
    f.write(r.content)

# Reprice an existing workbook
with open("old.xlsx", "rb") as f:
    r = requests.post(f"{BASE}/reprice", files={"file": f})
with open("updated.xlsx", "wb") as f:
    f.write(r.content)
```

### Python (using `httpx`)

```python
import httpx
import asyncio

async def main():
    async with httpx.AsyncClient() as client:
        r = await client.get("http://localhost:8000/api/v1/prices")
        print(r.json()["count"])

asyncio.run(main())
```

### Bash / CI Pipeline

```bash
# Refresh prices and generate workbook in one shot
python -m xlpricer server --port 8080 &
sleep 2
curl -X POST http://localhost:8080/api/v1/build -o build-output.xlsx
curl -X POST http://localhost:8080/api/v1/cache/clear
kill %1
```

### JavaScript / fetch (browser)

```javascript
const BASE = "http://localhost:8000/api/v1";

// Fetch prices
const resp = await fetch(`${BASE}/prices`);
const data = await resp.json();
console.log(`${data.count} SKUs loaded`);

// Download a generated workbook
const resp2 = await fetch(`${BASE}/build`, { method: "POST" });
const blob = await resp2.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "t-cloud-prices.xlsx";
a.click();
```

---

## Configuration

The server reads the same settings file as the CLI tool
(`~/.xlpricer-settings.yaml`).  Environment variables and the settings file
control proxy behaviour, cache location, and API defaults:

```yaml
# ~/.xlpricer-settings.yaml
proxy: true                          # Auto-configure proxy from OS/registry
api: https://calculator.otc-service.com/en/open-telekom-price-api/
use_cache: true
cache_file: /path/to/custom-cache.json
include:
  - my-extra-prices.json
```

---

## Error Handling

The API returns standard HTTP status codes:

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request (missing or invalid parameters) |
| `502` | Upstream pricing API unreachable or returned an error |
| `503` | Service unavailable (e.g., cache locked) |
| `500` | Internal error (check server logs) |

Errors include a JSON body with details:

```json
{
  "detail": "External API error: 503 Server Error: Service Unavailable for url"
}
```

---

## Notes

- The first request to `/api/v1/prices` (or any endpoint that needs pricing
  data) will trigger a fetch from the upstream Open Telekom Cloud API.  This
  can take several seconds.  Subsequent requests use the in-memory cache
  and are fast.
- Use `?refresh=true` or `POST /api/v1/cache/clear` to force a re-fetch.
- The built-in Swagger UI at `/docs` lets you explore every endpoint
  interactively without writing a single curl command.
