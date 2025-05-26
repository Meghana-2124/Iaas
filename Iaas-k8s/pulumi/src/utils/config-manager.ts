import { automation } from "@pulumi/pulumi";
import type {
  DeploymentOptions,
  AwsCloudConfig,
  GcpCloudConfig,
  CloudConfig,
  Logger,
} from "../types/index.js";
import { validateAndEncodeSecrets } from "./validation.js";

export interface PulumiConfigSetup {
  stackName: string;
  cloudProvider: "aws" | "gcp";
  companyName: string;
  cloudConfig: CloudConfig;
  secretsJson: string;
  valuesJson?: string;
  helmChartPath?: string;
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
      await this.setHelmConfig(stack, options);

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
      // Check if it's a file path or JSON content
      const isFilePath = !config.credentials.startsWith("{");

      if (isFilePath) {
        await stack.setConfig("gcp:credentials", { value: config.credentials });
        this.logger.debug("✓ Set GCP credentials file path");
      } else {
        await stack.setConfig("gcp:credentials", {
          value: config.credentials,
          secret: true,
        });
        this.logger.debug("✓ Set GCP credentials JSON");
      }
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

    // Validate and encode secrets before setting them
    this.logger.debug("Validating and encoding secrets for Kubernetes...");
    const secretsValidation = validateAndEncodeSecrets(options.secretsJson);

    if (!secretsValidation.isValid) {
      const errorMessages = secretsValidation.errors
        .map((e) => `${e.field}: ${e.message}`)
        .join(", ");
      throw new Error(`Secrets validation failed: ${errorMessages}`);
    }

    // Log encoding report if available
    if (secretsValidation.encodingReport) {
      const encodingStats = Object.entries(
        secretsValidation.encodingReport
      ).reduce((acc, [key, status]) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      this.logger.debug(
        `Secret encoding complete: ${JSON.stringify(encodingStats)}`
      );
    }

    // Set Helm secrets with base64 encoding
    await stack.setConfig("helmSecretsJson", {
      value: secretsValidation.encodedSecretsJson,
      secret: true,
    });
    this.logger.debug("✓ Set Helm secrets configuration with base64 encoding");

    if (options.valuesJson) {
      await stack.setConfig("helmValuesJson", { value: options.valuesJson });
      this.logger.debug("✓ Set Helm values configuration");
    }

    if (options.helmChartPath) {
      await stack.setConfig("helmChartPath", { value: options.helmChartPath });
      this.logger.debug(`✓ Set Helm chart path: ${options.helmChartPath}`);
    }
  }

  /**
   * Detect cloud provider from environment or configuration
   */
  static detectCloudProvider(): "aws" | "gcp" | null {
    // Check environment variables
    if (
      process.env.AWS_REGION ||
      process.env.AWS_PROFILE ||
      process.env.AWS_ACCESS_KEY_ID
    ) {
      return "aws";
    }

    if (
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GCLOUD_PROJECT
    ) {
      return "gcp";
    }

    return null;
  }

  /**
   * Create default cloud configuration based on environment
   */
  static createDefaultCloudConfig(cloudProvider: "aws" | "gcp"): CloudConfig {
    if (cloudProvider === "aws") {
      return {
        region: process.env.AWS_REGION || "us-east-1",
        profile: process.env.AWS_PROFILE,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      } as AwsCloudConfig;
    } else {
      return {
        project:
          process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "",
        region: process.env.GCLOUD_REGION || "us-central1",
        zone: process.env.GCLOUD_ZONE || "us-central1-a",
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      } as GcpCloudConfig;
    }
  }

  /**
   * Validate cloud configuration
   */
  static validateCloudConfig(
    cloudProvider: "aws" | "gcp",
    config: CloudConfig
  ): string[] {
    const errors: string[] = [];

    if (cloudProvider === "aws") {
      const awsConfig = config as AwsCloudConfig;
      if (!awsConfig.region) {
        errors.push("AWS region is required");
      }
    } else if (cloudProvider === "gcp") {
      const gcpConfig = config as GcpCloudConfig;
      if (!gcpConfig.project) {
        errors.push("GCP project is required");
      }
      if (!gcpConfig.region) {
        errors.push("GCP region is required");
      }
    }

    return errors;
  }
}
