# GeiseIT Network Looking Glass: web

Next.js 16 (App Router, SSR), React 19, TypeScript (strict), Tailwind CSS 4, ApexCharts, lucide-react.
All HTTP goes through axios. Dependency versions are pinned exactly in `package.json`.

## Run

```bash
npm ci
npm run dev        # http://localhost:3000
```

In development only, `/api/*` is rewritten to the API so the browser can call it same-origin.

| Variable            | Used by            | Default                 | Purpose                                                                 |
|---------------------|--------------------|-------------------------|-------------------------------------------------------------------------|
| `API_INTERNAL_URL`  | server (runtime)   | `http://localhost:5080` | Where server components fetch `/status`, `/network`, `/network/performance`, `/activity`. In-cluster: `http://<release>-api:8080`. |
| `PORT`              | server (runtime)   | `3000` (`8080` in image) | Listen port.                                                            |
| `API_PROXY_TARGET`  | `next dev` only    | `http://localhost:5080` | Target of the dev-only `/api` rewrite.                                  |

In production nothing in this app proxies `/api`. The ingress or gateway must route `/api` to the API and everything else to the web workload.

## Scripts

```bash
npm run typecheck   # next typegen + tsc --noEmit
npm run lint        # eslint (eslint-config-next)
npm test            # vitest + React Testing Library (jsdom)
npm run build       # next build (standalone output)
```

## Container

```bash
docker build -t looking-glass-web .
docker run --rm -p 8080:8080 -e API_INTERNAL_URL=http://host.docker.internal:5080 looking-glass-web
```

The image runs `node server.js` as uid 10001 on port 8080 and works with `readOnlyRootFilesystem: true` when `/tmp` and `/app/.next/cache` are writable `emptyDir` volumes. `GET /healthz` returns 200 without contacting the API and is suitable for liveness and readiness probes.

## How it works

- Server components load data through a server-side axios instance (`src/lib/server`) with a 2.5 s timeout. A failed call becomes a serialisable `LoadResult`, never a 500, so pages render "Unavailable" states when the API is down.
- Client components hydrate from that data and then poll with the browser axios instance (`src/lib/api/client.ts`, base URL `/api/v1`). Diagnostics accept an `AbortSignal`; cancelling aborts the HTTP request, which makes the backend kill the process.
- RFC 7807 problem responses are normalised into `ApiError` (`code`, `requestId`, `retryAfterSeconds`, field errors) in `src/lib/api/errors.ts`.
- `src/proxy.ts` sets a per-request nonce CSP (`src/lib/csp.ts`). Other security headers live in `next.config.js`. Pages are rendered dynamically so the nonce can be applied.
- Theme (light, dark, system) is stored in localStorage and a cookie. The server reads the cookie to render the right class, and a nonced inline script resolves `system` before first paint.

## Layout

```
src/app                 routes, layout, /healthz, error and not-found pages
src/components/ui       Card, StatusBadge, MetricCard, EmptyState, ErrorState, Skeleton, Tabs, Overlay, Toast, TerminalOutput, NetworkTable
src/components/layout   AppShell, Sidebar, Topbar, Breadcrumbs, ThemeToggle, PageHeader, Logo
src/components/diagnostics  DiagnosticForm, DiagnosticRunner, ResultArea, ResultPanel, RouteTable, DiagnosticCard
src/components/dashboard    dashboard sections and QuickDiagnostic
src/components/charts   LatencyChart, HopBarChart (ApexCharts, lazy), MiniBar, ReplyBars
src/components/pages    client views for network, status, BGP and the architecture diagram
src/hooks               useApiQuery, useDiagnostic, useCountdown, useTheme, useServiceStatus, useFocusTrap
src/lib                 api client and types, validation, formatters, theme, CSP, server loaders
src/styles/globals.css  design tokens (CSS variables for light and dark) and component classes
```
