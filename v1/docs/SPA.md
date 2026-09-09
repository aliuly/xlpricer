# SPA Browser Interface

The `spa/` directory contains a single-page application (SPA) that mirrors the
Tkinter wizard GUI (`xlpricer/wiz.py`).  It consumes the REST API documented in
[API.md](API.md) instead of calling the pricing pipeline directly.

No framework, no bundler, no build step — just a single `index.html` file you
can open in any browser or serve with any static file server.

---

## Screens

The SPA has five screens that map directly to the Tkinter wizard:

| Screen | Description | API endpoint used |
|---|---|---|
| **Main Menu** | Three operation buttons: Build, Reprice, Prep | `GET /api/v1/version` (version badge) |
| **Build** | Enter output filename, choose cache setting, run | `POST /api/v1/build` |
| **Reprice** | Upload an existing workbook, enter output name, run | `POST /api/v1/reprice` |
| **Prep** | Upload a workbook, enter output name, run | `POST /api/v1/prep` |
| **Log** | Shows timestamped progress messages, then offers download | — |

All three operation screens have a **← Back** button to return to the main
menu, and the log screen has a **Cancel** button (changes to **Close** on
completion) plus a **📥 Open file…** button that downloads the result.

---

## Serving the SPA

The REST API server does not serve static files, so you run two processes side
by side during development.

### 1. Start the API server

```bash
python -m xlpricer server --host 0.0.0.0 --port 8000
```

### 2. Serve the SPA with any static file server

```bash
cd spa
python -m http.server 8080
```

Then open **http://localhost:8080/** in your browser.

The SPA makes `fetch()` calls to `/api/v1/…` (same origin).  When served on
port 8080 and the API is on port 8000, you need to either:

- set up a reverse proxy that serves both on the same origin (see below), or
- update the `API` constant in `spa/index.html` to point to the full URL.

---

## Configuring the API Base URL

Near the top of `spa/index.html` (around line 144):

```js
const API = '/api/v1';          // Adjust if server is on a different origin
```

If the API server runs on a different host or port, change this to the full
base URL.  For example:

```js
const API = 'http://localhost:8000/api/v1';
```

The server has CORS enabled (`allow_origins=["*"]`), so cross-origin requests
will work from any origin.

---

## Production Deployment

### Option A — Same origin via reverse proxy

Run a web server (Nginx, Caddy, Apache) in front of both the SPA and the API.
A typical Nginx config:

```nginx
server {
    listen 80;
    server_name pricer.example.com;

    # Serve the SPA
    root /path/to/spa;
    index index.html;

    # Proxy API calls to the FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
```

Now the SPA lives at `https://pricer.example.com/` and calls
`/api/v1/…` on the same origin.  The `API` constant stays at its default
value of `/api/v1`.

### Option B — GitHub Pages + sidecar server

The existing GitHub Pages deployment (in `pages/`) publishes static XLSX
builds.  The SPA can live alongside it, but the API server must be running
somewhere reachable by the browser.  Set the `API` constant to the deployed
server's URL.

---

## Differences from the Tkinter Wizard

Because the SPA runs in a browser and talks to a remote API, a few things work
differently than the desktop GUI:

| Aspect | Tkinter wizard | SPA |
|---|---|---|
| File selection | OS file dialog (`filedialog.askopenfilename`) | Browser file upload (`<input type="file">`) |
| Output file | Written to local filesystem | Downloaded via browser `blob` → `URL.createObjectURL` |
| Open result | Opens in Excel via `subprocess.Popen` | Triggers browser download |
| "Auto config proxy" checkbox | Controls `proxycfg.proxy_cfg()` | Not shown — proxy config is server-side |
| Task progress | `sys.stdout`/`sys.stderr` redirected to a `Listbox` | Timestamped `<span>` elements appended to a `<div>` |
| Cache clearing | N/A (cache falls off after 1 hour) | `POST /api/v1/cache/clear` available via API |
