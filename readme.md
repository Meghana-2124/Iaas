# IAAS (Infrastructure as a Service)

A comprehensive multi-cloud Kubernetes infrastructure deployment solution supporting AWS EKS and GCP GKE with streamlined deployment automation.

## Features

- 🌥️ **Multi-Cloud Support**: Deploy to AWS EKS and GCP GKE
- 🔐 **Advanced Security**: Automatic secrets processing, NetworkPolicies, RBAC
- 📊 **Monitoring**: Health checks, progress tracking, rollback capabilities
- 🎯 **Type Safety**: Full TypeScript support with validation
- 🚀 **CLI Interface**: Simple command-line deployment tools
- ⚡ **Automated Setup**: Streamlined configuration and deployment

## Quick Start

1. **Install prerequisites**:

   - [Node.js](https://nodejs.org/) (v18+)
   - [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
   - Cloud CLI tools (AWS CLI, gcloud) with credentials configured

2. **Install and build**:

   ```bash
   cd Iaas-k8s/pulumi
   npm install && npm run build
   ```

3. **Prepare configuration files**:

   - `config/secrets.json` (sensitive values)
   - `config/values.json` (non-sensitive configuration)
   - `config/aws.json` or `config/gcp.json` (cloud provider config)

4. **Deploy using the CLI**:

   **Standard Deployment**:

   ```bash
   npm run deploy:cli up client-stack \
     --companyName="client-a" \
     --cloudProvider="aws" \
     --cloudConfigFile="./config/aws.json" \
     --secretsFile="./config/secrets.json" \
     --valuesFile="./config/values.json" \
     --autoSetupConfig
   ```

   **Alternative with inline config**:

   ```bash
   npm run deploy:cli up client-stack \
     --companyName="client-company" \
     --cloudProvider="gcp" \
     --region="us-central1" \
     --zone="us-central1-a" \
     --secretsFile="./config/secrets.json" \
     --valuesFile="./config/values.json"
   ```

5. **Monitor and manage**:

   - View deployment progress with real-time updates
   - Access endpoints and DNS information from outputs
   - Use automatic rollback on failures

   **Shared Deployment (Multi-Tenant)**:

   ```bash
   npm run deploy:cli up client-a-stack \
     --companyName="client-a" \
     --deploymentType="shared" \
     --namespace="client-a-prod" \
     --cloudProvider="aws" \
     --cloudConfigFile="./config/aws.json" \
     --secretsFile="./config/secrets.json" \
     --valuesFile="./config/values.json" \
     --autoSetupConfig
   ```

   **Dedicated Deployment**:

   ```bash
   npm run deploy:cli up client-dedicated \
     --companyName="client-company" \
     --deploymentType="dedicated" \
     --cloudProvider="gcp" \
     --cloudConfigFile="./config/gcp.json" \
     --secretsFile="./config/secrets.json" \
     --valuesFile="./config/values.json" \
     --autoSetupConfig
   ```

6. **Monitor and manage**:
   - View deployment progress with real-time updates
   - Access endpoints and DNS information from outputs
   - Use automatic rollback on failures

> For detailed documentation, examples, and API reference, see [Iaas-k8s/pulumi/README.md](./Iaas-k8s/pulumi/README.md)

## Project Structure

```
Iaas/
├── readme.md              # This file - project overview
└── Iaas-k8s/             # Kubernetes infrastructure deployment
    ├── README.md          # Detailed deployment guide
    ├── helm-chart/        # Kubernetes application manifests
    └── pulumi/            # Infrastructure as Code (TypeScript)
        ├── src/           # Well-organized source code
        │   ├── core/      # Core infrastructure logic
        │   ├── types/     # TypeScript definitions
        │   ├── utils/     # Utility functions
        │   └── cli/       # Command-line interface
        ├── config/        # Configuration files
        └── scripts/       # Deployment scripts
```

## Development Workflow

1. **Navigate to the pulumi directory**:

   ```bash
   cd Iaas-k8s/pulumi
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the project**:

   ```bash
   npm run build
   ```

4. **Deploy infrastructure with automated config setup**:
   ```bash
   npm run dev -- up dev \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --valuesFile ./config/values.json \
     --cloudProvider gcp \
     --cloudConfigFile ./config/gcp.json \
     --autoSetupConfig
   ```

## Features

- ✅ **Multi-cloud support** (AWS EKS, GCP GKE)
- ✅ **Type-safe TypeScript codebase**
- ✅ **Modular, well-organized architecture**
- ✅ **Comprehensive error handling**
- ✅ **Progress monitoring and logging**
- ✅ **Configuration validation**
- ✅ **Automatic rollback capabilities**
- ✅ **Fully automated Pulumi config setup via CLI and JSON files**
- ✅ **Streamlined deployment process**

For detailed usage instructions, see [Iaas-k8s/README.md](./Iaas-k8s/README.md).

For Pulumi-specific documentation and all CLI/file-based config options, see [Iaas-k8s/pulumi/README.md](./Iaas-k8s/pulumi/README.md).
