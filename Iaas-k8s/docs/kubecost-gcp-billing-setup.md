# Kubecost GCP Billing Integration Setup Guide

This guide walks you through setting up comprehensive GCP Cloud Billing integration with Kubecost for accurate cost tracking and allocation in your tier-based IaaS deployment system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [GCP Billing Account Setup](#gcp-billing-account-setup)
3. [Service Account Configuration](#service-account-configuration)
4. [Kubecost Configuration](#kubecost-configuration)
5. [Authentication Setup](#authentication-setup)
6. [Cost Allocation Labels](#cost-allocation-labels)
7. [Verification and Testing](#verification-and-testing)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- GCP Project with billing enabled
- Kubernetes cluster running on GCP (GKE)
- Kubecost installed in your cluster
- `gcloud` CLI tool installed and configured
- Appropriate IAM permissions

## GCP Billing Account Setup

### 1. Create or Identify Billing Account

```bash
# List existing billing accounts
gcloud billing accounts list

# If you need to create a new billing account
# This must be done through the GCP Console as it requires business verification
```

### 2. Enable Required APIs

```bash
# Enable Cloud Billing API
gcloud services enable cloudbilling.googleapis.com

# Enable Cloud Resource Manager API
gcloud services enable cloudresourcemanager.googleapis.com

# Enable BigQuery API (for advanced cost analysis)
gcloud services enable bigquery.googleapis.com

# Enable Cloud Asset API
gcloud services enable cloudasset.googleapis.com
```

### 3. Configure Billing Export (Optional but Recommended)

```bash
# Create BigQuery dataset for billing export
bq mk --dataset --location=US ${PROJECT_ID}:billing_export

# Set up billing export (must be done in Console)
# Go to Billing > Billing Export > BigQuery Export
# Create detailed usage cost export
```

## Service Account Configuration

### 1. Create Service Account

```bash
# Set environment variables
export PROJECT_ID="your-project-id"
export BILLING_ACCOUNT_ID="your-billing-account-id"
export SERVICE_ACCOUNT_NAME="kubecost-billing"

# Create service account
gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
    --display-name="Kubecost Billing Integration" \
    --description="Service account for Kubecost to access GCP billing data"
```

### 2. Grant Required IAM Roles

```bash
# Billing Account Viewer (read billing account info)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/billing.viewer"

# Cloud Asset Viewer (read resource metadata)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudasset.viewer"

# BigQuery Data Viewer (if using billing export)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataViewer"

# Monitoring Viewer (read usage metrics)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/monitoring.viewer"
```

### 3. Create and Download Service Account Key

```bash
# Create service account key
gcloud iam service-accounts keys create kubecost-billing-key.json \
    --iam-account=${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com

# Store the key securely (example using Kubernetes secret)
kubectl create secret generic kubecost-gcp-billing \
    --from-file=service-account-key.json=kubecost-billing-key.json \
    --namespace kubecost
```

## Kubecost Configuration

### 1. Update Kubecost Values

Create or update your `values-gcp.yaml` file:

```yaml
# values-gcp.yaml
kubecostProductConfigs:
  # Enable GCP billing integration
  gcpBillingDataDataset: "billing_export" # BigQuery dataset name
  gcpBillingDatabaseProject: "your-project-id"
  gcpBillingAccountId: "your-billing-account-id"

  # Configure cost allocation
  costAllocationLabels:
    - "iaas.deployment/tier"
    - "iaas.deployment/company"
    - "iaas.deployment/namespace"
    - "app.kubernetes.io/name"
    - "app.kubernetes.io/instance"

  # Currency and pricing
  currency: "USD"
  currencyCode: "USD"

  # Data retention
  dataRetentionDays: 365

# Service account configuration
serviceAccount:
  create: true
  annotations:
    iam.gke.io/gcp-service-account: "kubecost-billing@your-project-id.iam.gserviceaccount.com"

# GCP-specific configurations
cloudProviderApiKey:
  enabled: true
  secretName: kubecost-gcp-billing
  secretKey: service-account-key.json

# Enable Prometheus for metrics collection
prometheus:
  enabled: true
  server:
    retention: 30d

  # Configure node exporter for detailed resource usage
  nodeExporter:
    enabled: true
    hostNetwork: true
    hostPID: true

# Configure Grafana dashboards
grafana:
  enabled: true
  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
        - name: Prometheus
          type: prometheus
          url: http://prometheus-server
          isDefault: true
        - name: BigQuery
          type: doitintl-bigquery-datasource
          jsonData:
            authenticationType: gce
            clientEmail: "kubecost-billing@your-project-id.iam.gserviceaccount.com"
            defaultProject: "your-project-id"

# Cost allocation configuration
costModel:
  # Enable detailed cost allocation
  allocateIdle: true
  allocateUnmounted: true

  # Set custom pricing (optional)
  # customPricing:
  #   CPU: 0.031611
  #   RAM: 0.004237
  #   storage: 0.00013
  #   zoneNetworkEgress: 0.01
  #   regionNetworkEgress: 0.01
  #   internetNetworkEgress: 0.12
```

### 2. Configure Environment Variables

```bash
# In your deployment configuration
env:
  - name: GOOGLE_APPLICATION_CREDENTIALS
    value: /var/secrets/google/service-account-key.json
  - name: GOOGLE_CLOUD_PROJECT
    value: "your-project-id"
  - name: GCP_BILLING_ACCOUNT_ID
    value: "your-billing-account-id"
  - name: KUBECOST_NAMESPACE_ANNOTATION_KEY
    value: "iaas.deployment/company"
  - name: KUBECOST_DEPLOYMENT_ANNOTATION_KEY
    value: "iaas.deployment/tier"
```

## Authentication Setup

### 1. Workload Identity (Recommended for GKE)

```bash
# Enable Workload Identity on cluster (if not already enabled)
gcloud container clusters update ${CLUSTER_NAME} \
    --zone=${ZONE} \
    --workload-pool=${PROJECT_ID}.svc.id.goog

# Allow Kubernetes service account to impersonate GCP service account
gcloud iam service-accounts add-iam-policy-binding \
    --role roles/iam.workloadIdentityUser \
    --member "serviceAccount:${PROJECT_ID}.svc.id.goog[kubecost/kubecost-cost-analyzer]" \
    ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com

# Annotate Kubernetes service account
kubectl annotate serviceaccount --namespace kubecost kubecost-cost-analyzer \
    iam.gke.io/gcp-service-account=${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com
```

### 2. Service Account Key (Alternative)

```bash
# Mount service account key as volume
volumeMounts:
  - name: gcp-billing-key
    mountPath: /var/secrets/google
    readOnly: true

volumes:
  - name: gcp-billing-key
    secret:
      secretName: kubecost-gcp-billing
```

## Cost Allocation Labels

### 1. Configure Namespace Labels

```bash
# Apply cost allocation labels to namespaces
kubectl label namespace production \
    iaas.deployment/tier=premium \
    iaas.deployment/company=acme-corp \
    iaas.cost/budget-enabled=true

kubectl label namespace staging \
    iaas.deployment/tier=standard \
    iaas.deployment/company=acme-corp \
    iaas.cost/budget-enabled=true
```

### 2. Configure Deployment Labels

```yaml
# In your deployment templates
metadata:
  labels:
    iaas.deployment/tier: "{{ .Values.tier }}"
    iaas.deployment/company: "{{ .Values.company }}"
    iaas.deployment/namespace: "{{ .Release.Namespace }}"
    app.kubernetes.io/name: "{{ .Chart.Name }}"
    app.kubernetes.io/instance: "{{ .Release.Name }}"
```

### 3. Configure GCP Resource Labels

```bash
# Label GKE nodes
kubectl patch node ${NODE_NAME} -p '{
  "metadata": {
    "labels": {
      "iaas.deployment/tier": "premium",
      "iaas.deployment/company": "acme-corp"
    }
  }
}'

# Label persistent volumes
kubectl patch pv ${PV_NAME} -p '{
  "metadata": {
    "labels": {
      "iaas.deployment/tier": "premium",
      "iaas.deployment/company": "acme-corp"
    }
  }
}'
```

## Verification and Testing

### 1. Test Kubecost API Connectivity

```bash
# Port forward to Kubecost
kubectl port-forward --namespace kubecost deployment/kubecost-cost-analyzer 9090

# Test allocation API
curl "http://localhost:9090/model/allocation?window=7d&aggregate=namespace"

# Test assets API
curl "http://localhost:9090/model/assets?window=7d&aggregate=type"
```

### 2. Verify GCP Billing Integration

```bash
# Check Kubecost logs
kubectl logs -n kubecost deployment/kubecost-cost-analyzer | grep -i billing

# Test GCP API access
kubectl exec -n kubecost deployment/kubecost-cost-analyzer -- \
    gcloud billing accounts list
```

### 3. Validate Cost Data

```typescript
// Using the KubecostClient
import { createKubecostClient } from "./src/utils/kubecost-client.js";

const client = createKubecostClient(
  "http://localhost:9090",
  kubecostConfig,
  logger,
  undefined, // API key
  {
    billingAccountId: "your-billing-account-id",
    projectId: "your-project-id",
    credentialsPath: "/path/to/service-account-key.json",
  }
);

// Test cost summary
const summary = await client.getTierCostSummary(
  "premium",
  "production",
  "acme-corp"
);
console.log("Cost Summary:", summary);

// Test GCP billing sync
await client.syncGCPBillingWithKubecost(
  "2024-01-01T00:00:00Z",
  "2024-01-31T23:59:59Z"
);
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**

   ```bash
   # Check service account permissions
   gcloud projects get-iam-policy ${PROJECT_ID} \
     --flatten="bindings[].members" \
     --format="table(bindings.role)" \
     --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
   ```

2. **Missing Cost Data**

   ```bash
   # Verify billing export is configured
   gcloud billing accounts describe ${BILLING_ACCOUNT_ID}

   # Check BigQuery dataset
   bq ls ${PROJECT_ID}:billing_export
   ```

3. **Label Configuration Issues**

   ```bash
   # Check namespace labels
   kubectl get namespaces --show-labels

   # Verify cost allocation configuration
   kubectl get configmap -n kubecost kubecost-cost-analyzer-config -o yaml
   ```

4. **Prometheus Metrics Missing**

   ```bash
   # Check Prometheus configuration
   kubectl get configmap -n kubecost prometheus-server -o yaml

   # Verify node exporter is running
   kubectl get daemonset -n kubecost prometheus-node-exporter
   ```

### Log Analysis

```bash
# Kubecost logs
kubectl logs -n kubecost deployment/kubecost-cost-analyzer -f

# Prometheus logs
kubectl logs -n kubecost deployment/prometheus-server -f

# Check for billing-related errors
kubectl logs -n kubecost deployment/kubecost-cost-analyzer | grep -i "billing\|gcp\|error"
```

### Performance Optimization

1. **Configure data retention**

   ```yaml
   # Reduce storage usage
   dataRetentionDays: 90
   prometheus:
     server:
       retention: 15d
   ```

2. **Optimize query performance**

   ```yaml
   # Reduce metric resolution
   costModel:
     scrapeInterval: 1m
     queryDuration: 24h
   ```

3. **Configure cost allocation efficiently**
   ```yaml
   # Limit label cardinality
   costAllocationLabels:
     - "iaas.deployment/tier"
     - "iaas.deployment/company"
     # Add only essential labels
   ```

## Next Steps

1. Set up automated billing reports
2. Configure cost optimization recommendations
3. Implement budget alerts and notifications
4. Set up cross-project cost analysis
5. Integrate with your billing/finance systems

For additional support, refer to:

- [Kubecost Documentation](https://docs.kubecost.com/)
- [GCP Cloud Billing API](https://cloud.google.com/billing/docs/reference/rest)
- [GKE Cost Management](https://cloud.google.com/kubernetes-engine/docs/concepts/cost-management)
