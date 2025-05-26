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
            demandOption: true,
          })
          .option("companyName", {
            describe: "Company name for resource naming",
            type: "string",
            demandOption: true,
          })
          .option("secretsJson", {
            describe: "JSON string of secrets",
            type: "string",
          })
          .option("valuesJson", {
            describe: "JSON string of values",
            type: "string",
          })
          .option("cloudProvider", {
            describe: "Cloud provider (aws or gcp)",
            type: "string",
            choices: ["aws", "gcp"],
            demandOption: true,
          })
          .option("cloudConfig", {
            describe: "Cloud config as JSON string (see docs)",
            type: "string",
          })
          .option("cloudConfigFile", {
            describe: "Path to cloud config JSON file",
            type: "string",
            demandOption: true,
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
          .option("secretsFile", {
            describe: "Path to secrets JSON file",
            type: "string",
            demandOption: true,
          })
          .option("valuesFile", {
            describe: "Path to values JSON file",
            type: "string",
            demandOption: true,
          })
          .help(),
      async (args) => {
        // Prefer file input if provided
        let secretsJson = args.secretsJson || "{}"; // Default to empty JSON if not provided
        let valuesJson = args.valuesJson || "{}"; // Default to empty JSON if not provided
        let cloudConfig = undefined as any; // Default to undefined if not provided
        const fs = await import("fs");
        if (args.secretsFile) {
          try {
            secretsJson = fs.readFileSync(args.secretsFile, "utf8");
          } catch (e) {
            console.error(
              `Failed to read secrets file: ${args.secretsFile}\n${e}`
            );
            process.exit(1);
          }
        }
        if (args.valuesFile) {
          try {
            valuesJson = fs.readFileSync(args.valuesFile, "utf8");
          } catch (e) {
            console.error(
              `Failed to read values file: ${args.valuesFile}\n${e}`
            );
            process.exit(1);
          }
        }
        // Prefer cloudConfigFile if provided
        if (args.cloudConfigFile) {
          try {
            const fileContent = fs.readFileSync(args.cloudConfigFile, "utf8");
            cloudConfig = JSON.parse(fileContent);
          } catch (e) {
            console.error(
              `Failed to read cloud config file: ${args.cloudConfigFile}\n${e}`
            );
            process.exit(1);
          }
        } else if (args.cloudConfig) {
          try {
            cloudConfig = JSON.parse(args.cloudConfig);
          } catch (e) {
            console.error("Invalid cloudConfig JSON:", e);
            process.exit(1);
          }
        }
        const options: DeploymentOptions = {
          action: args.action as any,
          stackName: args.stackName || "",
          secretsJson,
          valuesJson,
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
        "You can also pass --cloudConfig as a JSON string or --cloudConfigFile as a JSON file for advanced cloud setup.\n" +
        "--secretsFile/--valuesFile: Use these to provide secrets/values as JSON files instead of raw JSON strings. If both a file and a string are provided, the file takes precedence."
    )
    .strict();

  await argv.parseAsync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
