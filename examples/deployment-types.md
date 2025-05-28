# Kubernetes Deployment Examples

This document demonstrates how to use the streamlined IaaS deployment system for Kubernetes infrastructure management.

## Deployment Overview

The new deployment system focuses on simplicity and automation, providing standardized deployments that are flexible and easy to manage.

## Standard Deployment Examples

### Example 1: AWS Deployment with Config File

Deploy to AWS EKS using configuration files:

```bash
npm run deploy:cli up client-stack \
  --companyName="client-a" \
  --cloudProvider="aws" \
  --cloudConfigFile="./examples/aws-config.json" \
  --secretsFile="./examples/client-a-secrets.json" \
  --valuesFile="./examples/client-a-values.json" \
  --autoSetupConfig
```

### Example 2: GCP Deployment with Inline Config

Deploy to GCP GKE with inline configuration:

```bash
npm run deploy:cli up client-gcp-stack \
  --companyName="client-b" \
  --cloudProvider="gcp" \
  --region="us-central1" \
  --zone="us-central1-a" \
  --secretsFile="./examples/client-b-secrets.json" \
  --valuesFile="./examples/client-b-values.json"
```

### Example 3: Development Deployment

Quick development deployment:

```bash
npm run dev -- up dev \
  --companyName="mycompany" \
  --cloudProvider="gcp" \
  --secretsFile="./config/secrets.json" \
  --valuesFile="./config/values.json" \
  --cloudConfigFile="./config/gcp.json" \
  --autoSetupConfig
```

## Configuration Files

### Client Values (client-a-values.json)

```json
{
  "companyName": "client-a",
  "environment": "production",
  "rafikiAuth": {
    "enabled": true,
    "replicaCount": 2,
    "resources": {
      "requests": {
        "memory": "512Mi",
        "cpu": "250m"
      },
      "limits": {
        "memory": "1Gi",
        "cpu": "500m"
      }
    }
  },
  "rafikiBackend": {
    "enabled": true,
    "replicaCount": 3,
    "resources": {
      "requests": {
        "memory": "1Gi",
        "cpu": "500m"
      },
      "limits": {
        "memory": "2Gi",
        "cpu": "1000m"
      }
    }
  },
  "ingress": {
    "enabled": true,
    "className": "nginx",
    "host": "client-a.example.com"
  },
  "monitoring": {
    "enabled": true
  }
}
```

### AWS Cloud Configuration (aws-config.json)

```json
{
  "region": "us-west-2",
  "availabilityZones": ["us-west-2a", "us-west-2b", "us-west-2c"],
  "vpcCidr": "10.0.0.0/16",
  "clusterVersion": "1.28",
  "nodeGroups": [
    {
      "name": "general",
      "instanceTypes": ["t3.large", "t3.xlarge"],
      "minSize": 2,
      "maxSize": 10,
      "desiredSize": 3,
      "diskSize": 50
    }
  ],
  "enabledAddons": ["vpc-cni", "coredns", "kube-proxy", "aws-ebs-csi-driver"]
}
```

### GCP Cloud Configuration (gcp-config.json)

```json
{
  "region": "us-central1",
  "zone": "us-central1-a",
  "networkCidr": "10.0.0.0/16",
  "clusterVersion": "1.28",
  "nodePool": {
    "name": "general",
    "machineType": "e2-standard-4",
    "diskSize": 50,
    "initialNodeCount": 3,
    "minNodeCount": 2,
    "maxNodeCount": 10
  },
  "enabledServices": ["container.googleapis.com", "compute.googleapis.com"]
}
```

### Client Secrets (client-a-secrets.json)

```json
{
  "database": {
    "host": "db.example.com",
    "username": "app_user",
    "password": "secure_password_here",
    "name": "client_a_db"
  },
  "redis": {
    "host": "redis.example.com",
    "password": "redis_password_here"
  },
  "auth": {
    "jwtSecret": "jwt_secret_key_here",
    "apiKey": "api_key_here"
  },
  "external": {
    "thirdPartyApiKey": "external_api_key_here"
  }
}
```

## Stack Management

### Listing Stacks

```bash
# List all stacks
pulumi stack ls

# View current stack info
pulumi stack
```

### Managing Deployments

```bash
# Update a deployment
npm run deploy:cli up client-stack --update

# Preview changes
npm run deploy:cli preview client-stack

# Destroy a deployment
npm run deploy:cli destroy client-stack
```

### Monitoring Deployment

```bash
# View stack outputs
pulumi stack output

# Check deployment status
kubectl get pods -A

# View services and ingress
kubectl get svc,ingress -A
```

## Best Practices

### 1. Configuration Management

- Store sensitive data in `secrets.json` files
- Use separate configuration files for different environments
- Version control your non-sensitive configuration files

### 2. Naming Conventions

- Use descriptive stack names: `client-a-prod`, `client-b-staging`
- Follow company naming standards for resources
- Include environment indicators in names

### 3. Resource Management

- Set appropriate resource requests and limits
- Use HPA (Horizontal Pod Autoscaler) for scaling
- Monitor resource usage and adjust as needed

### 4. Security

- Rotate secrets regularly
- Use NetworkPolicies for network isolation
- Enable RBAC and pod security standards
- Keep cluster and node images updated

### 5. Monitoring

- Enable monitoring and logging
- Set up alerts for critical metrics
- Regularly review logs and metrics

## Troubleshooting

### Common Issues

1. **Stack creation fails**:

   - Check cloud provider credentials
   - Verify configuration file syntax
   - Ensure required permissions are granted

2. **Pods not starting**:

   - Check resource limits and requests
   - Verify secrets are properly configured
   - Review pod logs: `kubectl logs <pod-name>`

3. **Ingress not working**:
   - Verify ingress controller is installed
   - Check DNS configuration
   - Validate SSL certificates

### Debugging Commands

```bash
# Check cluster status
kubectl cluster-info

# View node status
kubectl get nodes

# Check pod logs
kubectl logs -f <pod-name> -n <namespace>

# Describe resources
kubectl describe pod <pod-name> -n <namespace>

# View events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```
