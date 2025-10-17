
# Azure AKS Setup Guide

## Prerequisites
- Azure account (example values)
- Roles: Contributor, AKS-specific roles
- Pulumi installed
- Azure CLI installed
- Example environment variables:
  - AZURE_SUBSCRIPTION_ID=xxxx
  - AZURE_CLIENT_ID=xxxx
  - AZURE_CLIENT_SECRET=xxxx
  - AZURE_TENANT_ID=xxxx

## Authentication
```bash
az login
pulumi login
pulumi config set azure:location eastus
```

## Configuration Reference
- Example `config/azure.json`:
```json
{
  "clusterName": "aks-demo",
  "vmSize": "Standard_B2s",
  "nodeCount": 3,
  "resourceGroup": "demo-rg",
  "networkPlugin": "azure"
}
```

## Deployment Examples
- Creating a new AKS cluster (mock):
```bash
pulumi up --stack dev
# Scale node pool
pulumi up --stack dev --target nodepool
```

- Multi-environment setup (dev/staging/prod):
```bash
pulumi stack select dev
pulumi up
pulumi stack select staging
pulumi up
pulumi stack select prod
pulumi up
```

## Troubleshooting
- Authentication errors → check AZURE_CLIENT_SECRET
- Node scaling fails → verify VM size availability
- Pulumi deployment fails → check resource group and region
- kubeconfig issues → validate Pulumi config and context

## Update README
- Add Azure AKS as a supported provider
- Link this documentation in the main README
