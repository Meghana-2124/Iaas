# Tier-Based Resource Allocation System Documentation

## Overview

The Tier-Based Resource Allocation System provides explicit resource allocation and replica management for shared Kubernetes deployments based on subscription tiers. This system replaces horizontal pod autoscaling with predictable, tier-based resource allocation while integrating with Kubecost for cost tracking and management.

## Architecture

### Core Components

1. **Tier Calculator** (`src/utils/tier-calculator.ts`)

   - Calculates resource allocations based on plan tiers
   - Validates tier configurations
   - Generates Helm values for deployments

2. **Migration Manager** (`src/utils/tier-migration.ts`)

   - Plans and executes tier upgrades/downgrades
   - Handles migration validation and rollback scenarios
   - Provides migration status tracking

3. **Kubecost Integration** (`src/utils/kubecost-client.ts`)

   - Tracks resource costs and usage
   - Provides cost allocation by tier and company
   - Manages cost alerts and budgets

4. **CLI Management** (`src/cli/tier-commands.ts`)
   - Command-line interface for tier operations
   - Migration planning and execution
   - Cost monitoring and validation

### Plan Tiers

| Tier       | Monthly Price | CPU   | Memory | Storage | Replicas | Max PVCs |
| ---------- | ------------- | ----- | ------ | ------- | -------- | -------- |
| Basic      | $99           | 1 CPU | 2Gi    | 20Gi    | 1        | 3        |
| Standard   | $299          | 2 CPU | 4Gi    | 50Gi    | 2        | 5        |
| Premium    | $599          | 4 CPU | 8Gi    | 100Gi   | 3        | 10       |
| Enterprise | $1299         | 8 CPU | 16Gi   | 200Gi   | 5        | 20       |

## Usage

### CLI Commands

#### List Available Tiers

```bash
iaas-deploy tiers list --company-name mycompany --stack-name mystack
```

#### Calculate Resources for a Tier

```bash
iaas-deploy tiers calculate basic --company-name mycompany --stack-name mystack
```

#### Plan a Tier Migration

```bash
iaas-deploy tiers migrate basic standard --plan-only --company-name mycompany --stack-name mystack
```

#### Execute a Tier Migration

```bash
iaas-deploy tiers migrate basic standard --company-name mycompany --stack-name mystack
```

#### View Cost Information

```bash
iaas-deploy tiers costs basic --company-name mycompany --stack-name mystack --kubecost-url http://kubecost.local
```

#### Validate Tier Configuration

```bash
iaas-deploy tiers validate premium --company-name mycompany --stack-name mystack
```

### Programmatic Usage

#### Calculate Tier Resources

```typescript
import { TierCalculator } from "./src/utils/tier-calculator.js";
import { PlanTier } from "./src/types/plans.js";

const calculator = new TierCalculator();
const resources = calculator.calculateResources(PlanTier.STANDARD);

console.log(resources);
// Output: { cpu: '2', memory: '4Gi', storage: '50Gi', replicas: 2, maxPvcs: 5 }
```

#### Plan a Migration

```typescript
import { TierMigrationManager } from "./src/utils/tier-migration.js";
import { PlanTier } from "./src/types/plans.js";

const migrationManager = new TierMigrationManager();
const plan = await migrationManager.planMigration(
  "mycompany",
  PlanTier.BASIC,
  PlanTier.STANDARD,
  "mycompany-ns"
);

console.log(plan.steps);
// Output: Migration steps array
```

#### Track Costs with Kubecost

```typescript
import { KubecostClient } from "./src/utils/kubecost-client.js";
import { PlanTier } from "./src/types/plans.js";

const kubecost = new KubecostClient({
  baseUrl: "http://kubecost.local",
  cluster: "shared-cluster",
});

const summary = await kubecost.getTierCostSummary(
  PlanTier.STANDARD,
  "mycompany"
);
console.log(`Total cost: $${summary.totalCost}`);
```

## Deployment Configuration

### Helm Values Structure

```yaml
# Enable tier-based allocation
planTier: "standard"
companyName: "mycompany"
deploymentType: "shared"

# Tier-specific resources (automatically calculated)
tierResources:
  cpu: "2"
  memory: "4Gi"
  storage: "50Gi"
  replicas: 2
  maxPvcs: 5

# Kubecost integration
kubecost:
  enabled: true
  version: "prod-1.108.1"
  clusterId: "shared-cluster"
  prometheusUrl: "http://prometheus-server.prometheus.svc.cluster.local"

  # Service configuration
  service:
    type: "ClusterIP"

  # Ingress configuration
  ingress:
    enabled: true
    host: "kubecost.example.com"
    tls:
      enabled: true
      secretName: "kubecost-tls"

  # RBAC
  rbac:
    enabled: true

  # Prometheus integration
  prometheus:
    enabled: true

  # Pricing configuration
  pricing:
    basic:
      cpu: "0.031611"
      memory: "0.004446"
      storage: "0.04"
    standard:
      cpu: "0.031611"
      memory: "0.004446"
      storage: "0.04"

  # Alerts configuration
  alerts:
    enabled: true
    budgetThreshold: 100
    anomalyThreshold: 150
    webhookUrl: "https://hooks.slack.com/services/..."
    email:
      enabled: true
      to: ["admin@example.com"]
      from: "kubecost@example.com"

  # Billing integration
  billing:
    enabled: true
    provider: "aws"
    accountId: "123456789012"

# Monitoring dashboards
monitoring:
  dashboards:
    enabled: true

# Resource quotas and limits
resourceQuota:
  enabled: true

limitRange:
  enabled: true
```

### Deployment Labels and Annotations

All tier-based deployments include the following labels and annotations:

#### Labels

- `iaas.deployment/tier`: The plan tier (basic, standard, premium, enterprise)
- `iaas.deployment/company`: Company name
- `iaas.deployment/type`: Deployment type (shared or dedicated)
- `kubecost.tier`: Tier for Kubecost allocation
- `kubecost.company`: Company for Kubecost allocation
- `kubecost.service`: Service name for Kubecost allocation

#### Annotations

- `kubecost.io/tier`: Tier for Kubecost cost allocation
- `kubecost.io/company`: Company for Kubecost cost allocation

## Migration Process

### Upgrade Process

1. **Validation**: Check current resource usage and cluster capacity
2. **Planning**: Generate migration plan with steps and estimated duration
3. **Pre-checks**: Verify prerequisites and dependencies
4. **Execution**:
   - Update resource quotas and limits
   - Scale up replicas (if needed)
   - Update resource allocations
   - Update monitoring and alerts
5. **Validation**: Verify successful migration

### Downgrade Process

1. **Validation**: Ensure current usage fits within target tier limits
2. **Planning**: Generate migration plan with potential data considerations
3. **Pre-checks**: Verify no data loss will occur
4. **Execution**:
   - Scale down replicas (if needed)
   - Update resource allocations
   - Update resource quotas and limits
   - Update monitoring and alerts
5. **Validation**: Verify successful migration

### Rollback Scenarios

- Migration failures trigger automatic rollback
- Manual rollback available through CLI
- Previous tier configuration preserved during migration
- Rollback steps included in migration plan

## Monitoring and Alerting

### Grafana Dashboards

#### Tier Resource Allocation Dashboard

- Current tier status and budget
- CPU and memory usage by service
- Replica count status
- Storage usage
- Cost breakdown by service

#### Tier Alerts & Budget Management Dashboard

- Budget status and trends
- Resource utilization alerts
- Cost trend analysis
- Alert history

### Kubecost Integration

#### Cost Allocation

- Real-time cost tracking by tier and company
- Historical cost analysis
- Budget alerts and notifications
- Cost optimization recommendations

#### Alerts

- Budget threshold alerts
- Usage anomaly detection
- Cost spike notifications
- Resource efficiency alerts

## Best Practices

### Tier Selection

1. **Start Small**: Begin with Basic tier and upgrade as needed
2. **Monitor Usage**: Use Kubecost data to inform tier decisions
3. **Plan Growth**: Consider usage trends when selecting tiers
4. **Cost Optimization**: Regular review of tier allocation vs. actual usage

### Migration Planning

1. **Test Migrations**: Use staging environments for migration testing
2. **Schedule During Low Usage**: Plan migrations during maintenance windows
3. **Monitor Post-Migration**: Watch resource usage after tier changes
4. **Document Changes**: Keep records of tier changes and reasons

### Cost Management

1. **Set Budgets**: Configure appropriate budget alerts for each tier
2. **Regular Reviews**: Monthly cost analysis and tier optimization
3. **Usage Monitoring**: Track resource utilization against tier allocations
4. **Alert Configuration**: Set up proactive alerts for cost and usage anomalies

## Troubleshooting

### Common Issues

#### Migration Failures

```bash
# Check migration status
iaas-deploy tiers validate <current-tier> --company-name mycompany --stack-name mystack

# View detailed logs
kubectl logs -n <namespace> deployment/<deployment-name>

# Rollback if needed
iaas-deploy tiers migrate <target-tier> <current-tier> --company-name mycompany --stack-name mystack
```

#### Resource Allocation Issues

```bash
# Check resource quotas
kubectl describe resourcequota -n <namespace>

# Check limit ranges
kubectl describe limitrange -n <namespace>

# Check pod resource usage
kubectl top pods -n <namespace>
```

#### Kubecost Integration Issues

```bash
# Check Kubecost service
kubectl get svc -n kubecost

# Check Kubecost logs
kubectl logs -n kubecost deployment/kubecost-cost-analyzer

# Verify Prometheus connection
kubectl get svc -n prometheus prometheus-server
```

### Error Codes

| Code          | Description                 | Resolution                                           |
| ------------- | --------------------------- | ---------------------------------------------------- |
| TIER_CALC_001 | Invalid tier specified      | Use valid tier: basic, standard, premium, enterprise |
| TIER_CALC_002 | Resource calculation failed | Check tier configuration and cluster capacity        |
| TIER_MIG_001  | Migration validation failed | Review migration prerequisites                       |
| TIER_MIG_002  | Migration execution failed  | Check cluster resources and try rollback             |
| KUBECOST_001  | Kubecost connection failed  | Verify Kubecost URL and connectivity                 |
| KUBECOST_002  | Cost data unavailable       | Check Kubecost configuration and Prometheus          |

## API Reference

### TierCalculator Methods

#### `calculateResources(tier: PlanTier): TierResourceAllocation`

Calculates resource allocation for a given tier.

#### `validateTierResources(tier: PlanTier, resources: TierResourceAllocation): ValidationResult`

Validates tier resource configuration.

#### `generateHelmValues(tier: PlanTier): any`

Generates Helm values for tier deployment.

#### `calculateMonthlyCost(tier: PlanTier): number`

Calculates monthly cost for a tier.

### TierMigrationManager Methods

#### `planMigration(company: string, fromTier: PlanTier, toTier: PlanTier, namespace?: string): Promise<MigrationPlan>`

Plans a tier migration.

#### `executeMigration(company: string, fromTier: PlanTier, toTier: PlanTier, namespace?: string): Promise<MigrationResult>`

Executes a tier migration.

#### `canUpgradeTier(tier: PlanTier): boolean`

Checks if tier can be upgraded.

#### `canDowngradeTier(tier: PlanTier): boolean`

Checks if tier can be downgraded.

### KubecostClient Methods

#### `getAllocationData(params: AllocationQueryParams): Promise<AllocationResponse>`

Fetches cost allocation data.

#### `getTierCostSummary(tier: PlanTier, company: string): Promise<TierCostSummary>`

Gets cost summary for a specific tier.

#### `createCostAlert(alert: CostAlert): Promise<AlertResponse>`

Creates a cost alert.

#### `getDashboardUrl(): string`

Gets Kubecost dashboard URL.

## Security Considerations

### RBAC Configuration

- Kubecost service account has minimal required permissions
- Tier management operations require appropriate cluster permissions
- Cost data access controlled through Kubecost RBAC

### Data Privacy

- Company-specific data isolated through labels and namespaces
- Cost data aggregated but not exposed across companies
- Sensitive billing information secured through Kubernetes secrets

### Network Security

- Kubecost communication secured through TLS
- Internal service communication within cluster
- External API access through authenticated endpoints

## Performance Considerations

### Resource Allocation

- Tier resources designed for efficient cluster utilization
- Replica counts optimized for load distribution
- Storage allocations based on typical usage patterns

### Cost Optimization

- Regular monitoring prevents resource waste
- Tier recommendations based on actual usage
- Automated alerts for cost anomalies

### Scalability

- System supports multiple companies and tiers
- Horizontal scaling through replica management
- Efficient resource utilization across shared clusters

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Build: `npm run build`

### Testing

- Unit tests for all core components
- Integration tests for migration workflows
- Performance tests for resource calculations
- End-to-end tests for CLI operations

### Code Standards

- TypeScript strict mode enabled
- ESLint configuration enforced
- Comprehensive error handling
- Documentation for all public APIs
