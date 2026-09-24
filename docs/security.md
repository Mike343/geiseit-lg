# Security model

The Looking Glass runs network probes on behalf of anonymous Internet users, so the design assumes hostile input
and hostile destinations. The two things that must never happen are **arbitrary command execution** and **reaching
private infrastructure** (SSRF / internal discovery).

## Threats and controls

| Threat | Controls |
|--------|----------|
| Command / argument injection | No shell anywhere. Tools run through argument arrays; the only variable argument is an IP literal that the resolver produced. Visitors cannot supply flags. Destination syntax is validated with a strict parser (see below) in both API and diagnostics. |
| SSRF to internal ranges | Blocklist of all non-public IPv4/IPv6 ranges (below), applied to literals, to every address a hostname resolves to, and again immediately before execution. IPv4-mapped, NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`) forms are unwrapped and checked. Enforced again at the network layer by the diagnostics NetworkPolicy. |
| DNS rebinding | Hostnames are resolved once by the diagnostics service; the tool receives the resolved IP, never the name. If any resolved address is blocked, the request is rejected. |
| Internal name discovery | Internal suffixes are refused (`.local`, `.internal`, `.svc`, `.cluster.local`, `.lan`, `.home.arpa`, `.onion`, `in-addr.arpa`, …), single-label names are refused, extra suffixes are configurable. DNS lookups use configured public resolvers, never cluster DNS. |
| Numeric / obfuscated IPs | Only dotted-quad IPv4 without leading zeros is an IP. `127.1`, `2130706433`, `0x7f.0.0.1` and octal forms are hostnames with a numeric TLD and are rejected. IPv6 zone IDs, brackets and ports are rejected. |
| Topology disclosure | Traceroute/MTR hops in private, CGNAT or reserved space are redacted (no address, no hostname, timing kept). Technical output is rendered from the redacted structure – raw tool output is never returned. Tool stderr is logged, never returned. Error responses never include stack traces. |
| Abuse / DoS | Per-IP sliding-window limits per endpoint, per-IP concurrency cap, global concurrency semaphore with bounded queue, hard deadline, output-size cap, small request-body limits, cancellation kills processes. |
| Resource exhaustion via probes | Fixed probe counts and timeouts (configuration, not user input). Only one destination per request. |
| Privilege escalation in the pod | Non-root, `allowPrivilegeEscalation: false`, all capabilities dropped, read-only root filesystem, `seccompProfile: RuntimeDefault`, no service-account token, no host namespaces/mounts. Pod Security *restricted* compliant. |
| Lateral movement | Default-deny NetworkPolicies; diagnostics egress is Internet-only with private, link-local, CGNAT and loopback ranges excluded; no Kubernetes API access; no RBAC objects required. |
| Metrics / internal endpoints exposed | `/metrics` is served only on a separate management port, and the two ports are strictly separated in code (the public port never serves `/metrics`; the management port serves nothing else). The ingress routes only `/` and `/api`. |
| Log privacy | Client IPs are never logged in clear; a daily-rotating HMAC hash is used. Recent activity is anonymous, capped and expires (defaults: 10 items, 60 minutes) and can be disabled. |
| Supply chain | Central package version pinning, exact frontend versions and lockfile, image tags immutable (`vX.Y.Z`, `git-<sha>`), Trivy/CodeQL/dependency audits in CI, minimal runtime images (chiseled for the API). |

## Blocked destinations

IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`,
`192.0.2.0/24`, `192.88.99.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`,
`224.0.0.0/4`, `240.0.0.0/4` (includes broadcast).

IPv6: `::/96` (unspecified, loopback, IPv4-compatible), `64:ff9b:1::/48`, `100::/64`, `2001::/23` (Teredo and IETF
protocol assignments), `2001:db8::/32`, `2002::/16`, `3fff::/20`, `fc00::/7`, `fe80::/10`, `fec0::/10`, `ff00::/8`.

Metadata endpoints (`169.254.169.254`, `169.254.170.2`, `100.100.100.200`, `fd00:ec2::254`) are additionally listed
explicitly. Add cluster-specific ranges (pod/service CIDRs that are not RFC 1918, your own public ranges you do not want
probed) with `Security__ExtraBlockedCidrs`.

## Client IP handling

Per-IP limits are only as good as the client address. The API trusts `X-Forwarded-For` **only** from
`Network__TrustedProxies` (default: RFC 1918, loopback, ULA) and honours `Network__ForwardLimit` hops. Make sure the
ingress sees real client addresses (`externalTrafficPolicy: Local`, PROXY protocol, or a trusted upstream) and that
untrusted networks cannot reach the API pods directly. See `docs/deployment.md`.

## Known limitations and hardening options

- Rate limits and concurrency guards are per API replica. For strict global limits add ingress-level limiting
  (e.g. ingress-nginx `limit-rps`) or a shared limiter.
- Anyone can probe any public destination from GeiseIT's address space within the limits. Acceptable-use text is on
  the About page; add an abuse contact and, if abuse becomes significant, a challenge (Turnstile/CAPTCHA) in front of
  the diagnostics endpoints.
- ICMP time-exceeded replies from private hops rely on the CNI's related-ICMP conntrack handling under the egress
  NetworkPolicy; verify traceroute on your CNI.
- The public API is intended for the bundled web app. If a public API is offered later it needs API keys, quotas
  and stricter limits.
- Web: strict nonce-based CSP, `frame-ancestors 'none'`, `X-Content-Type-Options`, restrictive `Permissions-Policy`.

## Security tests

The security boundary is covered by automated tests: destination parsing (injection, URL, obfuscated IPs,
oversize), every blocked range including mapped/NAT64/6to4 forms, hostnames resolving to blocked or mixed addresses,
that no probe or process is ever started for a rejected destination, argument arrays and shell metacharacters passed
verbatim, redaction of internal hops, process timeout/cancellation/output-limit behaviour, rate limits and
concurrency caps, malformed/oversized/wrong-content-type requests, error responses that do not leak details, and
port separation of `/metrics`.
