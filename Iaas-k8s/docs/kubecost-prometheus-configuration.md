# Kubecost Prometheus Configuration Guide

This guide covers the complete setup and configuration of Prometheus for optimal Kubecost integration in your tier-based IaaS deployment system.

## Table of Contents

1. [Overview](#overview)
2. [Prometheus Installation](#prometheus-installation)
3. [Configuration for Kubecost](#configuration-for-kubecost)
4. [Recording Rules](#recording-rules)
5. [Alerting Rules](#alerting-rules)
6. [Service Discovery](#service-discovery)
7. [Performance Optimization](#performance-optimization)
8. [Troubleshooting](#troubleshooting)

## Overview

Prometheus serves as the metrics collection and storage backend for Kubecost. This integration enables:

- **Real-time cost metrics collection** from Kubecost cost-analyzer
- **Automated recording rules** for performance optimization
- **Budget and efficiency alerting** based on tier thresholds
- **Historical cost data retention** for trend analysis
- **Custom metric creation** for tier-specific monitoring

## Prometheus Installation

### 1. Using Helm (Recommended)

```bash
# Add Prometheus community Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus with Kubecost-optimized configuration
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace kubecost \
  --create-namespace \
  -f helm-chart/templates/prometheus-config.yaml
```

### 2. Using the Included Configuration

Our Helm chart includes a complete Prometheus setup optimized for Kubecost:

```bash
# Deploy using our integrated configuration
helm install iaas-kubecost ./helm-chart \
  --set kubecost.enabled=true \
  --set kubecost.prometheus.enabled=true \
  --namespace kubecost \
  --create-namespace
```

## Configuration for Kubecost

### Core Prometheus Configuration

The main Prometheus configuration includes specialized scrape configs for Kubecost:

```yaml
# kubecost-prometheus-config.yaml
global:
  scrape_interval: 1m
  evaluation_interval: 1m
  external_labels:
    cluster: "production-cluster"
    environment: "production"

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  # Kubecost cost-analyzer metrics
  - job_name: "kubecost"
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names: ["kubecost"]
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        action: keep
        regex: kubecost-cost-analyzer
    scrape_interval: 1m
    scrape_timeout: 10s
    metrics_path: /metrics

  # Node exporter for node-level resource metrics
  - job_name: "node-exporter"
    kubernetes_sd_configs:
      - role: endpoints
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        action: keep
        regex: prometheus-node-exporter
    scrape_interval: 30s

  # Kubernetes API server metrics
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
```

### Tier-Specific Configuration

Configure Prometheus to handle tier-based metrics collection:

```yaml
# Tier-based metric collection
- job_name: "tier-metrics"
  kubernetes_sd_configs:
    - role: pod
  relabel_configs:
    - source_labels: [__meta_kubernetes_pod_label_iaas_deployment_tier]
      action: keep
      regex: (basic|standard|premium|enterprise)
    - source_labels: [__meta_kubernetes_pod_label_iaas_deployment_tier]
      target_label: tier
    - source_labels: [__meta_kubernetes_pod_label_iaas_deployment_company]
      target_label: company
```

## Recording Rules

Recording rules pre-compute frequently used metrics for better performance:

### Cost Allocation Rules

```yaml
# prometheus-recording-rules.yaml
groups:
  - name: kubecost.cost_allocation
    interval: 30s
    rules:
      # Daily cost per namespace
      - record: kubecost:namespace_daily_cost
        expr: |
          sum by (namespace) (
            increase(kubecost_cluster_costs[24h])
          )

      # Monthly cost projection per namespace
      - record: kubecost:namespace_monthly_cost_projection
        expr: |
          kubecost:namespace_daily_cost * 30

      # CPU cost per core hour
      - record: kubecost:cpu_cost_per_core_hour
        expr: |
          avg(
            kube_node_status_capacity{resource="cpu"} * 
            on(node) group_left() 
            node_cpu_hourly_cost
          ) by (node)

      # Memory cost per GB hour
      - record: kubecost:memory_cost_per_gb_hour
        expr: |
          avg(
            kube_node_status_capacity{resource="memory"} * 
            on(node) group_left() 
            node_ram_hourly_cost / (1024^3)
          ) by (node)
```

### Efficiency Rules

```yaml
- name: kubecost.efficiency
  interval: 1m
  rules:
    # Pod CPU efficiency
    - record: kubecost:pod_cpu_efficiency
      expr: |
        (
          rate(container_cpu_usage_seconds_total[5m]) /
          (container_spec_cpu_quota / container_spec_cpu_period)
        ) * 100

    # Pod memory efficiency
    - record: kubecost:pod_memory_efficiency
      expr: |
        (
          container_memory_working_set_bytes /
          container_spec_memory_limit_bytes
        ) * 100

    # Namespace CPU efficiency
    - record: kubecost:namespace_cpu_efficiency
      expr: |
        avg by (namespace) (kubecost:pod_cpu_efficiency)

    # Namespace memory efficiency
    - record: kubecost:namespace_memory_efficiency
      expr: |
        avg by (namespace) (kubecost:pod_memory_efficiency)
```

### Tier-Specific Rules

```yaml
- name: kubecost.tier_metrics
  interval: 2m
  rules:
    # Cost per tier
    - record: kubecost:tier_daily_cost
      expr: |
        sum by (tier) (
          kubecost:namespace_daily_cost * 
          on(namespace) group_left(tier) 
          kube_namespace_labels{label_iaas_deployment_tier=~".+"}
        )

    # Tier budget utilization
    - record: kubecost:tier_budget_utilization
      expr: |
        (kubecost:tier_daily_cost * 30) / 
        on(tier) group_left() 
        label_replace(
          vector(99), "tier", "basic", "", ""
        ) or
        label_replace(
          vector(299), "tier", "standard", "", ""
        ) or
        label_replace(
          vector(599), "tier", "premium", "", ""
        ) or
        label_replace(
          vector(1299), "tier", "enterprise", "", ""
        )
```

## Alerting Rules

Configure alerts for budget and efficiency monitoring:

### Budget Alerts

```yaml
# prometheus-alerting-rules.yaml
groups:
  - name: kubecost.budget_alerts
    interval: 5m
    rules:
      # Monthly budget exceeded
      - alert: NamespaceBudgetExceeded
        expr: |
          kubecost:namespace_monthly_cost_projection > 
          on(namespace) group_left() 
          (
            label_replace(vector(99), "namespace", "basic-.*", "", "") or
            label_replace(vector(299), "namespace", "standard-.*", "", "") or
            label_replace(vector(599), "namespace", "premium-.*", "", "") or
            label_replace(vector(1299), "namespace", "enterprise-.*", "", "")
          )
        for: 5m
        labels:
          severity: critical
          category: cost
        annotations:
          summary: "Namespace {{ $labels.namespace }} budget exceeded"
          description: |
            Projected monthly cost: ${{ $value | humanize }}
            Budget limit exceeded by namespace {{ $labels.namespace }}

      # Daily cost spike
      - alert: DailyCostSpike
        expr: |
          (
            kubecost:namespace_daily_cost / 
            avg_over_time(kubecost:namespace_daily_cost[7d])
          ) > 2.0
        for: 10m
        labels:
          severity: warning
          category: cost
        annotations:
          summary: "Daily cost spike detected"
          description: |
            Namespace {{ $labels.namespace }} daily cost is 
            {{ $value | humanizePercentage }} higher than 7-day average
```

### Efficiency Alerts

```yaml
- name: kubecost.efficiency_alerts
  interval: 5m
  rules:
    # Low CPU efficiency
    - alert: LowCPUEfficiency
      expr: kubecost:namespace_cpu_efficiency < 20
      for: 15m
      labels:
        severity: warning
        category: efficiency
      annotations:
        summary: "Low CPU efficiency in {{ $labels.namespace }}"
        description: |
          CPU efficiency: {{ $value | humanizePercentage }}
          Consider reducing CPU requests or increasing workload

    # Low memory efficiency
    - alert: LowMemoryEfficiency
      expr: kubecost:namespace_memory_efficiency < 30
      for: 15m
      labels:
        severity: warning
        category: efficiency
      annotations:
        summary: "Low memory efficiency in {{ $labels.namespace }}"
        description: |
          Memory efficiency: {{ $value | humanizePercentage }}
          Consider reducing memory requests or increasing workload
```

## Service Discovery

### Kubernetes Service Discovery Configuration

```yaml
# Service discovery for dynamic pod and service monitoring
kubernetes_sd_configs:
  - role: pod
    namespaces:
      names:
        - kubecost
        - default
        - kube-system
    selectors:
      - role: pod
        label: "app.kubernetes.io/name=kubecost"
      - role: pod
        label: "iaas.deployment/tier"

relabel_configs:
  # Keep only pods with cost tracking labels
  - source_labels: [__meta_kubernetes_pod_label_iaas_deployment_tier]
    action: keep
    regex: (basic|standard|premium|enterprise)

  # Add tier label
  - source_labels: [__meta_kubernetes_pod_label_iaas_deployment_tier]
    target_label: tier

  # Add company label
  - source_labels: [__meta_kubernetes_pod_label_iaas_deployment_company]
    target_label: company

  # Add namespace label
  - source_labels: [__meta_kubernetes_namespace]
    target_label: kubernetes_namespace
```

## Performance Optimization

### 1. Data Retention Configuration

```yaml
# Optimize retention for cost data
prometheus:
  prometheusSpec:
    retention: 90d
    retentionSize: 50GB

    # External storage for long-term retention
    remoteWrite:
      - url: "https://your-remote-storage/write"
        headers:
          "X-Source": "kubecost-prometheus"
```

### 2. Recording Rule Optimization

```yaml
# Optimize recording rules for performance
rules:
  groups:
    - name: kubecost.performance_optimized
      interval: 30s # Balance between accuracy and performance
      rules:
        # Pre-aggregate expensive queries
        - record: kubecost:cluster_hourly_cost
          expr: sum(kubecost_cluster_costs)

        - record: kubecost:tier_resource_usage
          expr: |
            sum by (tier) (
              kubecost_cluster_memory_allocation +
              kubecost_cluster_cpu_allocation
            )
```

### 3. Query Performance Tuning

```yaml
# Prometheus performance tuning
prometheus:
  prometheusSpec:
    resources:
      requests:
        memory: "2Gi"
        cpu: "1000m"
      limits:
        memory: "4Gi"
        cpu: "2000m"

    # Optimize for cost monitoring workloads
    walCompression: true
    query:
      maxConcurrency: 20
      timeout: 30s
```

## Integration with Kubecost

### 1. Metrics Endpoint Configuration

Ensure Kubecost cost-analyzer exposes metrics properly:

```yaml
# kubecost-service.yaml
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
  ports:
    - name: http-api
      port: 9090
      targetPort: 9090
    - name: http-metrics
      port: 9003
      targetPort: 9003
  selector:
    app.kubernetes.io/name: cost-analyzer
```

### 2. Kubecost Configuration for Prometheus

```yaml
# kubecost-config.yaml
kubecost:
  prometheusRule:
    enabled: true
    namespace: kubecost

  prometheus:
    server:
      global:
        external_labels:
          cluster_id: "production-cluster"

    nodeExporter:
      enabled: true

    serviceAccounts:
      server:
        annotations:
          prometheus.io/scrape: "true"
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Missing Cost Data

```bash
# Check if Kubecost is exposing metrics
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9003:9003
curl http://localhost:9003/metrics | grep kubecost

# Verify Prometheus is scraping Kubecost
kubectl port-forward -n kubecost svc/prometheus-server 9090:9090
# Navigate to http://localhost:9090/targets
```

#### 2. High Cardinality Metrics

```bash
# Check metric cardinality
kubectl exec -n kubecost prometheus-server-0 -- \
  promtool query series 'kubecost_cluster_costs'

# Optimize high cardinality metrics
# Add relabel_configs to drop unnecessary labels
```

#### 3. Recording Rule Failures

```bash
# Check recording rule evaluation
kubectl logs -n kubecost prometheus-server-0 | grep "recording rule"

# Validate recording rule syntax
kubectl exec -n kubecost prometheus-server-0 -- \
  promtool check rules /etc/prometheus/rules/recording-rules.yml
```

### Performance Monitoring

```bash
# Monitor Prometheus performance
kubectl exec -n kubecost prometheus-server-0 -- \
  promtool query instant 'prometheus_tsdb_head_series'

# Check rule evaluation time
kubectl exec -n kubecost prometheus-server-0 -- \
  promtool query instant 'prometheus_rule_group_last_duration_seconds'
```

### Debugging Queries

```promql
# Debug cost allocation queries
sum by (namespace) (kubecost_cluster_costs)

# Debug efficiency calculations
avg by (namespace) (
  kubecost_cluster_cpu_efficiency or
  kubecost_cluster_memory_efficiency
)

# Debug tier-based metrics
sum by (tier) (
  kubecost_cluster_costs * on(namespace) group_left(tier)
  kube_namespace_labels{label_iaas_deployment_tier=~".+"}
)
```

## Best Practices

### 1. Metric Collection

- Use appropriate scrape intervals (1m for cost data, 30s for efficiency)
- Implement metric filtering to reduce cardinality
- Use recording rules for expensive aggregations

### 2. Storage Optimization

- Configure appropriate retention periods
- Use remote storage for long-term data
- Implement tiered storage strategies

### 3. Alert Management

- Set meaningful thresholds based on tier budgets
- Implement alert routing based on severity
- Use inhibition rules to reduce alert noise

### 4. Monitoring Health

- Monitor Prometheus itself for performance
- Set up alerts for metric collection failures
- Regular backup of Prometheus configuration

---

This configuration provides a production-ready Prometheus setup optimized for Kubecost cost monitoring with tier-based resource allocation and comprehensive alerting capabilities.
