# Quick Deployment Type Comparison

## When to Use Each Deployment Type

| Factor         | Dedicated                          | Shared                                |
| -------------- | ---------------------------------- | ------------------------------------- |
| **Cost**       | Higher - full cluster per company  | Lower - shared infrastructure costs   |
| **Isolation**  | Complete - own cluster & resources | Namespace-level within shared cluster |
| **Setup Time** | Longer - provisions new cluster    | Faster - reuses existing cluster      |
| **Compliance** | Best for strict requirements       | Good for standard workloads           |
| **Scaling**    | Independent cluster scaling        | Shared cluster auto-scaling           |
| **Management** | Separate cluster per company       | Centralized cluster management        |
| **Use Cases**  | Production, compliance-critical    | Development, staging, cost-conscious  |

## Configuration Examples

### Dedicated Deployment

```bash
pulumi config set cloudProvider aws
pulumi config set companyName acme-corp
pulumi config set deploymentType dedicated
pulumi config set helmValuesJson '{"nginx":{"hpa":{"enabled":true}}}'
```

### Shared Deployment

```bash
pulumi config set cloudProvider gcp
pulumi config set companyName acme-corp
pulumi config set deploymentType shared
pulumi config set namespace acme-corp-prod
pulumi config set helmValuesJson '{"nginx":{"hpa":{"enabled":true}}}'
```

## Cost Savings with Shared Deployments

Typical savings when switching from dedicated to shared:

- **Control Plane**: 60-80% reduction
- **Load Balancers**: Up to 90% reduction
- **Static IPs**: 85-95% reduction
- **Overall Infrastructure**: 40-70% cost reduction

## Resource Naming

### Dedicated Mode

- Cluster: `{companyName}-rafiki`
- Namespace: `default`
- Helm Release: `{companyName}-rafiki`

### Shared Mode

- Cluster: `shared-{cloudProvider}-cluster`
- Namespace: `{namespace}` (user-defined)
- Helm Release: `{namespace}-rafiki`

## Migration Path

1. **From Dedicated to Shared**:

   - Create new shared stack
   - Update configuration
   - Deploy to shared cluster
   - Migrate applications
   - Cleanup dedicated resources

2. **From Shared to Dedicated**:
   - Create new dedicated stack
   - Remove namespace configuration
   - Deploy dedicated cluster
   - Migrate applications
   - Cleanup shared namespace
