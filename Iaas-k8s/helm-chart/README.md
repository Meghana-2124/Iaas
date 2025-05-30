# Kubecost-Prometheus Integration Helm Chart

This Helm chart provides a complete integration of Kubecost with custom Prometheus for Kubernetes cost monitoring and optimization. It includes tier-based resource allocation, budget alerting, and comprehensive cost tracking across different deployment environments.

## 🚀 Features

- **Custom Prometheus Integration**: Full Prometheus deployment optimized for cost monitoring
- **Kubecost Cost Analytics**: Complete cost allocation and monitoring solution
- **Tier-Based Budgeting**: Support for basic, standard, premium, and enterprise tiers
- **Resource Optimization**: Recording rules for cost efficiency metrics
- **Budget Alerting**: Automated alerts for budget thresholds
- **Node-Level Metrics**: Node Exporter for accurate resource utilization
- **Multi-Cloud Support**: Works with AWS, GCP, Azure, and on-premises clusters

## 📋 Prerequisites

- Kubernetes cluster (1.24+)
- Helm 3.8+
- kubectl configured to access your cluster
- 4GB+ free memory for Prometheus and Kubecost
- StorageClass for persistent volume claims (optional but recommended)

## 🛠️ Quick Start

### 1. Clone and Deploy

```bash
# Clone the repository
git clone <your-repo-url>
cd helm-chart

# Deploy with default configuration
./scripts/deploy.sh

# Or deploy with custom values
./scripts/deploy.sh -f custom-values.yaml
```

### 2. Access the UIs

```bash
# Access Kubecost UI
kubectl port-forward svc/kubecost-cost-analyzer 9090:9090 -n kubecost
# Open http://localhost:9090

# Access Prometheus UI
kubectl port-forward svc/prometheus-server 9091:9090 -n kubecost
# Open http://localhost:9091
```

### 3. Validate Deployment

```bash
# Run deployment tests
./scripts/test-deployment.sh
```

## ⚙️ Configuration

### Core Configuration (`values.yaml`)

```yaml
# Global settings
global:
  companyName: "mycompany"
  planTier: "basic" # basic, standard, premium, enterprise

# Kubecost configuration
kubecost:
  enabled: true
  version: "prod-1.108.1"
  clusterId: "shared-cluster"

  # Prometheus settings
  prometheus:
    enabled: true
    retention: "15d"
    persistence:
      enabled: true
      size: "20Gi"

  # Budget configuration by tier
  budgets:
    basic:
      monthly: 100 # USD
      alertThresholds:
        warning: 80 # %
        critical: 95 # %
    standard:
      monthly: 500
    # ... more tiers
```

### Environment-Specific Values

Create environment-specific values files:

```bash
# Development environment
cp values.yaml values-dev.yaml
# Edit values-dev.yaml for dev settings

# Production environment
cp values.yaml values-prod.yaml
# Edit values-prod.yaml for prod settings
```

## 📊 Monitoring & Alerting

### Built-in Metrics

The chart includes comprehensive recording rules for:

- **Cost Allocation**: Costs by namespace, tier, and company
- **Resource Efficiency**: CPU/Memory utilization rates
- **Budget Tracking**: Spend vs. budget by tier
- **Cost Trends**: Daily, weekly, monthly cost projections

### Alert Rules

Pre-configured alerts for:

- Budget threshold warnings (80% of monthly budget)
- Budget threshold critical (95% of monthly budget)
- High resource waste (>50% idle resources)
- Kubecost service health

### Custom Dashboards

Access Grafana dashboards (if enabled):

```yaml
monitoring:
  grafana:
    enabled: true
    adminPassword: "your-secure-password"
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Kubecost      │    │   Prometheus    │    │  Node Exporter  │
│  Cost Analyzer  │◄───┤     Server      │◄───┤   (DaemonSet)   │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │    Pods     │ │  Services   │ │   Nodes     │              │
│  └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## 🎯 Deployment Tiers

### Basic Tier

- Monthly budget: $100
- Resource limits: 2 CPU, 4Gi memory
- Basic cost tracking

### Standard Tier

- Monthly budget: $500
- Resource limits: 8 CPU, 16Gi memory
- Enhanced reporting

### Premium Tier

- Monthly budget: $2,000
- Resource limits: 32 CPU, 64Gi memory
- Advanced analytics

### Enterprise Tier

- Monthly budget: $10,000
- Resource limits: 128 CPU, 256Gi memory
- Full feature set

## 📁 Chart Structure

```
helm-chart/
├── Chart.yaml                           # Chart metadata
├── values.yaml                          # Default configuration values
├── README.md                            # This documentation
├── scripts/
│   ├── deploy.sh                        # Deployment script
│   └── test-deployment.sh               # Validation script
└── templates/
    ├── kubecost-installation.yaml       # Kubecost deployment
    ├── prometheus-deployment.yaml       # Prometheus StatefulSet
    ├── prometheus-config.yaml           # Prometheus configuration
    ├── prometheus-recording-rules.yaml  # Cost metrics recording rules
    ├── prometheus-alerting-rules.yaml   # Budget and cost alerts
    ├── prometheus-servicemonitors.yaml  # ServiceMonitor CRDs
    ├── prometheus-rules-cr.yaml         # PrometheusRule CRDs
    ├── prometheus-pvc.yaml              # Persistent volume claims
    ├── prometheus-crds.yaml             # Custom Resource Definitions
    ├── node-exporter.yaml               # Node Exporter DaemonSet
    └── _prometheus-helpers.tpl           # Helper templates
```

## 🚀 Deployment Options

### Option 1: Quick Deploy (Recommended)

```bash
# Deploy with defaults
./scripts/deploy.sh

# Deploy with custom namespace
./scripts/deploy.sh -n monitoring

# Upgrade existing deployment
./scripts/deploy.sh --upgrade

# Dry run to validate
./scripts/deploy.sh --dry-run
```

### Option 2: Manual Helm

```bash
# Install
helm install kubecost-monitoring . -n kubecost --create-namespace

# Upgrade
helm upgrade kubecost-monitoring . -n kubecost

# Uninstall
helm uninstall kubecost-monitoring -n kubecost
```

### Option 3: Custom Values

```bash
# Create custom values
cat > my-values.yaml << EOF
global:
  companyName: "acme-corp"
  planTier: "premium"

kubecost:
  prometheus:
    retention: "30d"
    persistence:
      size: "50Gi"

  budgets:
    premium:
      monthly: 5000
EOF

# Deploy with custom values
./scripts/deploy.sh -f my-values.yaml
```

## 🔧 Customization

### Adding Custom Metrics

Add additional scrape configs to Prometheus:

```yaml
kubecost:
  prometheus:
    additionalScrapeConfigs:
      - job_name: "my-app"
        static_configs:
          - targets: ["my-app-service:8080"]
```

### Custom Budget Alerts

Modify alert thresholds per tier:

```yaml
kubecost:
  budgets:
    standard:
      monthly: 1000
      alertThresholds:
        warning: 70 # Alert at 70% instead of 80%
        critical: 90 # Alert at 90% instead of 95%
```

### Resource Quotas

Adjust resource limits by tier:

```yaml
resourceQuotas:
  premium:
    requests:
      cpu: "64"
      memory: "128Gi"
    limits:
      cpu: "128"
      memory: "256Gi"
```

## 🧪 Testing & Validation

### Automated Testing

```bash
# Run full test suite
./scripts/test-deployment.sh

# Check specific components
kubectl get pods -n kubecost
kubectl get svc -n kubecost
kubectl get configmap -n kubecost
```

### Manual Validation

```bash
# Check Prometheus targets
kubectl port-forward svc/prometheus-server 9090:9090 -n kubecost
# Visit http://localhost:9090/targets

# Check Kubecost metrics
kubectl port-forward svc/kubecost-cost-analyzer 9090:9090 -n kubecost
# Visit http://localhost:9090

# View cost allocation
curl -G http://localhost:9090/model/allocation \
  -d window=1d \
  -d aggregate=namespace
```

## 📊 Key Metrics

### Cost Metrics

- `kubecost_allocation_cpu_cost`: CPU cost by allocation
- `kubecost_allocation_memory_cost`: Memory cost by allocation
- `kubecost_allocation_storage_cost`: Storage cost by allocation
- `kubecost_cluster_cost_total`: Total cluster cost

### Efficiency Metrics

- `kubecost_cpu_efficiency`: CPU utilization efficiency
- `kubecost_memory_efficiency`: Memory utilization efficiency
- `kubecost_cost_per_cpu_hour`: Cost per CPU hour
- `kubecost_cost_per_memory_gb_hour`: Cost per GB memory hour

### Budget Metrics

- `kubecost_budget_monthly_{tier}`: Monthly budget by tier
- `kubecost_spend_monthly_{tier}`: Monthly spend by tier
- `kubecost_budget_utilization_{tier}`: Budget utilization percentage

## 🔍 Troubleshooting

### Common Issues

#### Prometheus Not Starting

```bash
# Check logs
kubectl logs statefulset/prometheus-server -n kubecost

# Check storage
kubectl get pvc -n kubecost

# Check configuration
kubectl get configmap prometheus-config -n kubecost -o yaml
```

#### Kubecost Not Connecting to Prometheus

```bash
# Check service endpoints
kubectl get endpoints prometheus-server -n kubecost

# Check Kubecost logs
kubectl logs deployment/kubecost-cost-analyzer -n kubecost

# Verify Prometheus URL
kubectl get deployment kubecost-cost-analyzer -n kubecost -o yaml | grep PROMETHEUS_SERVER_ENDPOINT
```

#### Node Exporter Not Running

```bash
# Check DaemonSet status
kubectl get daemonset node-exporter -n kubecost

# Check node constraints
kubectl describe daemonset node-exporter -n kubecost

# Check node labels
kubectl get nodes --show-labels
```

### Debug Commands

```bash
# Port forward to debug services
kubectl port-forward svc/prometheus-server 9090:9090 -n kubecost &
kubectl port-forward svc/kubecost-cost-analyzer 9091:9090 -n kubecost &

# Check resource usage
kubectl top pods -n kubecost
kubectl top nodes

# Check events
kubectl get events -n kubecost --sort-by='.lastTimestamp'
```

## 🔒 Security Considerations

### RBAC Permissions

The chart creates minimal required permissions:

- Prometheus: Read access to cluster metrics
- Kubecost: Read access for cost calculation
- Node Exporter: Host-level metrics access

### Network Policies

Enable network policies for enhanced security:

```yaml
security:
  networkPolicies:
    enabled: true
    defaultDeny: true
```

### Pod Security Standards

Configure pod security standards:

```yaml
security:
  podSecurityStandards:
    enforce: "restricted"
    audit: "restricted"
    warn: "restricted"
```

## 📈 Scaling & Performance

### High Availability

Enable HA mode for production:

```yaml
ha:
  enabled: true
  replicas: 3

kubecost:
  prometheus:
    persistence:
      enabled: true
      size: "100Gi"
```

### Resource Optimization

Optimize for large clusters:

```yaml
kubecost:
  prometheus:
    retention: "7d" # Reduce retention for large clusters
    resources:
      limits:
        cpu: "4000m"
        memory: "8Gi"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- Documentation: Check this README and inline code comments
- Issues: Create GitHub issues for bugs and feature requests
- Community: Join our Slack/Discord for discussions

## 🔗 Useful Links

- [Kubecost Documentation](https://docs.kubecost.com/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Cost Optimization Guide](https://kubernetes.io/docs/concepts/cluster-administration/cost-optimization/)

When deployed via the Pulumi project, values and secrets are merged from multiple sources (base `values.yaml`, environment-specific `values.<env>.yaml`, and cloud-specific `chart-config` files) by the `automation.ts` script and passed as JSON strings to Pulumi, which then supplies them to this Helm chart.

### `companyName`

The `companyName` value is crucial. It is used in `Chart.yaml` to define the chart's name (`name: "{{ .Values.companyName }}-rafiki"`) and is also used by the Pulumi deployment script to name the Helm release.

**Example in `values.yaml`:**

```yaml
companyName: "mycompany"
# ... other default values
```

### Managing Secrets (for Manual Helm CLI Usage)

Secrets are managed via `templates/secret.yaml`. For manual deployment, it's recommended to use external, gitignored secret files.

**Example `secrets.prod.yaml` (gitignored):**

```yaml
kubernetesSecrets:
  rafikiAuth:
    stringData:
      RAFIKI_AUTH_DATABASE_URL: "prod_db_url"
      # ... other plain text secrets (no base64 encoding needed with stringData)
  rafikiBackend:
    stringData:
      RAFIKI_BACKEND_DATABASE_URL: "prod_db_url"
      # ... other plain text secrets (no base64 encoding needed with stringData)
```

Deploy manually merging this file:
`helm upgrade --install <release-name> . -f values.yaml -f values.prod.yaml -f secrets.prod.yaml -n <namespace>`

**Note on Pulumi Deployment:** When deployed via Pulumi, the `automation.ts` script reads these types of secret files from `../<cloudProvider>/chart-config/secrets.<env>.yaml`, converts them to JSON, and passes them to the Pulumi program. The Helm chart then receives these secrets as part of its values.

## Manual Deployment Steps (Using Helm CLI)

These steps are for deploying the chart directly with Helm, outside of the Pulumi automation.

1.  **Navigate to Chart Directory:**
    `cd Iaas-k8s/helm-chart`

2.  **Ensure `companyName` is set:**
    Verify `companyName` is in `values.yaml` or provide it via `--set companyName=yourcompany`.

3.  **Create Namespace (Recommended):**
    `kubectl create namespace my-rafiki-app-dev`

4.  **Lint and Dry Run (Recommended):**

    ```bash
    # Ensure companyName is available for linting, e.g., by having it in values.yaml
    helm lint . -f values.yaml -f values.dev.yaml --set companyName=yourcompany
    helm install my-release-dev . \
      --namespace my-rafiki-app-dev \
      -f values.yaml \
      -f values.dev.yaml \
      # -f secrets.dev.yaml # If using separate secrets file
      --set companyName=yourcompany \
      --dry-run --debug
    ```

5.  **Deploy:**

    ```bash
    helm upgrade --install my-release-dev . \
      --namespace my-rafiki-app-dev \
      -f values.yaml \
      -f values.dev.yaml \
      # -f secrets.dev.yaml
      --set companyName=yourcompany # Ensure companyName is set for the release name logic if Chart.yaml depends on it for the name directly
      --create-namespace
    ```

    The release name will be based on `companyName` if the Pulumi script's logic is replicated (`{{ .Values.companyName }}-rafiki`). For manual Helm, you define the release name (e.g., `my-release-dev`). The `Chart.yaml` itself uses `{{ .Values.companyName }}-rafiki` as its _chart name_.

6.  **Verify Deployment:**
    `kubectl get all -n my-rafiki-app-dev`

## Interaction with Pulumi Deployment

- The Pulumi project in `../pulumi/` is the primary intended method for deploying this chart.
- The `automation.ts` script in the Pulumi project handles:
  - Collecting `companyName` from Pulumi config.
  - Reading and merging `values.yaml`, `values.<env>.yaml` (from `helm-chart/`), and cloud-specific `values.<env>.yaml` and `secrets.<env>.yaml` (from `../<cloudProvider>/chart-config/`).
  - Passing the combined values (including `companyName` and secrets) as JSON strings to the Pulumi program (`index.ts`).
  - The Pulumi program then deploys this Helm chart using the provided values. The Helm release name is constructed as `${companyName}-rafiki`.
- The `Chart.yaml` `name` field is `{{ .Values.companyName }}-rafiki`. This means the `companyName` value _must_ be present in the values passed to Helm for the chart to be correctly identified.

## Key Template Files

- `templates/_helpers.tpl`: Common helper templates.
- `templates/secret.yaml`: Manages Kubernetes secrets.
- `templates/*-deployment.yaml`, `templates/*-service.yaml`: Define deployments and services for components like Nginx, Rafiki-Auth, Rafiki-Backend, Redis.
- `templates/ingress.yaml`: Defines Ingress resource. For GCP, Pulumi `index.ts` injects an annotation for the static IP.
- `templates/configmap.yaml`: Nginx configuration.

# Horizontal Pod Autoscaler (HPA)

## Enabling HPA for Nginx, Rafiki-Backend, and Rafiki-Auth

This chart supports deploying a HorizontalPodAutoscaler (HPA) for the Nginx, Rafiki-Backend, and Rafiki-Auth deployments. You can configure HPA for each component via their respective `hpa` sections in your values file or via Pulumi automation.

Example configuration in `values.yaml`:

```yaml
nginx:
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80

rafikiBackend:
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80

rafikiAuth:
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
```

- `enabled`: Set to `true` to enable HPA for the component.
- `minReplicas`: Minimum number of pod replicas.
- `maxReplicas`: Maximum number of pod replicas.
- `targetCPUUtilizationPercentage`: Target average CPU utilization across pods.

If deploying via Pulumi, you can override these values in your `helmValuesJson`.

> **Note:** Each component (nginx, rafikiBackend, rafikiAuth) has its own HPA configuration and template. HPAs will only be created if the corresponding `hpa.enabled` value is set to `true`.

## Customization (Manual Helm)

- Modify `values.yaml`, `values.dev.yaml`, `values.prod.yaml` for each component's HPA settings.
- For structural changes, edit the corresponding HPA templates in `templates/` (e.g., `nginx-hpa.yaml`, `rafiki-backend-hpa.yaml`, `rafiki-auth-hpa.yaml`).

Remember to always include `companyName` in your values when working with this chart, as `Chart.yaml` depends on it.
