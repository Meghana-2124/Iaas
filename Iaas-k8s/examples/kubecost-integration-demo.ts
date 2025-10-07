#!/usr/bin/env tsx

/**
 * Kubecost Integration Example
 *
 * This example demonstrates the complete Kubecost integration functionality
 * including cost tracking, GCP billing integration, monitoring setup, and reporting.
 */

import {
  createKubecostClient,
  validateKubecostConnection,
} from "../pulumi/src/utils/kubecost-client.js";
import { PlanTier } from "../pulumi/src/types/plans.js";
import { Logger } from "../pulumi/src/types/index.js";

// Example logger implementation
const logger: Logger = {
  info: (message: string, meta?: any) =>
    console.log(`[INFO] ${message}`, meta || ""),
  error: (message: string, meta?: any) =>
    console.error(`[ERROR] ${message}`, meta || ""),
  warn: (message: string, meta?: any) =>
    console.warn(`[WARN] ${message}`, meta || ""),
  debug: (message: string, meta?: any) =>
    console.debug(`[DEBUG] ${message}`, meta || ""),
};

// Kubecost configuration
const kubecostConfig = {
  enabled: true,
  namespace: "kubecost",
  currency: "USD",
  billingAccountId:
    process.env.GCP_BILLING_ACCOUNT_ID || "your-billing-account-id",
  costAllocationLabels: [
    "iaas.deployment/tier",
    "iaas.deployment/company",
    "iaas.deployment/namespace",
    "app.kubernetes.io/name",
    "app.kubernetes.io/instance",
  ],
  alertingEnabled: true,
  budgetAlerts: {
    enabled: true,
    thresholds: [50, 80, 100], // Alert at 50%, 80%, and 100% of budget
  },
};

// Budget limits per tier (monthly USD)
const budgetLimits = {
  [PlanTier.BASIC]: 99,
  [PlanTier.STANDARD]: 299,
  [PlanTier.PREMIUM]: 599,
  [PlanTier.ENTERPRISE]: 1299,
};

// GCP Billing configuration
const gcpBillingConfig = {
  billingAccountId:
    process.env.GCP_BILLING_ACCOUNT_ID || "your-billing-account-id",
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "your-project-id",
  credentialsPath:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "/path/to/service-account-key.json",
};

async function demonstrateKubecostIntegration() {
  try {
    logger.info("=".repeat(80));
    logger.info("KUBECOST INTEGRATION DEMONSTRATION");
    logger.info("=".repeat(80));

    // 1. Initialize Kubecost client
    logger.info("\n1. Initializing Kubecost client...");
    const kubecostUrl =
      process.env.KUBECOST_URL || "http://kubecost-cost-analyzer.kubecost:9090";

    const client = createKubecostClient(
      kubecostUrl,
      kubecostConfig,
      logger,
      process.env.KUBECOST_API_KEY, // Optional API key
      gcpBillingConfig
    );

    // 2. Validate connectivity
    logger.info("\n2. Validating Kubecost connectivity...");
    const isConnected = await validateKubecostConnection(client, logger);
    if (!isConnected) {
      logger.error(
        "Kubecost connection failed - this may be expected in a demo environment"
      );
      logger.info("Continuing with example data...");
    }

    // 3. Set up cost monitoring for different tiers
    logger.info(
      "\n3. Setting up cost monitoring for tier-based deployments..."
    );

    const deployments = [
      {
        namespace: "production-premium",
        tier: PlanTier.PREMIUM,
        company: "acme-corp",
      },
      {
        namespace: "production-standard",
        tier: PlanTier.STANDARD,
        company: "acme-corp",
      },
      {
        namespace: "staging-basic",
        tier: PlanTier.BASIC,
        company: "test-company",
      },
      { namespace: "development", tier: PlanTier.BASIC, company: "internal" },
    ];

    for (const deployment of deployments) {
      try {
        await client.setupCostMonitoring(
          deployment.namespace,
          deployment.tier,
          deployment.company,
          [75, 90, 100] // Budget alert thresholds
        );

        await client.allocateBudgetForNamespace(
          deployment.namespace,
          deployment.company,
          deployment.tier,
          gcpBillingConfig.billingAccountId
        );

        logger.info(
          `✓ Cost monitoring configured for ${deployment.namespace} (${deployment.tier})`
        );
      } catch (error) {
        logger.warn(
          `Failed to setup monitoring for ${deployment.namespace}: ${error}`
        );
      }
    }

    // 4. Get cost summaries for each tier
    logger.info("\n4. Retrieving cost summaries...");

    for (const deployment of deployments) {
      try {
        const summary = await client.getTierCostSummary(
          deployment.tier,
          deployment.namespace,
          deployment.company,
          "30d"
        );

        logger.info(
          `\n📊 Cost Summary for ${deployment.namespace} (${deployment.tier}):`,
          {
            totalCost: `$${summary.costs.total}`,
            budgetUtilization: `${summary.budgetStatus.utilizationPercent}%`,
            efficiency: `${Math.round(summary.efficiency.overall * 100)}%`,
            remaining: `$${summary.budgetStatus.remaining}`,
          }
        );
      } catch (error) {
        logger.warn(
          `Failed to get cost summary for ${deployment.namespace}: ${error}`
        );
      }
    }

    // 5. Check for cost alerts
    logger.info("\n5. Checking for cost alerts...");

    for (const deployment of deployments) {
      try {
        const alerts = await client.getCostAlerts(
          deployment.tier,
          deployment.namespace,
          deployment.company
        );

        if (alerts.length > 0) {
          logger.warn(
            `⚠️  Found ${alerts.length} alerts for ${deployment.namespace}:`
          );
          alerts.forEach((alert) => {
            logger.warn(`  - ${alert.severity.toUpperCase()}: ${alert.title}`);
            logger.warn(`    ${alert.message}`);
          });
        } else {
          logger.info(`✓ No alerts for ${deployment.namespace}`);
        }
      } catch (error) {
        logger.warn(
          `Failed to get alerts for ${deployment.namespace}: ${error}`
        );
      }
    }

    // 6. Get cost optimization recommendations
    logger.info("\n6. Generating cost optimization recommendations...");

    try {
      const recommendations = await client.getCostRecommendations();

      if (recommendations.length > 0) {
        logger.info(
          `💡 Found ${recommendations.length} cost optimization opportunities:`
        );

        const topRecommendations = recommendations.slice(0, 5); // Show top 5
        topRecommendations.forEach((rec, index) => {
          logger.info(
            `\n  ${index + 1}. ${rec.title} (${rec.severity.toUpperCase()})`
          );
          logger.info(`     Namespace: ${rec.namespace}`);
          logger.info(
            `     Estimated Savings: $${rec.estimatedSavings.toFixed(2)}`
          );
          logger.info(`     Action: ${rec.action}`);
        });

        const totalSavings = recommendations.reduce(
          (sum, rec) => sum + rec.estimatedSavings,
          0
        );
        logger.info(
          `\n💰 Total potential savings: $${totalSavings.toFixed(2)}`
        );
      } else {
        logger.info("✓ No optimization recommendations found");
      }
    } catch (error) {
      logger.warn(`Failed to get recommendations: ${error}`);
    }

    // 7. Generate cost reports
    logger.info("\n7. Generating cost reports...");

    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    try {
      // JSON report grouped by namespace
      const namespaceReport = await client.generateCostReport(
        startDate,
        endDate,
        "namespace",
        "json"
      );

      logger.info("📄 Namespace Cost Report Generated:", {
        totalCost: `$${namespaceReport.summary.totalCost.toFixed(2)}`,
        namespaceCount: namespaceReport.details.length,
        currency: namespaceReport.metadata.currency,
      });

      // CSV report grouped by tier
      const tierReportCsv = await client.generateCostReport(
        startDate,
        endDate,
        "tier",
        "csv"
      );

      logger.info("📄 Tier Cost Report (CSV) Generated:");
      logger.info("\nFirst few lines of CSV report:");
      const csvLines = tierReportCsv.split("\n").slice(0, 10);
      csvLines.forEach((line) => logger.info(`  ${line}`));
    } catch (error) {
      logger.warn(`Failed to generate reports: ${error}`);
    }

    // 8. GCP Billing Integration (if configured)
    if (
      process.env.GCP_BILLING_ACCOUNT_ID &&
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    ) {
      logger.info("\n8. Testing GCP billing integration...");

      try {
        const billingAccount = await client.getGCPBillingAccount();
        logger.info("✓ GCP Billing Account Info:", {
          name: billingAccount.displayName,
          id: billingAccount.name,
          open: billingAccount.open,
        });

        // Sync billing data
        await client.syncGCPBillingWithKubecost(startDate, endDate);
        logger.info("✓ GCP billing data sync completed");
      } catch (error) {
        logger.warn(`GCP billing integration not available: ${error}`);
      }
    } else {
      logger.info(
        "\n8. Skipping GCP billing integration (credentials not configured)"
      );
      logger.info("   To test GCP integration, set:");
      logger.info("   - GCP_BILLING_ACCOUNT_ID");
      logger.info("   - GOOGLE_APPLICATION_CREDENTIALS");
    }

    // 9. Dashboard URLs
    logger.info("\n9. Kubecost dashboard URLs:");

    for (const deployment of deployments) {
      try {
        const dashboardUrl = await client.getDashboardUrl(deployment.namespace);
        logger.info(`📊 ${deployment.namespace}: ${dashboardUrl}`);
      } catch (error) {
        logger.warn(
          `Failed to get dashboard URL for ${deployment.namespace}: ${error}`
        );
      }
    }

    // 10. Export cost data for billing integration
    logger.info("\n10. Exporting cost data for billing systems...");

    try {
      // Export as JSON
      const jsonExport = await client.exportCostData(
        startDate,
        endDate,
        "json"
      );
      logger.info(
        `✓ JSON export completed: ${jsonExport.length} allocation records`
      );

      // Export as CSV
      const csvExport = await client.exportCostData(startDate, endDate, "csv");
      logger.info(
        `✓ CSV export completed: ${csvExport.split("\n").length} lines`
      );
    } catch (error) {
      logger.warn(`Failed to export cost data: ${error}`);
    }

    logger.info("\n=".repeat(80));
    logger.info("KUBECOST INTEGRATION DEMONSTRATION COMPLETE");
    logger.info("=".repeat(80));

    logger.info("\n📋 Summary of implemented features:");
    logger.info("  ✓ Kubecost client with GCP billing integration");
    logger.info("  ✓ Tier-based cost monitoring and budget allocation");
    logger.info("  ✓ Cost alerts and efficiency monitoring");
    logger.info("  ✓ Cost optimization recommendations");
    logger.info("  ✓ Comprehensive cost reporting (JSON, CSV)");
    logger.info("  ✓ GCP Cloud Billing API integration");
    logger.info("  ✓ Dashboard URL generation");
    logger.info("  ✓ Cost data export for billing systems");

    logger.info("\n📚 Next steps:");
    logger.info(
      "  1. Deploy Kubecost to your cluster using the provided Helm charts"
    );
    logger.info("  2. Configure GCP billing integration using the setup guide");
    logger.info(
      "  3. Set up Prometheus monitoring using the configuration guide"
    );
    logger.info("  4. Integrate cost data with your billing/finance systems");
    logger.info("  5. Set up automated cost optimization workflows");
  } catch (error) {
    logger.error("Demo failed:", error);
    process.exit(1);
  }
}

// Example usage functions for specific scenarios

async function exampleBasicCostTracking() {
  logger.info("\n=== EXAMPLE: Basic Cost Tracking ===");

  const client = createKubecostClient(
    "http://kubecost-cost-analyzer.kubecost:9090",
    kubecostConfig,
    logger
  );

  try {
    // Get allocation data for a specific namespace
    const allocations = await client.getAllocationData("production", {
      window: "7d",
      aggregate: "pod",
    });

    logger.info(
      `Found ${allocations.length} cost allocations for production namespace`
    );

    // Get total costs
    const totalCost = allocations.reduce(
      (sum, alloc) => sum + (alloc.totalCost || 0),
      0
    );
    logger.info(`Total 7-day cost: $${totalCost.toFixed(2)}`);
  } catch (error) {
    logger.error("Basic cost tracking example failed:", error);
  }
}

async function exampleTierBudgetManagement() {
  logger.info("\n=== EXAMPLE: Tier Budget Management ===");

  const client = createKubecostClient(
    "http://kubecost-cost-analyzer.kubecost:9090",
    kubecostConfig,
    logger
  );

  try {
    // Allocate budget for premium tier
    const budgetAllocation = await client.allocateBudgetForNamespace(
      "production-premium",
      "acme-corp",
      PlanTier.PREMIUM,
      "billing-account-123"
    );

    logger.info("Budget allocated:", budgetAllocation);

    // Get cost summary
    const costSummary = await client.getTierCostSummary(
      PlanTier.PREMIUM,
      "production-premium",
      "acme-corp"
    );

    logger.info("Current budget status:", {
      allocated: costSummary.budgetStatus.allocated,
      used: costSummary.budgetStatus.used,
      remaining: costSummary.budgetStatus.remaining,
      utilization: `${costSummary.budgetStatus.utilizationPercent}%`,
    });
  } catch (error) {
    logger.error("Tier budget management example failed:", error);
  }
}

async function exampleCostOptimization() {
  logger.info("\n=== EXAMPLE: Cost Optimization ===");

  const client = createKubecostClient(
    "http://kubecost-cost-analyzer.kubecost:9090",
    kubecostConfig,
    logger
  );

  try {
    // Get recommendations for a specific namespace
    const recommendations = await client.getCostRecommendations("production");

    logger.info(`Found ${recommendations.length} optimization opportunities`);

    // Focus on high-impact recommendations
    const highImpactRecs = recommendations
      .filter((rec) => rec.severity === "high" && rec.estimatedSavings > 50)
      .slice(0, 3);

    logger.info("Top high-impact recommendations:");
    highImpactRecs.forEach((rec, index) => {
      logger.info(`${index + 1}. ${rec.title}`);
      logger.info(`   Savings: $${rec.estimatedSavings.toFixed(2)}`);
      logger.info(`   Action: ${rec.action}`);
    });
  } catch (error) {
    logger.error("Cost optimization example failed:", error);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateKubecostIntegration().catch((error) => {
    logger.error("Demonstration failed:", error);
    process.exit(1);
  });
}

export {
  demonstrateKubecostIntegration,
  exampleBasicCostTracking,
  exampleTierBudgetManagement,
  exampleCostOptimization,
};
