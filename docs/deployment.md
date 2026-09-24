# Deployment guide

The Looking Glass runs as three workloads installed by one Helm chart (`deploy/helm/looking-glass`):

| Workload | Image | Role | Ports |
|---|---|---|---|
| `web` | `looking-glass-web` (context `src/Web`) | Next.js server (SSR). Calls the API server-side through `API_INTERNAL_URL`. | 8080 |
| `api` | `looking-glass-api` (`src/Api/Dockerfile`, context = repo root) | Public REST API, validation, rate limiting | 8080 (`/api/v1/*`, `/health/*`), 9090 (`/metrics`) |
| `diagnostics` | `looking-glass-diagnostics` (`src/Diagnostics/Dockerfile`, context = repo root) | Runs ping, traceroute, mtr and DNS queries. Internet egress only. | 8080 (`/internal/v1/*`, `/health/*`), 9090 (`/metrics`) |

The ingress sends `/api` to the API and everything else to the web workload. `/metrics` and `/health/*` are never routed to the API from the outside; the management port 9090 is reachable only from the monitoring namespace.

## Prerequisites

- Kubernetes 1.27 or newer, with a CNI that enforces NetworkPolicy (Cilium, Calico, Antrea, ...). Without enforcement the policies are silently ignored.
- An ingress controller. The defaults assume ingress-nginx in the `ingress-nginx` namespace.
- cert-manager with a `ClusterIssuer` (below).
- Optional: the Prometheus Operator CRDs (`monitoring.coreos.com/v1`) for the ServiceMonitor, PodMonitor and PrometheusRule, and a Grafana with the dashboard sidecar.
- Helm 3.14+ (Helm 4 also works), `kubectl`.
- Nodes must have public IPv4 (and IPv6 if you want IPv6 diagnostics) egress from the pod network.

### ClusterIssuer example

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

Create a second issuer named `letsencrypt-staging` (server `https://acme-staging-v02.api.letsencrypt.org/directory`) for development.

## Building and pushing images

```sh
OWNER=registry.geiseit.com/geiseit-lg
TAG=v1.0.0               # or git-$(git rev-parse --short=12 HEAD)

docker build -t $OWNER/web:$TAG         src/Web
docker build -t $OWNER/api:$TAG         -f src/Api/Dockerfile .
docker build -t $OWNER/diagnostics:$TAG -f src/Diagnostics/Dockerfile .

docker push $OWNER/web:$TAG   # and the other two
```

The API and diagnostics images build from the repository root because they share `src/Contracts`. Use immutable tags (`vX.Y.Z`, `git-<sha>`); the chart never defaults to `latest`. When the registry is private, create a pull secret and set `web.imagePullSecrets`, `api.imagePullSecrets` and `diagnostics.imagePullSecrets`. To pin by digest set `<workload>.image.digest`.

CI builds and pushes these images automatically (see [CI/CD](#cicd)).

## Installing

Development:

```sh
helm upgrade --install looking-glass deploy/helm/looking-glass \
  --namespace network-looking-glass --create-namespace \
  -f deploy/environments/development/values.yaml \
  --set-string web.image.tag=$TAG --set-string api.image.tag=$TAG --set-string diagnostics.image.tag=$TAG \
  --atomic --wait
```

Production:

```sh
helm upgrade --install looking-glass deploy/helm/looking-glass \
  --namespace network-looking-glass --create-namespace \
  -f deploy/environments/production/values.yaml \
  -f deploy/private/values.production.yaml \
  -f secrets.yaml \
  --set-string web.image.tag=v1.0.0 --set-string api.image.tag=v1.0.0 --set-string diagnostics.image.tag=v1.0.0 \
  --atomic --wait
```

`secrets.yaml` is never committed (`deploy/environments/**/secrets*.yaml` is git-ignored); start from `deploy/environments/production/secrets.example.yaml`. The application has no mandatory secrets today. The wiring exists for values such as `OTEL_EXPORTER_OTLP_HEADERS` (`api.secretEnv` / `diagnostics.secretEnv`) or an existing Secret (`api.existingSecret`).

Pod Security Admission: either let the chart own the namespace (`--set namespace.create=true`, do not also pass `--create-namespace`), or label it yourself:

```sh
kubectl label ns network-looking-glass pod-security.kubernetes.io/enforce=restricted
```

All three workloads satisfy the `restricted` profile in the default configuration.

Environment files only hold differences from the chart defaults. Set `lookingGlass.asn`, `lookingGlass.ipv4` and `lookingGlass.ipv6` to publish the network details; leave the addresses empty for auto-detection. Keep your real addresses out of Git: put them in `deploy/private/values.production.yaml` (git-ignored; see `deploy/environments/production/values.private.example.yaml`) and pass it as a second `-f` file.

## Upgrading and rolling back

```sh
helm upgrade looking-glass deploy/helm/looking-glass -n network-looking-glass -f deploy/environments/production/values.yaml -f secrets.yaml --set-string ...tag=v1.0.1 --atomic --wait
helm history looking-glass -n network-looking-glass
helm rollback looking-glass <revision> -n network-looking-glass --wait
```

Deployments use `maxUnavailable: 0`, pod disruption budgets keep at least one pod of each workload, and diagnostics has a 60 s termination grace period so running probes finish. ConfigMap changes roll the pods through a `checksum/config` annotation. Changes to an `existingSecret` do not; restart with `kubectl rollout restart`.

With one replica a PodDisruptionBudget of `minAvailable: 1` blocks node drains; the development file disables the PDBs for that reason.

## Verifying

```sh
kubectl -n network-looking-glass get pods,hpa,pdb,ingress,certificate
helm test looking-glass -n network-looking-glass
sh scripts/smoke-test.sh https://lg.geiseit.com
```

`helm test` runs a pod inside the namespace that requests web `/healthz`, api `/health/ready` and `/api/v1/status`. The smoke test runs from outside and checks `/healthz`, `/api/v1/status`, `/api/v1/network`, that `/metrics` is not exposed, a ping to a public address (`SMOKE_PING_TARGET`, skip with `SMOKE_SKIP_PING=1`), and that private, loopback, link-local, metadata and internal names plus malformed input are rejected with 4xx. Set `SMOKE_INSECURE=1` for the Let's Encrypt staging certificate.

Health endpoints are not routed through the ingress. To reach them directly:

```sh
kubectl -n network-looking-glass port-forward deploy/looking-glass-api 8080:8080 9090:9090
curl localhost:8080/health/ready
curl localhost:9090/metrics | head
```

Metrics live on the management port (9090). With `monitoring.serviceMonitor.enabled=true` the Prometheus Operator scrapes both the api and the diagnostics Services; set `monitoring.serviceMonitor.labels` to whatever label your Prometheus selects on (for kube-prometheus-stack that is `release: <helm release name>`). The chart only renders these objects when the `monitoring.coreos.com/v1` API exists, so a plain `helm template` needs `--api-versions monitoring.coreos.com/v1`.

Alerts (`monitoring.prometheusRule.enabled`): target down, failure ratio (`looking_glass_requests_failed_total`), rejected diagnostics (`looking_glass_diagnostics_rejected_total`), diagnostics saturation (`looking_glass_diagnostics_active`), p95 request duration (`looking_glass_request_duration_seconds`). The Grafana dashboard ConfigMap (`monitoring.grafanaDashboard.enabled`) is labelled `grafana_dashboard: "1"`.

## Why diagnostics needs a sysctl

Ping needs ICMP sockets. Historically that meant raw sockets (`CAP_NET_RAW`) or a setuid `ping`, both of which conflict with the hardened container profile (`allowPrivilegeEscalation: false`, all capabilities dropped, non-root, read-only root filesystem).

Linux also allows unprivileged ICMP echo through datagram sockets (`SOCK_DGRAM`, `IPPROTO_ICMP`/`IPPROTO_ICMPV6`) for processes whose group id is inside `net.ipv4.ping_group_range`. The kernel default is `1 0`, an empty range, so nobody qualifies. The chart sets it on the diagnostics pod:

```yaml
securityContext:
  sysctls:
    - name: net.ipv4.ping_group_range
      value: "0 2147483647"
```

This is a namespaced sysctl on the Kubernetes safe list (since 1.18), so the kubelet accepts it without `--allowed-unsafe-sysctls` and Pod Security `restricted` allows it. It only affects that pod's network namespace and covers IPv4 and IPv6. Remove it with `diagnostics.icmp.pingGroupRange=""` if your runtime forbids it.

Fallback: `diagnostics.netRawFallback.enabled=true` additionally adds `NET_RAW`. Use it only on runtimes or CNIs where the sysctl route does not work (for example a sandboxed runtime that ignores the sysctl). Consequences:

- Pod Security rejects an explicit `NET_RAW` under both `restricted` and `baseline`. The namespace must not enforce those levels for this workload (the chart refuses to render a `restricted` namespace together with the fallback).
- A non-root process with `allowPrivilegeEscalation: false` does not gain the capability in its effective set unless the binary is granted it some other way, so verify the behaviour on your runtime before relying on it.

Tools that need raw sockets themselves (`mtr` in raw ICMP mode, `traceroute -I`) depend on how the diagnostics image invokes them; check `Diagnostics__Simulated=false` results after every runtime change.

### ICMP and traceroute replies

The diagnostics NetworkPolicy allows egress only to public addresses. Traceroute and mtr receive ICMP time-exceeded and destination-unreachable messages from intermediate routers, often from private source addresses (the provider's internal hops). Those are inbound packets that the ingress rules do not list; they get through only because the CNI's connection tracking recognises them as ICMP related to an allowed outbound flow. Cilium, Calico and other conntrack-based CNIs do this, but implementations and versions differ. After installation run a traceroute and confirm that internal hops appear as "Internal network" hops rather than timeouts. If they show as timeouts consistently, the CNI is dropping related ICMP.

The egress `except` list (10/8, 172.16/12, 192.168/16, 100.64/10, 169.254/16, 127/8, fc00::/7, fe80::/10) mirrors the application's SSRF blocklist so a compromised diagnostics process still cannot reach the Kubernetes API, the service network, nodes or cloud metadata endpoints. Add publicly routable pod or service CIDRs with `networkPolicy.diagnostics.extraExceptCidrs`. DNS uses the public resolvers in `Dns__Resolvers`, so no cluster DNS rule is created; set `networkPolicy.diagnostics.allowClusterDns=true` only if you point the resolvers at kube-dns.

Other NetworkPolicy notes:

- web egress: api pods on 8080 and kube-dns. api egress: diagnostics pods on 8080, kube-dns, and optionally an OTLP collector (`networkPolicy.otlpEgress`). api ingress: the ingress controller and web pods on 8080, the monitoring namespace on 9090.
- If the ingress controller runs with `hostNetwork`, a namespace selector does not match its traffic; allow the node CIDRs with your own additional policy.
- Kubelet probes originate from the node. Cilium, Calico and most CNIs always allow node-to-local-pod traffic; verify this on others.

## Preserving the client IP

Per-IP rate limiting is meaningless if every request appears to come from the ingress controller. The API reads `X-Forwarded-For` only from proxies listed in `Network__TrustedProxies` (default: the RFC1918 ranges; `api.config.trustedProxies`) and honours at most `Network__ForwardLimit` hops (`api.config.forwardLimit`, default 1).

1. Make the ingress controller see the real client address: on the controller Service use `externalTrafficPolicy: Local` (MetalLB and kube-vip honour it), or enable PROXY protocol on both the load balancer and the controller (`use-proxy-protocol: "true"`).
2. When another proxy or CDN sits in front, set `use-forwarded-headers: "true"` on ingress-nginx and raise `api.config.forwardLimit` by one per additional trusted hop.
3. The ingress controller pods must fall inside `trustedProxies`. The default covers the usual pod CIDRs; add your range if the pod network uses `100.64.0.0/10` or public addresses.

Check with a request from a known address and confirm the API log's hashed client address changes between clients.

## CI/CD

The repository is assumed to live on GitHub.

| Workflow | Trigger | Does |
|---|---|---|
| `.github/workflows/ci.yml` | push to `main`, pull requests | .NET restore/build/test; Web `npm ci`, lint, typecheck, test, build; NuGet vulnerability check, `npm audit --audit-level=high`, Trivy filesystem scan; chart lint + kubeconform (`scripts/lint-chart.sh`); hadolint; shellcheck |
| `.github/workflows/codeql.yml` | push, PR, weekly | CodeQL for C# and JavaScript/TypeScript |
| `.github/workflows/release.yml` | push to `main`, tags `vX.Y.Z` | Build the three images, Trivy image scan (fails on HIGH/CRITICAL), push `git-<sha>` (plus `vX.Y.Z` for tags) to registry.geiseit.com with SBOM and provenance attestations, deploy to development, run helm test and smoke tests, then (tags only) deploy to production |
| `.github/dependabot.yml` | weekly | NuGet, npm (`src/Web`), Docker, GitHub Actions |

Repository setup:

- Environments `development` and `production`. Add required reviewers to `production`; that is the approval gate.
- Environment secrets in both: `KUBECONFIG_B64` (base64 kubeconfig for a service account limited to the `network-looking-glass` namespace) and optionally `HELM_VALUES_OVERLAY` (contents of a secrets values file).
- Optional repository variable `DEPLOY_RUNNER` to run deploy jobs on a self-hosted runner when the cluster API is not reachable from GitHub-hosted runners. The smoke tests need the public URL to be reachable from that runner.
- Environment (or repository) secrets `REGISTRY_USERNAME` and `REGISTRY_PASSWORD` for registry.geiseit.com (a robot/service account with push rights), plus an image pull secret in the `network-looking-glass` namespace if the registry is private (set `<workload>.imagePullSecrets`).
- The development URL is `https://lg.dev.geiseit.com` (staging certificate, so `SMOKE_INSECURE=1`); change it in `release.yml` and the environment values together.

Web scripts expected in `src/Web/package.json`: `lint`, `typecheck`, `test`, `build`.

## GitOps

`deploy/gitops/flux/` (GitRepository + HelmRelease) and `deploy/gitops/argocd/application.yaml` deploy the chart straight from Git with the production values. Edit the repository URL. Release a new version by bumping the image tags in a values file (or `Chart.yaml` `appVersion`) in Git; the controllers apply the change. Keep secrets in a Flux `valuesFrom` Secret (SOPS or External Secrets) or Argo CD's own secret management, never in the repository.

## Local full stack

```sh
docker compose up --build                                    # http://localhost:8088
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build   # simulated diagnostics, management ports on 9090/9091
```

Only the `gateway` publishes a port (8088). It mimics the ingress: `/api/` to the API, everything else to web. The `dev` override enables `Diagnostics__Simulated=true` for machines without ICMP or IPv6 egress and publishes the management ports on 127.0.0.1. The diagnostics container runs read-only with all capabilities dropped and the same `ping_group_range` sysctl as the chart. Works with `docker compose` and `podman-compose`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Pod `Forbidden: unsafe sysctl` or `SysctlForbidden` | Runtime or PSP-like policy rejects the sysctl | Use a runtime that permits `net.ipv4.ping_group_range`, or `diagnostics.netRawFallback.enabled` with a relaxed namespace |
| Pods rejected by admission (`violates PodSecurity`) | A value override broke the restricted profile, or NET_RAW fallback under `restricted` | Inspect the message; keep `runAsNonRoot`, `drop: [ALL]`, `seccompProfile: RuntimeDefault` |
| Ping returns `diagnostic_failed` for every target | ICMP sockets unavailable | Check the sysctl in the pod (`cat /proc/sys/net/ipv4/ping_group_range`), the runtime, and egress policy |
| IPv6 targets fail | No IPv6 egress from the cluster | Expected without dual-stack; the status page reports IPv6 as outage |
| Traceroute shows timeouts for internal hops | CNI drops related ICMP | See "ICMP and traceroute replies" |
| Site works but everyone shares one rate limit | Client IP not preserved or ingress not in `trustedProxies` | See "Preserving the client IP" |
| 504 / 502 through the ingress | Proxy timeout below the diagnostic time budget | Keep `proxy-read-timeout` at 60 s or more with `Diagnostics__TimeoutSeconds` 45 |
| Ingress 404 or default backend | Wrong `ingress.className`, or DNS not pointing at the controller | `kubectl get ingressclass`; set `ingress.className` |
| Certificate stays `False` | ClusterIssuer name mismatch, HTTP-01 blocked | `kubectl describe certificate,order,challenge`; check `ingress.certManager.clusterIssuer` |
| Ingress returns 503 / connection resets after enabling NetworkPolicy | Ingress controller namespace labels differ | Set `networkPolicy.ingressControllerNamespaceSelector` (and `ingressControllerPodSelector`) |
| web pods cannot reach the API | `API_INTERNAL_URL` wrong, DNS blocked | `kubectl -n network-looking-glass get cm looking-glass-web -o yaml`; check `networkPolicy.dns` selectors |
| Prometheus shows no targets | ServiceMonitor not rendered or label mismatch | Enable it, pass `--api-versions monitoring.coreos.com/v1` for `helm template`, set `monitoring.serviceMonitor.labels` |
| Scraping fails after enabling NetworkPolicy | Monitoring namespace labels differ | `networkPolicy.monitoringNamespaceSelector` |
| `helm upgrade` rolls back with `--atomic` | Readiness failing | `kubectl describe pod`, `kubectl logs`; web probes `/healthz`, api and diagnostics `/health/ready` |
| ImagePullBackOff | Missing or wrong pull secret | Create a pull secret and set `<workload>.imagePullSecrets` |
| Node drain hangs | PDB `minAvailable: 1` with a single replica | Run 2 or more replicas, or disable the PDB |
| Read-only filesystem error in web logs | Extra writable path needed by the image | Add it under `web.extraEmptyDirs` |
