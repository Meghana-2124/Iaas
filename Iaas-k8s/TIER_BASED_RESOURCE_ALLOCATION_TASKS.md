# Tier-Based Resource Allocation System Implementation Tasks

## Overview

Implement a tier-based resource allocation system for shared plans where users receive explicit resource allocation and replicas based on their subscription tier instead of horizontal pod autoscaling. Integrate Kubecost for pricing and usage data tracking.

## Phase 1: Core Infrastructure & Planning

### Task 1.1: Define Plan Tiers and Resource Specifications

- [ ] **Create plan tier definitions** (`src/types/plans.ts`)
  - Basic Plan: 1 CPU, 2GB RAM, 1 replica per service
  - Standard Plan: 2 CPU, 4GB RAM, 2 replicas per service
  - Premium Plan: 4 CPU, 8GB RAM, 3 replicas per service
  - Enterprise Plan: 8 CPU, 16GB RAM, 5 replicas per service
- [ ] **Define resource quotas per tier**
  - Storage limits per tier
  - Network bandwidth considerations
  - Persistent volume claims limits
- [ ] **Create validation logic for tier specifications**

### Task 1.2: Extend Type Definitions

- [ ] **Update `src/types/index.ts`** with tier-based interfaces:
  - `PlanTier` enum
  - `TierResourceAllocation` interface
  - `TierConfiguration` interface
  - `KubecostConfig` interface
- [ ] **Update DeploymentOptions** to include:
  - `planTier: PlanTier`
  - `kubecostEnabled: boolean`
  - `billingAccountId?: string`

### Task 1.3: Database/Configuration Schema

- [ ] **Design tier configuration storage**
  - JSON schema for tier definitions
  - Configuration validation
  - Tier upgrade/downgrade paths
- [ ] **Create migration utilities** for existing deployments

## Phase 2: Resource Allocation Engine

### Task 2.1: Tier-Based Resource Calculator

- [ ] **Create `src/utils/tier-calculator.ts`**
  - Function to calculate resources based on tier
  - Resource validation against cluster capacity
  - Cost estimation per tier
- [ ] **Implement resource allocation logic**
  - CPU/Memory allocation per service per tier
  - Replica count determination
  - Storage allocation

### Task 2.2: Update Helm Chart Templates

- [ ] **Modify deployment templates** to use tier-based resources:
  - `helm-chart/templates/rafiki-auth-deployment.yaml`
  - `helm-chart/templates/rafiki-backend-deployment.yaml`
  - `helm-chart/templates/nginx-deployment.yaml`
  - `helm-chart/templates/redis-deployment.yaml`
- [ ] **Disable HPA for shared deployments**
  - Conditional HPA enablement based on deployment type
  - Static replica counts for shared plans
- [ ] **Add resource quota templates**
  - `helm-chart/templates/resource-quota.yaml`
  - `helm-chart/templates/limit-range.yaml`

### Task 2.3: Resource Quota Management

- [ ] **Create namespace resource quotas** based on tier
  - CPU/Memory requests and limits
  - Storage quotas
  - Pod count limits
- [ ] **Implement tier enforcement** in deployment logic
- [ ] **Add tier validation** during deployment

## Phase 3: Kubecost Integration

### Task 3.1: Kubecost Installation and Configuration

- [ ] **Add Kubecost to shared cluster setup**
  - Kubecost Helm chart integration
  - Prometheus and Grafana configuration
  - Cost allocation policies
- [ ] **Configure Kubecost for multi-tenancy**
  - Namespace-based cost allocation
  - Label-based cost tracking
  - Custom allocation rules

### Task 3.2: Cost Tracking Implementation

- [ ] **Create `src/utils/kubecost-client.ts`**
  - Kubecost API client
  - Cost data retrieval functions
  - Usage metrics collection
- [ ] **Implement cost monitoring** per namespace/tier
  - Real-time cost tracking
  - Usage alerts and notifications
  - Cost attribution by tier

### Task 3.3: Billing Integration

- [ ] **Create billing data export**
  - Cost reports per company/tier
  - Usage summaries
  - Overage detection and reporting
- [ ] **Add cost visualization** to deployment outputs
- [ ] **Implement budget alerts** per tier

## Phase 4: Shared Cluster Enhancements

### Task 4.1: Enhanced Cluster Resource Management

- [ ] **Update `src/core/gcp-infra.ts`** for tier-aware cluster sizing
  - Node pool configuration based on aggregate tier usage
  - Auto-scaling policies for shared clusters
  - Resource reservation per tier
- [ ] **Update `src/core/aws-infra.ts`** similarly
- [ ] **Implement cluster capacity planning**
  - Tier density calculations
  - Node utilization optimization

### Task 4.2: Upgrade/Downgrade Capabilities

- [ ] **Create tier migration utilities**
  - Resource reallocation during tier changes
  - Zero-downtime tier upgrades
  - Validation of tier changes
- [ ] **Implement tier change workflows**
  - Pre-migration validation
  - Resource adjustment
  - Post-migration verification

### Task 4.3: Multi-tenancy Security

- [ ] **Enhanced network policies** per tier
  - Tier-based traffic isolation
  - Ingress/egress rules per tier
- [ ] **RBAC enhancements** for tier management
- [ ] **Pod security standards** per tier

## Phase 5: Monitoring and Observability

### Task 5.1: Tier-Specific Monitoring

- [ ] **Create monitoring dashboards** per tier
  - Resource utilization per tier
  - Cost tracking dashboards
  - Performance metrics per tier
- [ ] **Implement alerting** for tier violations
  - Resource quota breaches
  - Cost overruns
  - Performance degradation

### Task 5.2: Usage Analytics

- [ ] **Create usage analytics engine**
  - Tier utilization patterns
  - Cost efficiency metrics
  - Capacity planning insights
- [ ] **Generate tier usage reports**
  - Daily/weekly/monthly summaries
  - Cost breakdown by service
  - Optimization recommendations

## Phase 6: API and CLI Enhancements

### Task 6.1: CLI Updates

- [ ] **Update `src/cli/index.ts`** with tier commands:
  - `tier list` - Show available tiers
  - `tier show <company>` - Show current tier
  - `tier upgrade <company> <tier>` - Upgrade tier
  - `tier cost <company>` - Show cost breakdown
- [ ] **Add tier validation** to deployment commands

### Task 6.2: API Endpoints for Tier Management

- [ ] **Create tier management API**
  - GET `/api/tiers` - List available tiers
  - GET `/api/company/:id/tier` - Get current tier
  - PUT `/api/company/:id/tier` - Update tier
  - GET `/api/company/:id/usage` - Get usage statistics
- [ ] **Implement tier change workflows** via API

## Phase 7: Documentation and Testing

### Task 7.1: Documentation Updates

- [ ] **Update README files** with tier information
- [ ] **Create tier migration guides**
- [ ] **Document Kubecost integration**
- [ ] **Create cost optimization guides**

### Task 7.2: Testing Framework

- [ ] **Create tier-based test scenarios**
- [ ] **Add Kubecost integration tests**
- [ ] **Implement tier migration tests**
- [ ] **Add cost calculation tests**

### Task 7.3: Example Configurations

- [ ] **Create example tier configurations**
- [ ] **Add tier upgrade/downgrade examples**
- [ ] **Document cost monitoring setup**

## Implementation Priority

### High Priority (Phase 1-2)

1. Plan tier definitions and type system
2. Resource allocation engine
3. Helm chart modifications for static resources
4. Basic tier enforcement

### Medium Priority (Phase 3-4)

1. Kubecost integration
2. Cost tracking and monitoring
3. Cluster resource management
4. Tier migration capabilities

### Lower Priority (Phase 5-7)

1. Advanced monitoring and analytics
2. API and CLI enhancements
3. Comprehensive documentation
4. Advanced testing scenarios

## Success Metrics

- [ ] **Resource Allocation**: Shared plan users get static resources based on tier
- [ ] **Cost Tracking**: Accurate cost attribution per tier/namespace
- [ ] **Cluster Efficiency**: Improved resource utilization in shared clusters
- [ ] **Tier Management**: Seamless tier upgrades/downgrades
- [ ] **Monitoring**: Comprehensive cost and usage visibility

## File Structure to Create/Modify

```
Iaas-k8s/
├── pulumi/src/
│   ├── types/
│   │   ├── plans.ts (NEW)
│   │   └── index.ts (MODIFY)
│   ├── utils/
│   │   ├── tier-calculator.ts (NEW)
│   │   ├── kubecost-client.ts (NEW)
│   │   └── tier-migration.ts (NEW)
│   ├── core/
│   │   ├── gcp-infra.ts (MODIFY)
│   │   ├── aws-infra.ts (MODIFY)
│   │   └── tier-manager.ts (NEW)
│   └── cli/
│       └── tier-commands.ts (NEW)
├── helm-chart/
│   ├── templates/
│   │   ├── resource-quota.yaml (NEW)
│   │   ├── limit-range.yaml (NEW)
│   │   ├── kubecost-namespace-labels.yaml (NEW)
│   │   └── *-deployment.yaml (MODIFY ALL)
│   └── values/
│       └── tier-configurations/ (NEW DIRECTORY)
└── docs/
    ├── TIER_SYSTEM.md (NEW)
    ├── KUBECOST_INTEGRATION.md (NEW)
    └── COST_OPTIMIZATION.md (NEW)
```

## Next Steps

1. **Start with Phase 1, Task 1.1** - Define the plan tiers and resource specifications
2. **Review and approve tier definitions** with stakeholders
3. **Begin implementation** following the task order
4. **Set up regular review meetings** to track progress
5. **Plan for gradual rollout** to existing customers

This implementation will provide a robust tier-based resource allocation system that improves cost predictability and resource management for shared deployments.
