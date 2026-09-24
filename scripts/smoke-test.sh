#!/bin/sh
# Usage: smoke-test.sh <base-url>
# Optional environment: SMOKE_PING_TARGET (default 1.1.1.1), SMOKE_SKIP_PING=1, SMOKE_WAIT_SECONDS (default 120),
# SMOKE_INSECURE=1 (accept untrusted certificates, e.g. the Let's Encrypt staging issuer), SMOKE_HEALTH_URL (direct API base URL, e.g. a port-forward).
set -eu

BASE=${1:-}
[ -n "$BASE" ] || { echo "usage: $0 <base-url>" >&2; exit 2; }
BASE=${BASE%/}
PING_TARGET=${SMOKE_PING_TARGET:-1.1.1.1}
WAIT=${SMOKE_WAIT_SECONDS:-120}
CURL="curl -sS --max-time 70"
[ "${SMOKE_INSECURE:-0}" = 1 ] && CURL="$CURL -k"

BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT
failures=0

pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

status() {
  $CURL -o "$BODY" -w '%{http_code}' "$@" || echo 000
}

post_json() {
  path=$1
  payload=$2
  tries=0
  while :; do
    code=$(status -X POST -H 'Content-Type: application/json' -d "$payload" "$BASE$path")
    [ "$code" = 429 ] && [ "$tries" -lt 5 ] || break
    tries=$((tries + 1))
    sleep 20
  done
  echo "$code"
}

expect_status() {
  name=$1
  want=$2
  got=$3
  if [ "$got" = "$want" ]; then pass "$name"; else fail "$name (expected $want, got $got)"; cat "$BODY" >&2 2>/dev/null || true; echo >&2; fi
}

expect_4xx() {
  name=$1
  got=$2
  case "$got" in
    4??) pass "$name ($got)" ;;
    *) fail "$name (expected 4xx, got $got)" ;;
  esac
}

echo "Smoke testing $BASE"

deadline=$(( $(date +%s) + WAIT ))
until [ "$(status "$BASE/api/v1/status")" = 200 ]; do
  [ "$(date +%s)" -lt "$deadline" ] || { echo "FAIL  $BASE/api/v1/status not ready after ${WAIT}s" >&2; exit 1; }
  sleep 3
done

expect_status "web /healthz" 200 "$(status "$BASE/healthz")"

expect_status "GET /api/v1/status" 200 "$(status "$BASE/api/v1/status")"
grep -q '"overall"' "$BODY" && pass "status payload has overall" || fail "status payload has overall"

expect_status "GET /api/v1/network" 200 "$(status "$BASE/api/v1/network")"

metrics_code=$(status "$BASE/metrics")
if [ "$metrics_code" = 200 ] && grep -q '^# HELP' "$BODY"; then fail "/metrics must not be exposed publicly"; else pass "/metrics not exposed"; fi

if [ -n "${SMOKE_HEALTH_URL:-}" ]; then
  expect_status "api /health/live" 200 "$(status "${SMOKE_HEALTH_URL%/}/health/live")"
  expect_status "api /health/ready" 200 "$(status "${SMOKE_HEALTH_URL%/}/health/ready")"
fi

if [ "${SMOKE_SKIP_PING:-0}" != 1 ]; then
  expect_status "ping $PING_TARGET" 200 "$(post_json /api/v1/diagnostics/ping "{\"destination\":\"$PING_TARGET\",\"family\":\"ipv4\"}")"
  grep -q '"transmitted"' "$BODY" && pass "ping payload has transmitted" || fail "ping payload has transmitted"
fi

expect_status "dns example.com A" 200 "$(post_json /api/v1/diagnostics/dns '{"name":"example.com","recordType":"A"}')"

for target in 10.0.0.1 192.168.1.1 172.16.0.1 127.0.0.1 169.254.169.254 100.64.0.1 localhost localhost.localdomain 'kubernetes.default.svc.cluster.local' '[::1]' 'fc00::1' 'fe80::1'; do
  expect_4xx "ping blocked destination $target" "$(post_json /api/v1/diagnostics/ping "{\"destination\":\"$target\"}")"
done

for target in '8.8.8.8; id' '$(id)' '8.8.8.8 -c 100' 'http://8.8.8.8/' '../etc/passwd' '-f'; do
  payload=$(printf '{"destination":"%s"}' "$(printf '%s' "$target" | sed 's/\\/\\\\/g; s/"/\\"/g')")
  expect_4xx "ping rejects malformed destination $target" "$(post_json /api/v1/diagnostics/ping "$payload")"
done

expect_4xx "malformed JSON rejected" "$(post_json /api/v1/diagnostics/ping '{not json')"
expect_4xx "missing destination rejected" "$(post_json /api/v1/diagnostics/ping '{}')"
expect_4xx "non-JSON content type rejected" "$(status -X POST -H 'Content-Type: text/plain' -d 'x' "$BASE/api/v1/diagnostics/ping")"

[ "$failures" -eq 0 ] || { echo "$failures smoke check(s) failed" >&2; exit 1; }
echo "all smoke checks passed"
