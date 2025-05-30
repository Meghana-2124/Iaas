# Kubecost Integration Deployment Guide

This guide provides step-by-step instructions for deploying and validating the Kubecost integration in your Kubernetes environment.

## 📋 Prerequisites

Before deploying the Kubecost integration, ensure you have:

### Required Tools

- `kubectl` installed and configured for your cluster
- `helm` (version 3.x) for chart deployments
- Node.js (version 16+) for running validation scripts
- Access to Google Cloud Console (for GCP billing integration)

### Required Access

- Kubernetes cluster admin access
- GCP Billing Account access
- Ability to create service accounts and secrets

### Environment Variables

Set the following environment variables:

```bash
export KUBECOST_URL="http://kubecost-cost-analyzer.kubecost:9090"
export GCP_BILLING_ACCOUNT_ID="your-billing-account-id"
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

## 🚀 Deployment Steps

### Step 1: Deploy Kubecost to Your Cluster

#### Option A: Using Helm (Recommended)

```bash
# Add kubecost helm repository
helm repo add kubecost https://kubecost.github.io/cost-analyzer/
helm repo update

# Create kubecost namespace
kubectl create namespace kubecost

# Install kubecost with our custom values
helm install kubecost kubecost/cost-analyzer \
  --namespace kubecost \
  --set prometheus.server.global.external_labels.cluster_id=your-cluster-name \
  --set prometheus.server.retention=15d \
  --set global.grafana.enabled=false \
  --set global.notifications.enabled=true
```

#### Option B: Using Our Helm Chart

```bash
# Navigate to helm chart directory
cd helm-chart

# Install using our custom chart with kubecost included
helm install iaas-k8s-with-kubecost . \
  --namespace your-namespace \
  --set kubecost.enabled=true \
  --set kubecost.billingAccountId=$GCP_BILLING_ACCOUNT_ID
```

### Step 2: Configure GCP Billing Integration

Follow the detailed setup in [kubecost-gcp-billing-setup.md](docs/kubecost-gcp-billing-setup.md):

1. **Create GCP Service Account**

   ```bash
   # Create service account
   gcloud iam service-accounts create kubecost-billing \
     --display-name="Kubecost Billing Integration"

   # Grant required permissions
   gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
     --member="serviceAccount:kubecost-billing@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" \
     --role="roles/billing.viewer"

   # Create and download key
   gcloud iam service-accounts keys create kubecost-billing-key.json \
     --iam-account=kubecost-billing@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com
   ```

2. **Create Kubernetes Secret**

   ```bash
   kubectl create secret generic kubecost-gcp-billing \
     --from-file=service-account-key.json=kubecost-billing-key.json \
     --namespace kubecost
   ```

3. **Configure Kubecost for GCP Billing**
   ```bash
   kubectl patch deployment kubecost-cost-analyzer \
     --namespace kubecost \
     --patch='
   spec:
     template:
       spec:
         containers:
         - name: cost-analyzer
           env:
           - name: GCP_BILLING_ACCOUNT_ID
             value: "'$GCP_BILLING_ACCOUNT_ID'"
           - name: GOOGLE_APPLICATION_CREDENTIALS
             value: "/var/secrets/google/service-account-key.json"
           volumeMounts:
           - name: gcp-billing
             mountPath: /var/secrets/google
             readOnly: true
         volumes:
         - name: gcp-billing
           secret:
             secretName: kubecost-gcp-billing'
   ```

### Step 3: Configure Prometheus Integration

Follow the detailed setup in [kubecost-prometheus-configuration.md](docs/kubecost-prometheus-configuration.md):

1. **Apply Prometheus Recording Rules**

   ```bash
   kubectl apply -f - <<EOF
   apiVersion: monitoring.coreos.com/v1
   kind: PrometheusRule
   metadata:
     name: kubecost-recording-rules
     namespace: kubecost
   spec:
     groups:
     - name: kubecost.rules
       rules:
       - record: kubecost:cluster_cpu_usage_rate5m
         expr: rate(container_cpu_usage_seconds_total[5m])
       - record: kubecost:cluster_memory_usage_bytes
         expr: container_memory_working_set_bytes
   EOF
   ```

2. **Configure Alerting Rules**
   ```bash
   kubectl apply -f - <<EOF
   apiVersion: monitoring.coreos.com/v1
   kind: PrometheusRule
   metadata:
     name: kubecost-alerting-rules
     namespace: kubecost
   spec:
     groups:
     - name: kubecost.alerts
       rules:
       - alert: HighCostNamespace
         expr: kubecost_cluster_cost_per_namespace > 100
         for: 5m
         labels:
           severity: warning
         annotations:
           summary: "High cost detected in namespace {{ $labels.namespace }}"
   EOF
   ```

### Step 4: Deploy Cost Allocation Labels

Apply cost allocation labels to your workloads:

```bash
# Label existing deployments
kubectl label deployment --all iaas.deployment/tier=standard
kubectl label deployment --all iaas.deployment/company=your-company

# Label namespaces
kubectl label namespace your-namespace iaas.deployment/tier=standard
kubectl label namespace your-namespace iaas.deployment/company=your-company
```

### Step 5: Initialize Kubecost Client in Your Application

Add the kubecost integration to your deployment code:

```typescript
import { createKubecostClient } from "./src/utils/kubecost-client";
import { PlanTier } from "./src/types/plans";

// Initialize kubecost client
const kubecostClient = createKubecostClient(
  process.env.KUBECOST_URL || "http://kubecost-cost-analyzer.kubecost:9090",
  {
    enabled: true,
    namespace: "kubecost",
    currency: "USD",
    billingAccountId: process.env.GCP_BILLING_ACCOUNT_ID,
    costAllocationLabels: [
      "iaas.deployment/tier",
      "iaas.deployment/company",
      "iaas.deployment/namespace",
    ],
    alertingEnabled: true,
    budgetAlerts: {
      enabled: true,
      thresholds: [50, 80, 100],
    },
  },
  logger
);

// Setup cost monitoring for a new deployment
await kubecostClient.setupCostMonitoring(
  namespace,
  company,
  PlanTier.STANDARD,
  299 // Monthly budget in USD
);
```

## ✅ Validation and Testing

### Step 1: Run Deployment Validation

```bash
# Make the validation script executable
chmod +x scripts/validate-kubecost-deployment.ts

# Run validation
npx ts-node scripts/validate-kubecost-deployment.ts
```

### Step 2: Run Integration Tests

```bash
# Run comprehensive integration tests
npx jest tests/kubecost-integration.test.ts --verbose

# Or run the demo
npx ts-node examples/kubecost-integration-demo.ts
```

### Step 3: Manual Verification

1. **Check Kubecost UI**

   ```bash
   # Port-forward to access Kubecost UI
   kubectl port-forward -n kubecost service/kubecost-cost-analyzer 9090:9090

   # Access http://localhost:9090 in your browser
   ```

2. **Verify Cost Data**

   - Navigate to "Cost Allocation" in Kubecost UI
   - Verify that costs are being tracked by namespace and labels
   - Check that GCP billing data is being imported (may take 24-48 hours)

3. **Test Alerts**
   - Check Prometheus alerts: `kubectl get prometheusrule -n kubecost`
   - Verify alertmanager configuration if using external alertmanager

## 🔧 Troubleshooting

### Common Issues

#### Kubecost Not Showing Cost Data

```bash
# Check kubecost logs
kubectl logs -n kubecost deployment/kubecost-cost-analyzer

# Verify prometheus is scraping metrics
kubectl exec -n kubecost deployment/kubecost-prometheus-server -- \
  wget -qO- http://localhost:9090/api/v1/query?query=up
```

#### GCP Billing Integration Not Working

```bash
# Check service account permissions
kubectl logs -n kubecost deployment/kubecost-cost-analyzer | grep -i billing

# Verify secret is mounted correctly
kubectl describe pod -n kubecost -l app=cost-analyzer
```

#### High Memory Usage

```bash
# Check prometheus retention settings
kubectl get configmap -n kubecost kubecost-prometheus-server -o yaml

# Reduce retention if needed
kubectl patch configmap kubecost-prometheus-server -n kubecost --patch='
data:
  prometheus.yml: |
    global:
      retention.time: 7d'
```

### Performance Optimization

#### For Large Clusters (>100 nodes)

```bash
# Increase resources for kubecost
kubectl patch deployment kubecost-cost-analyzer -n kubecost --patch='
spec:
  template:
    spec:
      containers:
      - name: cost-analyzer
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "1000m"'
```

#### For High-Volume Metrics

```bash
# Configure prometheus storage
kubectl patch statefulset kubecost-prometheus-server -n kubecost --patch='
spec:
  template:
    spec:
      containers:
      - name: prometheus-server
        args:
        - --storage.tsdb.retention.time=7d
        - --storage.tsdb.retention.size=10GB'
```

## 📊 Monitoring and Maintenance

### Regular Tasks

#### Daily

- Monitor kubecost pod health: `kubectl get pods -n kubecost`
- Check cost allocation accuracy in Kubecost UI

#### Weekly

- Review cost trends and anomalies
- Validate GCP billing reconciliation
- Check alert configurations

#### Monthly

- Review and adjust budget allocations
- Analyze cost optimization recommendations
- Update cost allocation labels as needed

### Automated Monitoring

Set up automated monitoring using our provided scripts:

```bash
# Add to cron for daily validation
0 8 * * * /path/to/scripts/validate-kubecost-deployment.ts >> /var/log/kubecost-validation.log 2>&1

# Weekly cost report generation
0 9 * * 1 npx ts-node examples/kubecost-integration-demo.ts --generate-report
```

## 🔒 Security Considerations

### Service Account Permissions

- Use minimal required permissions for GCP service account
- Regularly rotate service account keys
- Monitor service account usage

### Network Security

- Restrict access to Kubecost UI using ingress with authentication
- Use NetworkPolicies to limit pod-to-pod communication
- Enable TLS for all communications

### Data Protection

- Ensure cost data is not exposed in logs
- Use secrets for sensitive configuration
- Implement backup and disaster recovery procedures

## 📚 Additional Resources

- [Kubecost Documentation](https://docs.kubecost.com/)
- [GCP Billing API Documentation](https://cloud.google.com/billing/docs/apis)
- [Prometheus Configuration Guide](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Kubernetes Cost Optimization Best Practices](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/#cost-optimization)

## 🆘 Support

For issues with the kubecost integration:

1. Check the troubleshooting section above
2. Review logs using provided commands
3. Run validation scripts to identify specific issues
4. Consult the detailed setup guides in the `docs/` directory

For Kubecost-specific issues, refer to the [official Kubecost documentation](https://docs.kubecost.com/) and [GitHub repository](https://github.com/kubecost/cost-analyzer-helm-chart).
