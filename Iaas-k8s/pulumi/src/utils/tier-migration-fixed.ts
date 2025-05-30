import { TierCalculator } from "./tier-calculator.js";
import { PlanTier } from "../types/plans.js";
import { KubecostClient } from "./kubecost-client.js";
import { Logger } from "../types/index.js";
import * as pulumi from "@pulumi/pulumi";

export interface MigrationPlan {
  companyName: string;
  fromTier: PlanTier;
  toTier: PlanTier;
  namespace: string;
  migrationType: "upgrade" | "downgrade";
  requiresDowntime: boolean;
  estimatedDuration: string;
  preChecks: string[];
  steps: string[];
  rollbackSteps: string[];
  warnings: string[];
  costImpact?: {
    currentMonthlyCost: number;
    newMonthlyCost: number;
    difference: number;
  };
}

export interface MigrationResult {
  success: boolean;
  duration?: string;
  error?: string;
  rollbackRequired?: boolean;
  details?: Record<string, any>;
}

export class TierMigrationManager {
  private tierCalculator: TierCalculator;
  private kubecostClient: KubecostClient;
  private logger: Logger;

  constructor(
    tierCalculator: TierCalculator,
    kubecostClient: KubecostClient,
    logger: Logger
  ) {
    this.tierCalculator = tierCalculator;
    this.kubecostClient = kubecostClient;
    this.logger = logger;
  }

  /**
   * Plan a migration between tiers
   */
  async planMigration(
    companyName: string,
    fromTier: PlanTier,
    toTier: PlanTier,
    namespace?: string
  ): Promise<MigrationPlan> {
    this.logger.info(
      `Planning migration for ${companyName}: ${fromTier} -> ${toTier}`
    );

    if (fromTier === toTier) {
      throw new Error("Source and target tiers cannot be the same");
    }

    const targetNamespace = namespace || `shared-${companyName.toLowerCase()}`;
    const migrationType = this.getMigrationType(fromTier, toTier);

    const plan: MigrationPlan = {
      companyName,
      fromTier,
      toTier,
      namespace: targetNamespace,
      migrationType,
      requiresDowntime: migrationType === "downgrade",
      estimatedDuration: this.estimateMigrationDuration(fromTier, toTier),
      preChecks: [],
      steps: [],
      rollbackSteps: [],
      warnings: [],
    };

    // Add pre-checks
    plan.preChecks.push(`Validate current ${fromTier} tier resources`);
    plan.preChecks.push(`Check cluster capacity for ${toTier} tier`);
    plan.preChecks.push("Backup current configuration");

    // Add migration steps
    if (migrationType === "upgrade") {
      plan.steps.push(`Scale up resources to ${toTier} tier specifications`);
      plan.steps.push("Update resource quotas and limits");
      plan.steps.push("Apply new tier labels and annotations");
      plan.steps.push("Verify increased capacity is available");
    } else {
      plan.steps.push("Verify resource usage fits within target tier limits");
      plan.steps.push(`Scale down resources to ${toTier} tier specifications`);
      plan.steps.push("Update resource quotas and limits");
      plan.steps.push("Apply new tier labels and annotations");
    }

    // Add rollback steps
    plan.rollbackSteps.push(`Restore ${fromTier} tier configuration`);
    plan.rollbackSteps.push("Revert resource quotas and limits");
    plan.rollbackSteps.push("Remove new tier labels and annotations");

    // Add warnings
    if (migrationType === "downgrade") {
      plan.warnings.push("Downgrade may result in service degradation");
      plan.warnings.push(
        "Ensure current resource usage fits within target tier limits"
      );
    }

    // Calculate cost impact
    try {
      const currentCost = this.tierCalculator.calculateMonthlyCost(fromTier);
      const newCost = this.tierCalculator.calculateMonthlyCost(toTier);
      plan.costImpact = {
        currentMonthlyCost: currentCost,
        newMonthlyCost: newCost,
        difference: newCost - currentCost,
      };
    } catch (error) {
      plan.warnings.push(
        `Could not calculate cost impact: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return plan;
  }

  /**
   * Execute a migration plan
   */
  async executeMigration(
    companyName: string,
    fromTier: PlanTier,
    toTier: PlanTier,
    namespace?: string
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      this.logger.info(
        `Executing migration for ${companyName}: ${fromTier} -> ${toTier}`
      );

      const plan = await this.planMigration(
        companyName,
        fromTier,
        toTier,
        namespace
      );

      // Simulate migration execution (replace with actual Pulumi operations)
      for (const step of plan.steps) {
        this.logger.info(`Executing step: ${step}`);
        // Add actual implementation here
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate work
      }

      const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;

      this.logger.info(`Migration completed successfully in ${duration}`);

      return {
        success: true,
        duration,
        details: {
          fromTier,
          toTier,
          namespace: plan.namespace,
          stepsExecuted: plan.steps.length,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to execute migration: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        rollbackRequired: true,
      };
    }
  }

  /**
   * Check if a tier can be upgraded
   */
  canUpgradeTier(tier: PlanTier): boolean {
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const currentIndex = tiers.indexOf(tier);
    return currentIndex >= 0 && currentIndex < tiers.length - 1;
  }

  /**
   * Check if a tier can be downgraded
   */
  canDowngradeTier(tier: PlanTier): boolean {
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const currentIndex = tiers.indexOf(tier);
    return currentIndex > 0;
  }

  /**
   * Get the next higher tier
   */
  getNextTier(tier: PlanTier): PlanTier | null {
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const currentIndex = tiers.indexOf(tier);

    if (currentIndex >= 0 && currentIndex < tiers.length - 1) {
      return tiers[currentIndex + 1];
    }

    return null;
  }

  /**
   * Get the next lower tier
   */
  getPreviousTier(tier: PlanTier): PlanTier | null {
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const currentIndex = tiers.indexOf(tier);

    if (currentIndex > 0) {
      return tiers[currentIndex - 1];
    }

    return null;
  }

  /**
   * Determine migration type
   */
  private getMigrationType(
    fromTier: PlanTier,
    toTier: PlanTier
  ): "upgrade" | "downgrade" {
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const fromIndex = tiers.indexOf(fromTier);
    const toIndex = tiers.indexOf(toTier);

    return toIndex > fromIndex ? "upgrade" : "downgrade";
  }

  /**
   * Estimate migration duration
   */
  private estimateMigrationDuration(
    fromTier: PlanTier,
    toTier: PlanTier
  ): string {
    const migrationType = this.getMigrationType(fromTier, toTier);

    // Base duration estimates
    if (migrationType === "upgrade") {
      return "5-10 minutes";
    } else {
      return "10-15 minutes"; // Downgrades take longer due to validation
    }
  }
}
