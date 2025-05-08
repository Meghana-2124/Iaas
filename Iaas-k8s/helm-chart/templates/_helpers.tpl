{{/*
Expand the name of the chart.
*/}}
{{- define "chimoney-rafiki.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "chimoney-rafiki.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "chimoney-rafiki.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "chimoney-rafiki.labels" -}}
helm.sh/chart: {{ include "chimoney-rafiki.chart" . }}
{{ include "chimoney-rafiki.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "chimoney-rafiki.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chimoney-rafiki.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Create the name for a component service account.
*/}}
{{- define "chimoney-rafiki.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "chimoney-rafiki.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Return the appropriate apiVersion for deployment.
*/}}
{{- define "deployment.apiVersion" -}}
{{- if .Capabilities.APIVersions.Has "apps/v1" -}}
apps/v1
{{- else -}}
apps/v1beta2
{{- end -}}
{{- end -}}

{{/*
Return the appropriate apiVersion for ingress.
*/}}
{{- define "ingress.apiVersion" -}}
{{- if .Capabilities.APIVersions.Has "networking.k8s.io/v1" -}}
networking.k8s.io/v1
{{- else if .Capabilities.APIVersions.Has "networking.k8s.io/v1beta1" -}}
networking.k8s.io/v1beta1
{{- else -}}
extensions/v1beta1
{{- end -}}
{{- end -}}

{{/*
Construct service name for components
Usage: {{ include "chimoney-rafiki.componentFullname" (dict "componentName" .Values.rafikiAuth.name "context" $) }}
*/}}
{{- define "chimoney-rafiki.componentFullname" -}}
{{- printf "%s-%s" .context.Release.Name .componentName | trunc 63 | trimSuffix "-" -}}
{{- end -}}
