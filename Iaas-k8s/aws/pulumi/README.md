# Pulumi AWS Deployment Guide

This guide provides instructions on how to authenticate Pulumi with AWS using IAM credentials and how to deploy this project.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [AWS CLI](https://aws.amazon.com/cli/)
- [Node.js and npm](https://nodejs.org/en/download/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) (for interacting with the EKS cluster)
- [Helm](https://helm.sh/docs/intro/install/) (if you need to inspect or manually manage Helm charts)

## 1. Authenticating Pulumi with AWS using IAM Credentials

Pulumi uses the AWS SDK to interact with your AWS account. The recommended way to authenticate is by configuring the AWS CLI with IAM user credentials that have the necessary permissions.

### Step 1: Create an IAM User (if you don't have one)

1.  Navigate to the [IAM console](https://console.aws.amazon.com/iam/) in AWS.
2.  Go to **Users** and click **Add users**.
3.  Enter a **User name** (e.g., `pulumi-deployer`).
4.  Select **Access key - Programmatic access** as the AWS credential type.
5.  Click **Next: Permissions**.
6.  Attach appropriate permissions. For deploying this project, you'll need permissions for EKS, EC2 (for VPCs and instances), IAM (for roles), S3 (for Pulumi state), and potentially other services depending on your specific AWS setup. It's best to follow the principle of least privilege. A starting point could be `AdministratorAccess` for simplicity during initial setup, but refine this for production environments.
7.  Click **Next: Tags** (optional), then **Next: Review**.
8.  Click **Create user**.
9.  **Important**: Download the `.csv` file or copy the **Access key ID** and **Secret access key**. You will not be able to access the secret key again after this step.

### Step 2: Configure AWS CLI Credentials

Open your terminal and run:

```bash
aws configure
```

Enter the following when prompted:

- **AWS Access Key ID**: `[YOUR_ACCESS_KEY_ID]` (from the IAM user created/used)
- **AWS Secret Access Key**: `[YOUR_SECRET_ACCESS_KEY]` (from the IAM user created/used)
- **Default region name**: `[YOUR_AWS_REGION]` (e.g., `us-east-1`, `eu-west-2`). This should match the region you intend to deploy your resources in.
- **Default output format**: `json` (or your preferred format)

This will create or update the `~/.aws/credentials` and `~/.aws/config` files. Pulumi will automatically use these credentials.

### Step 3: (Optional) Configure a Specific AWS Profile

If you use multiple AWS profiles, you can configure Pulumi to use a specific profile by setting the `AWS_PROFILE` environment variable:

```bash
export AWS_PROFILE=your-profile-name
```

Or, you can set it when running Pulumi commands:

```bash
AWS_PROFILE=your-profile-name pulumi up
```

## 2. Deploying the Project using Pulumi Automation API

This project uses Pulumi with the Automation API to define and deploy AWS infrastructure, including an EKS cluster and associated Kubernetes resources via a Helm chart. The Automation API script (`automation.ts`) handles stack operations.

### Step 1: Install Project Dependencies

Navigate to the `Iaas-k8s/aws/pulumi` directory in your terminal:

```bash
cd /Users/mide/Documents/work/Iaas/Iaas-k8s/aws/pulumi
```

Install the Node.js dependencies:

```bash
npm install
# or
# yarn install
```

### Step 2: Build the TypeScript Code

Compile the TypeScript files (including `index.ts`, `aws-infra.ts`, and `automation.ts`) to JavaScript:

```bash
npm run build
# or
# yarn build
```

This will create a `dist` directory with the compiled JavaScript files.

### Step 3: Login to Pulumi

If you haven't already, log in to the Pulumi service. This is where your stack's state will be stored. You can use the default Pulumi SaaS backend or configure an alternative [backend](https://www.pulumi.com/docs/concepts/state/).

```bash
pulumi login
```

_Note: While the Automation API script handles deployments, `pulumi login` and `pulumi stack init/select` (for the very first time) are still typically done via the Pulumi CLI._

### Step 4: Create or Select a Pulumi Stack (Initial Setup)

A Pulumi stack is an isolated instance of your Pulumi program. Common practice is to have stacks for different environments (e.g., `dev`, `staging`, `prod`).

If you are setting up a stack for the first time with the Automation API, you might still need the CLI to initialize it or ensure it's selected if the Automation API script doesn't explicitly handle `pulumi stack init` in a way that creates the `Pulumi.<stack-name>.yaml` configuration file. However, the provided `automation.ts` script uses `LocalWorkspace.createOrSelectStack`, which should handle this.

To create a new stack (e.g., `dev`) if it doesn't exist, or select it if it does:
The `automation.ts` script will handle this. For example, when you run `npm run pulumi up dev`, it will use or create the `dev` stack.

The current Pulumi code is designed to use different configurations based on the stack name (`dev` or `prod`). For example, it uses `t3.medium` instances for `dev` and `m5.large` for `prod`.

### Step 5: Configure Stack-Specific Values (if necessary)

This project loads Helm values from `values.yaml` and merges them with environment-specific files like `values.dev.yaml` or `values.prod.yaml`. Additionally, for production, it attempts to load `secrets.prod.yaml`.

Ensure these files are correctly configured for your deployment:

- `../helm-chart/values.yaml` (base values)
- `../helm-chart/values.dev.yaml` (for `dev` stack)
- `../helm-chart/values.prod.yaml` (for `prod` stack)
- `../helm-chart/secrets.prod.yaml` (for production secrets - **ensure this file is in `.gitignore` and managed securely**)

The Pulumi configuration files (`Pulumi.dev.yaml`, `Pulumi.prod.yaml`, `Pulumi.yaml`) might also contain stack-specific settings. You can set configuration values using the Pulumi CLI if needed, though the Automation API script primarily focuses on deployment actions:

```bash
pulumi config set <key> <value> --stack <stack-name>
# e.g., pulumi config set aws:region us-west-2 --stack dev
```

### Step 6: Preview the Deployment

Before making any changes, preview the resources Pulumi will create or modify using the Automation API script:

```bash
npm run pulumi preview <stack-name>
# e.g., npm run pulumi preview dev
```

Review the output carefully.

### Step 7: Deploy the Infrastructure

To deploy the infrastructure using the Automation API script:

```bash
npm run pulumi up <stack-name>
# e.g., npm run pulumi up dev
```

The script will show you a preview of the changes and ask for confirmation before proceeding if the underlying Pulumi program is interactive (which `stack.up()` can be, though the current script logs progress).

This process can take several minutes, especially when creating an EKS cluster for the first time.

### Step 8: Accessing the Cluster

Once the deployment is complete, the Automation API script will output the `kubeconfig` among other outputs.

The `automation.ts` script includes instructions on how to save and use the `kubeconfig` from the output of the `up` command. It will look something like this:

```
--- To configure kubectl for EKS ---
1. Save the kubeconfig:
   echo '<kubeconfig_content>' > kubeconfig-dev.yaml
2. Set KUBECONFIG environment variable:
   export KUBECONFIG=$(pwd)/kubeconfig-dev.yaml
3. Test connection:
   kubectl get nodes
```

Follow these instructions in your terminal.

### Step 9: Accessing Exported Outputs

The Pulumi program exports several outputs. You can view these using the Automation API script:

```bash
npm run pulumi outputs <stack-name>
# e.g., npm run pulumi outputs dev
```

This will display all stack outputs, including:

- `kubeconfig`: The kubeconfig file content for accessing the EKS cluster.
- `ingressHostname`: The hostname or IP of the Ingress.
- `nginxLoadBalancer`: The hostname or IP of the Nginx service.

## 3. Updating the Deployment

If you make changes to the Pulumi code (`index.ts`, `aws-infra.ts`) or the Helm chart:

1.  Navigate to the `Iaas-k8s/aws/pulumi` directory.
2.  Run `npm install` (or `yarn install`) if you've updated Node.js dependencies.
3.  Rebuild the TypeScript code:
    ```bash
    npm run build
    # or
    # yarn build
    ```
4.  Run `npm run pulumi preview <stack-name>` to see the planned changes.
5.  Run `npm run pulumi up <stack-name>` to apply the changes.

## 4. Destroying the Infrastructure

To tear down all resources managed by your Pulumi stack using the Automation API script:

**Warning**: This action is irreversible and will delete all AWS resources created by this stack (EKS cluster, EC2 instances, Load Balancers, etc.).

```bash
npm run pulumi destroy <stack-name>
# e.g., npm run pulumi destroy dev
```

The script will ask for confirmation.

To remove the stack itself (after destroying its resources), you would typically use the Pulumi CLI:

```bash
pulumi stack rm <stack-name>
```

## 5. Other Operations

The Automation API script also supports refreshing the stack state:

```bash
npm run pulumi refresh <stack-name>
# e.g., npm run pulumi refresh dev
```

## Troubleshooting

- **Permissions Issues**: If `pulumi up` fails with permission errors, ensure the IAM user configured with the AWS CLI has the necessary permissions for all services Pulumi is trying to manage.
- **Helm Chart Issues**: Check the Helm chart templates and values files for correctness. You can use `helm template . --values values.dev.yaml > rendered.yaml` (from within the `helm-chart` directory) to debug the rendered Kubernetes manifests.
- **Pulumi Logs**: Check the Pulumi logs for detailed error messages during `pulumi up` or `preview`.
- **EKS Cluster Creation Time**: EKS cluster creation can take 15-25 minutes. Be patient.
- **AWS Load Balancer Controller**: Ensure the AWS Load Balancer Controller deploys successfully. You can check its logs in the `kube-system` namespace:
  ```bash
  kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
  ```
