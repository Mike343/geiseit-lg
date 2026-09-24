# looking-glass Helm chart

Deploys the GeiseIT Network Looking Glass: a Next.js `web` server, the ASP.NET Core `api`, and the `diagnostics` worker that runs ping, traceroute, mtr and DNS lookups. The chart is portable Kubernetes (>= 1.27) with no cloud-specific dependencies. See `docs/deployment.md` and `docs/eks-anywhere.md` for the operational guides.

```sh
helm upgrade --install looking-glass deploy/helm/looking-glass \
  --namespace network-looking-glass --create-namespace \
  -f deploy/environments/production/values.yaml \
  -f deploy/private/values.production.yaml
helm test looking-glass -n network-looking-glass
```

Object names are `<fullname>-web`, `<fullname>-api`, `<fullname>-diagnostics`. With the default release name `looking-glass` the fullname is `looking-glass`.

## What is rendered

| Object | web | api | diagnostics |
|---|---|---|---|
| Deployment (RollingUpdate, `maxUnavailable: 0`) | yes | yes | yes |
| Service (`http` 8080) | yes | yes (+ `metrics` 9090) | yes (+ `metrics` 9090) |
| ServiceAccount (`automountServiceAccountToken: false`) | yes | yes | yes |
| ConfigMap (env via `envFrom`) | yes | yes | yes |
| Secret (`secretEnv`, or `existingSecret`) | - | optional | optional |
| HorizontalPodAutoscaler (`autoscaling/v2`) | yes | yes | yes |
| PodDisruptionBudget (`minAvailable: 1`) | yes | yes | yes |
| NetworkPolicy (plus a namespace-wide default deny for these pods) | yes | yes | yes |

Shared objects: Ingress, Namespace (`namespace.create`), Role/RoleBinding (`rbac.create`), ResourceQuota (`quota.enabled`), LimitRange (`limitRange.enabled`), ServiceMonitor/PodMonitor/PrometheusRule (need the `monitoring.coreos.com/v1` API), Grafana dashboard ConfigMap, and a `helm test` pod.

The optional BGP workload is reserved: `bgp.enabled` renders nothing and only sets `Bgp__Enabled` on the API. No BGP image exists yet.

## Values

Every key below is in `values.yaml`; `values.schema.json` validates types and enums. Lists are joined with commas for the environment variables that take comma separated values.

### General

| Key | Default | Description |
|---|---|---|
| `nameOverride`, `fullnameOverride` | `""` | Standard name overrides (fullname is truncated to 50 characters). |
| `revisionHistoryLimit` | `3` | Deployment revision history. |
| `ports.http` / `ports.metrics` | `8080` / `9090` | Container ports. Must match the images. |
| `probeDefaults.{startup,readiness,liveness}` | see file | Timing for the three probes. Startup allows about 60 s. |
| `scheduling.podAntiAffinity.enabled` | `true` | Soft anti-affinity on hostname. |
| `scheduling.topologySpread.*` | enabled, `maxSkew: 1`, `kubernetes.io/hostname`, `ScheduleAnyway` | Topology spread constraint applied to every workload. |
| `namespace.create` | `false` | Render a Namespace with Pod Security Admission labels. Use it instead of `--create-namespace`, not with it. |
| `namespace.podSecurity.{enforce,audit,warn,version}` | `restricted` / `restricted` / `restricted` / `latest` | PSA labels. |

### Application settings

| Key | Env var | Default |
|---|---|---|
| `lookingGlass.location` | `LookingGlass__Location` | `GeiseIT Network` |
| `lookingGlass.hostname` | `LookingGlass__Hostname` | `lg.geiseit.com` (falls back to `ingress.host`) |
| `lookingGlass.asn` | `LookingGlass__Asn` | empty (omitted) |
| `lookingGlass.network` | `LookingGlass__Network` | `GeiseIT` |
| `lookingGlass.ipv4`, `lookingGlass.ipv6` | `LookingGlass__Ipv4`, `LookingGlass__Ipv6` | empty (omitted, auto-detected) |
| `security.extraBlockedCidrs` | `Security__ExtraBlockedCidrs` (api and diagnostics) | `[]` |
| `security.extraBlockedSuffixes` | `Security__ExtraBlockedSuffixes` (api and diagnostics) | `[]` |
| `otel.endpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` (api and diagnostics) | empty (omitted) |
| `bgp.enabled` | `Bgp__Enabled` | `false` |
| `api.config.diagnosticsBaseUrl` | `Diagnostics__BaseUrl` | `http://<fullname>-diagnostics:8080` |
| `api.config.diagnosticsTimeoutSeconds` | `Diagnostics__TimeoutSeconds` | `45` |
| `api.config.rateLimiting.pingPerMinute` | `RateLimiting__Ping__PermitLimit` | `10` |
| `api.config.rateLimiting.traceroutePerMinute` | `RateLimiting__Traceroute__PermitLimit` | `5` |
| `api.config.rateLimiting.mtrPerMinute` | `RateLimiting__Mtr__PermitLimit` | `3` |
| `api.config.rateLimiting.dnsPerMinute` | `RateLimiting__Dns__PermitLimit` | `20` |
| `api.config.rateLimiting.maxConcurrentPerIp` | `RateLimiting__MaxConcurrentPerIp` | `2` |
| `api.config.trustedProxies` | `Network__TrustedProxies` | RFC1918 ranges |
| `api.config.forwardLimit` | `Network__ForwardLimit` | `1` |
| `api.config.activity.{enabled,retentionMinutes,maxItems}` | `Activity__Enabled`, `Activity__RetentionMinutes`, `Activity__MaxItems` | `true`, `60`, `10` |
| `diagnostics.config.maxConcurrent` | `Diagnostics__MaxConcurrent` | `4` |
| `diagnostics.config.maxQueued` | `Diagnostics__MaxQueued` | `16` |
| `diagnostics.config.timeoutSeconds` | `Diagnostics__TimeoutSeconds` | `45` |
| `diagnostics.config.maxOutputBytes` | `Diagnostics__MaxOutputBytes` | `65536` |
| `diagnostics.config.redactPrivateHops` | `Diagnostics__RedactPrivateHops` | `true` |
| `diagnostics.config.simulated` | `Diagnostics__Simulated` | `false` (development only) |
| `diagnostics.config.dnsResolvers` | `Dns__Resolvers` | `1.1.1.1, 9.9.9.9, 8.8.8.8` |
| `diagnostics.config.connectivity.intervalSeconds` | `Connectivity__IntervalSeconds` | `60` |
| `diagnostics.config.connectivity.windowSeconds` | `Connectivity__WindowSeconds` | `86400` |
| `diagnostics.config.connectivity.ipv4Targets` | `Connectivity__Ipv4Targets` | `1.1.1.1:443, 8.8.8.8:443` |
| `diagnostics.config.connectivity.ipv6Targets` | `Connectivity__Ipv6Targets` | Cloudflare and Google DNS on 443 |
| `diagnostics.config.egress.{ipv4,ipv6}` | `Egress__Ipv4`, `Egress__Ipv6` | empty (omitted) |
| `web.config.apiInternalUrl` | `API_INTERNAL_URL` | `http://<fullname>-api:8080` |
| `web.config.nodeEnv` | `NODE_ENV` | `production` |
| `<workload>.config.extra` | any | `{}`; extra ConfigMap entries |
| `<workload>.secretEnv` (api, diagnostics) | any | `{}`; creates a Secret consumed with `envFrom` (for example `OTEL_EXPORTER_OTLP_HEADERS`) |
| `<workload>.existingSecret` (api, diagnostics) | any | `""`; use an existing Secret instead. The chart cannot detect changes in it, so restart the pods after editing. |

`OTEL_SERVICE_NAME` is set per workload (`looking-glass-api`, `looking-glass-diagnostics`).

### Per workload (`web`, `api`, `diagnostics`)

| Key | Default |
|---|---|
| `image.registry` / `image.repository` | `registry.geiseit.com` / `geiseit-lg/<workload>` |
| `image.tag` | `""` (uses `.Chart.AppVersion`, `1.0.0`; never `latest`) |
| `image.digest` | `""`; when set it wins over the tag |
| `image.pullPolicy` | `IfNotPresent` |
| `imagePullSecrets` | `[]` |
| `replicaCount` | `2` (ignored while autoscaling is enabled) |
| `podSecurityContext` | non-root, uid/gid/fsGroup `10001` for all three (override per workload to match the image), `seccompProfile: RuntimeDefault` |
| `containerSecurityContext` | `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, drop `ALL` |
| `probes.livenessPath` / `probes.readinessPath` | web `/healthz` for both; api and diagnostics `/health/live` and `/health/ready`. Startup probe uses the liveness path. |
| `probes.initialDelaySeconds.{startup,readiness,liveness}` | web `5/5/10`, others `0` |
| `resources` | web `100m/192Mi` requests, `500m/384Mi` limits; api `100m/128Mi`, `500m/384Mi`; diagnostics `100m/128Mi`, `1/512Mi` |
| `tmpSizeLimit` | `64Mi` (`/tmp` emptyDir) |
| `extraEmptyDirs` | web mounts `/app/.next/cache` (256Mi); others none |
| `terminationGracePeriodSeconds` | web and api `30`, diagnostics `60` |
| `autoscaling.{enabled,minReplicas,maxReplicas,targetCPUUtilizationPercentage,targetMemoryUtilizationPercentage}` | enabled; web 2-4, api 2-6, diagnostics 2-6; CPU 70; memory unset |
| `pdb.{enabled,minAvailable}` | `true`, `1` |
| `service.{type,annotations}` | `ClusterIP`, `{}` |
| `podAnnotations`, `podLabels`, `priorityClassName`, `nodeSelector`, `tolerations`, `affinity` | empty. A non-empty `affinity` replaces the default soft anti-affinity. |
| `extraEnv`, `extraVolumes`, `extraVolumeMounts` | `[]` |

Diagnostics only:

| Key | Default | Description |
|---|---|---|
| `diagnostics.icmp.pingGroupRange` | `"0 2147483647"` | Value of the `net.ipv4.ping_group_range` pod sysctl. Empty removes the sysctl. |
| `diagnostics.netRawFallback.enabled` | `false` | Adds `NET_RAW`. Rejected by Pod Security `restricted` and `baseline`; see `docs/deployment.md`. |

### Ingress

| Key | Default | Description |
|---|---|---|
| `ingress.enabled` | `true` | |
| `ingress.className` | `nginx` | Empty omits `ingressClassName`. |
| `ingress.host` | `lg.geiseit.com` | |
| `ingress.tls.enabled` / `ingress.tls.secretName` | `true` / `looking-glass-tls` | |
| `ingress.certManager.clusterIssuer` | `letsencrypt-prod` | Emits `cert-manager.io/cluster-issuer` when TLS is on. Empty for a pre-provisioned Secret. |
| `ingress.nginx.enabled` | `true` | Emits the ingress-nginx annotations below. Set `false` for Traefik or others and use `ingress.annotations`. |
| `ingress.nginx.{proxyReadTimeout,proxySendTimeout,proxyBodySize}` | `60`, `60`, `16k` | SSL redirect follows `ingress.tls.enabled`. |
| `ingress.annotations`, `ingress.labels` | `{}` | |

Routes: `/api` (Prefix) to the api Service, `/` (Prefix) to the web Service. `/health` and `/metrics` are not routed to the API. Preserve the client IP (see `docs/deployment.md`): per-IP rate limiting depends on it.

### NetworkPolicy

| Key | Default | Description |
|---|---|---|
| `networkPolicy.enabled` | `true` | |
| `networkPolicy.ingressControllerNamespaceSelector` | `kubernetes.io/metadata.name: ingress-nginx` | Namespace labels of the ingress controller. |
| `networkPolicy.ingressControllerPodSelector` | `{}` | Optional pod labels within that namespace. |
| `networkPolicy.monitoringNamespaceSelector` | `kubernetes.io/metadata.name: monitoring` | Allowed to scrape port 9090. |
| `networkPolicy.dns.{namespaceSelector,podSelector}` | `kube-system`, `k8s-app: kube-dns` | DNS egress for web and api. |
| `networkPolicy.otlpEgress.{enabled,namespaceSelector,podSelector,port}` | `false`, `{}`, `{}`, `4317` | API egress to an OTLP collector. |
| `networkPolicy.diagnostics.allowClusterDns` | `false` | Diagnostics uses public resolvers directly. |
| `networkPolicy.diagnostics.exceptCidrs` | private, CGNAT, link-local, loopback, ULA, link-local v6 | Removed from the diagnostics internet egress. Do not shrink. |
| `networkPolicy.diagnostics.extraExceptCidrs` | `[]` | Extra ranges to deny (IPv4 and IPv6 are split automatically). Add the cluster's pod and service CIDRs when they are publicly routable. |

### Other

| Key | Default | Description |
|---|---|---|
| `rbac.create`, `rbac.rules` | `false`, `[]` | Role and RoleBinding for the three ServiceAccounts. The app needs no Kubernetes API access, so this stays off. |
| `quota.enabled`, `quota.hard` | `false`, 6 CPU / 6Gi requests, 12 CPU / 12Gi limits, 40 pods | ResourceQuota. |
| `limitRange.enabled`, `limitRange.{default,defaultRequest,max}` | `false` | LimitRange for containers. |
| `monitoring.serviceMonitor.{enabled,namespace,labels,interval,scrapeTimeout}` | `false`, release ns, `{}`, `30s`, `10s` | Scrapes `metrics` on api and diagnostics. Not rendered without the `monitoring.coreos.com/v1` API. |
| `monitoring.podMonitor.*` | same | Alternative to the ServiceMonitor. |
| `monitoring.prometheusRule.{enabled,namespace,labels,failureRatioThreshold,latencyP95ThresholdSeconds,rejectedPerSecondThreshold}` | `false`, ..., `0.1`, `30`, `0.5` | Alert rules. |
| `monitoring.grafanaDashboard.{enabled,namespace,labels,annotations}` | `false`, ..., `grafana_dashboard: "1"` | Dashboard ConfigMap for the Grafana sidecar. |
| `tests.enabled`, `tests.image.*` | `true`, `docker.io/curlimages/curl:8.11.1` | `helm test` pod (checks web `/healthz`, api `/health/ready` and `/api/v1/status`). |

## Validation

`sh scripts/lint-chart.sh` runs `helm lint`, renders every feature combination and validates the output with kubeconform (`-strict`, CRD schemas from the datree catalog). It needs `helm` and `kubeconform` on the PATH (or `KUBECONFORM=/path`).
