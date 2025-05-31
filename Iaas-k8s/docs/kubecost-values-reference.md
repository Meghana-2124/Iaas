# Kubecost Values Reference

This document provides a comprehensive reference for all kubecost-related values found in the Helm chart templates and how they should be configured in the dynamic value generation.

## Overview

The Kubecost integration spans across multiple template files and provides comprehensive cost monitoring, allocation, and budgeting capabilities for the IAAS platform.

## Template Files with Kubecost Configuration

### Primary Kubecost Templates

- `kubecost-installation.yaml` - Main Kubecost deployment and configuration
- `node-exporter.yaml` - Node metrics collection for accurate cost calculation
- `prometheus-config.yaml` - Prometheus configuration optimized for Kubecost

### Secondary Templates with Kubecost Integration

- `nginx-deployment.yaml` - Kubecost labels and annotations
- `rafiki-auth-deployment.yaml` - Kubecost labels and annotations
- `rafiki-backend-deployment.yaml` - Kubecost labels and annotations (inferred)

## Complete Kubecost Values Structure

### Core Configuration

```yaml
kubecost:
  # Basic enablement and versioning
  enabled: boolean # Enable/disable kubecost installation
  version: string # Kubecost version (default: "prod-1.108.1")
  clusterId: string # Unique cluster identifier
  token: string # Kubecost enterprise token (optional)
  logLevel: string # Log level: debug, info, warn, error
  prometheusUrl: string # Prometheus endpoint URL
```

### Service Configuration

```yaml
kubecost:
  service:
    type: string # Service type (default: "ClusterIP")
    port: number # Service port (default: 9090)
    targetPort: number # Target port (default: 9090)
    annotations: object # Service annotations
```

### RBAC Configuration

```yaml
kubecost:
  rbac:
    enabled: boolean # Enable RBAC (default: true)
    serviceAccountName: string # Service account name
```

### Prometheus Integration

```yaml
kubecost:
  prometheus:
    # Core settings
    enabled: boolean # Enable custom Prometheus deployment

    # Image configuration
    image:
      repository: string # Prometheus image repository
      tag: string # Prometheus image tag
      pullPolicy: string # Image pull policy

    # Data retention
    retention: string # Data retention period (default: "15d")
    retentionSize: string # Data retention size (default: "10GB")

    # Storage configuration
    persistence:
      enabled: boolean # Enable persistent storage
      storageClass: string # Storage class name
      size: string # Storage size (default: "20Gi")
      accessMode: string # Access mode (default: "ReadWriteOnce")

    # Resource limits
    resources:
      limits:
        cpu: string # CPU limit (default: "2000m")
        memory: string # Memory limit (default: "4Gi")
      requests:
        cpu: string # CPU request (default: "500m")
        memory: string # Memory request (default: "2Gi")

    # Scraping configuration
    scrapeInterval: string # Scrape interval (default: "30s")
    scrapeTimeout: string # Scrape timeout (default: "10s")
    evaluationInterval: string # Evaluation interval (default: "30s")

    # External labels
    externalLabels:
      cluster: string # Cluster name
      environment: string # Environment name

    # Service configuration
    service:
      type: string # Service type
      port: number # Service port

    # ServiceMonitor for Prometheus Operator
    serviceMonitor:
      enabled: boolean # Enable ServiceMonitor
      additionalLabels: object # Additional labels
      interval: string # Scrape interval
      scrapeTimeout: string # Scrape timeout

    # Prometheus Operator integration
    operator:
      enabled: boolean # Enable Prometheus Operator integration

    # CRD management
    createCRDs: boolean # Create Prometheus CRDs

    # Alertmanager integration
    alertmanager:
      enabled: boolean # Enable Alertmanager
      url: string # Alertmanager URL

    # Additional scrape configs
    additionalScrapeConfigs: array # Additional scrape configurations

    # Remote write configuration
    remoteWrite:
      enabled: boolean # Enable remote write
      url: string # Remote write URL
      basicAuth:
        enabled: boolean # Enable basic auth
        username: string # Username
        password: string # Password
      configs: array # Remote write configurations

    # TSDB configuration
    tsdb:
      minBlockDuration: string # Min block duration (default: "2h")
      maxBlockDuration: string # Max block duration (default: "25h")
      walCompression: boolean # WAL compression (default: true)

    # Security context
    securityContext:
      runAsUser: number # User ID
      runAsGroup: number # Group ID
      fsGroup: number # FS group ID
      runAsNonRoot: boolean # Run as non-root
```

### Node Exporter Configuration

```yaml
kubecost:
  nodeExporter:
    # Basic configuration
    enabled: boolean # Enable Node Exporter (default: true)

    # Image configuration
    image:
      repository: string # Image repository (default: "prom/node-exporter")
      tag: string # Image tag (default: "v1.7.0")
      pullPolicy: string # Pull policy (default: "IfNotPresent")

    # Resource configuration
    resources:
      limits:
        cpu: string # CPU limit (default: "200m")
        memory: string # Memory limit (default: "128Mi")
      requests:
        cpu: string # CPU request (default: "100m")
        memory: string # Memory request (default: "64Mi")

    # Security context
    securityContext:
      runAsUser: number # User ID
      runAsGroup: number # Group ID
      runAsNonRoot: boolean # Run as non-root
```

### Cost Allocation Configuration

```yaml
kubecost:
  allocation:
    # Allocation strategies
    tierBased: boolean # Enable tier-based allocation
    companyBased: boolean # Enable company-based allocation
    shareIdle: boolean # Share idle costs
    shareNamespaces: array # Namespaces to share costs
```

### Efficiency Monitoring

```yaml
kubecost:
  efficiency:
    # Efficiency thresholds
    cpuThreshold: number # CPU efficiency threshold (0.0-1.0)
    memoryThreshold: number # Memory efficiency threshold (0.0-1.0)
```

### Alert Configuration

```yaml
kubecost:
  alerts:
    # Basic alert settings
    enabled: boolean # Enable alerts
    budgetThreshold: number # Budget alert threshold (default: 90)
    anomalyThreshold: number # Anomaly detection threshold (default: 150)
    webhookUrl: string # Webhook URL for alerts

    # Cost spike detection
    spikeThreshold: number # Cost spike threshold percentage

    # Email configuration
    email:
      enabled: boolean # Enable email alerts
      to: array # Email recipients
      from: string # From email address

    # Slack integration
    slack:
      enabled: boolean # Enable Slack alerts
      channel: string # Slack channel
      webhook: string # Slack webhook URL
```

### Budget Configuration by Tier

```yaml
kubecost:
  budgets:
    basic:
      monthly: number # Monthly budget in USD
      alertThresholds:
        warning: number # Warning threshold percentage
        critical: number # Critical threshold percentage
    standard:
      monthly: number
      alertThresholds:
        warning: number
        critical: number
    premium:
      monthly: number
      alertThresholds:
        warning: number
        critical: number
    enterprise:
      monthly: number
      alertThresholds:
        warning: number
        critical: number
```

### Cost Limits by Tier

```yaml
kubecost:
  limits:
    basic:
      dailyCost: number # Daily cost limit in USD
      hourlyCost: number # Hourly cost limit in USD
    standard:
      dailyCost: number
      hourlyCost: number
    premium:
      dailyCost: number
      hourlyCost: number
    enterprise:
      dailyCost: number
      hourlyCost: number
```

### Pricing Configuration by Tier

```yaml
kubecost:
  pricing:
    basic:
      cpu: string # Cost per CPU hour in USD
      memory: string # Cost per GB memory hour in USD
      storage: string # Cost per GB storage hour in USD
    standard:
      cpu: string
      memory: string
      storage: string
    premium:
      cpu: string
      memory: string
      storage: string
    enterprise:
      cpu: string
      memory: string
      storage: string
```

### Billing Integration

```yaml
kubecost:
  billing:
    # Cloud provider billing
    enabled: boolean # Enable billing integration
    provider: string # Cloud provider (aws, gcp, azure)

    # API configuration
    api:
      key: string # API key
      secret: string # API secret
      region: string # Region
```

### Network Policy

```yaml
kubecost:
  networkPolicy:
    enabled: boolean # Enable network policies
```

### Ingress Configuration

```yaml
kubecost:
  ingress:
    enabled: boolean # Enable ingress
    host: string # Ingress hostname
    className: string # Ingress class name
    annotations: object # Ingress annotations
    path: string # Ingress path (default: "/")
    pathType: string # Path type (default: "Prefix")
    tls:
      enabled: boolean # Enable TLS
      secretName: string # TLS secret name
```

### Namespace Monitoring

```yaml
kubecost:
  namespaceMonitoring:
    enabled: boolean # Enable namespace-specific monitoring
    namespace: string # Target namespace
    company: string # Company name
    tier: string # Tier name
```

### Cost Allocation Labels

```yaml
kubecost:
  costAllocationLabels: array # Labels used for cost allocation

  # Standard labels applied to resources
  labels:
    tier: string # Plan tier
    company: string # Company name
    billingAccount: string # Billing account ID
    namespace: string # Namespace
    deploymentType: string # Deployment type (shared/dedicated)
```

## Labels and Annotations Applied to Resources

### Resource Labels (when kubecost.enabled is true)

```yaml
labels:
  kubecost.tier: "{{ .Values.planTier }}"
  kubecost.company: "{{ .Values.companyName }}"
  kubecost.service: "{{ service-name }}"
```

### Resource Annotations (when kubecost.enabled is true)

```yaml
annotations:
  kubecost.io/tier: "{{ .Values.planTier }}"
  kubecost.io/company: "{{ .Values.companyName }}"
```

## Environment Variables in Kubecost Deployment

```yaml
env:
  - name: PROMETHEUS_SERVER_ENDPOINT
    value: "{{ .Values.kubecost.prometheusUrl }}"
  - name: CLOUD_PROVIDER_API_KEY
    value: "AIzaSyDXQPG_MHUEy9neR7stolq6l0ujXmjJlvk"
  - name: CLUSTER_ID
    value: "{{ .Values.kubecost.clusterId }}"
  - name: KUBECOST_NAMESPACE
    value: "kubecost"
  - name: KUBECOST_TOKEN
    value: "{{ .Values.kubecost.token }}"
  - name: LOG_LEVEL
    value: "{{ .Values.kubecost.logLevel }}"
  - name: CONFIG_PATH
    value: "/var/configs"
```

## ConfigMap Configurations

### Allocation Config

```yaml
allocation-config.yaml: |
  allocations:
    - name: "tier-based"
      aggregateBy:
        - "label:iaas.deployment/tier"
        - "label:iaas.deployment/company"
      filters:
        namespace: ["default", "kube-system"]
    - name: "company-based"
      aggregateBy:
        - "label:iaas.deployment/company"
      shareIdle: true
      shareNamespaces:
        - "kube-system"
```

### Pricing Config

```yaml
pricing-config.yaml: |
  tiers:
    basic:
      cpu: "{{ .Values.kubecost.pricing.basic.cpu }}"
      memory: "{{ .Values.kubecost.pricing.basic.memory }}"
      storage: "{{ .Values.kubecost.pricing.basic.storage }}"
    # ... other tiers
```

### Alert Config

```yaml
alerts.yaml: |
  alerts:
    - name: "tier-budget-exceeded"
      description: "Tier budget has been exceeded"
      enabled: true
      threshold: "{{ .Values.kubecost.alerts.budgetThreshold }}"
      aggregation: "tier"
      window: "1d"
      filters:
        - property: "tier"
          value: "{{ .Values.planTier }}"
```

## Integration Points

1. **Resource Labeling**: All deployments receive kubecost labels when `kubecost.enabled` is true
2. **Prometheus Integration**: Custom Prometheus deployment with kubecost-optimized configuration
3. **Node Metrics**: Node Exporter deployed for accurate node-level cost calculation
4. **Alerting**: Tier-based budget alerts and anomaly detection
5. **Cost Allocation**: Automatic cost allocation by tier and company
6. **Ingress**: Optional ingress for kubecost UI access

## Default Values Summary

- **Version**: `prod-1.108.1`
- **Cluster ID**: `shared-cluster`
- **Prometheus Retention**: `15d` / `10GB`
- **Node Exporter**: Enabled with `v1.7.0`
- **RBAC**: Enabled
- **Alerts**: Budget threshold at 90%, anomaly at 150%
- **Service Type**: `ClusterIP`
- **Log Level**: `info`
