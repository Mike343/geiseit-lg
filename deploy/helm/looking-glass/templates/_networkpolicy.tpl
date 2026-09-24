{{- define "lg.np.ingressController" -}}
- namespaceSelector:
    matchLabels:
      {{- toYaml .np.ingressControllerNamespaceSelector | nindent 6 }}
  {{- with .np.ingressControllerPodSelector }}
  podSelector:
    matchLabels:
      {{- toYaml . | nindent 6 }}
  {{- end }}
{{- end }}
{{- define "lg.np.monitoring" -}}
- namespaceSelector:
    matchLabels:
      {{- toYaml .np.monitoringNamespaceSelector | nindent 6 }}
{{- end }}
{{- define "lg.np.dns" -}}
- to:
    - namespaceSelector:
        matchLabels:
          {{- toYaml .np.dns.namespaceSelector | nindent 10 }}
      podSelector:
        matchLabels:
          {{- toYaml .np.dns.podSelector | nindent 10 }}
  ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
{{- end }}
