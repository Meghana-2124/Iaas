# Kubecost Standalone Setup Guide

This guide provides comprehensive instructions for deploying Kubecost as a standalone application using Helm, separate from the main IaaS-k8s deployment. This approach gives you dedicated cost monitoring with its own static IP and cluster-wide namespace monitoring capabilities.

## Overview

Kubecost will be deployed as a standalone application that:

- Monitors all namespaces across the Kubernetes cluster
- Has its own dedicated static IP address
- Operates independently from the main application deployment
- Provides comprehensive cost analysis and budget management
- Integrates with cloud provider billing APIs (AWS, GCP, Azure)

## Prerequisites

### Required Tools

- `helm` (v3.8+)
- `kubectl` configured to access your cluster
- Cloud provider CLI tools (`gcloud`, `aws`, or `az`)
- Cluster admin permissions

### Cluster Requirements

- Kubernetes 1.20+
- At least 4GB RAM and 2 CPU cores available
- StorageClass for persistent volumes
- LoadBalancer service support or Ingress controller

## Step 1: Prepare the Environment

### Create Dedicated Namespace

```bash
kubectl create namespace kubecost
```

### Create Static IP (Cloud Provider Specific)

#### For GCP (GKE)

```bash
# Reserve a regional static IP
gcloud compute addresses create kubecost-static-ip \
    --region=us-central1 \
    --project=your-project-id

# Get the IP address
gcloud compute addresses describe kubecost-static-ip \
    --region=us-central1 \
    --project=your-project-id \
    --format="value(address)"
```

#### For AWS (EKS)

```bash
# Create an Elastic IP
aws ec2 allocate-address --domain vpc --region us-west-2
```

#### For Azure (AKS)

```bash
# Create a static public IP
az network public-ip create \
    --resource-group your-resource-group \
    --name kubecost-static-ip \
    --allocation-method Static
```

## Step 2: Add Kubecost Helm Repository

```bash
# Add the Kubecost Helm repository
helm repo add kubecost https://kubecost.github.io/cost-analyzer/

# Update repository
helm repo update
```

## Step 3: Configure Values File

Create a custom values file for your deployment:

```bash
cat > kubecost-values.yaml << 'EOF'
# Kubecost Standalone Configuration
global:
  # Enable cluster-wide monitoring
  grafana:
    enabled: false  # Use external Grafana if needed
  prometheus:
    enabled: true
    fqdn: http://kubecost-prometheus-server.kubecost.svc.cluster.local:80

# Core Kubecost configuration
kubecostFrontend:
  image:
    tag: "1.106.3"  # Use latest stable version

# Cost analyzer configuration
costAnalyzer:
  image:
    tag: "1.106.3"

  # Enable all namespaces monitoring
  config:
    clusterProfile: production

  # Resource requests and limits
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

# Prometheus configuration for metrics collection
prometheus:
  server:
    # Enable persistence
    persistentVolume:
      enabled: true
      size: 50Gi
      storageClass: ""  # Use default storage class

    # Resource configuration
    resources:
      requests:
        cpu: 500m
        memory: 2Gi
      limits:
        cpu: 2000m
        memory: 8Gi

    # Retention policy
    retention: "30d"

    # Scrape configurations for cluster-wide monitoring
    config:
      global:
        scrape_interval: 60s
        evaluation_interval: 60s

      scrape_configs:
        - job_name: 'kubernetes-apiservers'
          kubernetes_sd_configs:
            - role: endpoints
          scheme: https
          tls_config:
            ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
          bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
          relabel_configs:
            - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
              action: keep
              regex: default;kubernetes;https

        - job_name: 'kubernetes-nodes'
          kubernetes_sd_configs:
            - role: node
          scheme: https
          tls_config:
            ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
          bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
          relabel_configs:
            - action: labelmap
              regex: __meta_kubernetes_node_label_(.+)

        - job_name: 'kubernetes-cadvisor'
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

        - job_name: 'kubernetes-service-endpoints'
          kubernetes_sd_configs:
            - role: endpoints
          relabel_configs:
            - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
              action: keep
              regex: true
            - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
              action: replace
              target_label: __metrics_path__
              regex: (.+)
            - source_labels: [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
              action: replace
              regex: ([^:]+)(?::\d+)?;(\d+)
              replacement: $1:$2
              target_label: __address__
            - action: labelmap
              regex: __meta_kubernetes_service_label_(.+)
            - source_labels: [__meta_kubernetes_namespace]
              action: replace
              target_label: kubernetes_namespace
            - source_labels: [__meta_kubernetes_service_name]
              action: replace
              target_label: kubernetes_name

        - job_name: 'kubernetes-pods'
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
            - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
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

  # Node exporter for detailed node metrics
  nodeExporter:
    enabled: true
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi

  # Kube-state-metrics for Kubernetes object metrics
  kubeStateMetrics:
    enabled: true

# Service configuration with static IP
service:
  type: LoadBalancer
  annotations:
    # GCP specific annotation for static IP
    cloud.google.com/load-balancer-type: "External"
    # Replace with your static IP
    # cloud.google.com/address: "YOUR_STATIC_IP_NAME"

    # AWS specific annotations (uncomment for AWS)
    # service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    # service.beta.kubernetes.io/aws-load-balancer-eip-allocations: "eipalloc-xxxxx"

    # Azure specific annotations (uncomment for Azure)
    # service.beta.kubernetes.io/azure-load-balancer-resource-group: "your-resource-group"
    # service.beta.kubernetes.io/azure-pip-name: "kubecost-static-ip"

  port: 9090
  targetPort: 9090

# Ingress configuration (alternative to LoadBalancer)
ingress:
  enabled: false  # Set to true if using Ingress instead of LoadBalancer
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: kubecost.your-domain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: kubecost-tls
      hosts:
        - kubecost.your-domain.com

# Cloud provider billing integration
cloudProviderConfig:
  # GCP Configuration
  gcp:
    enabled: true
    projectId: "your-gcp-project-id"
    billingDataDataset: "cloud_costs"  # BigQuery dataset
    key: |
      # Base64 encoded service account key
      # Use: cat service-account-key.json | base64 -w 0

  # AWS Configuration
  aws:
    enabled: false
    # AWS configuration would go here if using AWS

  # Azure Configuration
  azure:
    enabled: false
    # Azure configuration would go here if using Azure

# Network policy (optional, for security)
networkPolicy:
  enabled: false

# Priority class for important workloads
priorityClassName: ""

# Tolerations for node scheduling
tolerations: []

# Node affinity rules
affinity: {}

# Additional labels for all resources
additionalLabels:
  app.kubernetes.io/managed-by: "helm"
  monitoring.iaas/component: "kubecost"
  cost-monitoring: "enabled"

EOF
```

## Step 4: Deploy Kubecost

### Basic Deployment

```bash
# Deploy Kubecost with custom values
helm install kubecost kubecost/cost-analyzer \
    --namespace kubecost \
    --values kubecost-values.yaml \
    --version 1.106.3
```

### Deployment with Cloud Provider Specific Configuration

#### For GCP with Static IP

```bash
# Update values file with your static IP name
sed -i 's/# cloud.google.com\/address: "YOUR_STATIC_IP_NAME"/cloud.google.com\/address: "kubecost-static-ip"/' kubecost-values.yaml

# Deploy with GCP billing integration
helm install kubecost kubecost/cost-analyzer \
    --namespace kubecost \
    --values kubecost-values.yaml \
    --set cloudProviderConfig.gcp.enabled=true \
    --set cloudProviderConfig.gcp.projectId="your-project-id" \
    --version 1.106.3
```

#### For AWS with ELB

```bash
# Deploy with AWS configuration
helm install kubecost kubecost/cost-analyzer \
    --namespace kubecost \
    --values kubecost-values.yaml \
    --set service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-type"="nlb" \
    --set cloudProviderConfig.aws.enabled=true \
    --version 1.106.3
```

## Step 5: Verify Deployment

### Check Pod Status

```bash
# Verify all pods are running
kubectl get pods -n kubecost

# Check service status
kubectl get svc -n kubecost

# Get external IP
kubectl get svc kubecost-cost-analyzer -n kubecost -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### Access Kubecost UI

```bash
# Get the external IP or URL
KUBECOST_IP=$(kubectl get svc kubecost-cost-analyzer -n kubecost -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Kubecost UI available at: http://$KUBECOST_IP:9090"
```

### Port Forward for Testing (if LoadBalancer is not ready)

```bash
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
# Access at http://localhost:9090
```

## Step 6: Configure Cloud Provider Billing Integration

### GCP BigQuery Setup

```bash
# Create BigQuery dataset for billing data
bq mk --dataset --project_id=your-project-id cloud_costs

# Enable billing export to BigQuery in GCP Console
# Navigate to: Billing > Billing Export > BigQuery Export
# Set dataset to: cloud_costs
```

### Create Service Account for GCP

```bash
# Create service account
gcloud iam service-accounts create kubecost-bigquery \
    --display-name="Kubecost BigQuery Access"

# Grant necessary permissions
gcloud projects add-iam-policy-binding your-project-id \
    --member="serviceAccount:kubecost-bigquery@your-project-id.iam.gserviceaccount.com" \
    --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding your-project-id \
    --member="serviceAccount:kubecost-bigquery@your-project-id.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataViewer"

# Create and download key
gcloud iam service-accounts keys create kubecost-key.json \
    --iam-account=kubecost-bigquery@your-project-id.iam.gserviceaccount.com

# Update Kubecost with service account key
kubectl create secret generic kubecost-gcp-key \
    --from-file=key.json=kubecost-key.json \
    -n kubecost
```

## Step 7: Configure Cluster-Wide Monitoring

### RBAC for Cluster-Wide Access

```bash
cat > kubecost-cluster-rbac.yaml << 'EOF'
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kubecost-cluster-monitor
  namespace: kubecost
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubecost-cluster-monitor
rules:
- apiGroups: [""]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["batch"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["autoscaling"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["policy"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["storage.k8s.io"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["*"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kubecost-cluster-monitor
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kubecost-cluster-monitor
subjects:
- kind: ServiceAccount
  name: kubecost-cluster-monitor
  namespace: kubecost
EOF

kubectl apply -f kubecost-cluster-rbac.yaml
```

## Step 8: Configure Monitoring for All Namespaces

### Label Namespaces for Cost Allocation

```bash
# Label existing namespaces for cost tracking
kubectl label namespace default cost-center=shared
kubectl label namespace kube-system cost-center=system
kubectl label namespace kubecost cost-center=monitoring

# For application namespaces, add company/tier labels
kubectl label namespace your-app-namespace company=your-company
kubectl label namespace your-app-namespace tier=production
kubectl label namespace your-app-namespace cost-center=application
```

### Configure Cost Allocation Labels

```bash
cat > cost-allocation-config.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: kubecost-cost-allocation-config
  namespace: kubecost
data:
  allocation.yaml: |
    allocation:
      # Default allocation keys
      defaultKeys:
        - namespace
        - cluster
        - node
        - controller
        - service
        - deployment
        - pod
        - container

      # Custom allocation keys for your organization
      customKeys:
        - company
        - tier
        - cost-center
        - environment

      # Namespace-level cost allocation
      namespaceLabels:
        - company
        - tier
        - cost-center
        - environment

      # Pod-level cost allocation
      podLabels:
        - app
        - version
        - component
        - managed-by

      # Node-level cost allocation
      nodeLabels:
        - node-type
        - instance-type
        - availability-zone
EOF

kubectl apply -f cost-allocation-config.yaml
```

## Step 9: Set Up Monitoring and Alerts

### Configure Budget Alerts

Access Kubecost UI at your external IP and configure:

1. **Budget Alerts**:

   - Set monthly budgets per namespace
   - Configure alert thresholds (50%, 80%, 100%)
   - Set up email/Slack notifications

2. **Cost Allocation Rules**:

   - Configure allocation by namespace, label, annotation
   - Set up shared cost allocation rules
   - Configure idle resource tracking

3. **Reports and Dashboards**:
   - Enable automated cost reports
   - Set up executive dashboards
   - Configure trend analysis

## Step 10: Backup and Maintenance

### Backup Configuration

```bash
# Backup Kubecost configuration
kubectl get configmaps -n kubecost -o yaml > kubecost-configmaps-backup.yaml
kubectl get secrets -n kubecost -o yaml > kubecost-secrets-backup.yaml

# Backup Prometheus data (if using persistent volumes)
kubectl get pvc -n kubecost -o yaml > kubecost-pvc-backup.yaml
```

### Upgrade Process

```bash
# Update Helm repository
helm repo update

# Check available versions
helm search repo kubecost/cost-analyzer --versions

# Upgrade to new version
helm upgrade kubecost kubecost/cost-analyzer \
    --namespace kubecost \
    --values kubecost-values.yaml \
    --version 1.106.3
```

## Troubleshooting

### Common Issues

1. **Service not getting external IP**:

   ```bash
   # Check service events
   kubectl describe svc kubecost-cost-analyzer -n kubecost

   # Verify cloud provider load balancer support
   kubectl get nodes -o wide
   ```

2. **Prometheus not scraping metrics**:

   ```bash
   # Check Prometheus configuration
   kubectl logs -n kubecost -l app=prometheus-server

   # Verify service discovery
   kubectl get endpoints -n kubecost
   ```

3. **Cost data not appearing**:

   ```bash
   # Check cloud provider billing integration
   kubectl logs -n kubecost -l app.kubernetes.io/name=kubecost

   # Verify RBAC permissions
   kubectl auth can-i get pods --as=system:serviceaccount:kubecost:kubecost-cluster-monitor --all-namespaces
   ```

### Monitoring Commands

```bash
# Monitor deployment progress
watch kubectl get pods -n kubecost

# Check resource usage
kubectl top pods -n kubecost

# View logs
kubectl logs -n kubecost -l app.kubernetes.io/name=kubecost -f

# Check service status
kubectl get svc,endpoints -n kubecost
```

## Security Considerations

1. **Network Policies**: Implement network policies to restrict traffic to Kubecost
2. **RBAC**: Use minimal required permissions for service accounts
3. **TLS**: Enable TLS for external access via Ingress
4. **Secrets Management**: Use external secret management systems for cloud credentials
5. **Regular Updates**: Keep Kubecost updated to latest stable versions

## API Integration

Once deployed, the Kubecost API will be available at:

- `http://YOUR_EXTERNAL_IP:9090/model/` - Cost allocation API
- `http://YOUR_EXTERNAL_IP:9090/model/allocation` - Allocation queries
- `http://YOUR_EXTERNAL_IP:9090/model/assets` - Asset cost queries

The existing KubecostClient in your codebase can connect to this deployment by updating the `kubecostUrl` parameter to point to your external IP.

## Next Steps

1. Configure cloud provider billing integration
2. Set up automated reporting
3. Implement cost optimization recommendations
4. Integrate with existing monitoring stack
5. Set up backup and disaster recovery procedures

For detailed API documentation and advanced configuration, refer to the [official Kubecost documentation](https://docs.kubecost.com/).
