# Cluster monitoring (kube-prometheus-stack)

Installs the Prometheus operator, Prometheus, Alertmanager, Grafana, node-exporter and kube-state-metrics into the
`monitoring` namespace. This is cluster infrastructure, separate from the Looking Glass chart.

- Storage: a hand-made NFS PV (`prometheus-pv.yaml`) bound by name from the Prometheus claim template. The export
  directory must exist and be writable by uid 1000 / gid 2000. The cluster has no StorageClass.
- Grafana is served at https://grafana.geiseit.com through ingress-nginx with a `letsencrypt-production` certificate. It has no
  persistence: dashboards come from the chart and from ConfigMaps labelled `grafana_dashboard: "1"` in any namespace.
  The admin password is generated into the `kube-prometheus-stack-grafana` secret.
- Selectors are opened up (`*NilUsesHelmValues: false`), so ServiceMonitors and PrometheusRules from any namespace are
  discovered without a `release` label.
- Scraping of controller-manager, scheduler, etcd and kube-proxy is disabled: on kubeadm clusters they listen on
  localhost by default and would fire permanent "target down" alerts. Enable them after changing their bind addresses.
- Alertmanager runs without receivers; add one before relying on alerts.

```sh
kubectl apply -f prometheus-pv.yaml
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --version 91.5.1 --namespace monitoring -f values.yaml --atomic --wait --timeout 10m
kubectl -n monitoring get secret kube-prometheus-stack-grafana -o jsonpath='{.data.admin-password}' | base64 -d
```
