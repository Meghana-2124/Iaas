import yargs from "yargs";
import { TierCalculator } from "../utils/tier-calculator.js";
import { PlanTier, PLAN_TIER_DEFINITIONS } from "../types/plans.js";
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

  constructor(private options: TierCommandOptions) {
    this.calculator = new TierCalculator(options.logger);
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
}

/**
 * Add tier management commands to yargs
 */
export function addTierCommands(yargs: any) {
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
            const commands = new TierCommands(args);
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
            const commands = new TierCommands(args);
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
            const commands = new TierCommands(args);
            await commands.validateTier(args.tier as PlanTier);
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
