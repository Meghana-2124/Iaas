# IaaS K8s Deployment Package

A TypeScript package for deploying Kubernetes infrastructure across multiple cloud providers (AWS, GCP) using Pulumi automation.

## Project Structure

```
pulumi/
├── automation.ts           # Main automation entry point and library exports
├── index.ts               # Primary Pulumi program for infrastructure deployment
├── package.json           # Dependencies and npm scripts
├── tsconfig.json          # TypeScript configuration
├── config/                # Configuration files
│   ├── secrets.json       # Kubernetes secrets configuration
│   └── values.json        # Helm values configuration
├── src/                   # Source code organized by functionality
│   ├── index.ts           # Barrel export for all modules
│   ├── cli/               # Command-line interface modules
│   ├── core/              # Core infrastructure and deployment logic
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions and helpers
│   └── examples/          # Example usage and integration tests
└── dist/                  # Compiled JavaScript output (generated)
```

## Installation

```bash
npm install @chimoney/iaas-k8s-deployment
```

## Prerequisites

- Node.js >= 18.0.0
- Pulumi CLI installed on the system
- Cloud provider credentials configured (AWS CLI, gcloud, etc.)

## Usage

### As a Library

```typescript
import {
  handleDeployment,
  DeploymentOptions,
} from "@chimoney/iaas-k8s-deployment";

const options: DeploymentOptions = {
  action: "up",
  stackName: "my-company-dev",
  secretsJson: JSON.stringify(require("./config/secrets.json")),
  valuesJson: JSON.stringify(require("./config/values.json")),
  companyName: "my-company",
  workDir: "/path/to/pulumi/project",
  cloudProvider: "aws",
  cloudConfig: require("./config/cloudConfig.json"),
  autoSetupConfig: true,
};

const result = await handleDeployment(options);

if (result.success) {
  console.log("Deployment successful!");
  console.log("Outputs:", result.outputs);
  if (result.kubeconfig) {
    // Save kubeconfig for kubectl access
    fs.writeFileSync("kubeconfig.yaml", result.kubeconfig);
  }
} else {
  console.error("Deployment failed:", result.error);
}
```

### As CLI Tool (Recommended: Use JSON Files)

After installation, you can use the CLI command with file-based config:

```bash
iaas-deploy up my-stack \
  --companyName mycompany \
  --secretsFile ./config/secrets.json \
  --valuesFile ./config/values.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.json \
  --autoSetupConfig
```

- `--secretsFile` and `--valuesFile` let you provide secrets/values as JSON files (recommended for security and maintainability).
- `--cloudConfigFile` lets you provide cloud provider config as a JSON file (recommended).
- `--autoSetupConfig` tells the CLI to set all Pulumi config for you (no manual `pulumi config set ...` required).

**Example for GCP:**

```bash
iaas-deploy up dev \
  --companyName mycompany \
  --secretsFile ./config/secrets.json \
  --valuesFile ./config/values.json \
  --cloudProvider gcp \
  --cloudConfigFile ./config/cloudConfig.gcp.json \
  --autoSetupConfig
```

#### Supported --cloudConfigFile fields

- For AWS: `{ "region": "us-east-1", "profile": "default", "accessKeyId": "...", "secretAccessKey": "..." }`
- For GCP: `{ "project": "my-gcp-project", "region": "us-central1", "zone": "us-central1-a", "credentials": "/path/to/key.json" }`

> **Note:** You can still use `--secretsJson`, `--valuesJson`, and `--cloudConfig` with raw JSON strings, but using files is recommended for all non-trivial deployments.

### Available Actions

- `up` - Deploy/update infrastructure
- `preview` - Preview changes without applying
- `destroy` - Destroy infrastructure
- `outputs` - Get stack outputs
- `refresh` - Refresh stack state

## Configuration

The package expects:

1. **secretsFile**: Path to a JSON file containing sensitive configuration values
2. **valuesFile**: Path to a JSON file containing non-sensitive configuration values
3. **cloudConfigFile**: Path to a JSON file with cloud provider config
4. **companyName**: String identifying the company/tenant
5. **stackName**: Pulumi stack name (e.g., 'company-env')

## Multi-Cloud Support

The package automatically detects cloud provider based on Pulumi configuration:

- AWS: Uses EKS for Kubernetes clusters
- GCP: Uses GKE for Kubernetes clusters

## Return Values

The `handleDeployment` function returns a `DeploymentResult` object:

```typescript
interface DeploymentResult {
  success: boolean;
  outputs?: any; // Pulumi stack outputs
  summary?: any; // Operation summary
  error?: string; // Error message if failed
  kubeconfig?: string; // Kubernetes config for cluster access
}
```

## Examples

### Development Deployment (with auto-setup, file-based config)

```bash
iaas-deploy up acme-dev \
  --companyName acme \
  --secretsFile ./config/secrets.json \
  --valuesFile ./config/values.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.aws.json \
  --autoSetupConfig
```

### Production Deployment (with auto-setup, file-based config)

```bash
iaas-deploy up acme-prod \
  --companyName acme \
  --secretsFile ./config/secrets.json \
  --valuesFile ./config/values.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.aws.json \
  --autoSetupConfig
```

## Authentication

### AWS Authentication

Follow standard AWS CLI configuration using IAM user credentials with necessary permissions for EKS, EC2, IAM, S3, etc.

```bash
aws configure
```

Pulumi will use these default credentials. For specific profiles:

```bash
export AWS_PROFILE=your-profile-name
```

### GCP Authentication

Authenticate using service account or user credentials:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

Or using a service account:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

## Building and Publishing

For developers working on this package:

```bash
# Build the package
npm run build

# Test locally
npm link
cd /path/to/test/project
npm link @chimoney/iaas-k8s-deployment

# Publish to npm
npm publish
```

## License

MIT

---

### Advanced: Manual Pulumi Config (Not Recommended)

You can still use manual `pulumi config set ...` commands if you want full control, but the recommended approach is to use the CLI's `--autoSetupConfig` and file-based options for all configuration.
