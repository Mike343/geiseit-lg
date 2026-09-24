{{- define "lg.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 50 | trimSuffix "-" -}}
{{- end -}}

{{- define "lg.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "lg.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "lg.componentName" -}}
{{- printf "%s-%s" (include "lg.fullname" .root) .component -}}
{{- end -}}

{{- define "lg.baseLabels" -}}
helm.sh/chart: {{ include "lg.chart" . }}
app.kubernetes.io/name: {{ include "lg.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: looking-glass
{{- end -}}

{{- define "lg.labels" -}}
{{ include "lg.baseLabels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "lg.selectorLabels" -}}
app.kubernetes.io/name: {{ include "lg.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "lg.image" -}}
{{- $i := .cfg.image -}}
{{- $base := ternary (printf "%s/%s" $i.registry $i.repository) $i.repository (not (empty $i.registry)) -}}
{{- if $i.digest -}}
{{- printf "%s@%s" $base $i.digest -}}
{{- else -}}
{{- printf "%s:%s" $base (default .root.Chart.AppVersion $i.tag | toString) -}}
{{- end -}}
{{- end -}}

{{- define "lg.secretName" -}}
{{- $cfg := .cfg -}}
{{- if $cfg.existingSecret -}}
{{- $cfg.existingSecret -}}
{{- else if $cfg.secretEnv -}}
{{- include "lg.componentName" . -}}
{{- end -}}
{{- end -}}

{{- define "lg.csv" -}}
{{- join "," (. | default list) -}}
{{- end -}}

{{- define "lg.configData" -}}
{{- $root := .root -}}
{{- $v := $root.Values -}}
{{- $d := dict -}}
{{- if eq .component "web" -}}
{{- $c := $v.web.config -}}
{{- $_ := set $d "NODE_ENV" $c.nodeEnv -}}
{{- $_ := set $d "API_INTERNAL_URL" (default (printf "http://%s:%v" (include "lg.componentName" (dict "root" $root "component" "api")) $v.ports.http) $c.apiInternalUrl) -}}
{{- range $k, $val := $c.extra }}{{ $_ := set $d $k (toString $val) }}{{ end -}}
{{- else if eq .component "api" -}}
{{- $c := $v.api.config -}}
{{- $lg := $v.lookingGlass -}}
{{- $_ := set $d "LookingGlass__Location" $lg.location -}}
{{- $_ := set $d "LookingGlass__Hostname" (default $v.ingress.host $lg.hostname) -}}
{{- $_ := set $d "LookingGlass__Network" $lg.network -}}
{{- if $lg.asn }}{{ $_ := set $d "LookingGlass__Asn" $lg.asn }}{{ end -}}
{{- if $lg.ipv4 }}{{ $_ := set $d "LookingGlass__Ipv4" $lg.ipv4 }}{{ end -}}
{{- if $lg.ipv6 }}{{ $_ := set $d "LookingGlass__Ipv6" $lg.ipv6 }}{{ end -}}
{{- $_ := set $d "Diagnostics__BaseUrl" (default (printf "http://%s:%v" (include "lg.componentName" (dict "root" $root "component" "diagnostics")) $v.ports.http) $c.diagnosticsBaseUrl) -}}
{{- $_ := set $d "Diagnostics__TimeoutSeconds" (toString $c.diagnosticsTimeoutSeconds) -}}
{{- $_ := set $d "RateLimiting__Ping__PermitLimit" (toString $c.rateLimiting.pingPerMinute) -}}
{{- $_ := set $d "RateLimiting__Traceroute__PermitLimit" (toString $c.rateLimiting.traceroutePerMinute) -}}
{{- $_ := set $d "RateLimiting__Mtr__PermitLimit" (toString $c.rateLimiting.mtrPerMinute) -}}
{{- $_ := set $d "RateLimiting__Dns__PermitLimit" (toString $c.rateLimiting.dnsPerMinute) -}}
{{- $_ := set $d "RateLimiting__MaxConcurrentPerIp" (toString $c.rateLimiting.maxConcurrentPerIp) -}}
{{- $_ := set $d "Network__TrustedProxies" (include "lg.csv" $c.trustedProxies) -}}
{{- $_ := set $d "Network__ForwardLimit" (toString $c.forwardLimit) -}}
{{- if $v.security.extraBlockedCidrs }}{{ $_ := set $d "Security__ExtraBlockedCidrs" (include "lg.csv" $v.security.extraBlockedCidrs) }}{{ end -}}
{{- if $v.security.extraBlockedSuffixes }}{{ $_ := set $d "Security__ExtraBlockedSuffixes" (include "lg.csv" $v.security.extraBlockedSuffixes) }}{{ end -}}
{{- $_ := set $d "Activity__Enabled" (toString $c.activity.enabled) -}}
{{- $_ := set $d "Activity__RetentionMinutes" (toString $c.activity.retentionMinutes) -}}
{{- $_ := set $d "Activity__MaxItems" (toString $c.activity.maxItems) -}}
{{- $_ := set $d "Bgp__Enabled" (toString $v.bgp.enabled) -}}
{{- $_ := set $d "OTEL_SERVICE_NAME" "looking-glass-api" -}}
{{- if $v.otel.endpoint }}{{ $_ := set $d "OTEL_EXPORTER_OTLP_ENDPOINT" $v.otel.endpoint }}{{ end -}}
{{- range $k, $val := $c.extra }}{{ $_ := set $d $k (toString $val) }}{{ end -}}
{{- else if eq .component "diagnostics" -}}
{{- $c := $v.diagnostics.config -}}
{{- $_ := set $d "Diagnostics__MaxConcurrent" (toString $c.maxConcurrent) -}}
{{- $_ := set $d "Diagnostics__MaxQueued" (toString $c.maxQueued) -}}
{{- $_ := set $d "Diagnostics__TimeoutSeconds" (toString $c.timeoutSeconds) -}}
{{- $_ := set $d "Diagnostics__MaxOutputBytes" (toString $c.maxOutputBytes) -}}
{{- $_ := set $d "Diagnostics__RedactPrivateHops" (toString $c.redactPrivateHops) -}}
{{- $_ := set $d "Diagnostics__Simulated" (toString $c.simulated) -}}
{{- $_ := set $d "Dns__Resolvers" (include "lg.csv" $c.dnsResolvers) -}}
{{- $_ := set $d "Connectivity__IntervalSeconds" (toString $c.connectivity.intervalSeconds) -}}
{{- $_ := set $d "Connectivity__WindowSeconds" (toString $c.connectivity.windowSeconds) -}}
{{- $_ := set $d "Connectivity__Ipv4Targets" (include "lg.csv" $c.connectivity.ipv4Targets) -}}
{{- $_ := set $d "Connectivity__Ipv6Targets" (include "lg.csv" $c.connectivity.ipv6Targets) -}}
{{- if $c.egress.ipv4 }}{{ $_ := set $d "Egress__Ipv4" $c.egress.ipv4 }}{{ end -}}
{{- if $c.egress.ipv6 }}{{ $_ := set $d "Egress__Ipv6" $c.egress.ipv6 }}{{ end -}}
{{- if $v.security.extraBlockedCidrs }}{{ $_ := set $d "Security__ExtraBlockedCidrs" (include "lg.csv" $v.security.extraBlockedCidrs) }}{{ end -}}
{{- if $v.security.extraBlockedSuffixes }}{{ $_ := set $d "Security__ExtraBlockedSuffixes" (include "lg.csv" $v.security.extraBlockedSuffixes) }}{{ end -}}
{{- $_ := set $d "OTEL_SERVICE_NAME" "looking-glass-diagnostics" -}}
{{- if $v.otel.endpoint }}{{ $_ := set $d "OTEL_EXPORTER_OTLP_ENDPOINT" $v.otel.endpoint }}{{ end -}}
{{- range $k, $val := $c.extra }}{{ $_ := set $d $k (toString $val) }}{{ end -}}
{{- end -}}
{{- toYaml $d -}}
{{- end -}}

{{- define "lg.validate" -}}
{{- if and .Values.diagnostics.netRawFallback.enabled .Values.namespace.create (eq .Values.namespace.podSecurity.enforce "restricted") -}}
{{- fail "diagnostics.netRawFallback.enabled adds NET_RAW, which Pod Security 'restricted' rejects: set namespace.podSecurity.enforce to privileged or create the namespace yourself" -}}
{{- end -}}
{{- if and .Values.ingress.enabled (not .Values.ingress.host) -}}
{{- fail "ingress.host is required when ingress.enabled is true" -}}
{{- end -}}
{{- end -}}
