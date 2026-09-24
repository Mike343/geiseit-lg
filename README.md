# GeiseIT Network Looking Glass

A public network Looking Glass for **https://lg.geiseit.com**: IPv4/IPv6 ping, traceroute, MTR and DNS lookups from the
GeiseIT network, presented as a modern network-operations dashboard. It is a real production workload built to run on
GeiseIT-owned Kubernetes and to move unchanged to Amazon EKS Anywhere or any upstream Kubernetes.

- **Web** – Next.js (App Router, SSR), React, Tailwind CSS. Light/dark/system themes, responsive, accessible.
- **API** – ASP.NET Core (.NET 10). Validation, rate limiting, audit logging, status/network aggregation.
- **Diagnostics** – ASP.NET Core worker that runs `ping`, `traceroute` and `mtr` safely, resolves DNS, and measures connectivity.
- **Deploy** – Helm chart with Ingress + cert-manager TLS, NetworkPolicies, HPA, PDB, ServiceMonitor, Pod Security *restricted*.

```text
Ingress ─► web (Next.js) ──SSR reads──► api ─► diagnostics ─► Internet
        └► /api ─────────────────────► api
```

See [docs/architecture.md](docs/architecture.md) for the full picture.

## Repository layout

```text
src/Contracts     Shared contracts, destination policy (SSRF rules), hosting helpers
src/Api           Public API
src/Diagnostics   Diagnostics service
src/Web           Next.js frontend (own README)
tests/            xUnit tests (Contracts, Api, Diagnostics)
deploy/           Helm chart, environment values, GitOps examples, compose gateway
docs/             Architecture, security, configuration, deployment, EKS Anywhere, API reference
scripts/          Chart lint and smoke tests
```

## Run it locally

### With containers (recommended)

Needs Docker or Podman with compose. The gateway mirrors the production ingress (`/api` → API, everything else → web).

```bash
docker compose up --build
```

Open <http://localhost:8088>. On a machine without IPv6/ICMP egress, or to demo without touching the network, use the
simulated diagnostics override (results are clearly labelled as simulated):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Without containers

Real ping/traceroute/mtr need a Linux host with the tools installed (and, for non-root, `net.ipv4.ping_group_range`).
For UI work use simulated diagnostics:

```bash
Diagnostics__Simulated=true ASPNETCORE_URLS="http://localhost:5081;http://localhost:5091" Management__Port=5091 \
  dotnet run --project src/Diagnostics
Diagnostics__BaseUrl=http://localhost:5081 ASPNETCORE_URLS="http://localhost:5080;http://localhost:5090" Management__Port=5090 \
  dotnet run --project src/Api
cd src/Web && npm ci && npm run dev
```

The dev server proxies `/api` to `http://localhost:5080`.

## Test

```bash
dotnet test                       # Contracts, API and Diagnostics suites
cd src/Web && npm test            # frontend
sh scripts/lint-chart.sh          # helm lint + template matrix + kubeconform
```

The tests cover the security boundaries: injection and malformed input, every blocked address range (including mapped,
NAT64 and 6to4 forms), DNS-rebinding style answers, rate and concurrency limits, process timeout/cancellation/output
limits, error handling and port separation.

## Deploy

```bash
helm upgrade --install looking-glass deploy/helm/looking-glass \
  --namespace network-looking-glass --create-namespace \
  -f deploy/environments/production/values.yaml \
  -f deploy/private/values.production.yaml
```

`deploy/private/` is git-ignored and holds environment-specific values such as public IP addresses. Copy
`deploy/environments/production/values.private.example.yaml` there and fill in your own.

Prerequisites, image builds, upgrades, verification and troubleshooting: [docs/deployment.md](docs/deployment.md).
Running on Amazon EKS Anywhere: [docs/eks-anywhere.md](docs/eks-anywhere.md).

## Documentation

| Document | Contents |
|----------|----------|
| [docs/architecture.md](docs/architecture.md) | Components, request lifecycle, execution model, observability, scaling |
| [docs/security.md](docs/security.md) | Threat model, SSRF/abuse controls, blocked ranges, hardening, known limits |
| [docs/configuration.md](docs/configuration.md) | Every setting, defaults, aliases, ports, metrics |
| [docs/deployment.md](docs/deployment.md) | Helm installation and operations |
| [docs/eks-anywhere.md](docs/eks-anywhere.md) | Portability checklist and EKS Anywhere notes |
| [docs/api.md](docs/api.md) | HTTP API reference and error model |

## CI/CD

GitHub Actions (`.github/workflows`): build/test/lint, dependency and container scanning (Trivy, CodeQL), image builds with
immutable tags (`vX.Y.Z`, `git-<sha>`), automatic deploy to development, smoke tests, and a reviewer-gated production
deploy on release tags. GitOps examples for Flux and Argo CD are in `deploy/gitops`.

## Status of optional features

BGP (read-only routes, prefixes, sessions) is designed as a separate provider behind the API. The endpoints and UI pages
exist and degrade to a friendly "currently unavailable" state; no provider is bundled yet.
