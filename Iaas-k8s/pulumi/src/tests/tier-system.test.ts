import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TierCalculator } from "../utils/tier-calculator.js";
import { TierMigrationManager } from "../utils/tier-migration.js";
import { KubecostClient } from "../utils/kubecost-client.js";
import { PlanTier, PLAN_TIER_DEFINITIONS } from "../types/plans.js";
import { Logger } from "../types/index.js";

// Mock logger for testing
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock KubecostConfig for testing
const mockKubecostConfig = {
  enabled: true,
  namespace: "test-kubecost",
  currency: "USD",
  costAllocationLabels: ["tier", "company"],
  alertingEnabled: true,
  budgetAlerts: {
    enabled: true,
    thresholds: [50, 80, 100],
  },
};

describe("Tier-Based Resource Allocation System", () => {
  let calculator: TierCalculator;
  let migrationManager: TierMigrationManager;
  let kubecostClient: KubecostClient;

  beforeEach(() => {
    calculator = new TierCalculator(mockLogger);
    kubecostClient = new KubecostClient(
      "http://test-kubecost.local",
      mockKubecostConfig,
      mockLogger
    );
    migrationManager = new TierMigrationManager(
      calculator,
      kubecostClient,
      mockLogger
    );
  });

  describe("TierCalculator", () => {
    it("should calculate correct resources for each tier", () => {
      const basicResources = calculator.calculateResources(PlanTier.BASIC);
      expect(basicResources.quota.requests.cpu).toBe("1200m");
      expect(basicResources.quota.requests.memory).toBe("2.5Gi");
      expect(basicResources.tier).toBe(PlanTier.BASIC);

      const enterpriseResources = calculator.calculateResources(
        PlanTier.ENTERPRISE
      );
      expect(enterpriseResources.quota.requests.cpu).toBe("10000m");
      expect(enterpriseResources.quota.requests.memory).toBe("20Gi");
      expect(enterpriseResources.tier).toBe(PlanTier.ENTERPRISE);
    });

    it("should validate tier resources correctly", () => {
      const basicResources = calculator.calculateResources(PlanTier.BASIC);
      const validation = calculator.validateTierResources(
        PlanTier.BASIC,
        basicResources
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should generate correct Helm values for tier", () => {
      const helmValues = calculator.generateHelmValuesForTier(
        PlanTier.STANDARD,
        "test-company",
        "test-namespace"
      );

      expect(helmValues).toBeDefined();
      expect(helmValues.planTier).toBe(PlanTier.STANDARD);
      expect(helmValues.companyName).toBe("test-company");
      expect(helmValues.namespace).toBe("test-namespace");
    });

    it("should calculate correct cost estimates", () => {
      const basicCost = calculator.calculateMonthlyCost(PlanTier.BASIC);
      const enterpriseCost = calculator.calculateMonthlyCost(
        PlanTier.ENTERPRISE
      );

      expect(basicCost).toBe(
        PLAN_TIER_DEFINITIONS[PlanTier.BASIC].monthlyPriceUSD
      );
      expect(enterpriseCost).toBe(
        PLAN_TIER_DEFINITIONS[PlanTier.ENTERPRISE].monthlyPriceUSD
      );
      expect(enterpriseCost).toBeGreaterThan(basicCost);
    });
  });

  describe("TierMigrationManager", () => {
    it("should plan upgrade migration correctly", async () => {
      const plan = await migrationManager.planMigration(
        "test-company",
        PlanTier.BASIC,
        PlanTier.STANDARD,
        "test-namespace"
      );

      expect(plan.migrationType).toBe("upgrade");
      expect(plan.fromTier).toBe(PlanTier.BASIC);
      expect(plan.toTier).toBe(PlanTier.STANDARD);
    });

    it("should identify tier migration capabilities", () => {
      expect(migrationManager.canUpgradeTier(PlanTier.BASIC)).toBe(true);
      expect(migrationManager.canUpgradeTier(PlanTier.ENTERPRISE)).toBe(false);

      expect(migrationManager.canDowngradeTier(PlanTier.ENTERPRISE)).toBe(true);
      expect(migrationManager.canDowngradeTier(PlanTier.BASIC)).toBe(false);
    });

    it("should get next/previous tiers correctly", () => {
      expect(migrationManager.getNextTier(PlanTier.BASIC)).toBe(
        PlanTier.STANDARD
      );
      expect(migrationManager.getNextTier(PlanTier.ENTERPRISE)).toBeNull();

      expect(migrationManager.getPreviousTier(PlanTier.STANDARD)).toBe(
        PlanTier.BASIC
      );
      expect(migrationManager.getPreviousTier(PlanTier.BASIC)).toBeNull();
    });
  });

  describe("KubecostClient", () => {
    beforeEach(() => {
      // Mock fetch for testing
      global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    });

    it("should fetch allocation data correctly", async () => {
      const mockResponse = {
        code: 200,
        data: [
          {
            "test-company/basic": {
              name: "test-company/basic",
              totalCost: 150.5,
              cpuCost: 75.25,
              memoryCost: 50.15,
              storageCost: 25.1,
            },
          },
        ],
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(
        {
          ok: true,
          json: async () => mockResponse,
        } as Response
      );

      const allocation = await kubecostClient.getAllocationData(
        "test-namespace",
        { window: "7d" }
      );

      expect(allocation).toHaveLength(1);
      expect(allocation[0].name).toBe("test-company/basic");
    });

    it("should generate tier cost summary correctly", async () => {
      const mockTierSummary = {
        tier: PlanTier.BASIC,
        namespace: "test-namespace",
        company: "test-company",
        period: {
          start: "2025-05-23T00:00:00Z",
          end: "2025-05-30T00:00:00Z",
        },
        costs: {
          cpu: 50.0,
          memory: 30.0,
          storage: 15.0,
          network: 4.0,
          loadBalancer: 0.0,
          total: 99.0,
          currency: "USD",
        },
        efficiency: {
          cpu: 0.75,
          memory: 0.8,
          overall: 0.78,
        },
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(
        {
          ok: true,
          json: async () => ({ data: [mockTierSummary] }),
        } as Response
      );

      const summary = await kubecostClient.getTierCostSummary(
        PlanTier.BASIC,
        "test-namespace",
        "test-company",
        "7d"
      );

      expect(summary.costs.total).toBe(99.0);
      expect(summary.costs.cpu).toBe(50.0);
      expect(summary.tier).toBe(PlanTier.BASIC);
      expect(summary.company).toBe("test-company");
    });

    it("should handle API errors gracefully", async () => {
      // Create a new client instance that will trigger error condition
      const errorKubecostClient = new KubecostClient(
        "http://error-test-kubecost.local",
        mockKubecostConfig,
        mockLogger
      );

      await expect(
        errorKubecostClient.getAllocationData("test-namespace")
      ).rejects.toThrow(
        "Failed to fetch allocation data: Error: 500 Internal Server Error"
      );
    });

    it("should generate correct dashboard URLs", () => {
      const dashboardUrl = kubecostClient.getDashboardUrl("");
      expect(dashboardUrl).toBe("http://test-kubecost.local/allocation.html");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete tier upgrade workflow", async () => {
      // Calculate current and target resources
      const currentResources = calculator.calculateResources(PlanTier.BASIC);
      const targetResources = calculator.calculateResources(PlanTier.STANDARD);

      // Plan migration
      const migrationPlan = await migrationManager.planMigration(
        "test-company",
        PlanTier.BASIC,
        PlanTier.STANDARD,
        "test-namespace"
      );

      expect(migrationPlan.migrationType).toBe("upgrade");
      expect(migrationPlan.fromTier).toBe(PlanTier.BASIC);
      expect(migrationPlan.toTier).toBe(PlanTier.STANDARD);

      // Validate target tier
      const validation = calculator.validateTierResources(
        PlanTier.STANDARD,
        targetResources
      );
      expect(validation.isValid).toBe(true);
    });

    it("should calculate costs for all tiers", () => {
      const tiers = [
        PlanTier.BASIC,
        PlanTier.STANDARD,
        PlanTier.PREMIUM,
        PlanTier.ENTERPRISE,
      ];

      tiers.forEach((tier) => {
        const resources = calculator.calculateResources(tier);
        const monthlyCost = calculator.calculateMonthlyCost(tier);
        const validation = calculator.validateTierResources(tier, resources);

        expect(validation.isValid).toBe(true);
        expect(monthlyCost).toBeGreaterThan(0);
        expect(resources.tier).toBe(tier);
      });

      // Verify cost increases with tier
      const basicCost = calculator.calculateMonthlyCost(PlanTier.BASIC);
      const standardCost = calculator.calculateMonthlyCost(PlanTier.STANDARD);
      const premiumCost = calculator.calculateMonthlyCost(PlanTier.PREMIUM);
      const enterpriseCost = calculator.calculateMonthlyCost(
        PlanTier.ENTERPRISE
      );

      expect(standardCost).toBeGreaterThan(basicCost);
      expect(premiumCost).toBeGreaterThan(standardCost);
      expect(enterpriseCost).toBeGreaterThan(premiumCost);
    });
  });
});
