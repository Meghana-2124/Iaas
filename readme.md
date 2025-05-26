# IAAS (Infrastructure as a Service)

A comprehensive multi-cloud Kubernetes infrastructure deployment solution supporting AWS EKS and GCP GKE.

## How to Run

1. **Install prerequisites**:

   - [Node.js](https://nodejs.org/) (v18+)
   - [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
   - Cloud CLI tools (e.g., AWS CLI, gcloud) and credentials configured

2. **Install dependencies**:

   ```bash
   cd Iaas-k8s/pulumi
   npm install
   ```

3. **Build the project**:

   ```bash
   npm run build
   ```

4. **Prepare your configuration files**:

   - `config/secrets.json` (sensitive values)
   - `config/values.json` (non-sensitive values)
   - `config/cloudConfig.aws.json` or `config/cloudConfig.gcp.json` (cloud provider config)

5. **Run a deployment (example for AWS)**:

   ```bash
   npm run dev -- up dev \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --valuesFile ./config/values.json \
     --cloudProvider aws \
     --cloudConfigFile ./config/cloudConfig.aws.json \
     --autoSetupConfig
   ```

   For GCP, change `--cloudProvider` and `--cloudConfigFile` accordingly.

6. **See outputs and instructions**:
   - The CLI and Pulumi outputs will provide endpoints, DNS, and next steps.

> For more details, see the [Iaas-k8s/pulumi/README.md](./Iaas-k8s/pulumi/README.md).

## Project Structure

```
Iaas/
├── readme.md              # This file - project overview
└── Iaas-k8s/             # Kubernetes infrastructure deployment
    ├── README.md          # Detailed deployment guide
    ├── aws/               # AWS-specific configurations
    ├── gcp/               # GCP-specific configurations
    ├── helm-chart/        # Kubernetes application manifests
    └── pulumi/            # Infrastructure as Code (TypeScript)
        ├── src/           # Well-organized source code
        │   ├── core/      # Core infrastructure logic
        │   ├── types/     # TypeScript definitions
        │   ├── utils/     # Utility functions
        │   └── cli/       # Command-line interface
        ├── config/        # Configuration files
        └── dist/          # Compiled JavaScript (generated)
```

## Quick Start

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

4. **Deploy infrastructure (with fully automated config setup, using JSON files)**:
   ```bash
   npm run dev -- up dev \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --valuesFile ./config/values.json \
     --cloudProvider aws \
     --cloudConfigFile ./config/cloudConfig.aws.json \
     --autoSetupConfig
   ```
   > Use `--secretsFile`, `--valuesFile`, and `--cloudConfigFile` to provide all configuration as JSON files. This is the recommended and most secure approach. See the Pulumi README for full details and examples.

## Features

- ✅ **Multi-cloud support** (AWS EKS, GCP GKE)
- ✅ **Type-safe TypeScript codebase**
- ✅ **Modular, well-organized architecture**
- ✅ **Comprehensive error handling**
- ✅ **Progress monitoring and logging**
- ✅ **Configuration validation**
- ✅ **Automatic rollback capabilities**
- ✅ **Fully automated Pulumi config setup via CLI and JSON files**

For detailed usage instructions, see [Iaas-k8s/README.md](./Iaas-k8s/README.md).

For Pulumi-specific documentation and all CLI/file-based config options, see [Iaas-k8s/pulumi/README.md](./Iaas-k8s/pulumi/README.md).
