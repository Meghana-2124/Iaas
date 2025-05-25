#!/usr/bin/env node

import { handleDeployment, DeploymentOptions } from "../index.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// CLI entry point with auto-setup-config support
async function main() {
  const argv = yargs(hideBin(process.argv))
    .scriptName("iaas-deploy")
    .usage("$0 <action> <stackName> [options]")
    .command(
      "$0 <action> <stackName>",
      "Run a Pulumi deployment action",
      (yargs) =>
        yargs
          .positional("action", {
            describe:
              "Deployment action (up, preview, destroy, outputs, refresh)",
            type: "string",
            choices: [
              "up",
              "preview",
              "destroy",
              "outputs",
              "refresh",
              "rollback",
            ],
          })
          .positional("stackName", {
            describe: "Pulumi stack name",
            type: "string",
          })
          .option("companyName", {
            describe: "Company name for resource naming",
            type: "string",
            demandOption: true,
          })
          .option("secretsJson", {
            describe: "JSON string of secrets",
            type: "string",
            demandOption: true,
          })
          .option("valuesJson", {
            describe: "JSON string of values",
            type: "string",
          })
          .option("cloudProvider", {
            describe: "Cloud provider (aws or gcp)",
            type: "string",
            choices: ["aws", "gcp"],
          })
          .option("cloudConfig", {
            describe: "Cloud config as JSON string (see docs)",
            type: "string",
          })
          .option("autoSetupConfig", {
            describe: "Automatically setup Pulumi config for the stack",
            type: "boolean",
            default: false,
          })
          .option("helmChartPath", {
            describe: "Path to custom Helm chart",
            type: "string",
          })
          .option("logLevel", {
            describe: "Log level",
            type: "string",
            choices: ["debug", "info", "warn", "error", "silent"],
          })
          .option("validateConfig", {
            describe: "Validate configuration before deployment",
            type: "boolean",
            default: true,
          })
          .option("enableRollback", {
            describe: "Enable automatic rollback on failure",
            type: "boolean",
            default: true,
          })
          .option("timeout", {
            describe: "Deployment timeout in seconds",
            type: "number",
          })
          .help(),
      async (args) => {
        // Parse cloudConfig JSON if provided
        let cloudConfig = undefined;
        if (args.cloudConfig) {
          try {
            cloudConfig = JSON.parse(args.cloudConfig);
          } catch (e) {
            console.error("Invalid cloudConfig JSON:", e);
            process.exit(1);
          }
        }
        const options: DeploymentOptions = {
          action: args.action as any,
          stackName: args.stackName || "", // fallback to empty string for type safety
          secretsJson: args.secretsJson,
          valuesJson: args.valuesJson,
          companyName: args.companyName,
          cloudProvider: args.cloudProvider as any,
          cloudConfig,
          autoSetupConfig: args.autoSetupConfig,
          helmChartPath: args.helmChartPath,
          logLevel: args.logLevel as any,
          validateConfig: args.validateConfig,
          enableRollback: args.enableRollback,
          timeout: args.timeout,
        };
        try {
          const result = await handleDeployment(options);
          if (result.success) {
            console.log("Deployment successful!");
            if (result.outputs) {
              console.log("Outputs:", JSON.stringify(result.outputs, null, 2));
            }
          } else {
            console.error("Deployment failed:", result.error);
            process.exit(1);
          }
        } catch (err) {
          console.error("Deployment error:", err);
          process.exit(1);
        }
      }
    )
    .help()
    .alias("h", "help")
    .epilog(
      "--autoSetupConfig: If set, the CLI will automatically configure the Pulumi stack for you (cloud provider, region, etc). " +
        "You can also pass --cloudConfig as a JSON string for advanced cloud setup."
    )
    .strict();

  await argv.parseAsync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
