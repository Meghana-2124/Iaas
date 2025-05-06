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

## 2. Deploying the Project using Pulumi

This project uses Pulumi to define and deploy AWS infrastructure, including an EKS cluster and associated Kubernetes resources via a Helm chart.

### Step 1: Install Project Dependencies

Navigate to the `Iaas-k8s/aws/pulumi` directory in your terminal:

```bash
cd /Users/mide/Documents/work/Iaas/Iaas-k8s/aws/pulumi
```

Install the Node.js dependencies:

```bash
npm install
```

### Step 2: Login to Pulumi

If you haven't already, log in to the Pulumi service. This is where your stack's state will be stored. You can use the default Pulumi SaaS backend or configure an alternative [backend](https://www.pulumi.com/docs/concepts/state/).

```bash
pulumi login
```

### Step 3: Create or Select a Pulumi Stack

A Pulumi stack is an isolated instance of your Pulumi program. Common practice is to have stacks for different environments (e.g., `dev`, `staging`, `prod`).

To create a new stack (e.g., `dev`):

```bash
pulumi stack init dev
```

If the stack already exists, select it:

```bash
pulumi stack select <stack-name> # e.g., pulumi stack select dev
```

The current Pulumi code is designed to use different configurations based on the stack name (`dev` or `prod`). For example, it uses `t3.medium` instances for `dev` and `m5.large` for `prod`.

### Step 4: Configure Stack-Specific Values (if necessary)

This project loads Helm values from `values.yaml` and merges them with environment-specific files like `values.dev.yaml` or `values.prod.yaml`. Additionally, for production, it attempts to load `secrets.prod.yaml`.

Ensure these files are correctly configured for your deployment:

- `../helm-chart/values.yaml` (base values)
- `../helm-chart/values.dev.yaml` (for `dev` stack)
- `../helm-chart/values.prod.yaml` (for `prod` stack)
- `../helm-chart/secrets.prod.yaml` (for production secrets - **ensure this file is in `.gitignore` and managed securely**)

The Pulumi configuration files (`Pulumi.dev.yaml`, `Pulumi.yaml`) might also contain stack-specific settings. You can set configuration values using:

```bash
pulumi config set <key> <value>
# e.g., pulumi config set aws:region us-west-2
```

### Step 5: Preview the Deployment

Before making any changes, preview the resources Pulumi will create or modify:

```bash
pulumi preview
```

Review the output carefully.

### Step 6: Deploy the Infrastructure

To deploy the infrastructure:

```bash
pulumi up
```

Pulumi will show you a preview of the changes and ask for confirmation before proceeding. Type `yes` to approve.

This process can take several minutes, especially when creating an EKS cluster for the first time.

### Step 7: Accessing the Cluster

Once the deployment is complete, Pulumi will output the `kubeconfig`. You can use this to interact with your EKS cluster using `kubectl`.

To configure `kubectl` to use the new cluster's kubeconfig:

```bash
pulumi stack output kubeconfig > kubeconfig.yaml
export KUBECONFIG=$(pwd)/kubeconfig.yaml
kubectl get nodes
```

You should see the nodes of your EKS cluster.

### Step 8: Accessing Exported Outputs

The Pulumi program exports several outputs:

- `kubeconfig`: The kubeconfig file content for accessing the EKS cluster.
- `ingressHostname`: The hostname or IP of the Ingress (if an ALB is provisioned and the Ingress controller updates its status).
- `nginxLoadBalancer`: The hostname or IP of the Nginx service if it's of type LoadBalancer.

You can view these outputs at any time with:

```bash
pulumi stack output
```

Or for a specific output:

```bash
pulumi stack output ingressHostname
```

## 3. Updating the Deployment

If you make changes to the Pulumi code or the Helm chart:

1.  Navigate to the `Iaas-k8s/aws/pulumi` directory.
2.  Run `npm install` if you've updated dependencies.
3.  Run `pulumi preview` to see the planned changes.
4.  Run `pulumi up` to apply the changes.

## 4. Destroying the Infrastructure

To tear down all resources managed by your Pulumi stack:

**Warning**: This action is irreversible and will delete all AWS resources created by this stack (EKS cluster, EC2 instances, Load Balancers, etc.).

```bash
pulumi destroy
```

Confirm by typing `yes`.

To remove the stack itself (after destroying its resources):

```bash
pulumi stack rm <stack-name>
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
