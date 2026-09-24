# Running on GeiseIT Kubernetes, Amazon EKS Anywhere and upstream Kubernetes

The chart uses only core Kubernetes APIs (`apps/v1`, `networking.k8s.io/v1`, `autoscaling/v2`, `policy/v1`, `rbac.authorization.k8s.io/v1`) and, optionally, the Prometheus Operator CRDs. It has no cloud provider dependency: no cloud load balancer annotations, no cloud storage, no cloud IAM, no persistent volumes. The same chart deploys to all three targets; only the values file differs. Verify the version-specific facts below against the documentation of the EKS Anywhere release you run.

## Portability checklist

| Kubernetes object | What the chart uses | Cluster requirement | Do not depend on |
|---|---|---|---|
| Deployment | `apps/v1`, rolling update, topology spread on `kubernetes.io/hostname` | none | zone labels being present (spread is `ScheduleAnyway`) |
| Service | `ClusterIP` only | none | `LoadBalancer` on the app Services; expose through the ingress controller |
| Ingress | `networking.k8s.io/v1`, `ingress.className`, path types `Prefix` | any ingress controller | AWS ALB annotations, controller-specific CRDs |
| TLS | cert-manager annotation `cert-manager.io/cluster-issuer` | cert-manager and an ACME-capable ClusterIssuer (or a pre-created Secret) | ACM certificates |
| ConfigMap / Secret | env via `envFrom`; `existingSecret` | none | AWS Secrets Manager or Parameter Store (use External Secrets if needed) |
| ServiceAccount / RBAC | one SA per workload, token not mounted, no Role by default | none | IRSA or any cloud IAM binding (there are no cloud API calls) |
| NetworkPolicy | standard `networking.k8s.io/v1` (podSelector, namespaceSelector, ipBlock+except) | a CNI that enforces it | CNI-specific policy CRDs |
| HPA | `autoscaling/v2`, CPU utilisation | metrics-server | custom metrics adapters |
| PDB | `policy/v1`, `minAvailable: 1` | none | cluster-autoscaler specifics |
| ResourceQuota / LimitRange | opt-in | none | |
| ServiceMonitor / PodMonitor / PrometheusRule | opt-in, `monitoring.coreos.com/v1`, guarded by an API check | Prometheus Operator | a managed Prometheus service |
| Pod security | `restricted` profile plus the safe sysctl `net.ipv4.ping_group_range` | Pod Security Admission (1.25+), runtime that honours safe sysctls | privileged pods, host networking, hostPath |
| Images | `registry.geiseit.com/geiseit-lg/*`, registry and repository configurable | reachability to the registry | ECR-only image references |

Storage is not needed; all pods are stateless and use `emptyDir` for `/tmp` (and the Next.js cache for web).

## Amazon EKS Anywhere specifics

Points that commonly differ from a plain upstream cluster:

- **CNI: Cilium.** EKS Anywhere ships Cilium as the default CNI, so standard NetworkPolicy is enforced. Cilium matches `ipBlock` rules against destinations outside the cluster; in-cluster destinations (pods, nodes, services) are matched by identity, so the diagnostics `0.0.0.0/0` egress rule does not open pod-to-pod traffic. The `except` list is defence in depth. Cilium's connection tracking treats ICMP errors as related traffic, which lets traceroute time-exceeded replies from private hops return; confirm with a traceroute after the first install. If the ingress controller uses `hostNetwork`, its traffic arrives as the `host` entity and namespace selectors do not match; add a Cilium or NetworkPolicy exception for the node CIDRs. Hubble (`hubble observe --namespace network-looking-glass --verdict DROPPED`) shows policy drops when debugging.
- **Pod and service CIDRs.** Defaults are typically `192.168.0.0/16` (pods) and `10.96.0.0/12` (services), both inside the diagnostics egress `except` list and the API `trustedProxies` default. If you chose ranges outside RFC1918, add them to `networkPolicy.diagnostics.extraExceptCidrs` and `api.config.trustedProxies`.
- **LoadBalancer addresses: MetalLB or kube-vip.** On bare metal there is no cloud load balancer. kube-vip usually provides the control-plane VIP; MetalLB (an EKS Anywhere curated package) or kube-vip's service load balancer gives the ingress controller Service an address. Configure an address pool from your public range, and set the ingress controller Service to `externalTrafficPolicy: Local` so the client IP reaches the API (see `docs/deployment.md`). With Local, the announcing node must run a controller pod; use at least two controller replicas with anti-affinity, and L2 or BGP mode as suits your network.
- **Ingress controller.** ingress-nginx is not one of the EKS Anywhere curated packages; install it with its own Helm chart, or use a curated ingress such as Emissary and set `ingress.className`, `ingress.nginx.enabled=false` and controller-specific `ingress.annotations`. Update `networkPolicy.ingressControllerNamespaceSelector` to the controller's namespace.
- **Curated packages.** cert-manager, MetalLB, metrics-server, Prometheus and the ADOT collector are available as curated packages installed through the EKS Anywhere package controller (`eksctl anywhere` / `kubectl` on `Package` resources). Using them is optional; the upstream Helm charts for the same components work equally. Check which packages are available for your version and cluster provider.
- **Metrics server** is required for the HPA. Install it if absent (curated package or upstream manifest).
- **Prometheus stack.** Use kube-prometheus-stack or the curated Prometheus package. Set `monitoring.serviceMonitor.labels` to the selector your Prometheus uses and `networkPolicy.monitoringNamespaceSelector` to its namespace. The Grafana sidecar picks up the dashboard through the `grafana_dashboard: "1"` label.
- **OpenTelemetry.** Point `otel.endpoint` at an in-cluster collector (for example the ADOT collector) and enable `networkPolicy.otlpEgress` with matching selectors. Keep collector credentials in `secretEnv` or an existing Secret.
- **Registry access.** Nodes must reach registry.geiseit.com (or your mirror) and Let's Encrypt for cert-manager. For air-gapped clusters mirror the three images and the curl test image and set `image.registry` per workload.
- **Operating system and runtime.** Bottlerocket and Ubuntu nodes with containerd honour the safe sysctl. If a node image or runtime blocks it, see the NET_RAW fallback in `docs/deployment.md`.
- **Internet egress and NAT.** Diagnostics leave through the node's default route. Traceroute and mtr show the path from the cluster's egress address; the API reports that address as the Looking Glass IPv4/IPv6 (`Egress__Ipv4` / `Egress__Ipv6` override it when egress goes through NAT).

## One chart, three targets

Create an environment file per cluster containing only the differences, for example:

```yaml
ingress:
  className: nginx
  host: lg.geiseit.com
networkPolicy:
  ingressControllerNamespaceSelector:
    kubernetes.io/metadata.name: ingress-nginx
  monitoringNamespaceSelector:
    kubernetes.io/metadata.name: monitoring
monitoring:
  serviceMonitor:
    enabled: true
    labels:
      release: kube-prometheus-stack
```

Typical differences: the ingress class and namespace, the monitoring labels and namespace, the ClusterIssuer name, registry or pull secrets, and any extra `except` CIDRs. Nothing in the templates changes between GeiseIT Kubernetes, EKS Anywhere and upstream clusters.

## Moving between clusters

1. **Compare prerequisites** on the target: Kubernetes version (>= 1.27), CNI policy enforcement, metrics-server, ingress controller class and namespace, cert-manager ClusterIssuer, Prometheus Operator CRDs, storage none. Note the pod and service CIDRs.
2. **Create the values file** for the target cluster (above). Render it: `helm template looking-glass deploy/helm/looking-glass -f <values> --api-versions monitoring.coreos.com/v1 | kubeconform -strict -ignore-missing-schemas`.
3. **Dry-run against the API server**: `helm upgrade --install ... --dry-run=server`. This catches missing CRDs, Pod Security rejections and quota problems.
4. **Deploy under a temporary hostname**: `--set ingress.host=lg-new.geiseit.com` (and matching `lookingGlass.hostname`), so the certificate is issued and the site can be tested without touching production DNS.
5. **Verify**: `helm test`, `sh scripts/smoke-test.sh https://lg-new.geiseit.com`, run a traceroute and an IPv6 ping from the UI, confirm internal hops are shown as internal, confirm Prometheus scrapes both metrics endpoints, and check that per-IP rate limiting sees distinct client addresses.
6. **Cut over**: lower the DNS TTL for `lg.geiseit.com` in advance, redeploy with `ingress.host=lg.geiseit.com` (or add both hosts through a second release), then point the A/AAAA records at the new ingress address.
7. **Keep the old cluster** running until the TTL has expired and metrics on the new cluster are healthy; roll back by restoring the DNS records.
8. **Decommission** the old release with `helm uninstall looking-glass -n network-looking-glass` and remove the namespace.

The application keeps no state (recent activity and connectivity history live in memory and rebuild after a restart), so there is nothing to migrate.

## Multiple locations

Each location is one cluster running this chart with its own `lookingGlass.location`, `hostname`, `asn` and values file. Use a separate hostname per location (`chi.lg.geiseit.com`, ...). Nothing in the chart prevents a future global dashboard from selecting between them.
