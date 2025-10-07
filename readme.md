# IAAS (Infrastructure as a Service)

A comprehensive multi-cloud Kubernetes infrastructure deployment solution supporting AWS EK5. **Monitor and manage**:

- View deployment progress with real-time updates
- Access endpoints and DNS information from outputs
- Use automatic rollback on failures

> **🆕 New Dynamic Configuration**: The system now automatically generates comprehensive Helm values based on your deployment configuration. The `--valuesFile` option is only needed for custom overrides beyond the intelligent defaults.

> For detailed documentation, examples, and API reference, see [Iaas-k8s/pulumi/README.md](./Iaas-k8s/pulumi/README.md)GCP GKE with streamlined deployment automation.

## Features

- 🌥️ **Multi-Cloud Support**: Deploy to AWS EKS and GCP GKE
- 🔐 **Advanced Security**: Automatic secrets processing, NetworkPolicies, RBAC
- 📊 **Monitoring**: Health checks, progress tracking, rollback capabilities
- 🎯 **Type Safety**: Full TypeScript support with validation
- 🚀 **CLI Interface**: Simple command-line deployment tools
- ⚡ **Automated Setup**: Streamlined configuration and deployment
- 🤖 **Dynamic Configuration**: Auto-generates Helm values based on deployment settings
- 🏗️ **Smart Defaults**: Cloud provider-optimized configurations out of the box


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

   - `config/secrets.json` (sensitive values like database passwords, API keys)
   - `config/aws.json` or `config/gcp.json` (cloud provider config)

   **Optional** (only needed for custom configurations):

   - `config/values-overrides.json` (override auto-generated defaults)

4. **Deploy using the CLI**:

   **Modern Deployment (Auto-Generated Configuration)**:

   ```bash
   npm run deploy:cli up client-stack \
     --companyName="client-a" \
     --cloudProvider="aws" \
     --cloudConfigFile="./config/aws.json" \
     --secretsFile="./config/secrets.json" \
     --autoSetupConfig
   ```

   **With Custom Overrides** (only when needed):

   ```bash
   npm run deploy:cli up client-stack \
     --companyName="client-a" \
     --cloudProvider="aws" \
     --cloudConfigFile="./config/aws.json" \
     --secretsFile="./config/secrets.json" \
     --valuesFile="./config/custom-overrides.json" \
     --autoSetupConfig
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
     --cloudProvider gcp \
     --cloudConfigFile ./config/gcp.json \
     --autoSetupConfig
   ```

   **With custom overrides** (optional):

   ```bash
   npm run dev -- up dev \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --valuesFile ./config/custom-overrides.json \
     --cloudProvider gcp \
     --cloudConfigFile ./config/gcp.json \
     --autoSetupConfig
   ```

## Key Features

- ✅ **Multi-cloud support** (AWS EKS, GCP GKE)
- ✅ **Dynamic Configuration Generation** - No manual Helm values required
- ✅ **Type-safe TypeScript codebase**
- ✅ **Modular, well-organized architecture**
- ✅ **Comprehensive error handling**
- ✅ **Progress monitoring and logging**
- ✅ **Configuration validation**
- ✅ **Automatic rollback capabilities**
- ✅ **Fully automated Pulumi config setup via CLI and JSON files**
- ✅ **Streamlined deployment process**
- ✅ **Smart defaults with cloud provider optimization**

For detailed usage instructions, see [Iaas-k8s/README.md](./Iaas-k8s/README.md).

For Pulumi-specific documentation and all CLI/file-based config options, see [Iaas-k8s/pulumi/README.md](./Iaas-k8s/pulumi/README.md).

## Community & Contributions

We welcome and encourage contributions from everyone! To get started, please review our [Contribution Guide](/CONTRIBUTING.md), which provides details on the contribution process and pull request guidelines.

If you’d like to extend support for additional cloud providers supported by Pulumi, please see the [Contributing Cloud Providers Guide](/docs/CONTRIBUTING-CLOUD-PROVIDERS.md). It outlines instructions on implementation steps, testing guidelines, and best practices for integrating new providers.

All contributors are expected to follow our [Code of Conduct](/CODE_OF_CONDUCT.md) to maintain a respectful and inclusive community. If you’d like to connect with other contributors, share feedback, or ask questions, join us on [Discord](https://discord.gg/TsyKnzT4qV). 

Every contribution, no matter how small, helps strengthen this project ❤️

## Hacktoberfest

This project is participating in Hacktoberfest 2025! If you’re looking for a way to get involved, check out issues labeled `hacktoberfest` or `good first issue`. Submitting valid pull requests for these issues will count toward your Hacktoberfest contributions.

## License

This project is licensed under the [MIT License](/LICENSE)