# Kubecost Integration - Complete Implementation

This repository contains a comprehensive Kubecost integration for tier-based IaaS cost management with GCP Cloud Billing support.

## 🎯 Overview

The kubecost integration provides:

- **Tier-based cost allocation** for Basic, Standard, Premium, and Enterprise plans
- **GCP Cloud Billing API integration** for accurate cost reconciliation
- **Real-time cost monitoring** with budget alerts and efficiency tracking
- **Cost optimization recommendations** based on resource utilization
- **Comprehensive reporting** with JSON, CSV, and PDF export options
- **Prometheus integration** for detailed metrics collection
- **Automated alerting** for budget thresholds and efficiency issues

## 📁 Implementation Files

### Core Implementation

- [`src/utils/kubecost-client.ts`](./pulumi/src/utils/kubecost-client.ts) - Main KubecostClient with full API implementation
- [`helm-chart/templates/kubecost-installation.yaml`](./helm-chart/templates/kubecost-installation.yaml) - Kubecost deployment template
- [`helm-chart/templates/monitoring-dashboard.yaml`](./helm-chart/templates/monitoring-dashboard.yaml) - Grafana dashboards

### Configuration & Values

- [`helm-chart/tests/config/values-gcp.yaml`](./helm-chart/tests/config/values-gcp.yaml) - GCP-specific configuration
- [`helm-chart/templates/cost-monitoring-config.yaml`](./helm-chart/templates/cost-monitoring-config.yaml) - Cost monitoring configuration

### Documentation & Guides

- [`docs/kubecost-gcp-billing-setup.md`](./docs/kubecost-gcp-billing-setup.md) - Comprehensive GCP billing setup guide
- [`docs/kubecost-prometheus-configuration.md`](./docs/kubecost-prometheus-configuration.md) - Prometheus configuration guide

### Examples & Demos

- [`examples/kubecost-integration-demo.ts`](./examples/kubecost-integration-demo.ts) - Complete usage examples

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install google-auth-library
```

### 2. Basic Usage

```typescript
import { createKubecostClient } from "./src/utils/kubecost-client.js";
import { PlanTier } from "./src/types/plans.js";

// Initialize client
const client = createKubecostClient(
  "http://kubecost-cost-analyzer.kubecost:9090",
  {
    currency: "USD",
    costAllocationLabels: {
      "iaas.deployment/tier": "tier",
      "iaas.deployment/company": "company",
    },
  },
  logger
);

// Get cost summary for a tier
const summary = await client.getTierCostSummary(
  PlanTier.PREMIUM,
  "production-premium",
  "acme-corp"
);

console.log(`Total cost: $${summary.costs.total}`);
console.log(`Budget utilization: ${summary.budgetStatus.utilizationPercent}%`);
```

### 3. Set Up Cost Monitoring

```typescript
// Configure monitoring for a namespace
await client.setupCostMonitoring(
  "production-premium",
  PlanTier.PREMIUM,
  "acme-corp",
  [75, 90, 100] // Alert thresholds
);

// Allocate budget
await client.allocateBudgetForNamespace(
  "production-premium",
  "acme-corp",
  PlanTier.PREMIUM,
  "gcp-billing-account-id"
);
```

## 🔧 Features Implemented

### ✅ Cost Tracking & Allocation

- [x] Real-time cost allocation by namespace, tier, and company
- [x] Resource usage tracking (CPU, memory, storage, network)
- [x] Asset cost tracking (load balancers, persistent volumes)
- [x] Tier-based budget management with configurable limits
- [x] Cost efficiency metrics and analysis

### ✅ GCP Cloud Billing Integration

- [x] GCP Billing Account API integration
- [x] Service account authentication with Workload Identity support
- [x] Cost data synchronization between GCP and Kubecost
- [x] Billing data reconciliation and variance analysis
- [x] BigQuery export integration for advanced analytics

### ✅ Monitoring & Alerting

- [x] Prometheus metrics collection and recording rules
- [x] Budget threshold alerts (75%, 90%, 100%)
- [x] Resource efficiency monitoring
- [x] Cost anomaly detection
- [x] Grafana dashboard integration

### ✅ Cost Optimization

- [x] Resource rightsizing recommendations
- [x] Over-provisioning detection
- [x] Storage optimization suggestions
- [x] Efficiency improvement recommendations
- [x] Estimated savings calculations

### ✅ Reporting & Export

- [x] Comprehensive cost reports (JSON, CSV, PDF-ready)
- [x] Multi-dimensional grouping (namespace, tier, company)
- [x] Time-series cost analysis
- [x] Export for external billing systems
- [x] Dashboard URL generation

### ✅ API & Client Features

- [x] Full Kubecost API client implementation
- [x] Error handling and retry logic
- [x] Request timeout and connection management
- [x] Type-safe interfaces and responses
- [x] Comprehensive logging and debugging

## 📊 Key Interfaces

### TierCostSummary

```typescript
interface TierCostSummary {
  tier: PlanTier;
  namespace: string;
  company: string;
  period: { start: string; end: string };
  costs: {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
    loadBalancer: number;
    total: number;
    currency: string;
  };
  efficiency: {
    cpu: number;
    memory: number;
    overall: number;
  };
  budgetStatus: {
    allocated: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
  };
}
```

### Cost Alerts

```typescript
interface CostAlert {
  id: string;
  type: "budget" | "anomaly" | "efficiency";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  tier: PlanTier;
  namespace: string;
  company: string;
  threshold: number;
  current: number;
  timestamp: string;
}
```

## 🔄 BillingId Functionality

The `billingAccountId` is used throughout the system for:

### 1. Cost Allocation Labels

```typescript
// Applied to resources for cost tracking
labels: {
  "iaas.deployment/billing-account": billingAccountId,
  "iaas.deployment/tier": tier,
  "iaas.deployment/company": company,
}
```

### 2. Budget Management

```typescript
// Associate namespace budgets with billing accounts
await client.allocateBudgetForNamespace(
  namespace,
  company,
  tier,
  billingAccountId // Links budget to specific billing account
);
```

### 3. GCP Integration

```typescript
// Used in GCP Billing API calls
const gcpConfig = {
  billingAccountId: "012345-678901-ABCDEF",
  projectId: "my-project",
  credentialsPath: "/path/to/key.json",
};
```

### 4. Cost Reconciliation

```typescript
// Sync GCP billing data with Kubecost allocations
await client.syncGCPBillingWithKubecost(startDate, endDate);
// Uses billingAccountId to match costs to resources
```

### 5. Alert Configuration

```typescript
// Alerts include billing account context
const alert = {
  labels: {
    billing_account: billingAccountId,
    namespace: "production",
    tier: "premium",
  },
};
```

## 🛠 Setup Instructions

### 1. Deploy Kubecost

```bash
helm install kubecost ./helm-chart \
  -f helm-chart/tests/config/values-gcp.yaml \
  --namespace kubecost \
  --create-namespace
```

### 2. Configure GCP Billing

Follow the comprehensive guide: [`docs/kubecost-gcp-billing-setup.md`](./docs/kubecost-gcp-billing-setup.md)

### 3. Set Up Prometheus

Follow the configuration guide: [`docs/kubecost-prometheus-configuration.md`](./docs/kubecost-prometheus-configuration.md)

### 4. Test Integration

```bash
tsx examples/kubecost-integration-demo.ts
```

## 📈 Tier-Based Budget Limits

```typescript
const budgetLimits = {
  [PlanTier.BASIC]: 99, // $99/month
  [PlanTier.STANDARD]: 299, // $299/month
  [PlanTier.PREMIUM]: 599, // $599/month
  [PlanTier.ENTERPRISE]: 1299, // $1299/month
};
```

## 🔍 Monitoring Dashboard URLs

The system generates direct links to Kubecost dashboards:

```typescript
const dashboardUrl = await client.getDashboardUrl("production-premium");
// Returns: http://kubecost.example.com/namespace/production-premium
```

## 🚨 Alert Thresholds

Default budget alert thresholds:

- **75%** - Info alert for budget awareness
- **90%** - Warning alert for budget approaching
- **100%** - Critical alert for budget exceeded

Efficiency alerts:

- **CPU efficiency < 50%** - Warning for over-provisioning
- **Memory efficiency < 50%** - Warning for over-provisioning
- **Overall efficiency < 30%** - Critical for significant waste

## 📋 Environment Variables

```bash
# Kubecost Configuration
KUBECOST_URL=http://kubecost-cost-analyzer.kubecost:9090
KUBECOST_API_KEY=optional-api-key

# GCP Configuration
GCP_BILLING_ACCOUNT_ID=012345-678901-ABCDEF
GOOGLE_CLOUD_PROJECT=my-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Cluster Configuration
CLUSTER_NAME=production-cluster
```

## 🧪 Testing

Run the comprehensive demo:

```bash
npm run kubecost:demo
```

Test specific functionality:

```typescript
import {
  exampleBasicCostTracking,
  exampleTierBudgetManagement,
  exampleCostOptimization,
} from "./examples/kubecost-integration-demo.js";

await exampleBasicCostTracking();
await exampleTierBudgetManagement();
await exampleCostOptimization();
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Errors**

   ```bash
   kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
   ```

2. **GCP Authentication**

   ```bash
   gcloud auth application-default login
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
   ```

3. **Missing Metrics**
   ```bash
   kubectl logs -n kubecost deployment/kubecost-cost-analyzer
   kubectl logs -n kubecost deployment/prometheus-server
   ```

### Performance Optimization

- Configure appropriate data retention periods
- Use recording rules for expensive queries
- Implement metric filtering to reduce cardinality
- Monitor Prometheus performance metrics

## 📚 Additional Resources

- [Kubecost Documentation](https://docs.kubecost.com/)
- [GCP Cloud Billing API](https://cloud.google.com/billing/docs/reference/rest)
- [Prometheus Recording Rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Grafana Dashboard Configuration](https://grafana.com/docs/grafana/latest/dashboards/)

## 🎯 Next Steps

1. **Integration with CI/CD**: Add cost validation to deployment pipelines
2. **Advanced Analytics**: Implement cost forecasting and trend analysis
3. **Multi-Cloud Support**: Extend to AWS and Azure billing APIs
4. **Cost Governance**: Implement automated cost controls and policies
5. **ML-based Optimization**: Use machine learning for intelligent rightsizing

---

This implementation provides a production-ready, comprehensive Kubecost integration that enables accurate cost tracking, proactive monitoring, and intelligent optimization for tier-based IaaS deployments.
