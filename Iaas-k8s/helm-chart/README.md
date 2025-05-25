# Helm Chart for {{ .Values.companyName }} Rafiki Application Suite

This README provides instructions for understanding and using the Helm chart for the {{ .Values.companyName }} Rafiki application suite. This chart is primarily designed to be deployed via the Pulumi project located in the parent directory (`../pulumi/`) but can also be used manually with Helm CLI.

## Prerequisites (for Manual Helm CLI Usage)

- `kubectl` installed and configured.
- Helm 3 installed.
- Access to Docker images specified in `values.yaml`.

## Chart Structure

```
helm-chart/
├── Chart.yaml          # Dynamically uses {{ .Values.companyName }}-rafiki as name
├── README.md           # This file
├── values.yaml         # Default configuration values (must include companyName)
├── values.dev.yaml     # Development environment overrides
├── values.prod.yaml    # Production environment overrides
├── templates/          # Kubernetes manifest templates
│   └── ...
└── crds/               # Optional: Custom Resource Definitions
```

## Configuration

Key configuration files:

- `values.yaml`: Default values. **It is expected that `companyName` is defined here or overridden.**
- `values.dev.yaml`: Overrides for development.
- `values.prod.yaml`: Overrides for production.

When deployed via the Pulumi project, values and secrets are merged from multiple sources (base `values.yaml`, environment-specific `values.<env>.yaml`, and cloud-specific `chart-config` files) by the `automation.ts` script and passed as JSON strings to Pulumi, which then supplies them to this Helm chart.

### `companyName`

The `companyName` value is crucial. It is used in `Chart.yaml` to define the chart's name (`name: "{{ .Values.companyName }}-rafiki"`) and is also used by the Pulumi deployment script to name the Helm release.

**Example in `values.yaml`:**

```yaml
companyName: "mycompany"
# ... other default values
```

### Managing Secrets (for Manual Helm CLI Usage)

Secrets are managed via `templates/secret.yaml`. For manual deployment, it's recommended to use external, gitignored secret files.

**Example `secrets.prod.yaml` (gitignored):**

```yaml
kubernetesSecrets:
  rafikiAuth:
    data:
      RAFIKI_AUTH_DATABASE_URL: "base64_encoded_prod_db_url"
      # ... other base64 encoded secrets
  rafikiBackend:
    data:
      RAFIKI_BACKEND_DATABASE_URL: "base64_encoded_prod_db_url"
      # ... other base64 encoded secrets
```

Deploy manually merging this file:
`helm upgrade --install <release-name> . -f values.yaml -f values.prod.yaml -f secrets.prod.yaml -n <namespace>`

**Note on Pulumi Deployment:** When deployed via Pulumi, the `automation.ts` script reads these types of secret files from `../<cloudProvider>/chart-config/secrets.<env>.yaml`, converts them to JSON, and passes them to the Pulumi program. The Helm chart then receives these secrets as part of its values.

## Manual Deployment Steps (Using Helm CLI)

These steps are for deploying the chart directly with Helm, outside of the Pulumi automation.

1.  **Navigate to Chart Directory:**
    `cd Iaas-k8s/helm-chart`

2.  **Ensure `companyName` is set:**
    Verify `companyName` is in `values.yaml` or provide it via `--set companyName=yourcompany`.

3.  **Create Namespace (Recommended):**
    `kubectl create namespace my-rafiki-app-dev`

4.  **Lint and Dry Run (Recommended):**

    ```bash
    # Ensure companyName is available for linting, e.g., by having it in values.yaml
    helm lint . -f values.yaml -f values.dev.yaml --set companyName=yourcompany
    helm install my-release-dev . \
      --namespace my-rafiki-app-dev \
      -f values.yaml \
      -f values.dev.yaml \
      # -f secrets.dev.yaml # If using separate secrets file
      --set companyName=yourcompany \
      --dry-run --debug
    ```

5.  **Deploy:**

    ```bash
    helm upgrade --install my-release-dev . \
      --namespace my-rafiki-app-dev \
      -f values.yaml \
      -f values.dev.yaml \
      # -f secrets.dev.yaml
      --set companyName=yourcompany # Ensure companyName is set for the release name logic if Chart.yaml depends on it for the name directly
      --create-namespace
    ```

    The release name will be based on `companyName` if the Pulumi script's logic is replicated (`{{ .Values.companyName }}-rafiki`). For manual Helm, you define the release name (e.g., `my-release-dev`). The `Chart.yaml` itself uses `{{ .Values.companyName }}-rafiki` as its _chart name_.

6.  **Verify Deployment:**
    `kubectl get all -n my-rafiki-app-dev`

## Interaction with Pulumi Deployment

- The Pulumi project in `../pulumi/` is the primary intended method for deploying this chart.
- The `automation.ts` script in the Pulumi project handles:
  - Collecting `companyName` from Pulumi config.
  - Reading and merging `values.yaml`, `values.<env>.yaml` (from `helm-chart/`), and cloud-specific `values.<env>.yaml` and `secrets.<env>.yaml` (from `../<cloudProvider>/chart-config/`).
  - Passing the combined values (including `companyName` and secrets) as JSON strings to the Pulumi program (`index.ts`).
  - The Pulumi program then deploys this Helm chart using the provided values. The Helm release name is constructed as `${companyName}-rafiki`.
- The `Chart.yaml` `name` field is `{{ .Values.companyName }}-rafiki`. This means the `companyName` value _must_ be present in the values passed to Helm for the chart to be correctly identified.

## Key Template Files

- `templates/_helpers.tpl`: Common helper templates.
- `templates/secret.yaml`: Manages Kubernetes secrets.
- `templates/*-deployment.yaml`, `templates/*-service.yaml`: Define deployments and services for components like Nginx, Rafiki-Auth, Rafiki-Backend, Redis.
- `templates/ingress.yaml`: Defines Ingress resource. For GCP, Pulumi `index.ts` injects an annotation for the static IP.
- `templates/configmap.yaml`: Nginx configuration.

# Horizontal Pod Autoscaler (HPA)

## Enabling HPA for Nginx, Rafiki-Backend, and Rafiki-Auth

This chart supports deploying a HorizontalPodAutoscaler (HPA) for the Nginx, Rafiki-Backend, and Rafiki-Auth deployments. You can configure HPA for each component via their respective `hpa` sections in your values file or via Pulumi automation.

Example configuration in `values.yaml`:

```yaml
nginx:
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80

rafikiBackend:
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80

rafikiAuth:
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
```

- `enabled`: Set to `true` to enable HPA for the component.
- `minReplicas`: Minimum number of pod replicas.
- `maxReplicas`: Maximum number of pod replicas.
- `targetCPUUtilizationPercentage`: Target average CPU utilization across pods.

If deploying via Pulumi, you can override these values in your `helmValuesJson`.

> **Note:** Each component (nginx, rafikiBackend, rafikiAuth) has its own HPA configuration and template. HPAs will only be created if the corresponding `hpa.enabled` value is set to `true`.

## Customization (Manual Helm)

- Modify `values.yaml`, `values.dev.yaml`, `values.prod.yaml` for each component's HPA settings.
- For structural changes, edit the corresponding HPA templates in `templates/` (e.g., `nginx-hpa.yaml`, `rafiki-backend-hpa.yaml`, `rafiki-auth-hpa.yaml`).

Remember to always include `companyName` in your values when working with this chart, as `Chart.yaml` depends on it.
