# IaaS K8s Deployment Package

This is a **TypeScript package** for deploying Kubernetes infrastructure across multiple cloud providers (AWS, GCP) using Pulumi automation. It supports both **dedicated** and **shared** deployment types for cost optimization and resource efficiency.

## 🚀 New Features

### Dynamic Helm Values Generation

- **Automatic configuration**: No longer requires manual Helm values files
- **Cloud provider-aware defaults**: Automatically configures images and settings based on your cloud provider
- **Optional overrides**: Use `--valuesFile` only when you need to override generated defaults
- **Smart merging**: Combines dynamic values + tier allocation + user overrides seamlessly

### Deployment Types

#### Dedicated Deployments (Default)

- Creates a new Kubernetes cluster for each company
- Complete infrastructure isolation
- Higher cost, maximum security
- Auto-configures HPA (Horizontal Pod Autoscaling) for optimal performance

#### Shared Deployments (Cost-Optimized)

- Reuses existing Kubernetes clusters across multiple companies
- Namespace-level isolation with automatic network policies
- Significant cost savings through resource sharing
- Automatic cluster lookup and creation if not found

See [DEPLOYMENT_TYPES.md](./DEPLOYMENT_TYPES.md) for detailed documentation.

## How to Run

1. **Install prerequisites**:

   - Node.js v18+
   - Pulumi CLI
   - Cloud CLI tools (AWS CLI, gcloud) and credentials

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the project**:

   ```bash
   npm run build
   ```

4. **Prepare configuration files**:

   - `config/secrets.json`
   - `config/values.json`
   - `config/aws.json` or `config/gcp.json`

5. **Run a deployment (CLI example)**:

   ### Dedicated Deployment (Default)

   ```bash
   npm run dev -- up my-stack \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --cloudProvider aws \
     --cloudConfigFile ./config/aws.json \
     --deploymentType dedicated \
     --autoSetupConfig
   ```

   ### Shared Deployment (Cost-Optimized)

   ```bash
   npm run dev -- up my-stack \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --cloudProvider gcp \
     --cloudConfigFile ./config/gcp.json \
     --deploymentType shared \
     --namespace mycompany-prod \
     --autoSetupConfig
   ```

   ### With Custom Configuration (Optional)

   You can still provide a values file for specific overrides:

   ```bash
   npm run dev -- up my-stack \
     --companyName mycompany \
     --secretsFile ./config/secrets.json \
     --valuesFile ./config/values-overrides.json \
     --cloudProvider aws \
     --cloudConfigFile ./config/aws.json \
     --deploymentType dedicated \
     --autoSetupConfig
   ```

   For GCP, use `--cloudProvider gcp` and the appropriate config file.

6. **Outputs**:
   - The CLI will print endpoints, DNS, and next steps.

> For advanced usage and library integration, see the sections below.

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
npm install @chimoney.io/iaas-k8s-deployment
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
} from "@chimoney.io/iaas-k8s-deployment";

const options: DeploymentOptions = {
  action: "up",
  stackName: "my-company-dev",
  secretsJson: JSON.stringify(require("./config/secrets.json")),
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

### As CLI Tool (Dynamic Values Generation)

The CLI now automatically generates Helm values based on your deployment configuration:

```bash
iaas-deploy up my-stack \
  --companyName mycompany \
  --secretsFile ./config/secrets.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.json \
  --autoSetupConfig
```

**Key Changes:**

- `--valuesFile` is now **optional** - the system generates comprehensive Helm values automatically
- Values are dynamically created based on your cloud provider, deployment type, and configuration options
- Use `--valuesFile` only when you need to override the generated defaults

**Example with optional overrides:**

```bash
iaas-deploy up my-stack \
  --companyName mycompany \
  --secretsFile ./config/secrets.json \
  --valuesFile ./config/custom-overrides.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.json \
  --autoSetupConfig
```

**Example for GCP:**

```bash
iaas-deploy up dev \
  --companyName mycompany \
  --secretsFile ./config/secrets.json \
  --cloudProvider gcp \
  --cloudConfigFile ./config/cloudConfig.gcp.json \
  --autoSetupConfig
```

#### Supported --cloudConfigFile fields

- For AWS: `{ "region": "us-east-1", "profile": "default", "accessKeyId": "...", "secretAccessKey": "..." }`
- For GCP: `{ "project": "my-gcp-project", "region": "us-central1", "zone": "us-central1-a", "credentials": "/path/to/key.json" }`

> **Note:** You can still use `--secretsJson` and `--cloudConfig` with raw JSON strings, but using files is recommended for all non-trivial deployments.

### Available Actions

- `up` - Deploy/update infrastructure
- `preview` - Preview changes without applying
- `destroy` - Destroy infrastructure
- `outputs` - Get stack outputs
- `refresh` - Refresh stack state

## Configuration

The package now uses **dynamic value generation** with minimal configuration requirements:

### Required Configuration

1. **secretsFile**: Path to a JSON file containing sensitive configuration values
2. **companyName**: String identifying the company/tenant
3. **stackName**: Pulumi stack name (e.g., 'company-env')
4. **cloudProvider**: Target cloud provider ('aws' or 'gcp')
5. **cloudConfigFile**: Path to a JSON file with cloud provider config

### Optional Configuration

1. **valuesFile**: Path to a JSON file for overriding generated defaults
2. **deploymentType**: 'dedicated' (default) or 'shared'
3. **namespace**: Kubernetes namespace (auto-generated for shared deployments)
4. **planTier**: Resource tier for shared deployments ('basic', 'standard', 'premium')

### Dynamic Configuration Options

The CLI now supports extensive configuration options for fine-tuning your deployment:

- **Service Control**: `--enableRafikiAuth`, `--enableRafikiBackend`, `--enableNginx`, `--enableRedis`
- **Custom Images**: `--rafikiAuthImageRepository`, `--rafikiAuthImageTag`, etc.
- **Domain Configuration**: `--defaultDomain` for automatic hostname generation
- **HPA Settings**: `--dedicatedDeploymentHpaEnabledByDefault`
- **Network Policies**: `--sharedDeploymentNetworkPolicyEnabled`

Run `iaas-deploy --help` to see all available options.

## Multi-Cloud Support

The package automatically detects cloud provider based on Pulumi configuration:

- AWS: Uses EKS for Kubernetes clusters
- GCP: Uses GKE for Kubernetes clusters

## Dynamic Helm Values Generation

The package now automatically generates comprehensive Helm values based on your deployment configuration, eliminating the need for manual Helm values files in most cases.

### How It Works

1. **Base Generation**: Creates complete Helm values with sensible defaults
2. **Cloud Provider Optimization**: Adjusts configurations based on AWS/GCP best practices
3. **Deployment Type Configuration**:
   - **Dedicated**: Enables HPA for optimal performance
   - **Shared**: Configures network policies for security isolation
4. **Tier Integration**: Merges resource allocations for shared deployments
5. **User Overrides**: Applies any custom values from `--valuesFile`

### Generated Configuration Includes

- **Service Enablement**: All Rafiki services with appropriate defaults
- **Image Configuration**: Cloud provider-optimized container images
- **Networking**: Automatic hostname generation and ingress configuration
- **Security**: Network policies for shared deployments
- **Scaling**: HPA configuration for dedicated deployments
- **Resource Management**: Tier-based resource allocation for shared deployments

### Example Generated Values

For a company named "acme" with domain "example.com":

```yaml
companyName: acme
deploymentType: dedicated
rafikiAuth:
  enabled: true
  image:
    repository: ghcr.io/interledger/rafiki-auth
    tag: v1.0.0-alpha.20
  hpa:
    enabled: true # Auto-enabled for dedicated deployments
nginx:
  config:
    serverNameIlp: ilp.acme.example.com
    serverNameAuth: auth-ilp.acme.example.com
networkPolicy:
  enabled: false # Disabled for dedicated, enabled for shared
```

### When to Use Values File

Use `--valuesFile` only when you need to:

- Override specific image tags or repositories
- Customize resource limits beyond tier defaults
- Add custom ingress annotations
- Configure additional services or sidecars

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

### Basic Deployment (Auto-Generated Configuration)

```bash
iaas-deploy up acme-dev \
  --companyName acme \
  --secretsFile ./config/secrets.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.aws.json \
  --autoSetupConfig
```

### Shared Deployment with Tier (Cost-Optimized)

```bash
iaas-deploy up acme-dev \
  --companyName acme \
  --secretsFile ./config/secrets.json \
  --cloudProvider gcp \
  --cloudConfigFile ./config/cloudConfig.gcp.json \
  --deploymentType shared \
  --planTier premium \
  --namespace acme-production \
  --autoSetupConfig
```

### Custom Configuration with Overrides

```bash
iaas-deploy up acme-prod \
  --companyName acme \
  --secretsFile ./config/secrets.json \
  --valuesFile ./config/custom-overrides.json \
  --cloudProvider aws \
  --cloudConfigFile ./config/cloudConfig.aws.json \
  --defaultDomain "acme.com" \
  --authDomain  "auth-ilp.acme.com" \
  --openPaymentsDomain  "ilp.acme.com" \
  --connectorDomain  "ilp-connector.acme.com" \
  --rafikiAuthImageTag "latest" \
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
npm link @chimoney.io/iaas-k8s-deployment

# Publish to npm
npm publish
```

## License

MIT

---

### Advanced: Manual Pulumi Config (Not Recommended)

You can still use manual `pulumi config set ...` commands if you want full control, but the recommended approach is to use the CLI's `--autoSetupConfig` and file-based options for all configuration.
