# Architecture

## Overview

```text
Internet ─► DNS (lg.geiseit.com) ─► Ingress (TLS via cert-manager)
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼ /                                 ▼ /api
              looking-glass-web                    looking-glass-api
              Next.js (SSR), :8080                 ASP.NET Core, :8080 / metrics :9090
                     │  server-side reads                │
                     └───────────────►──────────────────►│
                                                         ▼ /internal/v1
                                                 looking-glass-diagnostics
                                                 ASP.NET Core + ping/traceroute/mtr, :8080 / metrics :9090
                                                         │
                                                         ▼
                                                     Internet
```

| Workload | Responsibility | State |
|----------|----------------|-------|
| `web` | Server-rendered UI. Renders dashboards from API data on the server, hydrates in the browser, and runs diagnostics from the browser through the ingress. | none |
| `api` | The only public backend. Input validation, rate limiting and concurrency limits, audit logging, request/metric bookkeeping, status and network aggregation, anonymous recent activity. Never executes a process. | in-memory only |
| `diagnostics` | Executes diagnostics. Re-validates every destination after DNS resolution, runs native tools with fixed argument arrays, redacts internal hops, measures connectivity, discovers the public egress address. | in-memory only |
| `bgp` (reserved) | Read-only BGP data provider. Not built yet; the API answers BGP routes with `bgp_unavailable`. | – |

The browser never talks to the diagnostics service. The diagnostics service is reachable only from the API pods
(NetworkPolicy), and the API is the only component that accepts public traffic besides the web UI.

## Projects

```text
src/Contracts     Shared DTOs, problem codes, destination policy (IP blocklist + hostname rules), hosting helpers
src/Api           Public API (GeiseIT.LookingGlass.Api)
src/Diagnostics   Diagnostics service (GeiseIT.LookingGlass.Diagnostics)
src/Web           Next.js frontend
tests/            xUnit projects for Contracts, Api and Diagnostics; frontend tests live in src/Web
deploy/           Helm chart, environment values, GitOps examples, compose gateway
```

`Contracts` is shared on purpose: the API and the diagnostics service use the **same** destination policy, so a
request the API accepts is judged by identical rules in the worker, and the worker still re-checks after DNS resolution.

## Request lifecycle

```text
Browser ─POST /api/v1/diagnostics/ping─► Ingress ─► API
   1. forwarded-headers (trusted proxies only) → client IP
   2. request id assigned (X-Request-Id)
   3. per-IP, per-endpoint sliding-window rate limit          → 429 rate_limited
   4. per-IP concurrency guard                                → 429 rate_limited
   5. syntactic + literal-IP validation (DestinationPolicy)   → 400 / 422
   6. forward to diagnostics with the same request id
        7. DestinationPolicy again, DNS resolution through the configured public resolvers
        8. every resolved address checked against the blocklist (rebinding defence) → 422
        9. global concurrency semaphore + bounded queue        → 503 busy
       10. tool executes with an argument array and the IP literal, deadline + output cap
       11. output parsed into structure, private hops redacted, reverse DNS for public hops
       12. text rendered from the structure (raw tool output is never forwarded)
   13. audit log line, metrics, anonymous recent-activity entry
   ◄── JSON result (or RFC 7807 problem)
```

Cancellation flows end to end: aborting the browser request cancels the API call, which cancels the diagnostics
call, which kills the child process tree.

Results are synchronous request/response. This keeps the system stateless, lets every replica serve any request
and avoids a job store. Streaming (WebSocket/SSE) for traceroute and MTR is a natural extension.

## Diagnostics execution

- Tools: `ping` (iputils), `traceroute`, `mtr` from the diagnostics image. Paths are configuration.
- Tools are invoked with `ProcessStartInfo.ArgumentList` (no shell), a cleared environment, and only ever with an IP
  literal produced by the resolver – never the visitor's text.
- The pod runs as non-root with all capabilities dropped and privilege escalation disabled. ICMP works through
  unprivileged datagram sockets, enabled by the pod-level safe sysctl `net.ipv4.ping_group_range`. `traceroute` uses
  its default unprivileged UDP method and `mtr` uses ICMP datagram sockets; no file capabilities are involved
  (the image strips them, because a file capability that the bounding set cannot satisfy makes `exec` fail).
- Limits: total deadline per request, per-call output cap, `MaxConcurrent` executing plus `MaxQueued` waiting with a
  bounded wait, then `503 busy`.

## Connectivity and network information

The diagnostics service samples TCP connect latency to configurable public anchors over IPv4 and IPv6 on a fixed
interval and keeps a rolling window in memory. That feeds the dashboard cards (status, average latency, uptime), the
latency chart and the `looking_glass_*` gauges. It also discovers the public egress addresses (or uses configured
values). Uptime is reported over the window actually observed and labelled with that window; it is not a
30-day figure. Each replica keeps its own window, so long-term history belongs in Prometheus/Grafana.

## Observability

- Metrics: Prometheus format on the **management port (9090)** of `api` and `diagnostics`, never routed through the
  ingress. ServiceMonitor, PrometheusRule and a Grafana dashboard are optional chart features.
- Logs: structured JSON on stdout. Audit lines carry `request_id`, `client_ip_hash`, `endpoint`,
  `diagnostic_type`, `destination`, `duration_ms`, `result`, `error`. The client hash is an HMAC keyed by a random
  key that rotates daily and is never stored, so entries are correlatable within a day and unlinkable after.
- Tracing: OpenTelemetry via OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- Health: `/health/live` (process only) and `/health/ready` (self-contained). Readiness deliberately does not depend
  on Internet reachability or on the diagnostics service: a temporary outage must not restart pods or remove the API
  from rotation – the status page reports it instead.

## Scaling

All three workloads are stateless and scale horizontally behind HPAs. Rate limits and the recent-activity feed are
per replica, which is why the chart also documents ingress-level limiting for stricter guarantees. Diagnostics
capacity is bounded per pod (`MaxConcurrent`), so total capacity scales with replicas.

## Multi-location (future)

Nothing here prevents multiple locations: deploy the chart per cluster with its own `LookingGlass__Location`, and add
a location selector that fans out to per-location APIs. The API contract has no location assumptions today.
