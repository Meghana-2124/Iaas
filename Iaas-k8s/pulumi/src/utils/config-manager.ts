import { automation } from "@pulumi/pulumi";
import type {
  AwsCloudConfig,
  GcpCloudConfig,
  CloudConfig,
  Logger,
} from "../types/index.js";
import * as pulumi from "@pulumi/pulumi";
import { validateAndProcessSecrets } from "./validation.js";

export interface PulumiConfigSetup {
  stackName: string;
  cloudProvider: "aws" | "gcp";
  companyName: string;
  cloudConfig: CloudConfig;
  secretsJson: string;
}

export class PulumiConfigManager {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Automatically setup Pulumi configuration based on deployment options
   */
  async setupPulumiConfig(
    workDir: string,
    stack: automation.Stack,
    options: PulumiConfigSetup
  ): Promise<void> {
    this.logger.info(
      `🔧 Setting up Pulumi configuration for stack: ${options.stackName}`
    );

    try {
      // Set core configuration
      await this.setBasicConfig(stack, options);

      // Set cloud provider specific configuration
      if (options.cloudProvider === "aws") {
        await this.setAwsConfig(stack, options.cloudConfig as AwsCloudConfig);
      } else if (options.cloudProvider === "gcp") {
        await this.setGcpConfig(stack, options.cloudConfig as GcpCloudConfig);
      }

      // Set Helm configuration
      await this.setHelmConfig(stack, options); // Set Helm configuration (secrets only now)

      this.logger.info("✅ Pulumi configuration setup completed");
    } catch (error) {
      this.logger.error("❌ Failed to setup Pulumi configuration:", error);
      throw new Error(
        `Configuration setup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Setup basic Pulumi configuration
   */
  private async setBasicConfig(
    stack: automation.Stack,
    options: PulumiConfigSetup
  ): Promise<void> {
    this.logger.debug("Setting basic configuration...");

    await stack.setConfig("iaas:cloudProvider", {
      value: options.cloudProvider,
    });
    await stack.setConfig("companyName", { value: options.companyName });

    this.logger.debug(`✓ Set cloudProvider: ${options.cloudProvider}`);
    this.logger.debug(`✓ Set companyName: ${options.companyName}`);
  }

  /**
   * Setup AWS-specific configuration
   */
  private async setAwsConfig(
    stack: automation.Stack,
    config: AwsCloudConfig
  ): Promise<void> {
    this.logger.debug("Setting AWS configuration...");

    await stack.setConfig("aws:region", { value: config.region });
    this.logger.debug(`✓ Set AWS region: ${config.region}`);

    if (config.profile) {
      await stack.setConfig("aws:profile", { value: config.profile });
      this.logger.debug(`✓ Set AWS profile: ${config.profile}`);
    }

    if (config.accessKeyId && config.secretAccessKey) {
      await stack.setConfig("aws:accessKey", {
        value: config.accessKeyId,
        secret: false,
      });
      await stack.setConfig("aws:secretKey", {
        value: config.secretAccessKey,
        secret: true,
      });
      this.logger.debug("✓ Set AWS access credentials");
    }
  }

  /**
   * Setup GCP-specific configuration
   */
  private async setGcpConfig(
    stack: automation.Stack,
    config: GcpCloudConfig
  ): Promise<void> {
    this.logger.debug("Setting GCP configuration...");

    await stack.setConfig("gcp:project", { value: config.project });
    await stack.setConfig("gcp:region", { value: config.region });

    this.logger.debug(`✓ Set GCP project: ${config.project}`);
    this.logger.debug(`✓ Set GCP region: ${config.region}`);

    if (config.zone) {
      await stack.setConfig("gcp:zone", { value: config.zone });
      this.logger.debug(`✓ Set GCP zone: ${config.zone}`);
    }

    if (config.credentials) {
      let credentialsValue: string;

      // Handle different types of credentials input
      if (typeof config.credentials === "object") {
        credentialsValue = JSON.stringify(config.credentials);
        this.logger.debug("✓ Set GCP credentials from JSON object");
      } else if (typeof config.credentials === "string") {
        const isFilePath = !config.credentials.startsWith("{");

        if (isFilePath) {
          // If it's a file path, try to read the file
          try {
            const fs = await import("fs");
            const path = await import("path");

            // Resolve path relative to the current working directory
            const fullPath = path.resolve(process.cwd(), config.credentials);

            // Set GOOGLE_APPLICATION_CREDENTIALS environment variable
            process.env.GOOGLE_APPLICATION_CREDENTIALS = fullPath;
            this.logger.debug(
              `✓ Set GOOGLE_APPLICATION_CREDENTIALS to: ${fullPath}`
            );

            pulumi.log.info(
              `Using GCP credentials from file path: ${fullPath}`
            );
            credentialsValue = fs.readFileSync(fullPath, "utf8");
            this.logger.debug("✓ Set GCP credentials from file path");
          } catch (error) {
            this.logger.error(
              `Failed to read credentials file: ${config.credentials}`
            );
            throw new Error(
              `Failed to read GCP credentials file: ${config.credentials}`
            );
          }
        } else {
          credentialsValue = config.credentials;
          this.logger.debug("✓ Set GCP credentials from JSON string");
        }
      }

      await stack.setConfig("gcp:credentials", {
        value: credentialsValue!,
        secret: true,
      });
    }
  }

  /**
   * Setup Helm configuration
   */
  private async setHelmConfig(
    stack: automation.Stack,
    options: PulumiConfigSetup
  ): Promise<void> {
    this.logger.debug("Setting Helm configuration...");

    // Validate and process secrets for stringData usage (no base64 encoding needed)
    this.logger.debug(
      "Validating and processing secrets for Kubernetes stringData..."
    );
    const secretsValidation = validateAndProcessSecrets(options.secretsJson);

    if (!secretsValidation.isValid) {
      const errorMessages = secretsValidation.errors
        .map((e: any) => `${e.field}: ${e.message}`)
        .join(", ");
      throw new Error(`Secrets validation failed: ${errorMessages}`);
    }

    // Log processing report if available
    if (secretsValidation.processingReport) {
      const processingStats = Object.entries(
        secretsValidation.processingReport
      ).reduce((acc, [key, status]) => {
        acc[status as string] = (acc[status as string] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      this.logger.debug(
        `Secret processing complete: ${JSON.stringify(processingStats)}`
      );
    }

    // Set Helm secrets for stringData usage (plain text, no base64 encoding)
    await stack.setConfig("helmSecretsJson", {
      value: secretsValidation.processedSecretsJson,
      secret: true,
    });
    this.logger.debug("✓ Set Helm secrets configuration for stringData usage");

    // helmChartPath removed: always using bundled chart
  }
}
