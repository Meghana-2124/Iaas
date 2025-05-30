import yargs from "yargs";
import { TierCalculator } from "../utils/tier-calculator.js";
import { TierMigrationManager } from "../utils/tier-migration.js";
import { createKubecostClient } from "../utils/kubecost-client.js";
import {
  PlanTier,
  PLAN_TIER_DEFINITIONS,
  DEFAULT_KUBECOST_CONFIG,
} from "../types/plans.js";
import { Logger } from "../types/index.js";
import chalk from "chalk";

export interface TierCommandOptions {
  stackName: string;
  companyName: string;
  kubeconfig?: string;
  namespace?: string;
  kubecostUrl?: string;
  logger: Logger;
}

/**
 * CLI commands for managing tier-based resource allocation
 */
export class TierCommands {
  private calculator: TierCalculator;
  private migrationManager: TierMigrationManager;

  constructor(private options: TierCommandOptions) {
    this.calculator = new TierCalculator(options.logger);

    // Initialize migration manager with Kubecost client
    const kubecostClient = createKubecostClient(
      options.kubecostUrl || "http://localhost:9090",
      DEFAULT_KUBECOST_CONFIG,
      options.logger
    );

    this.migrationManager = new TierMigrationManager(
      this.calculator,
      kubecostClient,
      options.logger
    );
  }

  /**
   * Show available tiers and their resource allocations
   */
  async showTiers(): Promise<void> {
    console.log(chalk.blue.bold("\n📊 Available Plan Tiers\n"));

    Object.entries(PLAN_TIER_DEFINITIONS).forEach(([tier, definition]) => {
      console.log(
        chalk.green.bold(
          `${tier.toUpperCase()} - $${definition.monthlyPriceUSD}/month`
        )
      );
      console.log(`  Display Name: ${definition.displayName}`);
      console.log(`  Description: ${definition.description}`);
      console.log(`  Max Namespaces: ${definition.maxNamespaces}`);
      console.log(`  Max PVCs: ${definition.maxPersistentVolumeClaims}`);
      console.log(
        `  Network Policies: ${
          definition.networkPoliciesEnabled ? "Enabled" : "Disabled"
        }`
      );

      // Service details
      console.log(`  Services:`);
      Object.entries(definition.services).forEach(
        ([serviceName, serviceConfig]) => {
          console.log(`    ${serviceName}:`);
          console.log(`      CPU: ${serviceConfig.cpu}`);
          console.log(`      Memory: ${serviceConfig.memory}`);
          console.log(`      Storage: ${serviceConfig.storage}`);
          console.log(`      Replicas: ${serviceConfig.replicas}`);
        }
      );
      console.log("");
    });
  }

  /**
   * Calculate resource allocation for a specific tier
   */
  async calculateTier(tier: PlanTier): Promise<void> {
    try {
      const resources = this.calculator.calculateResources(tier);
      const validation = this.calculator.validateTierResources(tier, resources);
      const monthlyCost = this.calculator.calculateMonthlyCost(tier);

      console.log(
        chalk.blue.bold(
          `\n📋 Resource Allocation for ${tier.toUpperCase()} Tier\n`
        )
      );

      console.log(chalk.yellow("Tier Information:"));
      console.log(`  Display Name: ${resources.displayName}`);
      console.log(`  Description: ${resources.description}`);
      console.log(`  Monthly Cost: $${monthlyCost}`);
      console.log(`  Max Namespaces: ${resources.maxNamespaces}`);
      console.log(`  Max PVCs: ${resources.maxPersistentVolumeClaims}`);
      console.log(
        `  Network Policies: ${
          resources.networkPoliciesEnabled ? "Enabled" : "Disabled"
        }\n`
      );

      console.log(chalk.yellow("Service Resource Allocation:"));
      Object.entries(resources.services).forEach(
        ([serviceName, serviceConfig]) => {
          console.log(`  ${serviceName}:`);
          console.log(`    CPU: ${serviceConfig.cpu}`);
          console.log(`    Memory: ${serviceConfig.memory}`);
          console.log(`    Storage: ${serviceConfig.storage}`);
          console.log(`    Replicas: ${serviceConfig.replicas}`);
        }
      );

      console.log(chalk.yellow("\nValidation:"));
      console.log(
        `  Valid: ${validation.isValid ? chalk.green("✓") : chalk.red("✗")}`
      );
      if (!validation.isValid) {
        validation.errors.forEach((error: string) => {
          console.log(`  Error: ${chalk.red(error)}`);
        });
      }
      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning: string) => {
          console.log(`  Warning: ${chalk.yellow(warning)}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error calculating tier: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Validate current tier configuration
   */
  async validateTier(tier: PlanTier): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🔍 Validating ${tier.toUpperCase()} Tier Configuration\n`
        )
      );

      const resources = this.calculator.calculateResources(tier);
      const validation = this.calculator.validateTierResources(tier, resources);

      console.log(chalk.yellow("Resource Validation:"));
      console.log(
        `  Status: ${
          validation.isValid ? chalk.green("✅ Valid") : chalk.red("❌ Invalid")
        }`
      );

      if (validation.errors.length > 0) {
        console.log(chalk.red("\nErrors:"));
        validation.errors.forEach((error: string) => {
          console.log(`  ❌ ${error}`);
        });
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow("\nWarnings:"));
        validation.warnings.forEach((warning: string) => {
          console.log(`  ⚠️  ${warning}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error validating tier: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Migrate resources to a new tier
   */
  async migrateTier(
    currentTier: PlanTier,
    targetTier: PlanTier
  ): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🚀 Migrating from ${currentTier.toUpperCase()} to ${targetTier.toUpperCase()} Tier\n`
        )
      );

      // Perform migration
      const result = await this.migrationManager.executeMigration(
        this.options.companyName,
        currentTier,
        targetTier,
        this.options.namespace
      );

      if (result.success) {
        console.log(chalk.green("Migration successful!"));
        if (result.duration) {
          console.log(`  Duration: ${result.duration}`);
        }
        if (result.details) {
          console.log(
            `  Steps Executed: ${result.details.stepsExecuted || "N/A"}`
          );
          if (result.details.costImpact) {
            const impact = result.details.costImpact;
            console.log(`  Cost Change: $${impact.difference}/month`);
          }
        }
      } else {
        console.error(chalk.red("Migration failed!"));
        if (result.error) {
          console.error(`  Error: ${result.error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error during migration: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Plan a tier migration
   */
  async planMigration(fromTier: PlanTier, toTier: PlanTier): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🚀 Planning Migration: ${fromTier.toUpperCase()} → ${toTier.toUpperCase()}\n`
        )
      );

      const plan = await this.migrationManager.planMigration(
        this.options.companyName,
        fromTier,
        toTier,
        this.options.namespace
      );

      console.log(chalk.yellow("📋 Migration Plan:"));
      console.log(`  Company: ${plan.companyName}`);
      console.log(`  From Tier: ${plan.fromTier.toUpperCase()}`);
      console.log(`  To Tier: ${plan.toTier.toUpperCase()}`);
      console.log(`  Namespace: ${plan.namespace}`);
      console.log(`  Type: ${plan.migrationType.toUpperCase()}`);
      console.log(`  Estimated Duration: ${plan.estimatedDuration}`);
      console.log(
        `  Requires Downtime: ${plan.requiresDowntime ? "Yes" : "No"}`
      );

      if (plan.costImpact) {
        console.log(chalk.yellow("\n💰 Cost Impact:"));
        console.log(
          `  Current Monthly Cost: $${plan.costImpact.currentMonthlyCost}`
        );
        console.log(`  New Monthly Cost: $${plan.costImpact.newMonthlyCost}`);
        const change = plan.costImpact.difference;
        const changeColor =
          change > 0 ? chalk.red : change < 0 ? chalk.green : chalk.gray;
        console.log(
          `  Difference: ${changeColor(
            `${change > 0 ? "+" : ""}$${change}/month`
          )}`
        );
      }

      if (plan.preChecks.length > 0) {
        console.log(chalk.yellow("\n✅ Pre-checks:"));
        plan.preChecks.forEach((check) => {
          console.log(`  • ${check}`);
        });
      }

      if (plan.steps.length > 0) {
        console.log(chalk.yellow("\n📝 Migration Steps:"));
        plan.steps.forEach((step, index) => {
          console.log(`  ${index + 1}. ${step}`);
        });
      }

      if (plan.warnings.length > 0) {
        console.log(chalk.yellow("\n⚠️  Warnings:"));
        plan.warnings.forEach((warning) => {
          console.log(`  • ${warning}`);
        });
      }

      if (plan.rollbackSteps.length > 0) {
        console.log(chalk.yellow("\n🔄 Rollback Steps:"));
        plan.rollbackSteps.forEach((step, index) => {
          console.log(`  ${index + 1}. ${step}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error planning migration: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Execute a tier migration
   */
  async executeMigration(
    fromTier: PlanTier,
    toTier: PlanTier,
    options: {
      dryRun?: boolean;
      force?: boolean;
      skipPreChecks?: boolean;
    } = {}
  ): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🚀 ${
            options.dryRun ? "Simulating" : "Executing"
          } Migration: ${fromTier.toUpperCase()} → ${toTier.toUpperCase()}\n`
        )
      );

      if (options.dryRun) {
        console.log(
          chalk.yellow("🔍 DRY RUN MODE - No actual changes will be made")
        );
      }

      const result = await this.migrationManager.executeMigration(
        this.options.companyName,
        fromTier,
        toTier,
        this.options.namespace,
        options
      );

      if (result.success) {
        console.log(chalk.green.bold(`\n✅ Migration completed successfully!`));
        if (result.duration) {
          console.log(`Duration: ${result.duration}`);
        }

        if (result.details) {
          console.log(chalk.yellow("\n📊 Migration Details:"));
          console.log(`  From Tier: ${result.details.fromTier?.toUpperCase()}`);
          console.log(`  To Tier: ${result.details.toTier?.toUpperCase()}`);
          if (result.details.stepsExecuted) {
            console.log(`  Steps Executed: ${result.details.stepsExecuted}`);
          }
          if (result.details.costImpact) {
            const impact = result.details.costImpact;
            console.log(`  Cost Change: $${impact.difference}/month`);
          }
        }
      } else {
        console.error(chalk.red.bold(`\n❌ Migration failed!`));
        if (result.error) {
          console.error(`Error: ${result.error}`);
        }
        if (result.rollbackRequired) {
          console.error(chalk.yellow("🔄 Rollback may be required"));
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error executing migration: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Validate a tier migration
   */
  async validateMigration(
    fromTier: PlanTier,
    toTier: PlanTier,
    options: {
      checkResourceUsage?: boolean;
      checkClusterCapacity?: boolean;
    } = {}
  ): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🔍 Validating Migration: ${fromTier.toUpperCase()} → ${toTier.toUpperCase()}\n`
        )
      );

      const validation = await this.migrationManager.validateMigration(
        this.options.companyName,
        fromTier,
        toTier,
        this.options.namespace,
        options
      );

      console.log(
        `Validation Status: ${
          validation.isValid ? chalk.green("✅ Valid") : chalk.red("❌ Invalid")
        }`
      );

      if (validation.errors.length > 0) {
        console.log(chalk.red("\n❌ Errors:"));
        validation.errors.forEach((error) => {
          console.log(`  • ${error}`);
        });
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow("\n⚠️  Warnings:"));
        validation.warnings.forEach((warning) => {
          console.log(`  • ${warning}`);
        });
      }

      if (validation.recommendations.length > 0) {
        console.log(chalk.blue("\n💡 Recommendations:"));
        validation.recommendations.forEach((recommendation) => {
          console.log(`  • ${recommendation}`);
        });
      }

      if (!validation.isValid) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error validating migration: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Rollback a tier migration
   */
  async rollbackMigration(fromTier: PlanTier, toTier: PlanTier): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🔄 Rolling back Migration: ${toTier.toUpperCase()} → ${fromTier.toUpperCase()}\n`
        )
      );

      const result = await this.migrationManager.rollbackMigration(
        this.options.companyName,
        fromTier,
        toTier,
        this.options.namespace
      );

      if (result.success) {
        console.log(chalk.green.bold(`\n✅ Rollback completed successfully!`));
        if (result.duration) {
          console.log(`Duration: ${result.duration}`);
        }
      } else {
        console.error(chalk.red.bold(`\n❌ Rollback failed!`));
        if (result.error) {
          console.error(`Error: ${result.error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error rolling back migration: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Show possible migration paths from a tier
   */
  async showMigrationPaths(tier: PlanTier): Promise<void> {
    try {
      console.log(
        chalk.blue.bold(
          `\n🛤️  Migration Paths from ${tier.toUpperCase()} Tier\n`
        )
      );

      const paths = this.migrationManager.getPossibleMigrations(tier);

      if (paths.length === 0) {
        console.log(
          chalk.yellow("No migration paths available from this tier.")
        );
        return;
      }

      paths.forEach((path) => {
        const arrow = path.migrationType === "upgrade" ? "⬆️" : "⬇️";
        const complexity =
          path.complexity === "low"
            ? chalk.green("Low")
            : path.complexity === "medium"
            ? chalk.yellow("Medium")
            : chalk.red("High");

        console.log(
          `${arrow} ${tier.toUpperCase()} → ${path.targetTier.toUpperCase()}`
        );
        console.log(`   Type: ${path.migrationType.toUpperCase()}`);
        console.log(`   Complexity: ${complexity}`);
        console.log(`   Estimated Duration: ${path.estimatedDuration}`);
        console.log("");
      });
    } catch (error) {
      console.error(chalk.red(`Error showing migration paths: ${error}`));
      process.exit(1);
    }
  }
}

/**
 * Add tier management commands to yargs
 */
export function addTierCommands(yargs: any, logger?: Logger) {
  const defaultLogger: Logger = {
    info: (message: string) => console.log(`[INFO] ${message}`),
    warn: (message: string) => console.warn(`[WARN] ${message}`),
    error: (message: string) => console.error(`[ERROR] ${message}`),
    debug: (message: string) => console.debug(`[DEBUG] ${message}`),
  };

  const commandLogger = logger || defaultLogger;

  return yargs.command(
    "tiers",
    "Manage tier-based resource allocation",
    (yargs: any) =>
      yargs
        .command(
          "list",
          "Show available tiers and their specifications",
          {},
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.showTiers();
          }
        )
        .command(
          "calculate <tier>",
          "Calculate resource allocation for a specific tier",
          (yargs: any) =>
            yargs.positional("tier", {
              describe: "Plan tier to calculate",
              type: "string",
              choices: Object.keys(PLAN_TIER_DEFINITIONS),
            }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.calculateTier(args.tier as PlanTier);
          }
        )
        .command(
          "validate <tier>",
          "Validate tier configuration",
          (yargs: any) =>
            yargs.positional("tier", {
              describe: "Tier to validate",
              type: "string",
              choices: Object.keys(PLAN_TIER_DEFINITIONS),
            }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.validateTier(args.tier as PlanTier);
          }
        )
        .command(
          "migrate <currentTier> <targetTier>",
          "Migrate resources to a new tier",
          (yargs: any) =>
            yargs
              .positional("currentTier", {
                describe: "Current plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .positional("targetTier", {
                describe: "Target plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.migrateTier(
              args.currentTier as PlanTier,
              args.targetTier as PlanTier
            );
          }
        )
        .command(
          "plan-migration <fromTier> <toTier>",
          "Plan a migration from one tier to another",
          (yargs: any) =>
            yargs
              .positional("fromTier", {
                describe: "Current plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .positional("toTier", {
                describe: "Target plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.planMigration(
              args.fromTier as PlanTier,
              args.toTier as PlanTier
            );
          }
        )
        .command(
          "execute-migration <fromTier> <toTier>",
          "Execute a migration from one tier to another",
          (yargs: any) =>
            yargs
              .positional("fromTier", {
                describe: "Current plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .positional("toTier", {
                describe: "Target plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .option("dry-run", {
                describe: "Simulate the migration without making changes",
                type: "boolean",
                default: false,
              })
              .option("force", {
                describe: "Force the migration, skipping confirmation",
                type: "boolean",
                default: false,
              })
              .option("skip-pre-checks", {
                describe: "Skip pre-migration checks",
                type: "boolean",
                default: false,
              }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.executeMigration(
              args.fromTier as PlanTier,
              args.toTier as PlanTier,
              {
                dryRun: args.dryRun,
                force: args.force,
                skipPreChecks: args.skipPreChecks,
              }
            );
          }
        )
        .command(
          "validate-migration <fromTier> <toTier>",
          "Validate a migration from one tier to another",
          (yargs: any) =>
            yargs
              .positional("fromTier", {
                describe: "Current plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .positional("toTier", {
                describe: "Target plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .option("check-resource-usage", {
                describe: "Check resource usage for the migration",
                type: "boolean",
                default: true,
              })
              .option("check-cluster-capacity", {
                describe: "Check cluster capacity for the migration",
                type: "boolean",
                default: true,
              }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.validateMigration(
              args.fromTier as PlanTier,
              args.toTier as PlanTier,
              {
                checkResourceUsage: args.checkResourceUsage,
                checkClusterCapacity: args.checkClusterCapacity,
              }
            );
          }
        )
        .command(
          "rollback-migration <fromTier> <toTier>",
          "Rollback a migration from one tier to another",
          (yargs: any) =>
            yargs
              .positional("fromTier", {
                describe: "Current plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              })
              .positional("toTier", {
                describe: "Target plan tier",
                type: "string",
                choices: Object.keys(PLAN_TIER_DEFINITIONS),
              }),
          async (args: any) => {
            const commands = new TierCommands({
              ...args,
              logger: commandLogger,
            });
            await commands.rollbackMigration(
              args.fromTier as PlanTier,
              args.toTier as PlanTier
            );
          }
        )
        .option("company-name", {
          describe: "Company name for tier operations",
          type: "string",
          demandOption: true,
        })
        .option("stack-name", {
          describe: "Pulumi stack name",
          type: "string",
          demandOption: true,
        })
        .option("namespace", {
          describe: "Kubernetes namespace (for shared deployments)",
          type: "string",
        })
        .option("kubeconfig", {
          describe: "Path to kubeconfig file",
          type: "string",
        })
        .option("kubecost-url", {
          describe: "Kubecost server URL",
          type: "string",
        })
        .demandCommand(1, "Please specify a tier command")
  );
}
