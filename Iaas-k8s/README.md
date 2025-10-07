# Iaas-k8s Infrastructure Management

This project is a **TypeScript package** for deploying Kubernetes infrastructure across multiple cloud providers (AWS, GCP) using Pulumi automation. It provides infrastructure as code and deployment configurations for the Iaas Rafiki application suite on Kubernetes. The package can be used as a library or CLI tool, and supports deployment to both AWS (Amazon Web Services) and GCP (Google Cloud Platform) using Pulumi for infrastructure provisioning and Helm for application deployment. The project is designed to be deployed using a `companyName` configuration for customized resource naming.

## Directory Structure

```
Iaas-k8s/
├── aws/                  # AWS-specific Helm value overrides
│   └── chart-config/
│       ├── secrets.dev.yaml
│       ├── secrets.prod.yaml
│       ├── values.dev.yaml
│       └── values.yaml
├── gcp/                  # GCP-specific Helm value overrides
│   └── chart-config/
│       ├── secrets.dev.yaml
│       ├── secrets.prod.yaml
│       ├── values.dev.yaml
│       └── values.yaml
├── helm-chart/           # Helm chart for deploying the application stack
│   ├── Chart.yaml        # Chart metadata (dynamically uses companyName)
│   ├── README.md         # Detailed guide for Helm chart usage
│   ├── values.yaml       # Default Helm chart values
│   ├── values.dev.yaml   # Development environment Helm overrides
│   ├── values.prod.yaml  # Production environment Helm overrides
│   └── templates/        # Kubernetes manifest templates
│       └── ...
├── pulumi/               # Pulumi project for provisioning cloud infrastructure and deploying the Helm chart
│   ├── automation.ts     # Pulumi Automation API script for managing deployments
│   ├── aws-infra.ts      # Pulumi code for AWS EKS infrastructure
│   ├── gcp-infra.ts      # Pulumi code for GCP GKE infrastructure
│   ├── index.ts          # Main Pulumi program (uses companyName for resource naming)
│   ├── package.json      # Node.js project dependencies for Pulumi
│   ├── Pulumi.dev.yaml   # Pulumi stack configuration for 'dev' environment
│   ├── Pulumi.prod.yaml  # Pulumi stack configuration for 'prod' environment
│   ├── Pulumi.yaml       # Pulumi project configuration
│   ├── README.md         # Detailed guide for Pulumi project usage
│   └── tsconfig.json     # TypeScript configuration for Pulumi project
└── README.md             # This file
```

## Overview

This setup uses a combination of Pulumi and Helm:

1.  **Pulumi**: Provisions cloud infrastructure (AWS EKS or GCP GKE).

    - The main program (`pulumi/index.ts`) orchestrates cloud provider selection (AWS/GCP) based on stack configuration (`iaas:cloudProvider`) and deploys the respective infrastructure. It also deploys the Helm chart.
    - Resources are named using a `companyName` prefix defined in the Pulumi stack configuration (e.g., `pulumi config set companyName yourcompany`).
    - The `pulumi/automation.ts` script provides a CLI-like interface (`npm run dev -- <command> <stack>`) for stack operations.

2.  **Helm**: Packages and deploys the Iaas Rafiki application suite.
    - The `helm-chart/` directory contains templates and values. The `Chart.yaml` name is dynamically set using `{{ .Values.companyName }}-rafiki`.
    - Helm values and secrets are passed to Pulumi via JSON strings in the Pulumi configuration (`helmValuesJson`, `helmSecretsJson`) by the `automation.ts` script.

## Core Components

### 1. Pulumi Project (`pulumi/`)

- **Purpose**: Creates and manages cloud resources (EKS or GKE clusters) and deploys the application using the Helm chart. Resource names are prefixed with the configured `companyName`.
- **Key Files**:
  - `index.ts`: Main entry point. Selects cloud provider, deploys infrastructure, and deploys the Helm chart using `companyName` for naming.
  - `aws-infra.ts`: Defines AWS EKS cluster. Cluster name includes `companyName`.
  - `gcp-infra.ts`: Defines GCP GKE cluster. Cluster name includes `companyName`. Creates a static IP for Ingress.
  - `automation.ts`: Script to run Pulumi commands. It prepares and passes `helmValuesJson` and `helmSecretsJson` to the Pulumi program.
  - `Pulumi.<stack-name>.yaml`: Stack-specific configurations (e.g., `aws:region`, `iaas:cloudProvider`, `gcp:project`, `companyName`, `helmValuesJson`, `helmSecretsJson`).
- **Usage**: Refer to `pulumi/README.md`.

### 2. Helm Chart (`helm-chart/`)

- **Purpose**: Packages and deploys the Iaas Rafiki application and its dependencies. The chart name is dynamically set to `{{ .Values.companyName }}-rafiki`.
- **Key Files**:
  - `Chart.yaml`: Metadata. `name` is `{{ .Values.companyName }}-rafiki`.
  - `values.yaml`: Default configuration values. Must include `companyName`.
  - `values.dev.yaml`, `values.prod.yaml`: Environment-specific overrides.
  - `templates/`: Kubernetes manifest templates.
- **Usage**:
  - Deployed via the Pulumi program, which receives Helm values/secrets as JSON strings.
  - For manual Helm usage, see `helm-chart/README.md`.

## Cloud Provider Specifics

### AWS

- Infrastructure (`pulumi/aws-infra.ts`): EKS cluster, VPC.
- Helm value overrides for AWS are specified in `aws/chart-config/` and passed via `helmValuesJson`/`helmSecretsJson` by `automation.ts`.

### GCP

- Infrastructure (`pulumi/gcp-infra.ts`): GKE cluster, static IP for Ingress.
- Helm value overrides for GCP are specified in `gcp/chart-config/` and passed via `helmValuesJson`/`helmSecretsJson` by `automation.ts`.
- The static IP name is exported by Pulumi (`staticIpName`) and used in Ingress annotations.

### Key Features

- **Namespace Isolation**: Each deployment gets isolated namespace with resource quotas
- **Cost Estimation**: Monthly cost estimates provided before deployment
- **Validation**: Pre-deployment resource validation

## General Workflow

1.  **Prerequisites**:

    - Install Pulumi CLI, AWS CLI, GCP CLI (`gcloud`), Node.js, npm/yarn, kubectl, Helm.
    - Configure AWS/GCP credentials.

2.  **Setup Pulumi Project**:

    - `cd pulumi/`
    - `npm install`
    - `npm run build`
    - `pulumi login`

3.  **Configure Pulumi Stack**:

    - The `automation.ts` script handles stack creation/selection.
    - Set configurations in `Pulumi.<stack-name>.yaml` or via `pulumi config set`:
      - `pulumi config set iaas:cloudProvider <aws|gcp> --stack <stack-name>`
      - `pulumi config set companyName yourcompanyname --stack <stack-name>`
      - For AWS: `pulumi config set aws:region <your-region> --stack <stack-name>`
      - For GCP: `pulumi config set gcp:project <your-project-id> --stack <stack-name>`
        `pulumi config set gcp:region <your-region> --stack <stack-name>` (optional)
        `pulumi config set gcp:zone <your-zone> --stack <stack-name>` (optional)
    - **Crucially**, the `automation.ts` script expects to find Helm values and secrets files (e.g., `../aws/chart-config/values.dev.yaml`, `../aws/chart-config/secrets.dev.yaml`) and will convert them into `helmValuesJson` and `helmSecretsJson` config values for the Pulumi program. Ensure these source YAML files are correctly placed and populated.

4.  **Deploy using the Pulumi CLI**:

    Use the deployment command for a complete infrastructure setup:

    ```bash
    npm run dev -- up prod --companyName chimoney-k8s --secretsFile ./config/secrets.json --valuesFile ./config/values.json --cloudProvider gcp --cloudConfigFile ./config/gcp-new.json --autoSetupConfig
    ```

    This command will:
    - Create GKE cluster with proper configuration
    - Deploy all Rafiki services (auth, backend, nginx, redis)
    - Set up Google Cloud Load Balancer with health checks
    - Configure ingress for the specified domains

5.  **Verify Deployment**:

    After deployment, run the verification script:

    ```bash
    ./scripts/verify-deployment.sh
    ```

    Or manually verify:
    ```bash
    # Check pods are running
    kubectl get pods

    # Check ingress has IP
    kubectl get ingress rafiki-ingress

    # Test health check
    curl -s -o /dev/null -w "%{http_code}" http://LOAD_BALANCER_IP/healthz
    ```

## Deployment Fixes and Known Issues

**✅ Successfully Deployed**: The deployment has been tested and verified working with the following key fixes:

1. **Service Connectivity**: Updated service names in `config/secrets.json` for proper internal communication
2. **Health Checks**: Configured Google Cloud Load Balancer health checks on `/healthz` endpoint
3. **Ingress Configuration**: Added required annotations for Google Cloud backend configuration
4. **Nginx Configuration**: Updated with proper health check endpoints and routing

For detailed information about the fixes applied, see [DEPLOYMENT_FIXES.md](DEPLOYMENT_FIXES.md).

## Prepared Configuration Files

The following configuration files are ready for deployment:

- `pulumi/config/secrets.json` - Contains all required secrets with correct service names
- `pulumi/config/values.json` - Contains optimized values for GCP deployment
- `pulumi/config/gcp-new.json` - GCP service account configuration
- `helm-chart/templates/backend-config.yaml` - Google Cloud backend configuration
- `helm-chart/templates/configmap.yaml` - Nginx configuration with health checks

4.  **Prepare Additional Helm Values & Secrets Files** (Optional):

    - Base configurations: `helm-chart/values.yaml` (ensure `companyName` is present or can be injected).
    - Environment-specific values: `helm-chart/values.dev.yaml`, `helm-chart/values.prod.yaml`.
    - Cloud-specific overrides:
      - `aws/chart-config/values.<env>.yaml`, `aws/chart-config/secrets.<env>.yaml`
      - `gcp/chart-config/values.<env>.yaml`, `gcp/chart-config/secrets.<env>.yaml`
    - **Ensure secret files are in `.gitignore`**. The `automation.ts` script reads these files and passes their content as JSON strings to Pulumi.

5.  **Deploy Infrastructure and Application**:

    - From the `pulumi/` directory:
      - Preview: `npm run dev preview <stack-name>`
      - Deploy: `npm run dev up <stack-name>`
    - The `automation.ts` script will prompt for the environment (dev/prod) to determine which `values.<env>.yaml` and `secrets.<env>.yaml` to use from the cloud-specific `chart-config` directory.

6.  **Accessing the Application**:

    - Pulumi output: `kubeconfig`, `ingressHostname`.
    - For GCP, `staticIpName` is also an output.
    - Use `kubeconfig` with `kubectl`. Access via `ingressHostname`.

7.  **Managing Deployments**:
    - Modify Pulumi code or Helm chart values/secret source files.
    - Rebuild (`npm run build` in `pulumi/`).
    - Run `npm run dev up <stack-name>`.
    - Destroy: `npm run dev destroy <stack-name>`.

## Important Notes

- **Secret Management**: Secrets are sourced from YAML files (e.g., `aws/chart-config/secrets.prod.yaml`) by `automation.ts`, converted to JSON, and passed to Pulumi. The Helm chart (`helm-chart/templates/secret.yaml`) creates Kubernetes secrets using `stringData` (plain text values, no base64 encoding needed). **Ensure source secret YAML files are gitignored.**
- **`companyName`**: This configuration is vital. It's used for naming Pulumi resources (EKS/GKE clusters) and dynamically in the Helm chart's `Chart.yaml` and release name. Set it via `pulumi config set companyName yourcompanyname`.
- **Production Deployments**:
  - Configure `values.prod.yaml` and cloud-specific `chart-config` files for production.
  - Use robust secret management.
- **Pulumi Automation API (`automation.ts`)**: This script is the primary interface for deployment. It handles the logic of reading Helm values/secrets files based on cloud provider and environment, converting them to JSON, and setting them in Pulumi config before running Pulumi operations. See `pulumi/README.md`.

## Further Information

- Pulumi project: `pulumi/README.md`.
- Helm chart (manual usage): `helm-chart/README.md`.
