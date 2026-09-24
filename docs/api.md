# HTTP API reference

Base path: `/api/v1`. All bodies are JSON (`application/json`), property names are camelCase, enums are camelCase strings.
The API is intended for the bundled web application. It is not a supported public API (see `docs/security.md`).

Every response carries an `X-Request-Id` header. Every diagnostic response body also carries `requestId`.

## Errors

All errors use RFC 7807 `application/problem+json`:

```json
{
  "type": "https://lg.geiseit.com/problems/rate_limited",
  "title": "Too many requests",
  "status": 429,
  "detail": "You have reached the limit of 10 ping requests per minute. Try again in 42 seconds.",
  "code": "rate_limited",
  "requestId": "0HN7...",
  "retryAfterSeconds": 42
}
```

| `code`                   | HTTP | Meaning                                                                 |
|--------------------------|------|-------------------------------------------------------------------------|
| `validation_failed`      | 400  | Malformed input (bad JSON, missing field, invalid hostname/IP)          |
| `destination_blocked`    | 422  | Well-formed but not permitted (private/reserved range, internal name, hostname that resolves to one) |
| `unsupported_media_type` | 415  | Body is not `application/json`                                          |
| `payload_too_large`      | 413  | Request body exceeds the limit                                          |
| `rate_limited`           | 429  | Per-IP rate or concurrency limit; `Retry-After` header + `retryAfterSeconds` |
| `busy`                   | 503  | Diagnostics capacity exhausted, retry shortly (`Retry-After`)           |
| `timeout`                | 504  | The diagnostic exceeded its time budget                                 |
| `diagnostic_failed`      | 502  | The tool failed or the destination could not be resolved/reached        |
| `service_unavailable`    | 503  | Diagnostics backend not reachable                                       |
| `bgp_unavailable`        | 503  | BGP subsystem is not configured or not reachable (Looking Glass is otherwise fine) |
| `internal_error`         | 500  | Unexpected failure                                                      |

`validation_failed` may also carry `errors`: `{ "destination": ["message"] }`.

## Diagnostics

`POST /api/v1/diagnostics/ping | traceroute | mtr` with

```json
{ "destination": "8.8.8.8", "family": "auto" }
```

`family` is `auto` (default), `ipv4` or `ipv6`. Requests run synchronously and return when the diagnostic completes
(typically 2-20 s; hard limits apply). Aborting the HTTP request cancels the diagnostic and kills the underlying process.

### Ping response

```json
{
  "requestId": "…", "type": "ping",
  "destination": "dns.google", "resolvedAddress": "8.8.8.8", "family": "ipv4",
  "startedAt": "2026-09-24T14:03:11.120+00:00", "durationMs": 4120,
  "transmitted": 5, "received": 5, "lossPercent": 0,
  "minMs": 11.2, "avgMs": 12.7, "maxMs": 14.4, "stdDevMs": 1.1,
  "replies": [{ "seq": 1, "ttl": 117, "timeMs": 12.3 }],
  "technicalOutput": "PING 8.8.8.8 …",
  "simulated": false
}
```

### Traceroute response

```json
{
  "requestId": "…", "type": "traceroute",
  "destination": "cloudflare.com", "resolvedAddress": "104.16.132.229", "family": "ipv4",
  "startedAt": "…", "durationMs": 9800, "reachedDestination": true,
  "hops": [
    { "hop": 1, "responded": true,  "redacted": true,  "address": null, "hostname": null, "rttMs": [0.4, 0.3, 0.4], "avgMs": 0.37 },
    { "hop": 4, "responded": true,  "redacted": false, "address": "203.0.113.9", "hostname": "core1.example.net", "rttMs": [5.1, null, 5.3], "avgMs": 5.2 },
    { "hop": 5, "responded": false, "redacted": false, "address": null, "hostname": null, "rttMs": [null, null, null], "avgMs": null }
  ],
  "technicalOutput": "traceroute to …",
  "simulated": false
}
```

`redacted: true` means the hop is inside a private/internal network. Its address and hostname are withheld (both `null`) but timing is retained; the UI should
show it as an "Internal network" hop. `responded: false` means every probe timed out (render as `* * *`). Individual `rttMs` entries may be `null` for a lost probe.

### MTR response

```json
{
  "requestId": "…", "type": "mtr",
  "destination": "1.1.1.1", "resolvedAddress": "1.1.1.1", "family": "ipv4",
  "startedAt": "…", "durationMs": 12000, "cycles": 10,
  "hops": [
    { "hop": 1, "responded": true, "redacted": true, "address": null, "hostname": null,
      "lossPercent": 0, "sent": 10, "lastMs": 0.4, "avgMs": 0.5, "bestMs": 0.3, "worstMs": 0.9, "stdDevMs": 0.2 }
  ],
  "technicalOutput": "HOST: … Loss% Snt Last Avg Best Wrst StDev …",
  "simulated": false
}
```

### DNS

`POST /api/v1/diagnostics/dns`

```json
{ "name": "example.com", "recordType": "MX" }
```

`recordType` ∈ `A, AAAA, CNAME, MX, NS, TXT, SOA, PTR`. For `PTR`, `name` must be a public IP address (reverse lookup); every other type requires a domain name. Underscore labels (`_dmarc.example.com`) are accepted for DNS lookups. Lookups are answered by the configured public resolvers, never by cluster DNS, and internal names (`.local`, `.internal`, `.svc`, `.cluster.local`, single-label names, …) are refused.

```json
{
  "requestId": "…", "type": "dns", "name": "example.com", "recordType": "MX",
  "startedAt": "…", "durationMs": 31, "status": "ok",
  "records": [{ "name": "example.com", "type": "MX", "ttl": 300, "value": "10 mail.example.com" }],
  "technicalOutput": ";; QUESTION …"
}
```

`status` is `ok`, `nodata` (name exists, no records of that type) or `nxdomain`. Neither is an HTTP error.

## Information

### `GET /api/v1/status`

Real health of each component. Never fails because an optional subsystem is down.

```json
{
  "overall": "operational",
  "checkedAt": "…", "version": "1.0.0",
  "components": [
    { "id": "web",         "name": "Looking Glass", "status": "operational", "detail": null, "latencyMs": null },
    { "id": "api",         "name": "API",           "status": "operational", "detail": null, "latencyMs": null },
    { "id": "diagnostics", "name": "Diagnostics",   "status": "operational", "detail": null, "latencyMs": 3.1 },
    { "id": "bgp",         "name": "BGP",           "status": "notConfigured", "detail": "BGP is not enabled on this Looking Glass.", "latencyMs": null },
    { "id": "ipv4",        "name": "IPv4 Connectivity", "status": "operational", "detail": "Average latency 12.7 ms", "latencyMs": 12.7 },
    { "id": "ipv6",        "name": "IPv6 Connectivity", "status": "outage", "detail": "No IPv6 connectivity detected", "latencyMs": null }
  ]
}
```

`status` ∈ `operational | degraded | outage | notConfigured`. `overall` ignores `notConfigured` components.

### `GET /api/v1/network`

```json
{
  "brand": "GeiseIT", "location": "GeiseIT Network", "hostname": "lg.geiseit.com",
  "ipv4": "198.51.100.10", "ipv6": "2001:db8::10", "asn": "AS64512", "network": "GeiseIT",
  "platform": "Kubernetes", "connectivity": "Internet", "version": "1.0.0"
}
```

`ipv4`, `ipv6`, `asn` may be `null` when unknown/unconfigured.

### `GET /api/v1/network/performance`

Measured by the diagnostics backend (periodic TCP-connect probes to well-known public anchors over each IP family).

```json
{
  "generatedAt": "…", "windowSeconds": 86400, "intervalSeconds": 60,
  "avgLatencyMs": 12.7, "uptimePercent": 99.9,
  "ipv4": { "status": "operational", "avgLatencyMs": 12.1, "uptimePercent": 100, "samples": [{ "at": "…", "latencyMs": 12.0 }, { "at": "…", "latencyMs": null }] },
  "ipv6": { "status": "outage", "avgLatencyMs": null, "uptimePercent": 0, "samples": [] }
}
```

`windowSeconds` is the window actually covered by the samples (it grows from 0 after a restart up to the configured maximum); label uptime with it
(e.g. "Last 24 hours"), never claim a longer period. `latencyMs: null` in a sample is a failed probe.

### `GET /api/v1/activity`

Anonymous recent diagnostics (disabled with `{ "enabled": false, "items": [] }`).

```json
{ "enabled": true, "items": [{ "type": "ping", "target": "8.8.8.8", "summary": "12.4 ms avg, 0% loss", "at": "…" }] }
```

`type` ∈ `ping | traceroute | mtr | dns`.

## BGP (read-only, optional)

`GET /api/v1/bgp/routes`, `GET /api/v1/bgp/prefix/{prefix}`, `GET /api/v1/bgp/asn/{asn}`, `GET /api/v1/bgp/sessions`.
Until a BGP provider is configured every one of these returns `503` with `code: "bgp_unavailable"`. The UI must show the friendly empty state
("BGP information is currently unavailable. The Looking Glass is still operational.") and must not treat it as a broken page.

## Health and metrics

- `GET /health/live` – process liveness only.
- `GET /health/ready` – dependencies required to serve (never depends on Internet reachability).
- `GET /metrics` – Prometheus exposition. Served on the **management port** (9090) only, never through the ingress.

## Internal API (API ➜ Diagnostics)

The diagnostics service exposes the same request/response shapes at `/internal/v1/{ping,traceroute,mtr,dns}`, plus
`GET /internal/v1/connectivity` (performance snapshot, `PerformanceResponse`) and `GET /internal/v1/egress` (`{ "ipv4": "…", "ipv6": "…" }`).
It is reachable only from the API pods (NetworkPolicy) and re-validates every destination after DNS resolution.
