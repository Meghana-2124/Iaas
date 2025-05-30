# filepath: /Users/mide/Documents/work/Iaas/Iaas-k8s/helm-chart/templates/_prometheus-helpers.tpl
{{/* Prometheus Helpers */}}

{{/*
Define the common labels for Prometheus components
*/}}
{{- define "prometheus.labels" -}}
app.kubernetes.io/name: prometheus
app.kubernetes.io/instance: kubecost-prometheus
app.kubernetes.io/component: {{ .component | default "prometheus-component" }}
iaas.deployment/component: monitoring
{{- end -}}

{{/*
Define the service name for Prometheus that Kubecost expects
*/}}
{{- define "prometheus.serviceName" -}}
prometheus-server
{{- end -}}

{{/*
Define the namespace for Prometheus components
*/}}
{{- define "prometheus.namespace" -}}
kubecost
{{- end -}}

{{/*
Define the default retention settings
*/}}
{{- define "prometheus.retention" -}}
{{- $retention := .Values.kubecost.prometheus.retention | default dict -}}
time: {{ $retention.time | default "15d" }}
size: {{ $retention.size | default "50GB" }}
{{- end -}}

{{/*
Define the default remote write settings
*/}}
{{- define "prometheus.remoteWrite" -}}
{{- if .Values.kubecost.prometheus.remoteWrite.enabled -}}
- url: {{ .Values.kubecost.prometheus.remoteWrite.url }}
  {{- if .Values.kubecost.prometheus.remoteWrite.basicAuth.enabled }}
  basic_auth:
    username: {{ .Values.kubecost.prometheus.remoteWrite.basicAuth.username }}
    password: {{ .Values.kubecost.prometheus.remoteWrite.basicAuth.password }}
  {{- end }}
  write_relabel_configs:
    - source_labels: [__name__]
      regex: "kubecost_.*|container_.*|node_.*|kube_.*"
      action: keep
{{- end -}}
{{- end -}}
