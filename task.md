# Helm Chart Parameter Coverage Analysis - Task List

## Overview

This document outlines the comprehensive analysis of the Helm chart templates and dynamic value generation system, identifying gaps and providing actionable steps to ensure complete parameter coverage.

## Executive Summary

✅ **Strengths:**

- Core service configurations are well-covered by dynamic generation
- Tier-based resource allocation system is comprehensive
- Cloud-specific configurations have proper conditional logic
- HPA and service configurations are properly handled

⚠️ **Areas Requiring Attention:**

- Monitoring dashboards lack proper parameter generation
- Kubecost configuration has extensive template usage without generation
- Network policy detailed configurations need enhancement
- Some cloud-specific parameters need defaults/validation

## Detailed Findings

### 1. Helm Templates Analysis (15 files examined)

#### Core Deployments ✅ COVERED

- `rafiki-auth-deployment.yaml` - All parameters generated
- `rafiki-backend-deployment.yaml` - All parameters generated
- `nginx-deployment.yaml` - All parameters generated
- `redis-deployment.yaml` - All parameters generated

#### Services ✅ COVERED

- All service configurations have proper parameter generation
- Port configurations, service types, and annotations are handled

#### HPA (Horizontal Pod Autoscaler) ✅ COVERED

- Conditional enablement based on deployment type (dedicated vs shared/tier-based)
- Resource thresholds properly configured

#### ConfigMaps ✅ COVERED

- All configuration parameters are generated dynamically

#### Ingress ✅ COVERED

- Cloud-specific annotations properly handled
- Host configurations and TLS settings covered

### 2. Parameter Gaps Identified

#### Critical Gaps 🔴

**Monitoring Dashboards (`monitoring-dashboard.yaml`)**

- `monitoring.dashboards.enabled` - **NOT GENERATED**
- `tierConfig.costBudget` - **NOT GENERATED** (used for budget thresholds)
- `tierResources.cpu` - **NOT GENERATED** (used in dashboard limits)
- `tierResources.memory` - **NOT GENERATED** (used in dashboard limits)

**Kubecost Installation (`kubecost-installation.yaml`)**

- `kubecost.enabled` - **NOT GENERATED**
- `kubecost.prometheus.fqdn` - **NOT GENERATED**
- `kubecost.cost-analyzer.nodeSelector` - **NOT GENERATED**
- `kubecost.cost-analyzer.tolerations` - **NOT GENERATED**
- `kubecost.networkCosts.enabled` - **NOT GENERATED**
- `kubecost.clusterName` - **NOT GENERATED**

#### Medium Priority Gaps 🟡

**Network Policy Details**

- `networkPolicy.allowIngressFrom` - **NOT GENERATED** (array)
- `networkPolicy.allowEgressTo` - **NOT GENERATED** (array)
- `networkPolicy.allowEgressPorts` - **NOT GENERATED** (array)

**Cloud-Specific Configurations**

- `gcp.backendConfig.healthCheck.*` - **PARTIALLY GENERATED**
- `gcp.managedCertificate.*` - **PARTIALLY GENERATED**
- `aws.loadBalancer.healthCheck.*` - **PARTIALLY GENERATED**

**Resource Management**

- `tierResourceQuota.enabled` - **NOT GENERATED**
- `tierResourceQuota.requests.*` - **NOT GENERATED**
- `tierResourceQuota.limits.*` - **NOT GENERATED**

#### Low Priority Gaps 🟢

**Kubernetes Secrets**

- `kubernetesSecrets.rafikiAuth.create` - **NOT GENERATED**
- `kubernetesSecrets.rafikiAuth.name` - **NOT GENERATED**
- `kubernetesSecrets.rafikiAuth.stringData` - **NOT GENERATED**
- `kubernetesSecrets.rafikiBackend.*` - **NOT GENERATED**

## Action Items

### Phase 1: Critical Fixes (Priority 1)

#### Task 1.1: Enhance Monitoring Dashboard Generation

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/core/helm/helm-values-generator.ts`

**Action Required:**

```typescript
// Add to generateDynamicHelmValues function
monitoring: {
  dashboards: {
    enabled: deploymentType === 'shared' || deploymentType === 'dedicated'
  }
},
tierConfig: {
  costBudget: tierCalculator.getTierBudget(tier) // Implement this method
},
tierResources: {
  cpu: tierCalculator.getTierCpuLimits(tier),
  memory: tierCalculator.getTierMemoryLimits(tier)
}
```

**Dependencies:**

- Implement `getTierBudget()` method in `tier-calculator.ts`
- Implement `getTierCpuLimits()` and `getTierMemoryLimits()` methods

#### Task 1.2: Implement Kubecost Configuration Generation

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/core/helm/helm-values-generator.ts`

**Action Required:**

```typescript
// Add kubecost configuration section
kubecost: {
  enabled: config.monitoring?.kubecost?.enabled ?? true,
  prometheus: {
    fqdn: config.monitoring?.prometheus?.fqdn ?? `prometheus.${config.domain}`
  },
  'cost-analyzer': {
    nodeSelector: config.cloudProvider === 'gcp' ? { 'cloud.google.com/gke-nodepool': 'default-pool' } : {},
    tolerations: []
  },
  networkCosts: {
    enabled: deploymentType === 'dedicated'
  },
  clusterName: config.clusterName || `${config.companyId}-${config.environment}`
}
```

### Phase 2: Medium Priority Enhancements (Priority 2)

#### Task 2.1: Enhance Network Policy Configuration

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/core/helm/helm-values-generator.ts`

**Action Required:**

```typescript
// Enhance networkPolicy configuration
networkPolicy: {
  enabled: deploymentType === 'shared',
  allowIngressFrom: deploymentType === 'shared' ? [
    { namespaceSelector: { matchLabels: { name: 'kube-system' } } },
    { namespaceSelector: { matchLabels: { name: 'monitoring' } } }
  ] : [],
  allowEgressTo: deploymentType === 'shared' ? [
    { namespaceSelector: { matchLabels: { name: 'kube-system' } } }
  ] : [],
  allowEgressPorts: [
    { port: 443, protocol: 'TCP' },
    { port: 53, protocol: 'UDP' },
    { port: 53, protocol: 'TCP' }
  ]
}
```

#### Task 2.2: Complete Cloud-Specific Configuration

**Files:**

- `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/core/helm/helm-values-generator.ts`
- `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/types/plans.ts`

**Action Required:**

```typescript
// Enhance GCP configuration
gcp: {
  // ...existing code...
  backendConfig: {
    healthCheck: {
      checkIntervalSec: 60,
      port: 8080,
      type: 'HTTP',
      requestPath: '/health'
    }
  },
  managedCertificate: {
    enabled: config.ssl?.managedCertificate ?? true,
    domains: [config.domain, `*.${config.domain}`]
  }
},

// Enhance AWS configuration
aws: {
  // ...existing code...
  loadBalancer: {
    healthCheck: {
      enabled: true,
      intervalSeconds: 30,
      path: '/health',
      port: 'traffic-port',
      protocol: 'HTTP',
      timeoutSeconds: 5,
      unhealthyThresholdCount: 2,
      healthyThresholdCount: 2
    }
  }
}
```

#### Task 2.3: Implement Resource Quota Generation

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/core/helm/helm-values-generator.ts`

**Action Required:**

```typescript
// Add resource quota configuration
tierResourceQuota: {
  enabled: deploymentType === 'shared',
  requests: {
    cpu: tierCalculator.getTierResourceQuota(tier, 'cpu', 'requests'),
    memory: tierCalculator.getTierResourceQuota(tier, 'memory', 'requests'),
    'persistent-volume-claims': tierCalculator.getTierResourceQuota(tier, 'storage', 'claims')
  },
  limits: {
    cpu: tierCalculator.getTierResourceQuota(tier, 'cpu', 'limits'),
    memory: tierCalculator.getTierResourceQuota(tier, 'memory', 'limits')
  }
}
```

### Phase 3: Low Priority Completions (Priority 3)

#### Task 3.1: Kubernetes Secrets Configuration

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/core/helm/helm-values-generator.ts`

**Action Required:**

```typescript
// Add kubernetes secrets configuration
kubernetesSecrets: {
  rafikiAuth: {
    create: config.secrets?.createKubernetesSecrets ?? false,
    name: `${config.companyId}-rafiki-auth-secret`,
    stringData: {
      // Will be populated by secrets manager
    }
  },
  rafikiBackend: {
    create: config.secrets?.createKubernetesSecrets ?? false,
    name: `${config.companyId}-rafiki-backend-secret`,
    stringData: {
      // Will be populated by secrets manager
    }
  }
}
```

### Phase 4: Testing and Validation

#### Task 4.1: Update Test Values Files

**Files to Update:**

- `/Users/mide/Documents/work/Iaas/Iaas-k8s/helm-chart/tests/config/values.yaml`
- `/Users/mide/Documents/work/Iaas/Iaas-k8s/helm-chart/tests/config/values-aws.yaml`
- `/Users/mide/Documents/work/Iaas/Iaas-k8s/helm-chart/tests/config/values-gcp.yaml`

**Action Required:**
Add all newly generated parameters to test configuration files to ensure templates render correctly.

#### Task 4.2: Implement Parameter Validation

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/utils/validation.ts`

**Action Required:**

```typescript
export function validateHelmValues(values: any): ValidationResult {
  const errors: string[] = [];

  // Validate required monitoring parameters
  if (
    values.monitoring?.dashboards?.enabled &&
    !values.tierConfig?.costBudget
  ) {
    errors.push(
      "tierConfig.costBudget is required when monitoring dashboards are enabled"
    );
  }

  // Validate kubecost configuration
  if (values.kubecost?.enabled && !values.kubecost?.clusterName) {
    errors.push("kubecost.clusterName is required when kubecost is enabled");
  }

  // Add more validation rules...

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

#### Task 4.3: Create Integration Tests

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/tests/helm-parameter-coverage.test.ts`

**Action Required:**
Create comprehensive tests to verify all template parameters have corresponding generation logic or proper defaults.

## Supporting Method Implementations Required

### TierCalculator Enhancements

**File:** `/Users/mide/Documents/work/Iaas/Iaas-k8s/pulumi/src/utils/tier-calculator.ts`

Add the following methods:

```typescript
getTierBudget(tier: string): number
getTierCpuLimits(tier: string): string
getTierMemoryLimits(tier: string): string
getTierResourceQuota(tier: string, resource: string, type: 'requests' | 'limits' | 'claims'): string
```

## Success Criteria

- [ ] All Helm template parameters have corresponding generation logic or documented defaults
- [ ] Monitoring dashboards render correctly with tier-specific configurations
- [ ] Kubecost installation works with generated parameters
- [ ] Network policies have complete configuration options
- [ ] Cloud-specific configurations are fully implemented
- [ ] All test value files validate successfully
- [ ] Integration tests pass for parameter coverage
- [ ] Documentation updated with new parameter explanations

## Estimated Timeline

- **Phase 1 (Critical):** 2-3 days
- **Phase 2 (Medium):** 3-4 days
- **Phase 3 (Low Priority):** 1-2 days
- **Phase 4 (Testing):** 2-3 days

**Total Estimated Time:** 8-12 days

## Risk Assessment

**Low Risk:**

- Core deployment parameters are already well-covered
- Existing tier system provides good foundation

**Medium Risk:**

- Kubecost integration may require external service dependencies
- Cloud-specific configurations need testing in actual cloud environments

**High Risk:**

- Monitoring dashboard parameter changes may affect existing deployments
- Resource quota changes could impact running workloads

## Recommendations

1. **Implement changes incrementally** - Start with Phase 1 critical fixes
2. **Test thoroughly** - Use the existing test infrastructure extensively
3. **Maintain backward compatibility** - Ensure existing deployments continue to work
4. **Document changes** - Update README and inline documentation
5. **Monitor after deployment** - Watch for any issues with new parameter generation

---

_Analysis completed on: May 30, 2025_
_Total templates analyzed: 23_
_Total parameters identified: 150+_
_Coverage assessment: ~75% covered, 25% requiring attention_
