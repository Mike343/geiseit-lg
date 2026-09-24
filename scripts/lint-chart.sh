#!/bin/sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHART="$ROOT/deploy/helm/looking-glass"
K8S_VERSION="${K8S_VERSION:-1.30.0}"
KUBECONFORM="${KUBECONFORM:-kubeconform}"
NS=network-looking-glass
CRD_CATALOG='https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
API_VERSIONS="--api-versions monitoring.coreos.com/v1"
DEV="-f $ROOT/deploy/environments/development/values.yaml"
PROD="-f $ROOT/deploy/environments/production/values.yaml"

command -v helm >/dev/null || { echo "helm is required" >&2; exit 2; }
command -v "$KUBECONFORM" >/dev/null || { echo "kubeconform is required (set KUBECONFORM=/path/to/binary)" >&2; exit 2; }

helm lint "$CHART" --strict
helm lint "$CHART" --strict $DEV
helm lint "$CHART" --strict $PROD

failures=0
check() {
  name=$1
  shift
  if ! helm template looking-glass "$CHART" -n "$NS" $API_VERSIONS "$@" \
    | "$KUBECONFORM" -strict -ignore-missing-schemas -summary \
        -kubernetes-version "$K8S_VERSION" \
        -schema-location default -schema-location "$CRD_CATALOG" >/dev/null; then
    echo "FAIL  $name"
    failures=$((failures + 1))
  else
    echo "ok    $name"
  fi
}

check defaults
check development $DEV
check production $PROD
check servicemonitor --set monitoring.serviceMonitor.enabled=true
check podmonitor --set monitoring.podMonitor.enabled=true
check prometheusrule --set monitoring.prometheusRule.enabled=true
check grafana-dashboard --set monitoring.grafanaDashboard.enabled=true
check quota-limitrange --set quota.enabled=true --set limitRange.enabled=true
check netraw-fallback --set diagnostics.netRawFallback.enabled=true
check namespace-create --set namespace.create=true
check rbac --set rbac.create=true
check ingress-no-tls --set ingress.tls.enabled=false
check ingress-no-class --set ingress.className=
check ingress-disabled --set ingress.enabled=false
check networkpolicy-disabled --set networkPolicy.enabled=false
check networkpolicy-extras --set networkPolicy.diagnostics.allowClusterDns=true --set networkPolicy.otlpEgress.enabled=true --set 'networkPolicy.diagnostics.extraExceptCidrs={203.0.113.0/24,2001:db8::/32}'
check secret-env --set api.secretEnv.OTEL_EXPORTER_OTLP_HEADERS=x --set diagnostics.existingSecret=my-secret
check no-autoscaling --set web.autoscaling.enabled=false --set api.autoscaling.enabled=false --set diagnostics.autoscaling.enabled=false
check tests-disabled --set tests.enabled=false

if helm template looking-glass "$CHART" -n "$NS" --set namespace.create=true --set diagnostics.netRawFallback.enabled=true >/dev/null 2>&1; then
  echo "FAIL  netraw-with-restricted-namespace should be rejected"
  failures=$((failures + 1))
else
  echo "ok    netraw-with-restricted-namespace rejected"
fi

if helm template looking-glass "$CHART" -n "$NS" --set ingress.host=lg.geiseit.com --set api.config.rateLimiting.pingPerMinute=zero >/dev/null 2>&1; then
  echo "FAIL  schema should reject a non-integer rate limit"
  failures=$((failures + 1))
else
  echo "ok    schema rejects invalid values"
fi

[ "$failures" -eq 0 ] || { echo "$failures check(s) failed" >&2; exit 1; }
echo "all chart checks passed"
