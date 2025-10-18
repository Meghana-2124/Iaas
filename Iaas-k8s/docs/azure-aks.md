# Azure AKS Setup Guide

> Last updated: October 2025 – Compatible with Pulumi v3 and Azure CLI v2

This guide explains how to deploy and manage **Azure Kubernetes Service (AKS)** clusters using **Pulumi** within the IaaS-k8s framework.  
It provides step-by-step setup, configuration, deployment, and troubleshooting instructions, ensuring consistency with other supported providers (AWS, GCP).

---

## 🧩 Prerequisites

| Requirement | Description |
|--------------|-------------|
| **Azure account** | Active Azure subscription |
| **Roles** | Contributor and AKS Service roles |
| **Tools** | Pulumi CLI and Azure CLI installed |
| **Dependencies** | Pulumi Azure-Native provider configured |

### Example environment variables
```bash
# Example Azure credentials
export AZURE_SUBSCRIPTION_ID=xxxx
export AZURE_CLIENT_ID=xxxx
export AZURE_CLIENT_SECRET=xxxx
export AZURE_TENANT_ID=xxxx
```

---

## 🔐 Authentication

```bash
# Login to Azure and select your subscription
az login
az account set --subscription $AZURE_SUBSCRIPTION_ID

# Login to Pulumi
pulumi login

# Configure default region
pulumi config set azure:location eastus
```

---

## ⚙️ Configuration Reference

Example `config/azure.json` file:

```json
{
  "clusterName": "aks-demo",
  "vmSize": "Standard_B2s",
  "nodeCount": 3,
  "resourceGroup": "demo-rg",
  "networkPlugin": "azure",
  "enableAutoScaling": true,
  "minNodeCount": 1,
  "maxNodeCount": 5
}
```

> **Note:**  
> - You can integrate **Azure Key Vault** for secret management and **Azure Storage** for Pulumi state storage.  
> - Ensure your VM size and region are supported under your Azure subscription.

---

## 🚀 Deployment Examples

### Creating a new AKS cluster
```bash
# Deploy AKS resources (mock)
pulumi up --stack dev
```

### Scaling node pools
```bash
pulumi up --stack dev --target nodepool
```

### Multi-environment setup (dev / staging / prod)
```bash
pulumi stack select dev
pulumi up

pulumi stack select staging
pulumi up

pulumi stack select prod
pulumi up
```

---

## 🧰 Troubleshooting

| Issue | Possible Cause | Resolution |
|--------|----------------|------------|
| Authentication errors | Invalid credentials | Verify `AZURE_CLIENT_SECRET` and tenant ID |
| Node scaling fails | VM size unavailable in region | Choose supported VM size or region |
| Pulumi deployment fails | Resource group not found | Confirm Pulumi config and Azure setup |
| kubeconfig issues | Context not updated | Run `pulumi stack output kubeconfig > ~/.kube/config` |
| Permission denied | Missing roles | Assign Contributor + AKS Admin roles |

---

## 📘 Update README

- Add **Azure AKS** as a supported provider under the “Supported Cloud Providers” section:
  ```md
  - AWS (EKS)
  - GCP (GKE)
  - **Azure (AKS)**
  ```

- Link this documentation in the main README:
  ```md
  For setup and deployment instructions, see [Azure AKS Setup Guide](Iaas-k8s/docs/azure-aks.md).
  ```

---

## ✅ Next Steps
- Configure CI/CD pipelines for AKS deployments.  
- Integrate secrets management using Azure Key Vault.  
- Explore autoscaling and monitoring strategies via Azure Monitor.

---

### Footer
*Aligned with IaaS-k8s documentation standards and consistent with Pulumi implementation for Azure.*
