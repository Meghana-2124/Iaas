# IAAS (Infrastructure as a Service)

A comprehensive multi-cloud Kubernetes infrastructure deployment solution supporting AWS EKS and GCP GKE.

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
   npm run pulumi -- up dev \
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
