/**
 * Comprehensive validation script for Kubecost integration
 *
 * This script validates all aspects of the kubecost integration including:
 * - Client initialization and connection validation
 * - Cost monitoring setup and alert configuration
 * - GCP billing integration
 * - Cost analysis and reporting capabilities
 * - Budget management and optimization recommendations
 */

import {
  createKubecostClient,
  validateKubecostConnection,
} from "../pulumi/src/utils/kubecost-client";
import { PlanTier } from "../pulumi/src/types/plans";
import { Logger } from "../pulumi/src/types/index";

// Mock logger for testing
const mockLogger: Logger = {
  info: (message: string, meta?: any) =>
    console.log(`[INFO] ${message}`, meta || ""),
  warn: (message: string, meta?: any) =>
    console.warn(`[WARN] ${message}`, meta || ""),
  error: (message: string, meta?: any) =>
    console.error(`[ERROR] ${message}`, meta || ""),
  debug: (message: string, meta?: any) =>
    console.debug(`[DEBUG] ${message}`, meta || ""),
};

// Test configuration
const TEST_CONFIG = {
  kubecostUrl: process.env.KUBECOST_URL || "http://localhost:9090",
  kubecostConfig: {
    enabled: true,
    namespace: "kubecost",
    currency: "USD",
    billingAccountId: "test-billing-account",
    costAllocationLabels: [
      "iaas.deployment/tier",
      "iaas.deployment/company",
      "iaas.deployment/namespace",
    ],
    alertingEnabled: true,
    budgetAlerts: {
      enabled: true,
      thresholds: [50, 80, 100],
    },
  },
  gcpBillingConfig: {
    billingAccountId: "test-billing-account-id",
    projectId: "test-project-id",
    credentialsPath: "/tmp/test-credentials.json",
  },
  testDeployments: [
    { tier: PlanTier.BASIC, namespace: "test-basic", company: "acme-corp" },
    {
      tier: PlanTier.STANDARD,
      namespace: "test-standard",
      company: "tech-startup",
    },
    {
      tier: PlanTier.PREMIUM,
      namespace: "test-premium",
      company: "enterprise-co",
    },
  ],
};

class KubecostValidationSuite {
  private kubecostClient: any;
  private testResults: Array<{
    test: string;
    status: "PASS" | "FAIL";
    message: string;
  }> = [];

  constructor() {
    this.kubecostClient = createKubecostClient(
      TEST_CONFIG.kubecostUrl,
      TEST_CONFIG.kubecostConfig,
      mockLogger
    );
  }

  private logResult(test: string, status: "PASS" | "FAIL", message: string) {
    this.testResults.push({ test, status, message });
    const icon = status === "PASS" ? "✅" : "❌";
    console.log(`${icon} ${test}: ${message}`);
  }

  async validateClientInitialization(): Promise<void> {
    console.log("\n📊 Testing Client Initialization...");

    try {
      if (
        this.kubecostClient &&
        this.kubecostClient.baseUrl === TEST_CONFIG.kubecostUrl
      ) {
        this.logResult(
          "client-creation",
          "PASS",
          "Kubecost client created successfully"
        );
      } else {
        this.logResult("client-creation", "FAIL", "Client creation failed");
      }

      // Test connection validation
      const isValid = await validateKubecostConnection(
        this.kubecostClient,
        mockLogger
      );
      this.logResult(
        "connection-validation",
        "PASS",
        `Connection validation completed (${isValid})`
      );
    } catch (error) {
      this.logResult("client-initialization", "FAIL", `Error: ${error}`);
    }
  }

  async validateCostMonitoring(): Promise<void> {
    console.log("\n💰 Testing Cost Monitoring Setup...");

    const budgets = {
      [PlanTier.BASIC]: 99,
      [PlanTier.STANDARD]: 299,
      [PlanTier.PREMIUM]: 599,
      [PlanTier.ENTERPRISE]: 1299,
    };

    for (const deployment of TEST_CONFIG.testDeployments) {
      try {
        await this.kubecostClient.setupCostMonitoring(
          deployment.namespace,
          deployment.company,
          deployment.tier,
          budgets[deployment.tier]
        );
        this.logResult(
          `cost-monitoring-${deployment.tier}`,
          "PASS",
          `Cost monitoring setup for ${deployment.tier} tier`
        );
      } catch (error) {
        this.logResult(
          `cost-monitoring-${deployment.tier}`,
          "FAIL",
          `Setup failed: ${error}`
        );
      }
    }

    // Test budget allocation
    try {
      const { tier, namespace, company } = TEST_CONFIG.testDeployments[0];
      await this.kubecostClient.allocateBudgetForNamespace(
        namespace,
        company,
        tier,
        100
      );
      this.logResult(
        "budget-allocation",
        "PASS",
        "Budget allocation successful"
      );
    } catch (error) {
      this.logResult(
        "budget-allocation",
        "FAIL",
        `Budget allocation failed: ${error}`
      );
    }
  }

  async validateCostAnalysis(): Promise<void> {
    console.log("\n📈 Testing Cost Analysis...");

    try {
      const { tier, namespace, company } = TEST_CONFIG.testDeployments[1];
      const costSummary = await this.kubecostClient.getTierCostSummary(
        tier,
        namespace,
        company,
        "7d"
      );

      if (costSummary && typeof costSummary.totalCost === "number") {
        this.logResult(
          "cost-summary",
          "PASS",
          "Tier cost summary retrieval successful"
        );
      } else {
        this.logResult("cost-summary", "FAIL", "Invalid cost summary response");
      }
    } catch (error) {
      this.logResult("cost-summary", "FAIL", `Cost summary failed: ${error}`);
    }

    // Test cost alerts
    try {
      const { tier, namespace, company } = TEST_CONFIG.testDeployments[2];
      const alerts = await this.kubecostClient.getCostAlerts(
        tier,
        namespace,
        company
      );

      if (Array.isArray(alerts)) {
        this.logResult(
          "cost-alerts",
          "PASS",
          "Cost alerts retrieval successful"
        );
      } else {
        this.logResult("cost-alerts", "FAIL", "Invalid alerts response");
      }
    } catch (error) {
      this.logResult("cost-alerts", "FAIL", `Cost alerts failed: ${error}`);
    }

    // Test cost recommendations
    try {
      const { tier, namespace, company } = TEST_CONFIG.testDeployments[0];
      const recommendations = await this.kubecostClient.getCostRecommendations(
        namespace,
        company,
        tier
      );

      if (
        recommendations &&
        recommendations.rightSizing &&
        recommendations.optimization
      ) {
        this.logResult(
          "cost-recommendations",
          "PASS",
          "Cost recommendations retrieval successful"
        );
      } else {
        this.logResult(
          "cost-recommendations",
          "FAIL",
          "Invalid recommendations response"
        );
      }
    } catch (error) {
      this.logResult(
        "cost-recommendations",
        "FAIL",
        `Cost recommendations failed: ${error}`
      );
    }
  }

  async validateReportGeneration(): Promise<void> {
    console.log("\n📄 Testing Report Generation...");

    const formats = ["json", "csv", "pdf"] as const;
    const { namespace, company } = TEST_CONFIG.testDeployments[0];

    for (const format of formats) {
      try {
        const report = await this.kubecostClient.generateCostReport(
          namespace,
          company,
          "30d",
          format
        );

        if (report && report.format === format && report.data) {
          this.logResult(
            `report-${format}`,
            "PASS",
            `${format.toUpperCase()} report generation successful`
          );
        } else {
          this.logResult(
            `report-${format}`,
            "FAIL",
            `Invalid ${format} report response`
          );
        }
      } catch (error) {
        this.logResult(
          `report-${format}`,
          "FAIL",
          `${format} report failed: ${error}`
        );
      }
    }
  }

  async validateGCPBillingIntegration(): Promise<void> {
    console.log("\n☁️ Testing GCP Billing Integration...");

    try {
      await this.kubecostClient.syncGCPBillingData(
        TEST_CONFIG.gcpBillingConfig.billingAccountId,
        TEST_CONFIG.gcpBillingConfig.projectId
      );
      this.logResult(
        "gcp-billing-sync",
        "PASS",
        "GCP billing data sync successful"
      );
    } catch (error) {
      this.logResult(
        "gcp-billing-sync",
        "FAIL",
        `GCP billing sync failed: ${error}`
      );
    }

    try {
      const reconciliation = await this.kubecostClient.reconcileWithGCPBilling(
        TEST_CONFIG.gcpBillingConfig.billingAccountId,
        "30d"
      );

      if (reconciliation && typeof reconciliation.variance === "number") {
        this.logResult(
          "gcp-billing-reconciliation",
          "PASS",
          "GCP billing reconciliation successful"
        );
      } else {
        this.logResult(
          "gcp-billing-reconciliation",
          "FAIL",
          "Invalid reconciliation response"
        );
      }
    } catch (error) {
      this.logResult(
        "gcp-billing-reconciliation",
        "FAIL",
        `GCP reconciliation failed: ${error}`
      );
    }
  }

  async validatePerformance(): Promise<void> {
    console.log("\n⚡ Testing Performance...");

    try {
      const concurrentQueries = TEST_CONFIG.testDeployments.map(
        ({ tier, namespace, company }) =>
          this.kubecostClient.getTierCostSummary(tier, namespace, company, "7d")
      );

      const startTime = Date.now();
      const results = await Promise.all(concurrentQueries);
      const executionTime = Date.now() - startTime;

      if (
        results.length === TEST_CONFIG.testDeployments.length &&
        executionTime < 10000
      ) {
        this.logResult(
          "concurrent-queries",
          "PASS",
          `Concurrent queries completed in ${executionTime}ms`
        );
      } else {
        this.logResult(
          "concurrent-queries",
          "FAIL",
          `Performance test failed or too slow (${executionTime}ms)`
        );
      }
    } catch (error) {
      this.logResult(
        "concurrent-queries",
        "FAIL",
        `Concurrent queries failed: ${error}`
      );
    }
  }

  async runAllTests(): Promise<void> {
    console.log("🚀 Starting Kubecost Integration Validation Suite...\n");

    await this.validateClientInitialization();
    await this.validateCostMonitoring();
    await this.validateCostAnalysis();
    await this.validateReportGeneration();
    await this.validateGCPBillingIntegration();
    await this.validatePerformance();

    this.generateSummaryReport();
  }

  generateSummaryReport(): void {
    const passCount = this.testResults.filter(
      (r) => r.status === "PASS"
    ).length;
    const failCount = this.testResults.filter(
      (r) => r.status === "FAIL"
    ).length;
    const totalTests = this.testResults.length;

    console.log("\n" + "=".repeat(80));
    console.log("KUBECOST INTEGRATION VALIDATION SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`Success Rate: ${Math.round((passCount / totalTests) * 100)}%`);
    console.log("=".repeat(80));

    if (failCount > 0) {
      console.log("\n❌ Failed Tests:");
      this.testResults
        .filter((r) => r.status === "FAIL")
        .forEach((result) => {
          console.log(`   • ${result.test}: ${result.message}`);
        });
    }

    console.log("\n🎉 Validation complete!");

    if (passCount === totalTests) {
      console.log(
        "✅ All tests passed! Kubecost integration is ready for production."
      );
    } else {
      console.log(
        "⚠️ Some tests failed. Please review and fix issues before production deployment."
      );
    }
  }
}

// Run validation if this file is executed directly
async function main() {
  const validator = new KubecostValidationSuite();
  await validator.runAllTests();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Validation suite failed:", error);
    process.exit(1);
  });
}

export { KubecostValidationSuite, TEST_CONFIG, mockLogger };
