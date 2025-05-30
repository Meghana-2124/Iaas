#!/usr/bin/env node

import { handleDeployment, DeploymentOptions } from "../index.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { addTierCommands } from "./tier-commands.js";
import { Logger } from "../types/index.js";
import { PlanTier } from "../types/plans.js";

// Simple console logger for CLI
const consoleLogger: Logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  debug: (message: string) => console.debug(`[DEBUG] ${message}`),
};

// CLI entry point with auto-setup-config support
async function main() {
  const argv = addTierCommands(yargs(hideBin(process.argv)), consoleLogger)
    .scriptName("iaas-deploy")
    .usage("$0 <action> <stackName> [options]")
    .command(
      "$0 <action> <stackName>",
      "Run a Pulumi deployment action",
      (yargs: any) =>
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
          .option("namespace", {
            describe:
              "Kubernetes namespace for shared deployments (auto-generated if not provided)",
            type: "string",
          })
          .option("deploymentType", {
            describe:
              "Deployment type: shared (namespace-based) or dedicated (separate cluster)",
            type: "string",
            choices: ["shared", "dedicated"],
            default: "dedicated",
          })
          .option("planTier", {
            describe:
              "Plan tier for shared deployments (basic, standard, premium, enterprise)",
            type: "string",
            choices: ["basic", "standard", "premium", "enterprise"],
          })
          .option("kubecostEnabled", {
            describe: "Enable Kubecost cost tracking and monitoring",
            type: "boolean",
            default: false,
          })
          .option("defaultDomain", {
            describe:
              "Default domain for constructing hostnames (e.g., 'example.com')",
            type: "string",
            required: true,
          })
          .option("authDomain", {
            describe:
              "Domain for the authentication service (e.g., 'auth.example.com')",
            type: "string",
            required: true,
          })
          .option("openPaymentsDomain", {
            describe:
              "Domain for the Open Payments service (e.g., 'ilp.example.com')",
            type: "string",
            required: true,
          })
         .option("connectorDomain", {
            describe:
              "Domain for the connector service (e.g., 'ilp-connector.example.com')",
            type: "string",
            required: true,
          })
          .option("enableRafikiAuth", {
            describe: "Enable rafiki-auth service",
            type: "boolean",
            default: true,
          })
          .option("enableRafikiBackend", {
            describe: "Enable rafiki-backend service",
            type: "boolean",
            default: true,
          })
          .option("enableNginx", {
            describe: "Enable nginx service",
            type: "boolean",
            default: true,
          })
          .option("enableRedis", {
            describe: "Enable redis service",
            type: "boolean",
            default: true,
          })
          .option("rafikiAuthImageRepository", {
            describe: "Docker repository for rafiki-auth image",
            type: "string",
            default: "ghcr.io/interledger/rafiki-auth",
          })
          .option("rafikiAuthImageTag", {
            describe: "Docker tag for rafiki-auth image",
            type: "string",
            default: "v1.0.0-alpha.20",
          })
          .option("rafikiBackendImageRepository", {
            describe: "Docker repository for rafiki-backend image",
            type: "string",
            default: "ghcr.io/interledger/rafiki-backend",
          })
          .option("rafikiBackendImageTag", {
            describe: "Docker tag for rafiki-backend image",
            type: "string",
            default: "v1.0.0-alpha.20",
          })
          .option("nginxImageRepository", {
            describe: "Docker repository for nginx image",
            type: "string",
            default: "nginx",
          })
          .option("nginxImageTag", {
            describe: "Docker tag for nginx image",
            type: "string",
            default: "latest",
          })
          .option("redisImageRepository", {
            describe: "Docker repository for redis image",
            type: "string",
            default: "redis",
          })
          .option("redisImageTag", {
            describe: "Docker tag for redis image",
            type: "string",
            default: "7-alpine",
          })
          .option("ingressClassName", {
            describe: "Ingress class name for the Ingress resource",
            type: "string",
            default: "nginx",
          })
          .option("dedicatedDeploymentHpaEnabledByDefault", {
            describe: "Enable HPA by default for dedicated deployments",
            type: "boolean",
            default: true,
          })
          .option("sharedDeploymentNetworkPolicyEnabled", {
            describe: "Enable network policies for shared deployments",
            type: "boolean",
            default: true,
          })
          .option("ingressControllerNamespace", {
            describe: "Namespace of the ingress controller",
            type: "string",
            default: "ingress-nginx",
          })
          .help(),
      async (args: any) => {
        // Add logger to args for tier commands
        args.logger = consoleLogger;

        // Prefer file input if provided
        let secretsJson = args.secretsJson || "{}"; // Default to empty JSON if not provided
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
          companyName: args.companyName,
          cloudProvider: args.cloudProvider as any,
          cloudConfig,
          autoSetupConfig: args.autoSetupConfig,
          helmChartPath: args.helmChartPath,
          logLevel: args.logLevel as any,
          validateConfig: args.validateConfig,
          enableRollback: args.enableRollback,
          timeout: args.timeout,
          namespace: args.namespace,
          deploymentType: args.deploymentType as "shared" | "dedicated",
          planTier: args.planTier as any,
          kubecostEnabled: args.kubecostEnabled,

          // Dynamic Helm values configuration
          defaultDomain: args.defaultDomain,  
          authDomain: args.authDomain,
          openPaymentsDomain: args.openPaymentsDomain,
          connectorDomain: args.connectorDomain,
          enableRafikiAuth: args.enableRafikiAuth,
          enableRafikiBackend: args.enableRafikiBackend,
          enableNginx: args.enableNginx,
          enableRedis: args.enableRedis,
          rafikiAuthImage: {
            repository: args.rafikiAuthImageRepository,
            tag: args.rafikiAuthImageTag,
            pullPolicy: "IfNotPresent",
          },
          rafikiBackendImage: {
            repository: args.rafikiBackendImageRepository,
            tag: args.rafikiBackendImageTag,
            pullPolicy: "IfNotPresent",
          },
          nginxImage: {
            repository: args.nginxImageRepository,
            tag: args.nginxImageTag,
            pullPolicy: "IfNotPresent",
          },
          redisImage: {
            repository: args.redisImageRepository,
            tag: args.redisImageTag,
            pullPolicy: "IfNotPresent",
          },
          ingressClassName: args.ingressClassName,
          dedicatedDeploymentHpaEnabledByDefault:
            args.dedicatedDeploymentHpaEnabledByDefault,
          sharedDeploymentNetworkPolicyEnabled:
            args.sharedDeploymentNetworkPolicyEnabled,
          ingressControllerNamespace: args.ingressControllerNamespace,
          ingressControllerPodSelectorLabels: {
            "app.kubernetes.io/name": "ingress-nginx",
          },
          allowedExternalEgressRules: [
            {
              cidr: "0.0.0.0/0",
              ports: [
                { port: 53, protocol: "UDP" }, // DNS
                { port: 53, protocol: "TCP" }, // DNS over TCP
                { port: 443, protocol: "TCP" }, // HTTPS
                { port: 5432, protocol: "TCP" }, // PostgreSQL
                { port: 6379, protocol: "TCP" }, // Redis
              ],
            },
          ],
        };
        try {
          await handleDeployment(options);
        } catch (err) {
          process.exit(1);
        }
      }
    )
    .help()
    .alias("h", "help")
    .epilog(
      "--autoSetupConfig: If set, the CLI will automatically configure the Pulumi stack for you (cloud provider, region, etc). " +
        "You can also pass --cloudConfig as a JSON string or --cloudConfigFile as a JSON file for advanced cloud setup.\n" +
        "--secretsFile/--valuesFile: Use these to provide secrets/values as JSON files instead of raw JSON strings. " +
        "valuesFile is now optional and used only for overrides after dynamic Helm values generation. " +
        "If both a file and a string are provided, the file takes precedence."
    )
    .strict();

  await argv.parseAsync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
