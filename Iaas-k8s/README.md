# Iaas-k8s Infrastructure Management

This directory contains the infrastructure as code and deployment configurations for the Chimoney Rafiki application suite on Kubernetes. It supports deployment to both AWS (Amazon Web Services) and GCP (Google Cloud Platform).

## Directory Structure

```
Iaas-k8s/
├── aws/                  # AWS-specific configurations (if any, beyond Pulumi)
│   └── chart-config/     # Helm value overrides for AWS environments
│       ├── secrets.dev.yaml
│       ├── secrets.prod.yaml
│       ├── values.dev.yaml
│       └── values.yaml       # Base values, likely symlinked or copied from helm-chart
├── gcp/                  # GCP-specific configurations (if any, beyond Pulumi)
│   └── chart-config/     # Helm value overrides for GCP environments
│       ├── secrets.dev.yaml
│       ├── secrets.prod.yaml
│       ├── values.dev.yaml
│       └── values.yaml       # Base values, likely symlinked or copied from helm-chart
├── helm-chart/           # Helm chart for deploying the application stack
│   ├── Chart.yaml        # Chart metadata
│   ├── README.md         # Detailed guide for Helm chart usage
│   ├── values.yaml       # Default Helm chart values
│   ├── values.dev.yaml   # Development environment Helm overrides
│   ├── values.prod.yaml  # Production environment Helm overrides (placeholder, create as needed)
│   └── templates/        # Kubernetes manifest templates
│       └── ...
├── pulumi/               # Pulumi project for provisioning cloud infrastructure (EKS/GKE) and deploying the Helm chart
│   ├── automation.ts     # Pulumi Automation API script for managing deployments
│   ├── aws-infra.ts      # Pulumi code for AWS EKS infrastructure
│   ├── gcp-infra.ts      # Pulumi code for GCP GKE infrastructure
│   ├── index.ts          # Main Pulumi program orchestrating cloud and Helm deployment
│   ├── package.json      # Node.js project dependencies for Pulumi
│   ├── Pulumi.dev.yaml   # Pulumi stack configuration for 'dev' environment
│   ├── Pulumi.prod.yaml  # Pulumi stack configuration for 'prod' environment
│   ├── Pulumi.yaml       # Pulumi project configuration
│   ├── README.md         # Detailed guide for Pulumi project usage
│   └── tsconfig.json     # TypeScript configuration for Pulumi project
└── README.md             # This file
```

## Overview

This setup uses a combination of Pulumi and Helm to manage and deploy the application:

1.  **Pulumi**: Used for provisioning the underlying cloud infrastructure.

    - For AWS: Creates an Elastic Kubernetes Service (EKS) cluster, VPC, and related resources.
    - For GCP: Creates a Google Kubernetes Engine (GKE) cluster and related resources.
    - The Pulumi program (`pulumi/index.ts`) also deploys the Helm chart onto the provisioned cluster.
    - The `pulumi/automation.ts` script provides a CLI-like interface (`npm run pulumi -- <command> <stack>`) to manage Pulumi stack operations (preview, up, destroy, outputs).

2.  **Helm**: Used for packaging and deploying the Chimoney Rafiki application suite onto a Kubernetes cluster.
    - The `helm-chart/` directory contains all necessary templates, default values, and environment-specific value overrides.
    - It defines deployments and services for various components like `rafiki-auth`, `rafiki-backend`, `nginx`, and `redis`.

## Core Components

### 1. Pulumi Project (`pulumi/`)

- **Purpose**: To create and manage cloud resources (EKS or GKE clusters) and deploy the application using the Helm chart.
- **Key Files**:
  - `index.ts`: Main entry point that selects cloud provider (AWS/GCP) based on stack configuration and deploys respective infrastructure and the Helm chart.
  - `aws-infra.ts`: Defines AWS EKS cluster and related resources.
  - `gcp-infra.ts`: Defines GCP GKE cluster and related resources.
  - `automation.ts`: Script to run Pulumi commands (`up`, `preview`, `destroy`, `outputs`).
  - `Pulumi.<stack-name>.yaml`: Stack-specific configurations (e.g., `aws:region`, `iaas:cloudProvider`, `gcp:project`).
- **Usage**: Refer to `pulumi/README.md` for detailed instructions on authentication, setup, and deployment commands.

### 2. Helm Chart (`helm-chart/`)

- **Purpose**: To package and deploy the Chimoney Rafiki application and its dependencies (Nginx, Redis) onto a Kubernetes cluster.
- **Key Files**:
  - `Chart.yaml`: Metadata about the Helm chart.
  - `values.yaml`: Default configuration values for the chart.
  - `values.dev.yaml`, `values.prod.yaml`: Environment-specific overrides.
  - `secrets.dev.yaml`, `secrets.prod.yaml` (within `aws/chart-config` or `gcp/chart-config` and gitignored): For managing sensitive data.
  - `templates/`: Contains Kubernetes manifest templates for deployments, services, ingress, configmaps, and secrets.
- **Usage**:
  - Primarily deployed via the Pulumi program.
  - Can also be used independently for manual Helm deployments. Refer to `helm-chart/README.md` for detailed instructions on manual deployment, configuration, and secret management.

## Cloud Provider Specifics

### AWS

- Infrastructure is defined in `pulumi/aws-infra.ts`.
- Helm value overrides specific to AWS deployments (e.g., for dev or prod environments on AWS) can be found in `aws/chart-config/`. These are merged by the Pulumi program when deploying to AWS.
- Secrets for AWS environments should be managed in `aws/chart-config/secrets.dev.yaml` or `aws/chart-config/secrets.prod.yaml` (ensure these are in `.gitignore`).

### GCP

- Infrastructure is defined in `pulumi/gcp-infra.ts`.
- Helm value overrides specific to GCP deployments can be found in `gcp/chart-config/`. These are merged by the Pulumi program when deploying to GCP.
- Secrets for GCP environments should be managed in `gcp/chart-config/secrets.dev.yaml` or `gcp/chart-config/secrets.prod.yaml` (ensure these are in `.gitignore`).

## General Workflow

1.  **Prerequisites**:

    - Install Pulumi CLI, AWS CLI, GCP CLI (`gcloud`), Node.js, npm/yarn, kubectl, Helm.
    - Configure AWS credentials (`aws configure`) or GCP credentials (`gcloud auth application-default login` or service account).

2.  **Setup Pulumi Project**:

    - Navigate to the `pulumi/` directory.
    - Run `npm install` (or `yarn install`).
    - Run `npm run build` to compile TypeScript.
    - Log in to Pulumi: `pulumi login`.

3.  **Configure Pulumi Stack**:

    - Create or select a stack (e.g., `dev`, `prod`). The `automation.ts` script handles this.
    - Set the cloud provider and other necessary configurations in `Pulumi.<stack-name>.yaml`. For example:
      - For AWS: `pulumi config set iaas:cloudProvider aws --stack <stack-name>`
      - For GCP: `pulumi config set iaas:cloudProvider gcp --stack <stack-name>`
      - Set `gcp:project` if using GCP.
      - Set `aws:region` if using AWS.

4.  **Configure Helm Values & Secrets**:

    - Review and update `helm-chart/values.yaml` for base configurations.
    - Update environment-specific values in:
      - `helm-chart/values.dev.yaml` or `helm-chart/values.prod.yaml`.
      - Cloud-specific overrides in `aws/chart-config/values.<env>.yaml` or `gcp/chart-config/values.<env>.yaml`.
    - Create and populate secret files (e.g., `aws/chart-config/secrets.prod.yaml`) and ensure they are gitignored. The Pulumi program is designed to look for these in the respective cloud provider's `chart-config` directory.

5.  **Deploy Infrastructure and Application**:

    - From the `pulumi/` directory:
      - Preview: `npm run pulumi preview <stack-name>`
      - Deploy: `npm run pulumi up <stack-name>`

6.  **Accessing the Application**:

    - After successful deployment, the Pulumi output will include `kubeconfig` and `ingressHostname`.
    - Use the `kubeconfig` to interact with your cluster via `kubectl`.
    - Access the application via the `ingressHostname`.

7.  **Managing Deployments**:
    - To update, modify the Pulumi code or Helm chart values, rebuild (`npm run build` in `pulumi/`), and run `npm run pulumi up <stack-name>`.
    - To destroy resources: `npm run pulumi destroy <stack-name>`.

## Important Notes

- **Secret Management**: Secrets are critical. The Helm chart (`helm-chart/templates/secret.yaml`) templates Kubernetes secrets. Actual secret values should be provided via gitignored files (e.g., `aws/chart-config/secrets.prod.yaml`) or other secure methods. Refer to the "Managing Secrets" section in `helm-chart/README.md`. The Pulumi program attempts to load these secret files based on the chosen cloud provider and stack.
- **Production Deployments**:
  - Ensure `values.prod.yaml` (in `helm-chart/` and potentially cloud-specific overrides in `aws/chart-config/` or `gcp/chart-config/`) are configured with production-ready settings (replica counts, resource limits, stable image tags, correct hostnames, etc.).
  - Use robust secret management practices for production.
- **Pulumi Automation API**: The `pulumi/automation.ts` script simplifies interaction with Pulumi. See `pulumi/README.md` for its usage.

## Further Information

- For detailed instructions on using the Pulumi project (authentication, deployment, etc.), see `pulumi/README.md`.
- For detailed instructions on the Helm chart (manual deployment, configuration options, secret management), see `helm-chart/README.md`.
