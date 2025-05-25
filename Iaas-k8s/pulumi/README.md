# Pulumi Iaas-k8s Deployment Guide

This guide provides instructions on how to authenticate Pulumi with AWS or GCP and how to deploy this project, which provisions Kubernetes infrastructure (EKS or GKE) and deploys the Rafiki application suite using a Helm chart. The deployment process is managed by an Automation API script (`automation.ts`) and utilizes a `companyName` configuration for resource naming.

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [AWS CLI](https://aws.amazon.com/cli/) (if deploying to AWS)
- [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/install) (if deploying to GCP)
- [Node.js and npm](https://nodejs.org/en/download/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
- [Helm CLI](https://helm.sh/docs/intro/install/) (for chart inspection, not direct deployment by this process)

## 1. Authentication

### 1.1. Authenticating Pulumi with AWS

Follow standard AWS CLI configuration using IAM user credentials with necessary permissions for EKS, EC2, IAM, S3, etc.

```bash
aws configure
```

Pulumi will use these default credentials. For specific profiles:

```bash
export AWS_PROFILE=your-profile-name
# Then run Pulumi commands
```

### 1.2. Authenticating Pulumi with Google Cloud (GCP)

**Recommended: Service Account Key**

1.  Create a GCP Service Account with roles like "Kubernetes Engine Admin", "Service Account User", "Compute Admin", "Storage Admin".
2.  Download the JSON key file.
3.  Set the environment variable:
    ```bash
    export GOOGLE_CREDENTIALS=/path/to/your-service-account-key.json
    ```

**Alternative: `gcloud` Application Default Credentials (ADC)**

```bash
gcloud auth application-default login
```

Pulumi will automatically pick up these credentials.

## 2. Deploying the Project using Pulumi Automation API

This project uses `automation.ts` to manage deployments. This script orchestrates Pulumi stack operations and handles the passing of Helm chart configurations.

### Step 1: Install Project Dependencies

Navigate to the `Iaas-k8s/pulumi` directory:

```bash
cd /Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi
npm install
```

### Step 2: Build the TypeScript Code

Compile TypeScript files (`index.ts`, `aws-infra.ts`, `gcp-infra.ts`, `automation.ts`):

```bash
npm run build
```

This creates a `dist` directory with compiled JavaScript.

### Step 3: Login to Pulumi

```bash
pulumi login
```

### Step 4: Configure Pulumi Stack and Project Settings

The `automation.ts` script will prompt you to select or create a stack (e.g., `dev`, `prod`). Stack configuration is stored in `Pulumi.<stack-name>.yaml`.

**Crucial Configurations (set via `pulumi config set` or directly in `Pulumi.<stack-name>.yaml`):**

1.  **Cloud Provider**: Determines whether to deploy to AWS or GCP.

    ```bash
    pulumi config set iaas:cloudProvider <aws|gcp> --stack <stack-name>
    ```

2.  **Company Name**: Used for naming resources (e.g., EKS/GKE cluster, Helm release).

    ```bash
    pulumi config set companyName yourcompanyname --stack <stack-name>
    ```

3.  **Cloud-Specific Settings**:

    - **AWS**:
      ```bash
      pulumi config set aws:region <your-aws-region> --stack <stack-name>
      ```
    - **GCP**:
      ```bash
      pulumi config set gcp:project <your-gcp-project-id> --stack <stack-name>
      pulumi config set gcp:region <your-gcp-region> --stack <stack-name> # e.g., us-central1
      pulumi config set gcp:zone <your-gcp-zone> --stack <stack-name>     # e.g., us-central1-a
      ```

4.  **Helm Configuration (Handled by `automation.ts`)**:
    The `automation.ts` script is responsible for reading Helm values and secrets from YAML files located in `../<cloudProvider>/chart-config/` (e.g., `../aws/chart-config/values.dev.yaml`, `../gcp/chart-config/secrets.prod.yaml`). It then converts these to JSON strings and sets them as `helmValuesJson` and `helmSecretsJson` in the Pulumi stack configuration for the `pulumi/index.ts` program to consume.

    **You do not set `helmValuesJson` or `helmSecretsJson` directly using `pulumi config set`.** Instead, ensure the source YAML files are correctly placed and populated in the respective `chart-config` directories:

    - `Iaas-k8s/aws/chart-config/values.<env>.yaml`
    - `Iaas-k8s/aws/chart-config/secrets.<env>.yaml` (ensure this is in `.gitignore`)
    - `Iaas-k8s/gcp/chart-config/values.<env>.yaml`
    - `Iaas-k8s/gcp/chart-config/secrets.<env>.yaml` (ensure this is in `.gitignore`)

    The base Helm values are typically in `Iaas-k8s/helm-chart/values.yaml` and environment-specific overrides in `Iaas-k8s/helm-chart/values.<env>.yaml`. The `automation.ts` script merges these with the cloud-specific files.

### Step 5: Preview the Deployment

Run the `preview` command using the `automation.ts` script. It will prompt for the stack name if not provided and the environment (dev/prod).

```bash
npm run pulumi preview <stack-name>
# Example: npm run pulumi preview dev
```

This command will:

1.  Invoke `automation.ts`.
2.  Prompt for environment (dev/prod).
3.  Read appropriate Helm values/secrets from `../<cloudProvider>/chart-config/` and `../../helm-chart/`.
4.  Convert them to JSON strings and set `helmValuesJson` and `helmSecretsJson` in Pulumi config.
5.  Run `pulumi preview` for the selected stack.

Review the output carefully.

### Step 6: Deploy the Infrastructure

Run the `up` command using the `automation.ts` script.

```bash
npm run pulumi up <stack-name>
# Example: npm run pulumi up dev
```

This command follows a similar process to `preview` but proceeds with the actual deployment (`pulumi up`).

### Step 7: Accessing the Cluster and Application

Once deployment is complete, `automation.ts` will display stack outputs.

- **`kubeconfig`**: Content to access your Kubernetes cluster. The script provides an `echo` command to save it.
  ```bash
  # Example for saving kubeconfig
  # echo '<kubeconfig_content_from_output>' > kubeconfig-<stack-name>.yaml
  # export KUBECONFIG=$(pwd)/kubeconfig-<stack-name>.yaml
  # kubectl get nodes
  ```
- **`ingressHostname`**: The hostname or IP of the Ingress controller to access your application.
- **Cloud Specific Outputs**:
  - AWS: `eksClusterName`, `vpcId`.
  - GCP: `gkeClusterName`, `gcpProject`, `gcpZone`, `staticIpName` (name of the reserved static IP for Ingress).

### Step 8: Accessing Exported Outputs Manually

If you need to view outputs later:

```bash
npm run pulumi outputs <stack-name>
# Example: npm run pulumi outputs dev
```

## 3. Updating the Deployment

1.  Modify Pulumi code (`*.ts` files in `pulumi/`) or Helm chart values/templates (`helm-chart/` or `aws/chart-config/`, `gcp/chart-config/`).
2.  Rebuild TypeScript: `npm run build` (in `pulumi/` directory).
3.  Preview changes: `npm run pulumi preview <stack-name>`.
4.  Apply changes: `npm run pulumi up <stack-name>`.

## 4. Destroying the Infrastructure

**Warning**: This is irreversible and deletes all cloud resources managed by the stack.

```bash
npm run pulumi destroy <stack-name>
# Example: npm run pulumi destroy dev
```

To remove the stack itself from Pulumi's backend (after destroying resources):

```bash
pulumi stack rm <stack-name>
```

## 5. Other Operations

Refresh stack state:

```bash
npm run pulumi refresh <stack-name>
# Example: npm run pulumi refresh dev
```

## `automation.ts` Script Details

The `automation.ts` script (run via `npm run pulumi -- <command> <stack>`) is central to the deployment workflow. Its key responsibilities include:

- Prompting for stack name and environment (dev/prod).
- Determining the cloud provider from Pulumi config (`iaas:cloudProvider`).
- Constructing file paths to Helm values and secrets YAML files based on cloud provider and environment (e.g., `../aws/chart-config/values.dev.yaml`, `../../helm-chart/values.dev.yaml`).
- Reading and merging these YAML files in a specific order of precedence.
- Converting the merged Helm values and secrets into JSON strings.
- Setting these JSON strings as `helmValuesJson` and `helmSecretsJson` in the Pulumi configuration for the target stack.
- Executing the requested Pulumi command (e.g., `preview`, `up`, `destroy`, `outputs`, `refresh`).

This approach ensures that the core Pulumi program (`pulumi/index.ts`) receives its Helm configurations dynamically and securely via Pulumi config, rather than reading files directly, making the Pulumi program itself more portable and testable.

## Troubleshooting

- **Permissions Issues**: Ensure IAM user (AWS) or Service Account (GCP) has necessary permissions.
- **Helm Chart Issues**: Check Helm templates and values. The `automation.ts` script logs the paths of files it attempts to load.
- **Pulumi Logs**: Detailed error messages are available in Pulumi command output.
- **`companyName` not set**: If you see errors related to `companyName` being undefined in `Chart.yaml` or resource names, ensure `pulumi config set companyName yourcompanyname` is run for the stack.
- **Secrets Files**: Ensure `secrets.<env>.yaml` files are present in the correct `../<cloudProvider>/chart-config/` directory and are correctly formatted. These files are critical and **must be gitignored**.
