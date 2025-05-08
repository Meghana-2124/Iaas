# Helm Chart Deployment for Chimoney Rafiki

This README provides instructions for deploying the Chimoney Rafiki application suite using the provided Helm chart.

## Prerequisites

- `kubectl` installed and configured to connect to your Kubernetes cluster.
- Helm 3 installed.
- AWS CLI configured (if deploying to EKS and managing AWS resources like ACM certificates or Load Balancers).
- Access to the Docker images specified in `values.yaml` (e.g., `ghcr.io/interledger/rafiki-auth`, `ghcr.io/interledger/rafiki-backend`).

## Project Structure

The Helm chart is structured as follows:

```
helm-chart/
├── Chart.yaml          # Information about the chart
├── README.md           # This file
├── values.yaml         # Default configuration values
├── values.dev.yaml     # Development environment specific values
├── values.prod.yaml    # Placeholder for production specific values (you should create this)
├── templates/          # Directory containing template files
│   ├── _helpers.tpl    # Helm helper templates
│   ├── configmap.yaml  # Template for Nginx ConfigMap
│   ├── deployment.yaml # Templates for various deployments (deprecated, split into individual files)
│   ├── ingress.yaml    # Template for Ingress resource
│   ├── secret.yaml     # Template for Kubernetes Secrets
│   ├── service.yaml    # Templates for various services (deprecated, split into individual files)
│   ├── nginx-deployment.yaml
│   ├── nginx-service.yaml
│   ├── rafiki-auth-deployment.yaml
│   ├── rafiki-auth-service.yaml
│   ├── rafiki-backend-deployment.yaml
│   ├── rafiki-backend-service.yaml
│   ├── redis-deployment.yaml
│   └── redis-service.yaml
└── crds/               # Optional: Custom Resource Definitions (if any)
```

## Configuration

The chart is configured using values files. The primary configuration files are:

- `values.yaml`: Contains default values for the chart.
- `values.dev.yaml`: Contains overrides for the development environment.
- `values.prod.yaml` (Recommended): You should create this file for production overrides. **Do not commit sensitive production data to this file if it's not in `.gitignore`.**

### Managing Secrets

Secrets are critical for the application and must be handled securely. The `templates/secret.yaml` file provides a template for creating Kubernetes Secret objects. However, **it is strongly recommended to manage secret data outside of version control.**

**Methods for Managing Secrets:**

1.  **External Secret Files (Gitignored):**
    Create a `secrets.dev.yaml` or `secrets.prod.yaml` (and add them to `.gitignore`) with the actual secret values.
    Example `secrets.prod.yaml`:

    ```yaml
    kubernetesSecrets:
      rafikiAuth:
        data:
          RAFIKI_AUTH_DATABASE_URL: "base64_encoded_prod_db_url"
          RAFIKI_AUTH_IDENTITY_SERVER_SECRET: "base64_encoded_prod_identity_secret"
          # Add other rafiki-auth secrets here
      rafikiBackend:
        data:
          RAFIKI_BACKEND_DATABASE_URL: "base64_encoded_prod_db_url"
          RAFIKI_BACKEND_STREAM_SECRET: "base64_encoded_prod_stream_secret"
          # Add other rafiki-backend secrets here
    ```

    Then, when deploying, merge this file:
    `helm upgrade --install <release-name> . -f values.yaml -f values.prod.yaml -f secrets.prod.yaml -n <namespace>`

2.  **Using `--set` or `--set-file` (for CI/CD or manual):**
    You can provide secrets directly during Helm installation or upgrade.

    ```bash
    helm upgrade --install <release-name> . \
      --namespace <namespace> \
      -f values.yaml \
      -f values.prod.yaml \
      --set-string kubernetesSecrets.rafikiAuth.data.RAFIKI_AUTH_DATABASE_URL="your_actual_db_url" \
      --set-string kubernetesSecrets.rafikiAuth.data.RAFIKI_AUTH_IDENTITY_SERVER_SECRET="your_actual_identity_secret" \
      # ... and so on for all secrets
    ```

    Note: Values set with `--set-string` are not base64 encoded by you; Helm handles them appropriately for secrets if the template expects plain strings that it then base64 encodes, or you can provide base64 encoded strings if the template expects that. The current `secret.yaml` template expects data to be already base64 encoded if you populate the `data` field directly. If you use `stringData`, Helm will base64 encode it for you. The provided `secret.yaml` uses `data`, so ensure values are base64 encoded.

    To base64 encode a value: `echo -n "your-secret-value" | base64`

3.  **External Secret Management (Recommended for Production):**
    Use tools like AWS Secrets Manager, HashiCorp Vault, or Sealed Secrets. These tools integrate with Kubernetes to securely inject secrets into your pods. This often involves modifying the deployment templates to fetch secrets from these external systems (e.g., using a sidecar container or an init container, or a CSI driver). The current chart templates would need to be adapted for this approach.

**Populating `secret.yaml`:**
The `templates/secret.yaml` creates Secret objects named according to `{{ .Values.kubernetesSecrets.rafikiAuth.name }}` and `{{ .Values.kubernetesSecrets.rafikiBackend.name }}`.
If `kubernetesSecrets.*.data` is not provided in any values file, the template creates secrets with a placeholder. You would then need to populate these secrets manually in the cluster or ensure your CI/CD process does.

Example for `rafikiAuth` secrets in `values.yaml` or an environment-specific values file:

```yaml
kubernetesSecrets:
  rafikiAuth:
    create: true
    name: "rafiki-auth-secrets" # Or use {{ .Release.Name }}-rafiki-auth-secrets for uniqueness
    # Data should be base64 encoded
    data:
      RAFIKI_AUTH_DATABASE_URL: "cG9zdGdyZXM6Ly91c2VyOnBhc3N3b3JkQGhvc3Q6NTQzMi9kYm5hbWU=" # postgres://user:password@host:5432/dbname
      RAFIKI_AUTH_IDENTITY_SERVER_SECRET: "c2VjdXJlc2VjcmV0Zm9yYXV0aA==" # securesecretforauth
      # ... other necessary secrets for rafiki-auth
  rafikiBackend:
    create: true
    name: "rafiki-backend-secrets" # Or use {{ .Release.Name }}-rafiki-backend-secrets
    data:
      RAFIKI_BACKEND_DATABASE_URL: "cG9zdGdyZXM6Ly91c2VyOnBhc3N3b3JkQGhvc3Q6NTQzMi9kYm5hbWU="
      RAFIKI_BACKEND_STREAM_SECRET: "c2VjdXJlc2VjcmV0Zm9yYmFja2VuZA==" # securesecretforbackend
      # ... other necessary secrets for rafiki-backend
```

## Deployment Steps

1.  **Navigate to the Helm Chart Directory:**

    ```bash
    cd k8s/helm-chart
    ```

2.  **Create a Namespace (Recommended):**
    It's good practice to deploy applications into their own namespaces.

    ```bash
    kubectl create namespace chimoney-rafiki-dev # For development
    kubectl create namespace chimoney-rafiki-prod # For production
    ```

3.  **Update Helm Dependencies (If any are added in `Chart.yaml`):**
    This chart currently does not list external dependencies, but if it did, you would run:

    ```bash
    helm dependency update
    ```

4.  **Lint the Chart (Optional but Recommended):**
    Check the chart for possible issues.

    ```bash
    helm lint . -f values.yaml -f values.dev.yaml # For dev
    # helm lint . -f values.yaml -f values.prod.yaml # For prod (once values.prod.yaml is created)
    ```

5.  **Dry Run (Optional but Recommended):**
    Simulate an installation to see what resources would be created.
    For Development:

    ```bash
    helm install <release-name>-dev . \
      --namespace chimoney-rafiki-dev \
      -f values.yaml \
      -f values.dev.yaml \
      # -f secrets.dev.yaml # If using a separate secrets file
      --dry-run --debug
    ```

    Replace `<release-name>-dev` with a name for your development release (e.g., `rafiki-dev`).

6.  **Deploying to Development Environment:**

    ```bash
    helm upgrade --install rafiki-dev . \
      --namespace chimoney-rafiki-dev \
      -f values.yaml \
      -f values.dev.yaml
      # -f secrets.dev.yaml # If using a separate gitignored secrets file
      # --set key1=value1 ... # For ad-hoc overrides
    ```

    - `upgrade --install`: This command will install the chart if it's not already installed, or upgrade it if it is.
    - `rafiki-dev`: This is the release name for the development environment.
    - `.` : Specifies that the chart is in the current directory.
    - `--namespace chimoney-rafiki-dev`: Deploys into the specified namespace.
    - `-f values.yaml -f values.dev.yaml`: Applies the default values and then overrides them with development-specific values.

7.  **Deploying to Production Environment:**

    **Important:**

    - Create a `values.prod.yaml` file. This file should contain overrides suitable for a production environment (e.g., higher replica counts, production database URLs, resource requests/limits, production hostnames).
    - Securely manage your production secrets as discussed in the "Managing Secrets" section. Create a `secrets.prod.yaml` (added to `.gitignore`) or use `--set` flags with values from a secure source, or integrate with an external secrets manager.

    Example `values.prod.yaml` (you need to create this):

    ```yaml
    global:
      environment: prod

    replicaCount: 3 # Example: higher replica count for prod

    rafikiAuth:
      replicaCount: 2
      image:
        tag: v1.0.0-alpha.20 # Use a stable production tag
      # Add production specific configurations

    rafikiBackend:
      replicaCount: 2
      image:
        tag: v1.0.0-alpha.20 # Use a stable production tag
      # Add production specific configurations

    nginx:
      replicaCount: 2
      config:
        serverNameIlp: "ilp.chimoney.com"
        serverNameAuth: "auth-ilp.chimoney.io"
      # Ensure resource requests and limits are set for production

    ingress:
      hosts:
        ilp:
          host: ilp.chimoney.com
        auth:
          host: auth-ilp.chimoney.io
      annotations:
        # Ensure you have production-ready annotations, e.g., for ACM certificate
        # alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:your-region:your-account-id:certificate/your-prod-certificate-id
        # Consider enabling HTTPS redirect
        # alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
        # alb.ingress.kubernetes.io/actions.ssl-redirect: '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}'
    # Ensure kubernetesSecrets are NOT defined here with plain text values.
    # Use a separate, gitignored secrets.prod.yaml or --set flags.
    ```

    Deployment command for Production:

    ```bash
    helm upgrade --install rafiki-prod . \
      --namespace chimoney-rafiki-prod \
      -f values.yaml \
      -f values.prod.yaml \
      # -f secrets.prod.yaml # CRITICAL: Use your gitignored production secrets file
      # --set kubernetesSecrets.rafikiAuth.data.RAFIKI_AUTH_DATABASE_URL="base64_value_from_secret_store" \
      # ... other --set flags for secrets from a secure source
      --create-namespace # If the namespace doesn't exist
    ```

    - `rafiki-prod`: This is the release name for the production environment.
    - `--namespace chimoney-rafiki-prod`: Deploys into the production namespace.
    - `-f values.prod.yaml`: Applies production-specific overrides.
    - `-f secrets.prod.yaml` (Recommended): Applies your securely managed production secrets.

8.  **Verify Deployment:**
    Check the status of your deployed resources:
    ```bash
    kubectl get pods -n <namespace>
    kubectl get services -n <namespace>
    kubectl get deployments -n <namespace>
    kubectl get ingress -n <namespace>
    kubectl get secrets -n <namespace> # Verify secrets are created (but not their content directly unless necessary)
    kubectl get configmaps -n <namespace>
    ```
    Check logs of a specific pod:
    ```bash
    kubectl logs -f <pod-name> -n <namespace>
    ```
    Once the Ingress is provisioned (especially if using AWS ALB), it might take a few minutes for the Load Balancer to be ready. You can get the Load Balancer URL/IP from:
    ```bash
    kubectl get ingress <ingress-name> -n <namespace> -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
    # or .ip depending on the ingress controller
    ```
    Configure your DNS records to point to this Load Balancer address.

## Upgrading a Release

If you make changes to the chart or your values files, you can upgrade an existing release:

```bash
# For Dev
helm upgrade rafiki-dev . \
  --namespace chimoney-rafiki-dev \
  -f values.yaml \
  -f values.dev.yaml \
  # -f secrets.dev.yaml

# For Prod
helm upgrade rafiki-prod . \
  --namespace chimoney-rafiki-prod \
  -f values.yaml \
  -f values.prod.yaml \
  # -f secrets.prod.yaml
```

## Rolling Back a Release

If an upgrade fails or introduces issues, you can roll back to a previous revision:

```bash
helm history <release-name> -n <namespace>
helm rollback <release-name> <revision-number> -n <namespace>
```

## Uninstalling a Release (Cleanup)

To remove all resources deployed by a Helm release:

```bash
# For Dev
helm uninstall rafiki-dev --namespace chimoney-rafiki-dev

# For Prod
helm uninstall rafiki-prod --namespace chimoney-rafiki-prod
```

This will delete all Kubernetes resources associated with the release. If you created the namespace manually, you might also want to delete it:

```bash
kubectl delete namespace chimoney-rafiki-dev
kubectl delete namespace chimoney-rafiki-prod
```

## Customizing the Chart

- **Values Files**: The primary way to customize is through `values.yaml` and environment-specific overrides (`values.dev.yaml`, `values.prod.yaml`).
- **Templates**: If you need to change the structure of Kubernetes resources, you can modify the files in the `templates/` directory.
- **Helpers**: The `templates/_helpers.tpl` file contains helper templates that can be used to generate common YAML snippets.
