# Kubecost Prometheus Configuration Guide

This guide provides comprehensive Prometheus configuration recommendations for optimal Kubecost cost monitoring and resource tracking.

## Table of Contents

1. [Overview](#overview)
2. [Prometheus Configuration](#prometheus-configuration)
3. [Recording Rules](#recording-rules)
4. [Alerting Rules](#alerting-rules)
5. [Service Discovery](#service-discovery)
6. [Performance Optimization](#performance-optimization)
7. [Troubleshooting](#troubleshooting)

## Overview

Prometheus is essential for Kubecost to collect accurate cost and resource utilization data. This configuration ensures comprehensive monitoring of:

- Node resource usage (CPU, memory, storage)
- Pod and container metrics
- Network traffic
- Storage utilization
- Cluster cost allocation

## Prometheus Configuration

### 1. Core Configuration (prometheus.yml)

```yaml
global:
  scrape_interval: 1m
  evaluation_interval: 1m
  external_labels:
    cluster: "production"
    environment: "iaas"

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  # Kubecost metrics
  - job_name: "kubecost"
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
            - kubecost
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        action: keep
        regex: kubecost-cost-analyzer
      - source_labels: [__meta_kubernetes_endpoint_port_name]
        action: keep
        regex: http
    scrape_interval: 1m
    scrape_timeout: 10s

  # Node exporter for node-level metrics
  - job_name: "node-exporter"
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
            - kubecost
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        action: keep
        regex: prometheus-node-exporter
      - source_labels: [__meta_kubernetes_endpoint_port_name]
        action: keep
        regex: http-metrics
    scrape_interval: 1m
    scrape_timeout: 10s

  # Kubernetes API server
  - job_name: "kubernetes-apiservers"
    kubernetes_sd_configs:
      - role: endpoints
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - source_labels:
          [
            __meta_kubernetes_namespace,
            __meta_kubernetes_service_name,
            __meta_kubernetes_endpoint_port_name,
          ]
        action: keep
        regex: default;kubernetes;https

  # Kubernetes nodes
  - job_name: "kubernetes-nodes"
    kubernetes_sd_configs:
      - role: node
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)

  # Kubernetes pods
  - job_name: "kubernetes-pods"
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels:
          [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: kubernetes_pod_name

  # cAdvisor for container metrics
  - job_name: "kubernetes-cadvisor"
    kubernetes_sd_configs:
      - role: node
    scheme: https
    metrics_path: /metrics/cadvisor
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)

  # Kubernetes service endpoints
  - job_name: "kubernetes-service-endpoints"
    kubernetes_sd_configs:
      - role: endpoints
    relabel_configs:
      - source_labels:
          [__meta_kubernetes_service_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels:
          [__meta_kubernetes_service_annotation_prometheus_io_scheme]
        action: replace
        target_label: __scheme__
        regex: (https?)
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels:
          [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
      - action: labelmap
        regex: __meta_kubernetes_service_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_service_name]
        action: replace
        target_label: kubernetes_name

  # GCP monitoring (if using GKE)
  - job_name: "gcp-monitoring"
    static_configs:
      - targets: ["monitoring.googleapis.com"]
    metrics_path: "/v1/projects/your-project-id/metricDescriptors"
    scheme: https
    bearer_token_file: /var/run/secrets/google/service-account-key.json
    scrape_interval: 5m
```

### 2. Storage Configuration

```yaml
# Prometheus storage configuration for long-term data retention
storage:
  tsdb:
    retention.time: 30d
    retention.size: 50GB
    min-block-duration: 2h
    max-block-duration: 25h
    wal-compression: true

# Remote write configuration (optional - for long-term storage)
remote_write:
  - url: https://your-remote-storage/api/v1/write
    write_relabel_configs:
      - source_labels: [__name__]
        regex: "kubecost_.*|container_.*|node_.*"
        action: keep
```

## Recording Rules

### 1. Cost Allocation Rules (kubecost-recording-rules.yml)

```yaml
groups:
  - name: kubecost.cost_allocation
    interval: 1m
    rules:
      # CPU cost per core hour
      - record: kubecost:cluster_cpu_cost_per_core_hour
        expr: |
          avg(
            label_replace(
              kubecost_cluster_info{provider="gcp"}, "region", "$1", "region", "(.+)"
            ) * on(region) group_left()
            label_replace(
              kubecost_gcp_cpu_pricing, "region", "$1", "zone", "(.+)-.+"
            )
          ) by (cluster_id)

      # Memory cost per GB hour
      - record: kubecost:cluster_memory_cost_per_gb_hour
        expr: |
          avg(
            label_replace(
              kubecost_cluster_info{provider="gcp"}, "region", "$1", "region", "(.+)"
            ) * on(region) group_left()
            label_replace(
              kubecost_gcp_memory_pricing, "region", "$1", "zone", "(.+)-.+"
            )
          ) by (cluster_id)

      # Storage cost per GB hour
      - record: kubecost:cluster_storage_cost_per_gb_hour
        expr: |
          avg(
            kubecost_gcp_storage_pricing
          ) by (cluster_id, storage_class)

      # Node resource capacity costs
      - record: kubecost:node_cpu_capacity_cost
        expr: |
          kubecost:cluster_cpu_cost_per_core_hour * on(cluster_id) group_left()
          sum(kube_node_status_capacity{resource="cpu"}) by (cluster_id, node)

      - record: kubecost:node_memory_capacity_cost
        expr: |
          kubecost:cluster_memory_cost_per_gb_hour * on(cluster_id) group_left()
          sum(kube_node_status_capacity{resource="memory"}) by (cluster_id, node) / 1024 / 1024 / 1024

      # Namespace resource usage costs
      - record: kubecost:namespace_cpu_usage_cost
        expr: |
          kubecost:cluster_cpu_cost_per_core_hour * on(cluster_id) group_left()
          sum(rate(container_cpu_usage_seconds_total[5m])) by (cluster_id, namespace)

      - record: kubecost:namespace_memory_usage_cost
        expr: |
          kubecost:cluster_memory_cost_per_gb_hour * on(cluster_id) group_left()
          sum(container_memory_working_set_bytes) by (cluster_id, namespace) / 1024 / 1024 / 1024

      # Tier-based cost allocation
      - record: kubecost:tier_total_cost
        expr: |
          sum(
            kubecost:namespace_cpu_usage_cost +
            kubecost:namespace_memory_usage_cost
          ) by (cluster_id, tier)

  - name: kubecost.efficiency
    interval: 1m
    rules:
      # CPU efficiency by namespace
      - record: kubecost:namespace_cpu_efficiency
        expr: |
          sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace) /
          sum(kube_pod_container_resource_requests{resource="cpu"}) by (namespace)

      # Memory efficiency by namespace
      - record: kubecost:namespace_memory_efficiency
        expr: |
          sum(container_memory_working_set_bytes) by (namespace) /
          sum(kube_pod_container_resource_requests{resource="memory"}) by (namespace)

      # Overall efficiency by tier
      - record: kubecost:tier_overall_efficiency
        expr: |
          (
            kubecost:namespace_cpu_efficiency +
            kubecost:namespace_memory_efficiency
          ) / 2

  - name: kubecost.network
    interval: 1m
    rules:
      # Network egress costs
      - record: kubecost:namespace_network_egress_cost
        expr: |
          sum(rate(container_network_transmit_bytes_total[5m])) by (namespace) *
          kubecost_network_egress_pricing * 3600 / 1024 / 1024 / 1024

      # Load balancer costs
      - record: kubecost:namespace_load_balancer_cost
        expr: |
          sum(kubecost_load_balancer_cost) by (namespace, service_name)
```

### 2. Resource Utilization Rules (resource-recording-rules.yml)

```yaml
groups:
  - name: kubecost.resource_utilization
    interval: 30s
    rules:
      # CPU utilization by node
      - record: kubecost:node_cpu_utilization
        expr: |
          1 - (
            avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)
          )

      # Memory utilization by node
      - record: kubecost:node_memory_utilization
        expr: |
          1 - (
            node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
          )

      # Storage utilization by node
      - record: kubecost:node_storage_utilization
        expr: |
          1 - (
            node_filesystem_avail_bytes{fstype!="tmpfs"} /
            node_filesystem_size_bytes{fstype!="tmpfs"}
          )

      # Pod resource requests vs limits
      - record: kubecost:pod_cpu_request_vs_limit
        expr: |
          sum(kube_pod_container_resource_requests{resource="cpu"}) by (pod, namespace) /
          sum(kube_pod_container_resource_limits{resource="cpu"}) by (pod, namespace)

      - record: kubecost:pod_memory_request_vs_limit
        expr: |
          sum(kube_pod_container_resource_requests{resource="memory"}) by (pod, namespace) /
          sum(kube_pod_container_resource_limits{resource="memory"}) by (pod, namespace)
```

## Alerting Rules

### 1. Cost Budget Alerts (cost-alerting-rules.yml)

```yaml
groups:
  - name: kubecost.budget_alerts
    rules:
      # Budget threshold alerts
      - alert: NamespaceBudgetExceeded
        expr: |
          kubecost:namespace_total_cost > kubecost:namespace_budget_limit
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Namespace {{ $labels.namespace }} has exceeded budget"
          description: "Namespace {{ $labels.namespace }} current cost ${{ $value }} exceeds budget limit"

      - alert: TierBudgetWarning
        expr: |
          kubecost:tier_total_cost > kubecost:tier_budget_limit * 0.9
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Tier {{ $labels.tier }} approaching budget limit"
          description: "Tier {{ $labels.tier }} has used 90% of budget limit"

      # Cost anomaly detection
      - alert: CostAnomalyDetected
        expr: |
          increase(kubecost:namespace_total_cost[1h]) >
          avg_over_time(increase(kubecost:namespace_total_cost[1h])[7d:1h]) * 2
        for: 15m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Unusual cost increase detected in {{ $labels.namespace }}"
          description: "Cost increase is 2x higher than 7-day average"

  - name: kubecost.efficiency_alerts
    rules:
      # Low efficiency alerts
      - alert: LowCPUEfficiency
        expr: |
          kubecost:namespace_cpu_efficiency < 0.3
        for: 30m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Low CPU efficiency in {{ $labels.namespace }}"
          description: "CPU efficiency is {{ $value | humanizePercentage }}"

      - alert: LowMemoryEfficiency
        expr: |
          kubecost:namespace_memory_efficiency < 0.3
        for: 30m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Low memory efficiency in {{ $labels.namespace }}"
          description: "Memory efficiency is {{ $value | humanizePercentage }}"

      # Over-provisioning alerts
      - alert: OverProvisionedResources
        expr: |
          kubecost:pod_cpu_request_vs_limit < 0.5 or
          kubecost:pod_memory_request_vs_limit < 0.5
        for: 1h
        labels:
          severity: info
          team: platform
        annotations:
          summary: "Resources over-provisioned in {{ $labels.namespace }}"
          description: "Pod {{ $labels.pod }} has low resource request/limit ratio"
```

### 2. Infrastructure Alerts (infrastructure-alerting-rules.yml)

```yaml
groups:
  - name: kubecost.infrastructure_alerts
    rules:
      # Node resource alerts
      - alert: HighNodeCPUUsage
        expr: |
          kubecost:node_cpu_utilization > 0.9
        for: 15m
        labels:
          severity: warning
          team: infrastructure
        annotations:
          summary: "High CPU usage on node {{ $labels.instance }}"
          description: "Node CPU usage is {{ $value | humanizePercentage }}"

      - alert: HighNodeMemoryUsage
        expr: |
          kubecost:node_memory_utilization > 0.9
        for: 15m
        labels:
          severity: warning
          team: infrastructure
        annotations:
          summary: "High memory usage on node {{ $labels.instance }}"
          description: "Node memory usage is {{ $value | humanizePercentage }}"

      - alert: HighStorageUsage
        expr: |
          kubecost:node_storage_utilization > 0.85
        for: 10m
        labels:
          severity: warning
          team: infrastructure
        annotations:
          summary: "High storage usage on {{ $labels.instance }}"
          description: "Storage usage is {{ $value | humanizePercentage }}"

      # Kubecost service alerts
      - alert: KubecostServiceDown
        expr: |
          up{job="kubecost"} == 0
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Kubecost service is down"
          description: "Kubecost cost-analyzer service is not responding"

      - alert: KubecostHighMemoryUsage
        expr: |
          container_memory_usage_bytes{pod=~"kubecost-cost-analyzer.*"} /
          container_spec_memory_limit_bytes{pod=~"kubecost-cost-analyzer.*"} > 0.9
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Kubecost high memory usage"
          description: "Kubecost memory usage is {{ $value | humanizePercentage }}"
```

## Service Discovery

### 1. Kubernetes Service Discovery

```yaml
# Service annotations for automatic discovery
apiVersion: v1
kind: Service
metadata:
  name: kubecost-cost-analyzer
  namespace: kubecost
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9003"
    prometheus.io/path: "/metrics"
spec:
  selector:
    app: cost-analyzer
  ports:
    - name: http-metrics
      port: 9003
      targetPort: 9003
```

### 2. Pod Annotations

```yaml
# Pod annotations for metrics scraping
apiVersion: v1
kind: Pod
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/metrics"
spec:
  containers:
    - name: app
      ports:
        - containerPort: 8080
          name: http-metrics
```

## Performance Optimization

### 1. Metric Filtering

```yaml
# Drop unnecessary metrics to reduce storage
metric_relabel_configs:
  # Keep only essential container metrics
  - source_labels: [__name__]
    regex: "container_(cpu_usage_seconds_total|memory_working_set_bytes|network_.*_bytes_total|fs_.*_bytes)"
    action: keep

  # Drop high cardinality labels
  - regex: "container_label_.*"
    action: labeldrop

  # Keep only running containers
  - source_labels: [container_state]
    regex: "running"
    action: keep
```

### 2. Recording Rule Optimization

```yaml
# Optimize recording rules for better performance
groups:
  - name: kubecost.optimized
    interval: 5m # Longer interval for expensive queries
    rules:
      - record: kubecost:hourly_namespace_cost
        expr: |
          sum(rate(kubecost_namespace_total_cost[1h]) * 3600) by (namespace, tier)
```

### 3. Retention Policies

```yaml
# Different retention for different metric types
retention_policies:
  - metric_regex: "kubecost_.*"
    retention: "90d"
  - metric_regex: "container_.*"
    retention: "30d"
  - metric_regex: "node_.*"
    retention: "30d"
  - metric_regex: ".*"
    retention: "15d" # Default retention
```

## Troubleshooting

### 1. Common Issues

```bash
# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets

# Check specific metrics
curl http://prometheus:9090/api/v1/query?query=kubecost_cluster_costs

# Verify service discovery
curl http://prometheus:9090/api/v1/label/__name__/values | grep kubecost
```

### 2. Performance Monitoring

```bash
# Check Prometheus performance metrics
curl http://prometheus:9090/api/v1/query?query=prometheus_tsdb_head_series
curl http://prometheus:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total
curl http://prometheus:9090/api/v1/query?query=rate(prometheus_tsdb_compaction_duration_seconds_sum[5m])
```

### 3. Configuration Validation

```bash
# Validate Prometheus configuration
promtool check config prometheus.yml

# Validate recording rules
promtool check rules recording-rules.yml

# Validate alerting rules
promtool check rules alerting-rules.yml
```

### 4. Log Analysis

```bash
# Check Prometheus logs for errors
kubectl logs -n kubecost deployment/prometheus-server | grep -i error

# Check kubecost logs for metric issues
kubectl logs -n kubecost deployment/kubecost-cost-analyzer | grep -i prometheus
```

This comprehensive Prometheus configuration ensures accurate cost tracking, efficient resource utilization monitoring, and proactive alerting for your tier-based IaaS deployment system.
