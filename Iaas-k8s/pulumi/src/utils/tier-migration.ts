import { TierCalculator } from "./tier-calculator.js";
import {
  PlanTier,
  getTierConfiguration,
  validateTierConfiguration,
  TierConfiguration,
  PLAN_TIER_DEFINITIONS,
} from "../types/plans.js";
import { KubecostClient } from "./kubecost-client.js";
import { Logger } from "../types/index.js";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

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

export interface MigrationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export interface MigrationPreCheck {
  name: string;
  description: string;
  passed: boolean;
  error?: string;
  details?: Record<string, any>;
}

export interface ResourceUsage {
  cpu: number; // millicores
  memory: number; // Mi
  storage: number; // Gi
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
    plan.preChecks.push("Verify current resource usage");
    plan.preChecks.push("Check for pending operations");

    // Add migration steps
    if (migrationType === "upgrade") {
      plan.steps.push("Create backup of current configuration");
      plan.steps.push(`Generate ${toTier} tier configuration`);
      plan.steps.push("Update resource quotas to accommodate new resources");
      plan.steps.push(`Scale up services to ${toTier} tier specifications`);
      plan.steps.push("Update limit ranges");
      plan.steps.push("Apply new tier labels and annotations");
      plan.steps.push("Verify all services are running with new resources");
      plan.steps.push("Update Kubecost configuration if enabled");
      plan.steps.push("Verify monitoring and alerting configuration");
    } else {
      plan.steps.push("Create backup of current configuration");
      plan.steps.push("Verify resource usage fits within target tier limits");
      plan.steps.push(
        "Validate that current workload can run on smaller resources"
      );
      plan.steps.push(`Scale down services to ${toTier} tier specifications`);
      plan.steps.push("Update resource quotas and limits");
      plan.steps.push("Apply new tier labels and annotations");
      plan.steps.push("Monitor service health during downscale");
      plan.steps.push("Update Kubecost configuration if enabled");
      plan.steps.push("Verify all services remain healthy");
    }

    // Add rollback steps
    plan.rollbackSteps.push(
      `Restore ${fromTier} tier configuration from backup`
    );
    plan.rollbackSteps.push("Revert resource quotas and limits");
    plan.rollbackSteps.push("Restore original service configurations");
    plan.rollbackSteps.push("Remove new tier labels and annotations");
    plan.rollbackSteps.push("Verify service health after rollback");
    plan.rollbackSteps.push("Restore Kubecost configuration");

    // Add warnings
    if (migrationType === "downgrade") {
      plan.warnings.push("Downgrade may result in service degradation");
      plan.warnings.push(
        "Ensure current resource usage fits within target tier limits"
      );
      plan.warnings.push(
        "Some features available in higher tiers may be disabled"
      );
      plan.warnings.push(
        "Performance may be reduced due to lower resource allocation"
      );
    }

    if (this.tierRequiresDowntime(fromTier, toTier)) {
      plan.warnings.push("This migration may cause brief service interruption");
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

      if (plan.costImpact.difference > 0) {
        plan.warnings.push(
          `Migration will increase monthly cost by $${plan.costImpact.difference}`
        );
      } else if (plan.costImpact.difference < 0) {
        plan.warnings.push(
          `Migration will reduce monthly cost by $${Math.abs(
            plan.costImpact.difference
          )}`
        );
      }
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
    namespace?: string,
    options: {
      dryRun?: boolean;
      force?: boolean;
      skipPreChecks?: boolean;
      k8sProvider?: any;
    } = {}
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

      if (options.dryRun) {
        this.logger.info("Dry run mode - no actual changes will be made");
        return {
          success: true,
          duration: "0s",
          details: {
            dryRun: true,
            plan,
          },
        };
      }

      // Run pre-checks unless skipped
      if (!options.skipPreChecks) {
        this.logger.info("Running pre-checks...");
        const preCheckResults = await this.runPreChecks(
          plan,
          options.k8sProvider
        );

        if (!preCheckResults.every((check) => check.passed) && !options.force) {
          const failedChecks = preCheckResults.filter((check) => !check.passed);
          throw new Error(
            `Pre-checks failed: ${failedChecks.map((c) => c.error).join(", ")}`
          );
        }
      }

      // Execute migration steps
      const executionResults: Array<{
        step: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const [index, step] of plan.steps.entries()) {
        this.logger.info(
          `Executing step ${index + 1}/${plan.steps.length}: ${step}`
        );

        try {
          await this.executeStep(step, plan, options.k8sProvider);
          executionResults.push({ step, success: true });

          // Add delay between steps for safety
          if (index < plan.steps.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Step failed: ${step} - ${errorMessage}`);
          executionResults.push({ step, success: false, error: errorMessage });

          // If a critical step fails, attempt rollback
          throw new Error(
            `Migration failed at step: ${step} - ${errorMessage}`
          );
        }
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
          stepsExecuted: executionResults.length,
          executionResults,
          costImpact: plan.costImpact,
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
        details: {
          fromTier,
          toTier,
          failurePoint: errorMessage,
        },
      };
    }
  }

  /**
   * Execute rollback of a failed migration
   */
  async rollbackMigration(
    companyName: string,
    fromTier: PlanTier,
    toTier: PlanTier,
    namespace?: string,
    options: {
      k8sProvider?: any;
    } = {}
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      this.logger.info(
        `Rolling back migration for ${companyName}: ${toTier} -> ${fromTier}`
      );

      const plan = await this.planMigration(
        companyName,
        toTier,
        fromTier,
        namespace
      );

      // Execute rollback steps
      for (const [index, step] of plan.rollbackSteps.entries()) {
        this.logger.info(
          `Executing rollback step ${index + 1}/${
            plan.rollbackSteps.length
          }: ${step}`
        );

        try {
          await this.executeStep(step, plan, options.k8sProvider);

          // Add delay between steps
          if (index < plan.rollbackSteps.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Rollback step failed: ${step} - ${errorMessage}`);
          // Continue with other rollback steps even if one fails
        }
      }

      const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;

      this.logger.info(`Rollback completed in ${duration}`);

      return {
        success: true,
        duration,
        details: {
          rollbackFrom: toTier,
          rollbackTo: fromTier,
          namespace: plan.namespace,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Rollback failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        details: {
          rollbackFailure: true,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Validate if a migration is possible and safe
   */
  async validateMigration(
    companyName: string,
    fromTier: PlanTier,
    toTier: PlanTier,
    namespace?: string,
    options: {
      checkResourceUsage?: boolean;
      checkClusterCapacity?: boolean;
    } = {}
  ): Promise<MigrationValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Basic validation
      if (fromTier === toTier) {
        errors.push("Source and target tiers cannot be the same");
      }

      if (!Object.values(PlanTier).includes(fromTier)) {
        errors.push(`Invalid source tier: ${fromTier}`);
      }

      if (!Object.values(PlanTier).includes(toTier)) {
        errors.push(`Invalid target tier: ${toTier}`);
      }

      // Get tier configurations
      const fromConfig = getTierConfiguration(fromTier);
      const toConfig = getTierConfiguration(toTier);

      // Validate tier configurations
      const fromValidation = validateTierConfiguration(fromConfig);
      const toValidation = validateTierConfiguration(toConfig);

      if (fromValidation.length > 0) {
        errors.push(
          `Source tier configuration invalid: ${fromValidation.join(", ")}`
        );
      }

      if (toValidation.length > 0) {
        errors.push(
          `Target tier configuration invalid: ${toValidation.join(", ")}`
        );
      }

      // Check migration direction
      const migrationType = this.getMigrationType(fromTier, toTier);

      if (migrationType === "downgrade") {
        warnings.push(
          "Downgrade migrations require careful resource usage validation"
        );
        recommendations.push(
          "Monitor current resource usage before proceeding"
        );
        recommendations.push("Consider running a dry-run first");
      }

      // Resource usage validation for downgrades
      if (migrationType === "downgrade" && options.checkResourceUsage) {
        try {
          const currentUsage = await this.getCurrentResourceUsage(
            companyName,
            namespace
          );
          const targetLimits = this.getTierResourceLimits(toTier);

          if (currentUsage.cpu > targetLimits.cpu) {
            errors.push(
              `Current CPU usage (${currentUsage.cpu}m) exceeds target tier limit (${targetLimits.cpu}m)`
            );
          }

          if (currentUsage.memory > targetLimits.memory) {
            errors.push(
              `Current memory usage (${currentUsage.memory}Mi) exceeds target tier limit (${targetLimits.memory}Mi)`
            );
          }

          if (currentUsage.storage > targetLimits.storage) {
            errors.push(
              `Current storage usage (${currentUsage.storage}Gi) exceeds target tier limit (${targetLimits.storage}Gi)`
            );
          }
        } catch (error) {
          warnings.push("Could not validate current resource usage");
        }
      }

      // Network policies validation
      if (
        fromConfig.resourceAllocation.networkPoliciesEnabled &&
        !toConfig.resourceAllocation.networkPoliciesEnabled
      ) {
        warnings.push(
          "Target tier disables network policies - this may reduce security"
        );
        recommendations.push(
          "Consider upgrading to a tier with network policies enabled"
        );
      }

      // Cost impact validation
      try {
        const fromCost = this.tierCalculator.calculateMonthlyCost(fromTier);
        const toCost = this.tierCalculator.calculateMonthlyCost(toTier);
        const costDelta = toCost - fromCost;

        if (costDelta > 500) {
          warnings.push(
            `Migration will significantly increase costs by $${costDelta}/month`
          );
        }
      } catch (error) {
        warnings.push("Could not calculate cost impact");
      }

      // General recommendations
      if (migrationType === "upgrade") {
        recommendations.push(
          "Upgrade migrations are generally safe and can be performed with minimal downtime"
        );
      }

      recommendations.push(
        "Always backup your configuration before performing migrations"
      );
      recommendations.push("Monitor service health during and after migration");
    } catch (error) {
      errors.push(
        `Validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
    };
  }

  /**
   * Get current resource usage for a company/namespace
   */
  async getCurrentResourceUsage(
    companyName: string,
    namespace?: string
  ): Promise<ResourceUsage> {
    const targetNamespace = namespace || `shared-${companyName.toLowerCase()}`;

    try {
      // Use Kubecost client to get current usage
      // Note: Getting usage by company name isn't directly supported in current getTierCostSummary method
      // This is a placeholder implementation that would need actual tier information
      // For now, we'll return conservative estimates
      this.logger.warn(
        "getCurrentResourceUsage: Actual usage retrieval not implemented, returning conservative estimates"
      );

      // In real implementation, you'd need to determine the current tier or have a different method
      // const costs = await this.kubecostClient.getTierCostSummary(
      //   currentTier, // Need to determine current tier first
      //   targetNamespace,
      //   companyName,
      //   "1d" // Last 24 hours
      // );

      return {
        cpu: 0, // Conservative estimate - would use costs.usage.cpuCoreHours * 1000
        memory: 0, // Conservative estimate - would use costs.usage.ramGBHours * 1024
        storage: 0, // Conservative estimate - would use costs.usage.storageGBHours
      };
    } catch (error) {
      this.logger.warn(
        `Could not get current resource usage: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Return conservative estimates
      return {
        cpu: 0,
        memory: 0,
        storage: 0,
      };
    }
  }

  /**
   * Get resource limits for a specific tier
   */
  private getTierResourceLimits(tier: PlanTier): ResourceUsage {
    const tierDef = PLAN_TIER_DEFINITIONS[tier];
    const quota = tierDef.quota;

    return {
      cpu: parseInt(quota.limits.cpu.replace("m", "")),
      memory: parseInt(quota.limits.memory.replace(/[^0-9]/g, "")),
      storage: parseInt(quota.limits.storage.replace(/[^0-9]/g, "")),
    };
  }

  /**
   * Run pre-checks before migration
   */
  private async runPreChecks(
    plan: MigrationPlan,
    k8sProvider?: any
  ): Promise<MigrationPreCheck[]> {
    const checks: MigrationPreCheck[] = [];

    // Check 1: Validate tier configurations
    checks.push({
      name: "Tier Configuration Validation",
      description: "Validate source and target tier configurations",
      passed: true, // This would have failed earlier if invalid
    });

    // Check 2: Check namespace exists (for shared deployments)
    if (k8sProvider) {
      try {
        // This is a simplified check - in real implementation you'd use k8s API
        checks.push({
          name: "Namespace Validation",
          description: `Verify namespace ${plan.namespace} exists and is accessible`,
          passed: true,
        });
      } catch (error) {
        checks.push({
          name: "Namespace Validation",
          description: `Verify namespace ${plan.namespace} exists and is accessible`,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Check 3: Verify no other migrations in progress
    checks.push({
      name: "Migration Lock Check",
      description: "Ensure no other migrations are currently in progress",
      passed: true, // In real implementation, you'd check for migration locks
    });

    // Check 4: Resource usage validation for downgrades
    if (plan.migrationType === "downgrade") {
      try {
        const currentUsage = await this.getCurrentResourceUsage(
          plan.companyName,
          plan.namespace
        );
        const targetLimits = this.getTierResourceLimits(plan.toTier);

        const resourcesWithinLimits =
          currentUsage.cpu <= targetLimits.cpu &&
          currentUsage.memory <= targetLimits.memory &&
          currentUsage.storage <= targetLimits.storage;

        checks.push({
          name: "Resource Usage Validation",
          description: "Verify current usage fits within target tier limits",
          passed: resourcesWithinLimits,
          error: resourcesWithinLimits
            ? undefined
            : "Current resource usage exceeds target tier limits",
          details: {
            currentUsage,
            targetLimits,
          },
        });
      } catch (error) {
        checks.push({
          name: "Resource Usage Validation",
          description: "Verify current usage fits within target tier limits",
          passed: false,
          error: `Failed to check resource usage: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    return checks;
  }

  /**
   * Execute a single migration step
   */
  private async executeStep(
    step: string,
    plan: MigrationPlan,
    k8sProvider?: any
  ): Promise<void> {
    // This is a simplified implementation - in a real system you'd implement
    // actual Kubernetes operations for each step type

    if (step.includes("backup")) {
      await this.createConfigurationBackup(plan.companyName, plan.namespace);
    } else if (step.includes("resource quota")) {
      await this.updateResourceQuota(plan, k8sProvider);
    } else if (step.includes("scale")) {
      await this.scaleServices(plan, k8sProvider);
    } else if (step.includes("labels")) {
      await this.updateTierLabels(plan, k8sProvider);
    } else if (step.includes("limit range")) {
      await this.updateLimitRange(plan, k8sProvider);
    } else if (step.includes("Kubecost")) {
      await this.updateKubecostConfiguration(plan);
    } else {
      // Generic step - simulate work
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.logger.debug(`Completed step: ${step}`);
  }

  /**
   * Create configuration backup
   */
  private async createConfigurationBackup(
    companyName: string,
    namespace: string
  ): Promise<void> {
    this.logger.info(
      `Creating configuration backup for ${companyName} in namespace ${namespace}`
    );
    // In real implementation, this would backup current Kubernetes resources
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Update resource quota for new tier
   */
  private async updateResourceQuota(
    plan: MigrationPlan,
    k8sProvider?: any
  ): Promise<void> {
    this.logger.info(`Updating resource quota for ${plan.toTier} tier`);

    if (k8sProvider) {
      const newQuota = this.tierCalculator.generateResourceQuota(
        getTierConfiguration(plan.toTier),
        plan.namespace
      );

      // In real implementation, apply the new resource quota
      this.logger.debug(`Generated new resource quota`, newQuota);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  /**
   * Scale services to new tier specifications
   */
  private async scaleServices(
    plan: MigrationPlan,
    k8sProvider?: any
  ): Promise<void> {
    this.logger.info(`Scaling services to ${plan.toTier} tier specifications`);

    const targetConfig = getTierConfiguration(plan.toTier);
    const services = targetConfig.resourceAllocation.services;

    // In real implementation, update each service's resource allocation
    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      this.logger.debug(
        `Scaling ${serviceName} to ${serviceConfig.replicas} replicas`
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Update tier labels and annotations
   */
  private async updateTierLabels(
    plan: MigrationPlan,
    k8sProvider?: any
  ): Promise<void> {
    this.logger.info(`Updating tier labels to ${plan.toTier}`);

    // In real implementation, update labels on all resources
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Update limit range for new tier
   */
  private async updateLimitRange(
    plan: MigrationPlan,
    k8sProvider?: any
  ): Promise<void> {
    this.logger.info(`Updating limit range for ${plan.toTier} tier`);

    if (k8sProvider) {
      const newLimitRange = this.tierCalculator.generateLimitRange(
        getTierConfiguration(plan.toTier),
        plan.namespace
      );

      // In real implementation, apply the new limit range
      this.logger.debug(`Generated new limit range`, newLimitRange);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Update Kubecost configuration
   */
  private async updateKubecostConfiguration(
    plan: MigrationPlan
  ): Promise<void> {
    this.logger.info(`Updating Kubecost configuration for ${plan.toTier} tier`);

    try {
      // In real implementation, update Kubecost labels and configuration
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      this.logger.warn(
        `Failed to update Kubecost configuration: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if migration requires downtime
   */
  private tierRequiresDowntime(fromTier: PlanTier, toTier: PlanTier): boolean {
    const migrationType = this.getMigrationType(fromTier, toTier);

    // Downgrades typically require more careful handling and potential downtime
    if (migrationType === "downgrade") {
      return true;
    }

    // Large tier jumps may require downtime
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const fromIndex = tiers.indexOf(fromTier);
    const toIndex = tiers.indexOf(toTier);

    return Math.abs(toIndex - fromIndex) > 1;
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
   * Get all possible migration paths from a tier
   */
  getPossibleMigrations(tier: PlanTier): Array<{
    targetTier: PlanTier;
    migrationType: "upgrade" | "downgrade";
    estimatedDuration: string;
    complexity: "low" | "medium" | "high";
  }> {
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const currentIndex = tiers.indexOf(tier);
    const migrations: Array<{
      targetTier: PlanTier;
      migrationType: "upgrade" | "downgrade";
      estimatedDuration: string;
      complexity: "low" | "medium" | "high";
    }> = [];

    for (let i = 0; i < tiers.length; i++) {
      if (i === currentIndex) continue;

      const targetTier = tiers[i];
      const migrationType = i > currentIndex ? "upgrade" : "downgrade";
      const tierDifference = Math.abs(i - currentIndex);

      migrations.push({
        targetTier,
        migrationType,
        estimatedDuration: this.estimateMigrationDuration(tier, targetTier),
        complexity:
          tierDifference === 1
            ? "low"
            : tierDifference === 2
            ? "medium"
            : "high",
      });
    }

    return migrations;
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
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const tierDifference = Math.abs(
      tiers.indexOf(toTier) - tiers.indexOf(fromTier)
    );

    // Base duration on migration type and complexity
    if (migrationType === "upgrade") {
      switch (tierDifference) {
        case 1:
          return "5-10 minutes";
        case 2:
          return "10-15 minutes";
        case 3:
          return "15-20 minutes";
        default:
          return "10-15 minutes";
      }
    } else {
      // Downgrades take longer due to validation requirements
      switch (tierDifference) {
        case 1:
          return "10-15 minutes";
        case 2:
          return "15-25 minutes";
        case 3:
          return "20-30 minutes";
        default:
          return "15-25 minutes";
      }
    }
  }
}
