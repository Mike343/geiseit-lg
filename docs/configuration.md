# Configuration reference

All settings are externalised. Use environment variables (ASP.NET style: `Section__Key`, e.g. `RateLimiting__Ping__PermitLimit`),
ConfigMaps and Secrets. Nothing environment-specific is baked into images and no secrets are required by the application.
In Kubernetes these are set through the Helm values (see `deploy/helm/looking-glass/README.md`).

Invalid values fail the pod at startup (validated options), so a bad rollout is caught by the readiness gate rather than at runtime.
List values are comma separated.

## Friendly aliases

These short variables are accepted by the services and map onto the keys below. An explicit `Section__Key` variable always wins.

| Alias | Maps to |
|-------|---------|
| `LOOKING_GLASS_LOCATION` | `LookingGlass__Location` |
| `LOOKING_GLASS_HOSTNAME` | `LookingGlass__Hostname` |
| `LOOKING_GLASS_ASN` | `LookingGlass__Asn` |
| `LOOKING_GLASS_NETWORK` | `LookingGlass__Network` |
| `LOOKING_GLASS_IPV4` / `LOOKING_GLASS_IPV6` | `LookingGlass__Ipv4` / `LookingGlass__Ipv6` |
| `DIAGNOSTICS_TIMEOUT_SECONDS` | `Diagnostics__TimeoutSeconds` |
| `DIAGNOSTICS_MAX_CONCURRENT` | `Diagnostics__MaxConcurrent` |
| `RATE_LIMIT_PING` / `_TRACEROUTE` / `_MTR` / `_DNS` | `RateLimiting__<Endpoint>__PermitLimit` (requests per window) |

## Ports

| Service | Public/internal | Management |
|---------|-----------------|------------|
| web | `8080` | – |
| api | `8080` (`/api/v1`, `/health/*`) | `9090` (`/metrics` only; `Management__Port`) |
| diagnostics | `8080` (`/internal/v1`, `/health/*`) | `9090` (`/metrics` only) |

The images set `ASPNETCORE_URLS=http://+:8080;http://+:9090`. When running outside a container, set `ASPNETCORE_URLS` and
`Management__Port` so that the management port is one of the bound ports.

## API (`looking-glass-api`)

| Key | Default | Description |
|-----|---------|-------------|
| `LookingGlass__Location` | `GeiseIT Network` | Location label shown in the UI |
| `LookingGlass__Hostname` | `lg.geiseit.com` | Public hostname shown in the UI |
| `LookingGlass__Asn` | – | ASN, with or without `AS` prefix; hidden when unset/invalid |
| `LookingGlass__Network` | `GeiseIT` | Operator/network name |
| `LookingGlass__Ipv4`, `LookingGlass__Ipv6` | auto | Public addresses to show. When empty, the diagnostics service's discovered egress addresses are used |
| `Diagnostics__BaseUrl` | `http://localhost:5081` | Base URL of the diagnostics service (`http://<release>-diagnostics:8080` in Kubernetes) |
| `Diagnostics__TimeoutSeconds` | `45` (5–300) | API-side wait budget (`+10 s` HTTP client margin) |
| `RateLimiting__Ping__PermitLimit` … `Dns` | `10` / `5` (traceroute) / `3` (mtr) / `20` (dns) | Requests per window per client IP |
| `RateLimiting__<Endpoint>__WindowSeconds` | `60` | Sliding window length |
| `RateLimiting__Info__PermitLimit` | `120` | Limit for status/network/activity/BGP reads |
| `RateLimiting__MaxConcurrentPerIp` | `2` | Diagnostics in flight per client IP |
| `Network__TrustedProxies` | RFC 1918, loopback, ULA | Sources allowed to set `X-Forwarded-For` (CIDRs or IPs) |
| `Network__ForwardLimit` | `1` | Number of forwarded hops to honour |
| `Security__ExtraBlockedCidrs` | – | Additional blocked destination ranges |
| `Security__ExtraBlockedSuffixes` | – | Additional blocked hostname suffixes |
| `Activity__Enabled` | `true` | Show anonymous recent diagnostics |
| `Activity__RetentionMinutes` | `60` | How long activity entries are kept |
| `Activity__MaxItems` | `10` | Maximum entries kept |
| `Bgp__Enabled` | `false` | Reserved. BGP endpoints answer `bgp_unavailable` until a provider exists |
| `Management__Port` | `9090` | Port that serves `/metrics` |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, … | – | Standard OpenTelemetry variables; tracing is exported only when the endpoint is set |

## Diagnostics (`looking-glass-diagnostics`)

| Key | Default | Description |
|-----|---------|-------------|
| `Diagnostics__TimeoutSeconds` | `45` (5–300) | Hard deadline for one diagnostic |
| `Diagnostics__MaxConcurrent` | `4` (1–64) | Diagnostics executing at once per pod |
| `Diagnostics__MaxQueued` | `16` | Requests allowed to wait for a slot; beyond that `503 busy` |
| `Diagnostics__QueueWaitSeconds` | `10` | Longest a request waits for a slot |
| `Diagnostics__MaxOutputBytes` | `65536` | Tool output cap; exceeding it kills the process |
| `Diagnostics__RedactPrivateHops` | `true` | Hide addresses/names of private hops in traceroute/MTR |
| `Diagnostics__ReverseDns` | `true` | Reverse-resolve public hop addresses |
| `Diagnostics__Simulated` | `false` | **Development only.** Fake probe results; responses are flagged `simulated: true` and the UI shows a banner |
| `Diagnostics__Ping__Count` / `IntervalSeconds` / `PacketTimeoutSeconds` | `5` / `0.5` / `2` | Ping shape |
| `Diagnostics__Traceroute__MaxHops` / `Queries` / `WaitSeconds` | `30` / `3` / `2` | Traceroute shape |
| `Diagnostics__Mtr__Cycles` / `IntervalSeconds` / `GraceSeconds` / `MaxHops` | `5` / `1` / `2` / `30` | MTR shape (the interval is limited to 1–5 s) |
| `Diagnostics__Tools__Ping` / `Traceroute` / `Mtr` | `/usr/bin/ping` … | Tool paths. Readiness fails if a tool is missing (unless simulated) |
| `Dns__Resolvers` | `1.1.1.1,9.9.9.9,8.8.8.8` | Resolvers used for all lookups (IP addresses only). Use your own resolvers if egress to these is restricted |
| `Dns__TimeoutSeconds`, `Dns__Retries` | `3`, `1` | Resolver timeout and retries |
| `Connectivity__Enabled` | `true` | Periodic connectivity sampling |
| `Connectivity__IntervalSeconds` | `60` | Sample interval |
| `Connectivity__WindowSeconds` | `86400` | Retention window |
| `Connectivity__ProbeTimeoutSeconds` | `3` | TCP connect timeout |
| `Connectivity__Ipv4Targets`, `Connectivity__Ipv6Targets` | Cloudflare/Google anchors on `:443` | `ip:port` list (IPv6 as `[addr]:port`). An empty list marks that family "not configured" |
| `Egress__Enabled` | `true` | Discover public addresses by asking an echo service |
| `Egress__Ipv4`, `Egress__Ipv6` | – | Static override (skips discovery for that family) |
| `Egress__Ipv4Url`, `Egress__Ipv6Url` | `https://api.ipify.org`, `https://api6.ipify.org` | Discovery endpoints |
| `Egress__CacheMinutes` | `10` | Discovery cache |
| `Security__ExtraBlockedCidrs`, `Security__ExtraBlockedSuffixes` | – | Same as API; set both consistently |
| `Management__Port` | `9090` | Port that serves `/metrics` |

## Web (`looking-glass-web`)

| Key | Default | Description |
|-----|---------|-------------|
| `API_INTERNAL_URL` | `http://localhost:5080` | Base URL the server uses to fetch initial data from the API (`http://<release>-api:8080` in Kubernetes) |
| `PORT` | `8080` | Listen port |

## Metrics

| Metric | Service | Meaning |
|--------|---------|---------|
| `looking_glass_requests_total{type}` | api, diagnostics | Requests handled |
| `looking_glass_requests_failed_total{type,reason}` | api, diagnostics | Failures by problem code |
| `looking_glass_request_duration_seconds{type}` | api, diagnostics | Duration histogram |
| `looking_glass_diagnostics_active` | api, diagnostics | In flight |
| `looking_glass_diagnostics_rejected_total{reason}` | api, diagnostics | Rejections (`rate_limited`, `concurrency`, `validation_failed`, `destination_blocked`, `busy`, `queue_full`, `queue_timeout`) |
| `looking_glass_packet_loss{family}` | diagnostics | Connectivity probe loss % over the window |
| `looking_glass_latency_seconds{family}` | diagnostics | Average probe latency over the window |
| `looking_glass_connectivity_up{family}` | diagnostics | Last probe succeeded |
| `looking_glass_bgp_sessions`, `looking_glass_bgp_routes` | api | Reserved (0 until a BGP provider exists) |

Standard `http_request_*` and .NET runtime metrics are exported as well.
