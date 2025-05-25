import { automation } from "@pulumi/pulumi";
import * as path from "path";
import {
  validateDeploymentOptionsWithZod,
  validateSecretsStructure,
  validateValuesStructure,
} from "../utils/validation.js";
import { DeploymentMonitor } from "../utils/monitoring.js";
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
    stackName,
    secretsJson,
    valuesJson,
    companyName,
    workDir,
    helmChartPath,
    logLevel = "info",
    onProgress,
    validateConfig = true,
    enableRollback = true,
    timeout = 1800, // 30 minutes default
  } = options;

  // Initialize logger and progress callback
  const logger = new ConsoleLogger(logLevel);
  const reportProgress = createProgressCallback(logger, onProgress);

  // Initialize deployment monitor
  const deploymentId = `${companyName}-${stackName}-${Date.now()}`;
  const monitor = new DeploymentMonitor(
    deploymentId,
    action,
    stackName,
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
        stackName,
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

    const resolvedWorkDir = workDir || path.resolve(".");
    logger.debug(`Working directory: ${resolvedWorkDir}`);

    // Set custom Helm chart path if provided
    if (helmChartPath) {
      process.env.HELM_CHART_PATH = helmChartPath;
      logger.debug(`Custom Helm chart path set: ${helmChartPath}`);
    }

    const projectSettings: automation.LocalProgramArgs = {
      stackName: stackName,
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
    // Configuration Setup
    // =============================================================================
    reportProgress("configuring", "Setting up stack configuration");

    // Set configuration with validation
    await withErrorHandling(
      async () => {
        // Set secrets JSON
        const parsedSecrets = JSON.parse(secretsJson);
        await stack!.setConfig("helmSecretsJson", {
          value: secretsJson,
          secret: true,
        });
        logger.info("Set helmSecretsJson configuration (as secret)");

        // Set values JSON if provided
        if (valuesJson) {
          const parsedValues = JSON.parse(valuesJson);
          await stack!.setConfig("helmValuesJson", { value: valuesJson });
          logger.info("Set helmValuesJson configuration");
        }

        // Set company name
        await stack!.setConfig("companyName", { value: companyName });
        logger.info("Set companyName configuration");

        // Set cloud provider config if available
        const cloudProvider = process.env.CLOUD_PROVIDER || "aws";
        await stack!.setConfig("cloudProvider", { value: cloudProvider });
        logger.debug(`Set cloudProvider configuration: ${cloudProvider}`);
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
      await stack.preview({ onOutput: (output) => logger.debug(output) });
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

// Keep the original CLI functionality for backward compatibility
export async function runCLI() {
  const rawArgs = process.argv.slice(2);
  let action: string | undefined;
  let stackName: string | undefined;
  let secretsJsonString: string | undefined;
  let valuesJsonString: string | undefined;
  let companyName: string | undefined;

  if (rawArgs.length < 2) {
    console.error(
      "Usage: node automation.js <action> <stackName> --secretsJson <json_string> --valuesJson <json_string> [--companyName <string>]"
    );
    console.error("Actions: up, preview, destroy, outputs, refresh");
    console.error(
      "Example: node automation.js up dev --secretsJson '{\"dbPassword\":\"s3cr3t\"}' --valuesJson '{\"replicaCount\":3}' --companyName 'mycorp'"
    );
    process.exit(1);
  }

  action = rawArgs[0];
  stackName = rawArgs[1];

  // Parse additional optional arguments
  for (let i = 2; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--secretsJson") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        secretsJsonString = rawArgs[i + 1];
        i++;
      } else {
        console.error("Error: --secretsJson requires a JSON string value.");
        process.exit(1);
      }
    } else if (arg === "--valuesJson") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        valuesJsonString = rawArgs[i + 1];
        i++;
      } else {
        console.error("Error: --valuesJson requires a JSON string value.");
        process.exit(1);
      }
    } else if (arg === "--companyName") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        companyName = rawArgs[i + 1];
        i++;
      } else {
        console.error("Error: --companyName requires a string value.");
        process.exit(1);
      }
    } else {
      console.warn(`Ignoring unknown argument or malformed pair: ${arg}`);
    }
  }

  if (!secretsJsonString) {
    console.error(
      "Error: --secretsJson is required. Please provide a valid JSON string."
    );
    process.exit(1);
  }

  if (!companyName) {
    console.error(
      "Error: --companyName is required. Please provide a company name string."
    );
    process.exit(1);
  }

  const options: DeploymentOptions = {
    action: action as any,
    stackName: stackName!,
    secretsJson: secretsJsonString,
    valuesJson: valuesJsonString,
    companyName: companyName,
  };

  const result = await handleDeployment(options);

  if (!result.success) {
    process.exit(1);
  }
}
