# Shared vs Dedicated Deployment Types

This document explains the new shared vs dedicated deployment functionality implemented in the IaaS Kubernetes deployment system.

## Overview

The system now supports two deployment types:

1. **Dedicated Deployments** - Creates a new Kubernetes cluster for each company (existing behavior)
2. **Shared Deployments** - Looks for existing Kubernetes clusters and reuses them, with namespace isolation

## Configuration

### Dedicated Deployment (Default)

```yaml
config:
  cloudProvider: "aws" # or "gcp"
  companyName: "acme-corp"
  deploymentType: "dedicated" # Optional - this is the default
  helmValuesJson: |
    {
      "nginx": {
        "hpa": {
          "enabled": true,
          "minReplicas": 1,
          "maxReplicas": 5
        }
      }
    }
```

### Shared Deployment

```yaml
config:
  cloudProvider: "gcp" # or "aws"
  companyName: "acme-corp"
  deploymentType: "shared"
  namespace: "acme-corp" # Required for shared deployments
  helmValuesJson: |
    {
      "nginx": {
        "hpa": {
          "enabled": true,
          "minReplicas": 1,
          "maxReplicas": 3
        }
      }
    }
```

## Behavior Differences

### Dedicated Deployments

- **Cluster**: Creates a new EKS/GKE cluster named `{companyName}-rafiki`
- **Resources**: All resources are dedicated to the company
- **Isolation**: Complete infrastructure isolation
- **Cost**: Higher cost due to dedicated cluster resources
- **Scaling**: Independent cluster scaling
- **Helm Release**: Named `{companyName}-rafiki`
- **Namespace**: Uses `default` namespace

### Shared Deployments

- **Cluster**: Looks for existing cluster named `shared-{cloudProvider}-cluster`
- **Resources**: Reuses cluster, load balancers, and static IPs
- **Isolation**: Namespace-level isolation within shared cluster
- **Cost**: Lower cost through resource sharing
- **Scaling**: Shared cluster resources
- **Helm Release**: Named `{namespace}-rafiki`
- **Namespace**: Uses specified namespace (required)

## Infrastructure Lookup Logic

### AWS (EKS)

For shared deployments, the system:

1. Looks for existing EKS cluster named `shared-aws-cluster`
2. If found, extracts kubeconfig and cluster metadata
3. If not found, creates a new shared cluster
4. Reuses existing VPC and security groups when possible

### GCP (GKE)

For shared deployments, the system:

1. Looks for existing GKE cluster named `shared-gcp-cluster`
2. Looks for existing static IP named `shared-gcp-static-ip`
3. If found, reuses cluster and static IP
4. If not found, creates new shared resources
5. Configures ingress to use shared static IP

## Resource Naming Conventions

### Dedicated Mode

- **Cluster**: `{companyName}-rafiki`
- **Helm Release**: `{companyName}-rafiki`
- **Namespace**: `default`
- **Static IP (GCP)**: `{companyName}-rafiki-ip`

### Shared Mode

- **Cluster**: `shared-{cloudProvider}-cluster`
- **Helm Release**: `{namespace}-rafiki`
- **Namespace**: `{namespace}` (user-specified)
- **Static IP (GCP)**: `shared-gcp-static-ip`

## Implementation Details

### New Functions Added

#### AWS Infrastructure (`src/core/aws-infra.ts`)

- `lookupSharedEksClusterSync()` - Synchronously looks up existing EKS clusters

#### GCP Infrastructure (`src/core/gcp-infra.ts`)

- `lookupSharedGkeClusterSync()` - Synchronously looks up existing GKE clusters and static IPs

### Main Changes (`index.ts`)

- Conditional infrastructure setup based on `deploymentType`
- Async infrastructure handling with `.apply()` pattern
- Namespace creation for shared deployments
- Updated exports to work with new async structure

## Usage Examples

### Deploy Dedicated Infrastructure

```bash
# Set up dedicated deployment
pulumi config set cloudProvider aws
pulumi config set companyName my-company
pulumi config set deploymentType dedicated
pulumi config set helmValuesJson '{"nginx":{"hpa":{"enabled":true}}}'

# Deploy
pulumi up
```

### Deploy Shared Infrastructure

```bash
# Set up shared deployment
pulumi config set cloudProvider gcp
pulumi config set companyName my-company
pulumi config set deploymentType shared
pulumi config set namespace my-company-prod
pulumi config set helmValuesJson '{"nginx":{"hpa":{"enabled":true}}}'

# Deploy
pulumi up
```

## Namespace Isolation in Shared Deployments

When using shared deployments:

1. **Required Configuration**: The `namespace` parameter is required
2. **Automatic Creation**: The system creates the namespace if it doesn't exist
3. **Resource Labeling**: All resources are labeled with deployment metadata
4. **Helm Release Scoping**: Each namespace gets its own Helm release

### Example Namespace Labels

```yaml
metadata:
  name: my-company-prod
  labels:
    app.kubernetes.io/managed-by: pulumi
    iaas.deployment/type: shared
    iaas.deployment/company: my-company
```

## Migration Guide

### From Dedicated to Shared

1. Note your current dedicated cluster resources
2. Create a new stack for shared deployment
3. Update configuration to use `deploymentType: shared`
4. Add `namespace` configuration
5. Deploy shared infrastructure
6. Migrate applications
7. Clean up dedicated resources

### From Shared to Dedicated

1. Note your current namespace and resources
2. Create a new stack for dedicated deployment
3. Update configuration to use `deploymentType: dedicated`
4. Remove `namespace` configuration
5. Deploy dedicated infrastructure
6. Migrate applications
7. Clean up shared namespace

## Cost Optimization

### Shared Deployment Benefits

1. **Cluster Costs**: Share control plane costs across multiple companies
2. **Node Pools**: Better resource utilization across workloads
3. **Load Balancers**: Share ingress load balancers
4. **Static IPs**: Reuse static IP addresses
5. **Add-ons**: Share cluster add-ons and controllers

### When to Use Each Type

#### Use Dedicated When:

- Strict compliance requirements
- High resource demands
- Custom cluster configurations needed
- Complete isolation required

#### Use Shared When:

- Cost optimization is priority
- Standard workload requirements
- Multiple environments/tenants
- Development/staging environments

## Troubleshooting

### Common Issues

1. **Namespace Already Exists**: The system handles existing namespaces gracefully
2. **Shared Cluster Not Found**: System will create new shared cluster automatically
3. **Permission Issues**: Ensure proper cloud provider permissions for resource lookup
4. **Resource Conflicts**: Use unique namespaces to avoid conflicts

### Debugging Commands

```bash
# Check cluster status
kubectl get clusters

# Check namespaces
kubectl get namespaces

# Check helm releases
helm list --all-namespaces

# Check resources in specific namespace
kubectl get all -n your-namespace
```

### Monitoring

The deployment provides comprehensive outputs for monitoring:

- `clusterInfo` - Cluster metadata
- `endpoints` - Service endpoints for the deployment
- `dnsInfo` - DNS configuration information
- `managementCommands` - kubectl and helm commands for management
- `deploymentSummary` - Complete deployment overview

## Security Considerations

### Shared Deployments

- Namespace-level RBAC isolation
- Network policies for traffic isolation
- Resource quotas per namespace
- Monitoring and auditing per tenant

### Dedicated Deployments

- Complete cluster isolation
- VPC-level network isolation
- Dedicated node pools
- Independent security configurations

## Future Enhancements

1. **Resource Quotas**: Automatic quota management for shared namespaces
2. **Network Policies**: Automatic network isolation policies
3. **Multi-Region**: Support for multi-region shared clusters
4. **Auto-scaling**: Shared cluster auto-scaling based on aggregate demand
5. **Cost Attribution**: Per-namespace cost tracking and reporting
