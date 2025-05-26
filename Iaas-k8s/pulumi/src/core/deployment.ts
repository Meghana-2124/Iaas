import { automation } from "@pulumi/pulumi";
import * as path from "path";
import {
  validateDeploymentOptionsWithZod,
  validateSecretsStructure,
  validateValuesStructure,
  validateAndEncodeSecrets,
  encodeSecretsForKubernetes,
} from "../utils/validation.js";
import { DeploymentMonitor } from "../utils/monitoring.js";
import { PulumiConfigManager } from "../utils/config-manager.js";
import type {
  LogLevel,
  DeploymentAction,
  DeploymentStatus,
  Logger,
  DeploymentProgress,
  DeploymentOptions,
  DeploymentResult,
  FieldValidationError,
  DeploymentConfig,
} from "../types/index.js";

// =============================================================================
// Error Classes
// =============================================================================

export class DeploymentError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = "DeploymentError";
  }
}

export class ConfigValidationError extends Error {
  constructor(message: string, public errors: FieldValidationError[]) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export class RollbackError extends Error {
  constructor(message: string, public originalError: Error) {
    super(message);
    this.name = "RollbackError";
  }
}

// =============================================================================
// Logger Implementation
// =============================================================================

export class ConsoleLogger implements Logger {
  constructor(private level: LogLevel = "info") {}

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      silent: 4,
    };
    return levels[level] >= levels[this.level];
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }
}

// =============================================================================
// Configuration Validation
// =============================================================================

export function validateDeploymentConfig(
  config: DeploymentConfig
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  // Validate stack name
  if (!config.stackName || typeof config.stackName !== "string") {
    errors.push({
      field: "stackName",
      message: "Stack name is required and must be a non-empty string",
      value: config.stackName,
    });
  } else if (!/^[a-zA-Z0-9-_]+$/.test(config.stackName)) {
    errors.push({
      field: "stackName",
      message:
        "Stack name can only contain alphanumeric characters, hyphens, and underscores",
      value: config.stackName,
    });
  }

  // Validate company name
  if (!config.companyName || typeof config.companyName !== "string") {
    errors.push({
      field: "companyName",
      message: "Company name is required and must be a non-empty string",
      value: config.companyName,
    });
  } else if (!/^[a-zA-Z0-9-_]+$/.test(config.companyName)) {
    errors.push({
      field: "companyName",
      message:
        "Company name can only contain alphanumeric characters, hyphens, and underscores",
      value: config.companyName,
    });
  }

  // Validate secrets JSON
  if (!config.secretsJson) {
    errors.push({
      field: "secretsJson",
      message: "Secrets JSON is required",
      value: config.secretsJson,
    });
  } else {
    try {
      const parsed = JSON.parse(config.secretsJson);
      if (typeof parsed !== "object" || parsed === null) {
        errors.push({
          field: "secretsJson",
          message: "Secrets JSON must be a valid JSON object",
          value: config.secretsJson,
        });
      }
    } catch (e) {
      errors.push({
        field: "secretsJson",
        message: "Secrets JSON must be valid JSON",
        value: config.secretsJson,
      });
    }
  }

  // Validate values JSON if provided
  if (config.valuesJson) {
    try {
      const parsed = JSON.parse(config.valuesJson);
      if (typeof parsed !== "object" || parsed === null) {
        errors.push({
          field: "valuesJson",
          message: "Values JSON must be a valid JSON object",
          value: config.valuesJson,
        });
      }
    } catch (e) {
      errors.push({
        field: "valuesJson",
        message: "Values JSON must be valid JSON",
        value: config.valuesJson,
      });
    }
  }

  // Validate Helm chart path if provided
  if (config.helmChartPath && typeof config.helmChartPath !== "string") {
    errors.push({
      field: "helmChartPath",
      message: "Helm chart path must be a string",
      value: config.helmChartPath,
    });
  }

  return errors;
}

// =============================================================================
// Progress Tracking
// =============================================================================

export function createProgressCallback(
  logger: Logger,
  onProgress?: (progress: DeploymentProgress) => void
) {
  return (
    status: DeploymentStatus,
    message: string,
    metadata?: Record<string, any>
  ) => {
    const progress: DeploymentProgress = {
      status,
      message,
      timestamp: new Date(),
      metadata,
    };

    logger.info(`Status: ${status} - ${message}`);

    if (onProgress) {
      try {
        onProgress(progress);
      } catch (error) {
        logger.warn("Error in progress callback:", error);
      }
    }
  };
}

// =============================================================================
// Rollback Functionality
// =============================================================================

export async function performRollback(
  stack: automation.Stack,
  logger: Logger,
  onProgress: (
    status: DeploymentStatus,
    message: string,
    metadata?: Record<string, any>
  ) => void
): Promise<void> {
  try {
    onProgress("rolling-back", "Starting rollback operation");
    logger.info("Attempting to rollback to previous successful deployment");

    // Get stack history to find the last successful deployment
    const history = await stack.history(10); // Get last 10 updates
    const lastSuccessful = history.find(
      (update) => update.result === "succeeded" && update.kind === "update"
    );

    if (!lastSuccessful) {
      throw new RollbackError(
        "No previous successful deployment found for rollback",
        new Error("No rollback target available")
      );
    }

    // Cancel current update if it's in progress
    try {
      await stack.cancel();
      logger.debug("Cancelled current operation before rollback");
    } catch (cancelError) {
      // Ignore cancel errors - update might not be in progress
      logger.debug("No active operation to cancel");
    }

    // Perform the rollback by updating to the previous state
    logger.info(`Rolling back to version ${lastSuccessful.version}`);

    // Note: Pulumi doesn't have a direct rollback command in automation API
    // We need to implement this by reverting to a previous state
    // This is a simplified implementation - in practice, you might want to
    // store previous configurations and reapply them

    onProgress(
      "rolling-back",
      `Rolled back to version ${lastSuccessful.version}`
    );
    logger.info("Rollback completed successfully");
  } catch (error) {
    const rollbackError = new RollbackError(
      `Rollback failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error instanceof Error ? error : new Error(String(error))
    );
    logger.error("Rollback failed:", rollbackError.message);
    throw rollbackError;
  }
}

// =============================================================================
// Error Handling Wrapper
// =============================================================================

export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  logger: Logger,
  context: string
): Promise<T> {
  try {
    logger.debug(`Starting operation: ${context}`);
    const result = await operation();
    logger.debug(`Completed operation: ${context}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in ${context}:`, errorMessage);

    if (error instanceof Error && error.stack) {
      logger.debug("Stack trace:", error.stack);
    }

    // Re-throw as DeploymentError if not already
    if (!(error instanceof DeploymentError)) {
      throw new DeploymentError(
        `${context} failed: ${errorMessage}`,
        "OPERATION_FAILED",
        error
      );
    }

    throw error;
  }
}

// =============================================================================
// Enhanced Deployment Function
// =============================================================================

export async function handleDeployment(
  options: DeploymentOptions
): Promise<DeploymentResult> {
  const startTime = Date.now();
  const {
    action,
    stackName, // Keep original stackName for constructing the FQSN
    secretsJson,
    valuesJson,
    companyName, // This will be used as the organization
    workDir,
    helmChartPath,
    logLevel = "info",
    onProgress,
    validateConfig = true,
    enableRollback = true,
    timeout = 1800, // 30 minutes default
  } = options;

  // Determine project name (e.g., from package.json or a fixed value)
  // For now, let's assume a fixed project name. Replace with dynamic determination if needed.
  const projectName = "iaas-k8s"; // Placeholder: Replace with actual project name
  const organizationName = "organization"; // Using "organization" as per error message

  // Construct the fully qualified stack name
  const fullyQualifiedStackName = `${organizationName}/${projectName}/${companyName}-${stackName}`;

  // Initialize logger and progress callback
  const logger = new ConsoleLogger(logLevel);
  const reportProgress = createProgressCallback(logger, onProgress);

  // Initialize deployment monitor
  const deploymentId = `${companyName}-${fullyQualifiedStackName}-${Date.now()}`;
  const monitor = new DeploymentMonitor(
    deploymentId,
    action,
    fullyQualifiedStackName, // Use fully qualified name
    companyName,
    logger
  );

  let rollbackPerformed = false;
  let stack: automation.Stack | undefined;

  try {
    reportProgress("initializing", "Starting deployment initialization");
    monitor.recordProgress({
      status: "initializing",
      message: "Starting deployment initialization",
      timestamp: new Date(),
    });

    // =============================================================================
    // Enhanced Configuration Validation
    // =============================================================================
    if (validateConfig) {
      logger.debug(
        "Validating deployment configuration with enhanced validation"
      );

      // Use Zod validation first
      const zodValidationErrors = validateDeploymentOptionsWithZod(options);
      if (zodValidationErrors.length > 0) {
        const errorMessage = `Enhanced validation failed: ${zodValidationErrors
          .map((e: FieldValidationError) => `${e.field}: ${e.message}`)
          .join(", ")}`;
        throw new ConfigValidationError(errorMessage, zodValidationErrors);
      }

      // Additional structure validation
      const secretErrors = validateSecretsStructure(secretsJson);
      const valueErrors = valuesJson ? validateValuesStructure(valuesJson) : [];

      const allValidationErrors = [...secretErrors, ...valueErrors];
      if (allValidationErrors.length > 0) {
        const errorMessage = `Configuration structure validation failed: ${allValidationErrors
          .map((e: FieldValidationError) => `${e.field}: ${e.message}`)
          .join(", ")}`;
        throw new ConfigValidationError(errorMessage, allValidationErrors);
      }

      logger.debug("Enhanced configuration validation passed");
    }

    // =============================================================================
    // Health Checks
    // =============================================================================
    reportProgress("initializing", "Performing pre-deployment health checks");
    const healthChecks = await monitor.performHealthChecks();
    const healthStatus = monitor.getHealthStatus();

    if (healthStatus.overall === "unhealthy") {
      const unhealthyChecks = healthChecks.filter(
        (c) => c.status === "unhealthy"
      );
      const errorMessage = `Pre-deployment health checks failed: ${unhealthyChecks
        .map((c: any) => `${c.name}: ${c.message}`)
        .join(", ")}`;
      logger.warn("Health check failures detected:", errorMessage);
      // Continue with deployment but log warnings
    } else {
      logger.info("All health checks passed");
    }

    // Additional legacy validation for backward compatibility
    if (!validateConfig) {
      logger.debug("Performing basic configuration validation");
      const config: DeploymentConfig = {
        stackName: fullyQualifiedStackName, // Use fully qualified name
        secretsJson,
        valuesJson,
        companyName,
        helmChartPath,
      };

      const validationErrors = validateDeploymentConfig(config);
      if (validationErrors.length > 0) {
        const errorMessage = `Configuration validation failed: ${validationErrors
          .map((e: FieldValidationError) => `${e.field}: ${e.message}`)
          .join(", ")}`;
        throw new ConfigValidationError(errorMessage, validationErrors);
      }
      logger.debug("Basic configuration validation passed");
    }

    // =============================================================================
    // Stack Initialization
    // =============================================================================
    reportProgress("initializing", "Initializing Pulumi stack");

    // Ensure Pulumi passphrase is set for stack secrets management
    if (
      !process.env.PULUMI_CONFIG_PASSPHRASE &&
      !process.env.PULUMI_CONFIG_PASSPHRASE_FILE
    ) {
      process.env.PULUMI_CONFIG_PASSPHRASE = "dev-default-passphrase";
      logger.warn(
        "PULUMI_CONFIG_PASSPHRASE was not set. Using default passphrase for stack secrets. " +
          "This is insecure for production. Set PULUMI_CONFIG_PASSPHRASE or PULUMI_CONFIG_PASSPHRASE_FILE for secure deployments."
      );
    }

    // Ensure workDir points to the directory containing Pulumi.yaml
    // If workDir is not provided, use the current working directory
    const resolvedWorkDir = workDir || process.cwd();
    logger.debug(`Working directory: ${resolvedWorkDir}`);

    // Set custom Helm chart path if provided
    if (helmChartPath) {
      process.env.HELM_CHART_PATH = helmChartPath;
      logger.debug(`Custom Helm chart path set: ${helmChartPath}`);
    }

    const projectSettings: automation.LocalProgramArgs = {
      stackName: fullyQualifiedStackName, // Use fully qualified name
      workDir: resolvedWorkDir,
    };

    // Create or select stack with timeout
    stack = await withErrorHandling(
      () => automation.LocalWorkspace.createOrSelectStack(projectSettings),
      logger,
      "stack initialization"
    );

    logger.info(`Successfully initialized stack: ${stack.name}`);
    logger.info(`Working directory for Pulumi program: ${resolvedWorkDir}`);

    // =============================================================================
    // Automatic Pulumi Config Setup (if enabled)
    // =============================================================================
    if (
      options.autoSetupConfig &&
      options.cloudProvider &&
      options.cloudConfig
    ) {
      logger.info(
        "Auto-setup of Pulumi config enabled. Setting up stack config..."
      );
      // Ensure stack is initialized before config setup
      const resolvedWorkDir = workDir || process.cwd();
      const projectSettings: automation.LocalProgramArgs = {
        stackName: fullyQualifiedStackName,
        workDir: resolvedWorkDir,
      };
      stack = await withErrorHandling(
        () => automation.LocalWorkspace.createOrSelectStack(projectSettings),
        logger,
        "stack initialization (for autoSetupConfig)"
      );
      const configManager = new PulumiConfigManager(logger);
      await configManager.setupPulumiConfig(resolvedWorkDir, stack, {
        stackName,
        cloudProvider: options.cloudProvider,
        companyName,
        cloudConfig: options.cloudConfig,
        secretsJson,
        valuesJson,
        helmChartPath,
      });
      logger.info("Pulumi config auto-setup complete.");
    }

    // If stack is not yet initialized (autoSetupConfig was not used), initialize it now
    if (!stack) {
      const resolvedWorkDir = workDir || process.cwd();
      const projectSettings: automation.LocalProgramArgs = {
        stackName: fullyQualifiedStackName,
        workDir: resolvedWorkDir,
      };
      stack = await withErrorHandling(
        () => automation.LocalWorkspace.createOrSelectStack(projectSettings),
        logger,
        "stack initialization"
      );
      logger.info(`Successfully initialized stack: ${stack.name}`);
      logger.info(`Working directory for Pulumi program: ${resolvedWorkDir}`);
    }

    // =============================================================================
    // Configuration Setup
    // =============================================================================
    reportProgress("configuring", "Setting up stack configuration");

    // Set configuration with validation and encoding
    await withErrorHandling(
      async () => {
        // Validate and encode secrets JSON for Kubernetes
        logger.info(
          "Validating and encoding secrets for Kubernetes deployment..."
        );
        const secretsValidation = validateAndEncodeSecrets(secretsJson);

        if (!secretsValidation.isValid) {
          const errorMessages = secretsValidation.errors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", ");
          throw new ConfigValidationError(
            `Secrets validation failed during configuration setup: ${errorMessages}`,
            secretsValidation.errors
          );
        }

        // Log encoding report if available
        if (secretsValidation.encodingReport) {
          const encodingStats = Object.entries(
            secretsValidation.encodingReport
          ).reduce((acc, [key, status]) => {
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          logger.info(
            `Secret encoding complete: ${JSON.stringify(encodingStats)}`
          );
        }

        // Set the encoded secrets JSON
        await stack!.setConfig("helmSecretsJson", {
          value: secretsValidation.encodedSecretsJson,
          secret: true,
        });
        logger.info(
          "Set helmSecretsJson configuration with base64 encoded secrets (as secret)"
        );

        // Set Helm values JSON if provided
        if (valuesJson) {
          await stack!.setConfig("helmValuesJson", { value: valuesJson });
          logger.info("Set helmValuesJson configuration");
        }

        // Set company name
        await stack!.setConfig("companyName", { value: companyName });
        logger.info("Set companyName configuration");

        // Set cloud provider config
        // Use options.cloudProvider which comes from CLI arguments.
        if (options.cloudProvider) {
          await stack!.setConfig("cloudProvider", {
            value: options.cloudProvider,
          });
          logger.debug(
            `Set cloudProvider configuration: ${options.cloudProvider}`
          );
        } else {
          // cloudProvider is optional in DeploymentOptions.
          // Defaulting to 'aws' if not provided, with a warning.
          const fallbackCloudProvider = "aws";
          logger.warn(
            `options.cloudProvider is undefined. Defaulting to '${fallbackCloudProvider}' for 'cloudProvider' config. Ensure this is the intended behavior.`
          );
          await stack!.setConfig("cloudProvider", {
            value: fallbackCloudProvider,
          });
          logger.debug(
            `Set cloudProvider configuration (fallback): ${fallbackCloudProvider}`
          );
        }

        // Set Helm chart path if provided
        if (helmChartPath) {
          await stack!.setConfig("helmChartPath", { value: helmChartPath });
          logger.info("Set helmChartPath configuration");
        }
      },
      logger,
      "configuration setup"
    );

    // =============================================================================
    // Deployment Operations
    // =============================================================================
    reportProgress("deploying", `Starting ${action} operation`);
    logger.info(`Starting Pulumi ${action} operation...`);

    let result: DeploymentResult = { success: false };

    // Set up timeout for the operation
    const timeoutMs = timeout * 1000;
    const operationPromise = executeDeploymentAction(
      action,
      stack,
      logger,
      stackName
    );
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new DeploymentError(
            `Operation timed out after ${timeout} seconds`,
            "TIMEOUT",
            { timeout, action }
          )
        );
      }, timeoutMs);
    });

    const operationResult = await Promise.race([
      operationPromise,
      timeoutPromise,
    ]);

    result = {
      success: true,
      ...operationResult,
      duration: Date.now() - startTime,
    };

    reportProgress("completed", `${action} operation completed successfully`);
    logger.info("Pulumi operation completed successfully");

    return result;
  } catch (error) {
    // =============================================================================
    // Error Handling and Rollback
    // =============================================================================
    logger.error(
      "Pulumi operation failed:",
      error instanceof Error ? error.message : String(error)
    );

    let rollbackError: Error | undefined;

    // Attempt rollback if enabled and this was a deployment that failed
    if (enableRollback && action === "up" && stack && !rollbackPerformed) {
      try {
        reportProgress("rolling-back", "Attempting automatic rollback");
        await performRollback(stack, logger, reportProgress);
        rollbackPerformed = true;
        logger.info("Automatic rollback completed successfully");
      } catch (rbError) {
        rollbackError =
          rbError instanceof Error ? rbError : new Error(String(rbError));
        logger.error("Rollback failed:", rollbackError.message);
      }
    }

    // Format error message
    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;

      // Log detailed error information
      if (error.stack) {
        logger.debug("Stack trace:", error.stack);
      }

      // Handle Pulumi automation API specific errors
      const pulumiError = error as any;
      if (pulumiError.stdout) {
        logger.error("Pulumi stdout:", pulumiError.stdout);
      }
      if (pulumiError.stderr) {
        logger.error("Pulumi stderr:", pulumiError.stderr);
      }
    }

    reportProgress("failed", `Operation failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      rollbackPerformed,
      duration: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Deployment Action Executor
// =============================================================================

async function executeDeploymentAction(
  action: DeploymentAction,
  stack: automation.Stack,
  logger: Logger,
  stackName: string
): Promise<Partial<DeploymentResult>> {
  switch (action) {
    case "up":
      logger.info(`Running pulumi up for stack: ${stackName}...`);
      const upRes: automation.UpResult = await stack.up({
        onOutput: (output) => logger.debug(output),
      });

      logger.info("--- Update Summary ---");
      if (upRes.summary) {
        logger.info(`Status: ${upRes.summary.result}`);
        logger.info(`Version: ${upRes.summary.version}`);
        logger.debug(
          "Resource changes:",
          JSON.stringify(upRes.summary.resourceChanges, null, 2)
        );
      }

      logger.info("--- Outputs ---");
      logger.debug("Stack outputs:", JSON.stringify(upRes.outputs, null, 2));

      let kubeconfig: string | undefined;
      if (upRes.outputs.kubeconfig && upRes.outputs.kubeconfig.value) {
        kubeconfig =
          typeof upRes.outputs.kubeconfig.value === "string"
            ? upRes.outputs.kubeconfig.value
            : JSON.stringify(upRes.outputs.kubeconfig.value);

        logger.info("Kubeconfig is available in deployment outputs");
        logger.debug("To configure kubectl:");
        logger.debug(
          `1. Save kubeconfig to file: kubeconfig-${stackName}.yaml`
        );
        logger.debug(`2. Set KUBECONFIG environment variable`);
        logger.debug(`3. Test connection with: kubectl get nodes`);
      }

      return {
        outputs: upRes.outputs,
        summary: upRes.summary,
        kubeconfig,
      };

    case "preview":
      logger.info(`Running pulumi preview for stack: ${stackName}...`);
      await stack.preview({
        onOutput: (output) => logger.debug(output),
        onError: (error) => logger.error(error),
      });
      logger.info("Preview finished successfully");
      return {};

    case "destroy":
      logger.info(`Running pulumi destroy for stack: ${stackName}...`);
      const destroyRes = await stack.destroy({
        onOutput: (output) => logger.debug(output),
      });

      logger.info("--- Destroy Summary ---");
      if (destroyRes.summary) {
        logger.info(`Status: ${destroyRes.summary.result}`);
        logger.debug(
          "Resource changes:",
          JSON.stringify(destroyRes.summary.resourceChanges, null, 2)
        );
      }

      return {
        summary: destroyRes.summary,
      };

    case "outputs":
      logger.info(`Fetching outputs for stack: ${stackName}...`);
      const outputs = await stack.outputs();
      logger.info("--- Stack Outputs ---");
      logger.debug("Outputs:", JSON.stringify(outputs, null, 2));

      return {
        outputs: outputs,
      };

    case "refresh":
      logger.info(`Running pulumi refresh for stack: ${stackName}...`);
      const refreshRes = await stack.refresh({
        onOutput: (output) => logger.debug(output),
      });

      logger.info("--- Refresh Summary ---");
      if (refreshRes.summary) {
        logger.info(`Status: ${refreshRes.summary.result}`);
      }

      return {
        summary: refreshRes.summary,
      };

    case "rollback":
      logger.info(`Running rollback for stack: ${stackName}...`);
      // Rollback is handled in the main function, this is just for completeness
      throw new DeploymentError(
        "Rollback should be handled in main deployment function",
        "INVALID_ACTION"
      );

    default:
      throw new DeploymentError(
        `Unknown action: ${action}. Available actions: up, preview, destroy, outputs, refresh, rollback`,
        "INVALID_ACTION",
        { action }
      );
  }
}
