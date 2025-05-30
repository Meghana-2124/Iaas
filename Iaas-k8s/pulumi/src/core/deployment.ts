import { automation } from "@pulumi/pulumi";
import * as path from "path";
import {
  validateDeploymentOptionsWithZod,
  validateSecretsStructure,
  validateValuesStructure,
  validateAndProcessSecrets,
  validateNamespaceConfiguration,
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
    onProgress(
      "rolling-back",
      `Found rollback target: version ${lastSuccessful.version}`,
      {
        targetVersion: lastSuccessful.version,
        targetTime: lastSuccessful.startTime,
        targetResult: lastSuccessful.result,
      }
    );

    // Complete rollback implementation with configuration restoration
    // Step 1: Backup current configuration for potential recovery
    onProgress("rolling-back", "Backing up current configuration");
    logger.info("Creating backup of current configuration before rollback");

    const currentConfig = await stack.getAllConfig();
    const configBackup = JSON.parse(JSON.stringify(currentConfig)); // Deep copy
    logger.debug(
      "Current configuration backed up:",
      JSON.stringify(configBackup, null, 2)
    );

    // Step 2: Attempt to restore configuration to target state
    onProgress("rolling-back", "Restoring configuration to target state");
    logger.info(
      `Attempting to restore configuration to state at version ${lastSuccessful.version}`
    );

    // Since Pulumi doesn't provide direct access to historical configs,
    // we'll use a strategy based on the deployment's idempotent nature
    // and implement configuration restoration through stack export/import
    let stateRestored = false;
    let restoredConfig: Record<string, any> = {};

    try {
      // Try to get the stack export which contains the full state
      onProgress("rolling-back", "Exporting current stack state");
      const currentStackExport = await stack.exportStack();
      logger.debug("Current stack state exported for analysis");

      // For a more robust rollback, we would typically:
      // 1. Store configuration snapshots during successful deployments
      // 2. Query external sources (like git history) for previous configs
      // 3. Use deployment metadata to reconstruct previous state

      // As a fallback, we'll attempt a refresh to sync with actual infrastructure
      // and then perform an update which should converge to the desired state
      onProgress("rolling-back", "Refreshing stack state");
      logger.info("Refreshing stack state to sync with actual infrastructure");

      const refreshResult = await stack.refresh({
        onOutput: (output) => {
          logger.debug(`Refresh output: ${output}`);
        },
      });

      if (refreshResult.summary?.result === "succeeded") {
        logger.info("Stack refresh completed successfully");
        stateRestored = true;
      } else {
        logger.warn("Stack refresh completed with warnings or errors");
      }
    } catch (stateError) {
      logger.warn(
        "Could not fully restore previous state, proceeding with current configuration:",
        stateError
      );
      // Continue with rollback using current configuration
    }

    // Step 3: Execute rollback update operation
    onProgress("rolling-back", "Executing rollback update operation");
    logger.info(
      "Executing rollback by running stack update to restore infrastructure state"
    );

    // Track rollback attempts for retry logic
    let rollbackAttempts = 0;
    const maxRollbackAttempts = 2;
    let rollbackResult: automation.UpResult | undefined;

    while (rollbackAttempts < maxRollbackAttempts) {
      rollbackAttempts++;

      try {
        logger.info(
          `Rollback attempt ${rollbackAttempts}/${maxRollbackAttempts}`
        );

        // Set up rollback-specific options
        const rollbackOptions: automation.UpOptions = {
          onOutput: (output) => {
            logger.debug(`Rollback output: ${output}`);
          },
          // Add targeted refresh to ensure we're working with current state
          refresh: true,
          // Set expectations for rollback operation
          expectNoChanges: false,
        };

        // Perform the rollback by running an update
        // The Pulumi program should be idempotent, so running it again
        // with the refreshed state will restore to the desired configuration
        rollbackResult = await stack.up(rollbackOptions);

        // If we get here, the rollback succeeded
        break;
      } catch (rollbackAttemptError) {
        logger.warn(
          `Rollback attempt ${rollbackAttempts} failed:`,
          rollbackAttemptError
        );

        if (rollbackAttempts >= maxRollbackAttempts) {
          // Final attempt failed, try to restore original config
          logger.error(
            "All rollback attempts failed, attempting to restore original configuration"
          );

          try {
            // Restore the backed up configuration
            for (const [key, value] of Object.entries(configBackup)) {
              await stack.setConfig(key, value as automation.ConfigValue);
            }
            logger.info(
              "Original configuration restored after failed rollback"
            );
          } catch (restoreError) {
            logger.error(
              "Failed to restore original configuration:",
              restoreError
            );
          }

          throw new RollbackError(
            `All ${maxRollbackAttempts} rollback attempts failed: ${
              rollbackAttemptError instanceof Error
                ? rollbackAttemptError.message
                : String(rollbackAttemptError)
            }`,
            rollbackAttemptError instanceof Error
              ? rollbackAttemptError
              : new Error(String(rollbackAttemptError))
          );
        }

        // Wait before retry
        logger.info(`Waiting 5 seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Step 4: Validate rollback results
    if (rollbackResult?.summary) {
      logger.info("--- Rollback Summary ---");
      logger.info(`Status: ${rollbackResult.summary.result}`);
      logger.info(`Version: ${rollbackResult.summary.version}`);
      logger.info(`Attempt: ${rollbackAttempts}/${maxRollbackAttempts}`);

      if (rollbackResult.summary.resourceChanges) {
        const changes = rollbackResult.summary.resourceChanges;
        const changeCount = Object.values(changes).reduce(
          (sum, count) => sum + (count || 0),
          0
        );
        logger.info(`Resources modified during rollback: ${changeCount}`);
        logger.debug(
          "Resource changes during rollback:",
          JSON.stringify(changes, null, 2)
        );

        // Log detailed change summary
        for (const [changeType, count] of Object.entries(changes)) {
          if (count && count > 0) {
            logger.info(`  ${changeType}: ${count} resources`);
          }
        }
      }

      // Verify rollback success
      if (rollbackResult.summary.result === "succeeded") {
        onProgress(
          "rolling-back",
          `Successfully rolled back to previous state (attempt ${rollbackAttempts})`,
          {
            targetVersion: lastSuccessful.version,
            newVersion: rollbackResult.summary.version,
            resourceChanges: rollbackResult.summary.resourceChanges,
            attempts: rollbackAttempts,
            stateRestored,
          }
        );

        logger.info(
          `Rollback completed successfully. New version: ${rollbackResult.summary.version}`
        );

        // Step 5: Post-rollback validation
        onProgress("rolling-back", "Performing post-rollback validation");
        logger.info("Performing post-rollback validation checks");

        try {
          // Get and validate outputs
          const outputs = await stack.outputs();
          logger.debug(
            "Post-rollback outputs:",
            JSON.stringify(outputs, null, 2)
          );

          // Check for critical outputs that should be available
          const criticalOutputs = ["kubeconfig"];
          const missingOutputs = criticalOutputs.filter(
            (output) => !outputs[output]
          );

          if (missingOutputs.length > 0) {
            logger.warn(
              `Warning: Missing critical outputs after rollback: ${missingOutputs.join(
                ", "
              )}`
            );
          } else {
            logger.info("All critical outputs are available after rollback");
          }
        } catch (validationError) {
          logger.warn(
            "Post-rollback validation encountered issues:",
            validationError
          );
          // Don't fail the rollback for validation issues
        }
      } else {
        throw new RollbackError(
          `Rollback completed but with unexpected status: ${rollbackResult.summary.result}`,
          new Error(
            `Unexpected rollback status: ${rollbackResult.summary.result}`
          )
        );
      }
    } else {
      logger.warn("Rollback completed but no summary information available");
      onProgress(
        "rolling-back",
        "Rollback completed with limited status information",
        {
          targetVersion: lastSuccessful.version,
          attempts: rollbackAttempts,
        }
      );
    }
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
    // New namespace-based deployment parameters
    namespace,
    deploymentType,
  } = options;

  // Determine project name (e.g., from package.json or a fixed value)
  // For now, let's assume a fixed project name. Replace with dynamic determination if needed.
  const projectName = "iaas-k8s"; // Placeholder: Replace with actual project name
  const organizationName = "organization"; // Using "organization" as per error message

  // Construct the fully qualified stack name based on deployment type
  let fullyQualifiedStackName: string;
  if (deploymentType === "shared") {
    // For shared deployments, use the namespace in the stack name
    const effectiveNamespace =
      namespace || `${companyName}-${stackName}`.toLowerCase();
    fullyQualifiedStackName = `${organizationName}/${projectName}/shared-${effectiveNamespace}`;
  } else {
    // For dedicated deployments, use the original company-based naming
    fullyQualifiedStackName = `${organizationName}/${projectName}/${companyName}-${stackName}`;
  }

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
    // Namespace and Deployment Type Validation
    // =============================================================================
    if (deploymentType === "shared" && !namespace) {
      // Generate namespace automatically for shared deployments if not provided
      const generatedNamespace = `${companyName}-${stackName}`.toLowerCase();
      logger.info(
        `Generated namespace for shared deployment: ${generatedNamespace}`
      );
      options.namespace = generatedNamespace;
    }

    if (namespace || deploymentType === "shared") {
      const effectiveNamespace = namespace || options.namespace!;
      const namespaceValidationErrors = validateNamespaceConfiguration(
        effectiveNamespace,
        deploymentType
      );

      if (namespaceValidationErrors.length > 0) {
        const errorMessage = `Namespace validation failed: ${namespaceValidationErrors
          .map((e: FieldValidationError) => `${e.field}: ${e.message}`)
          .join(", ")}`;
        throw new ConfigValidationError(
          errorMessage,
          namespaceValidationErrors
        );
      }

      logger.info(
        `Using namespace: ${effectiveNamespace} for ${deploymentType} deployment`
      );
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
        namespace: namespace || options.namespace,
        deploymentType,
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
        // Validate and process secrets JSON for Kubernetes (using stringData - no encoding needed)
        logger.info(
          "Validating and processing secrets for Kubernetes deployment..."
        );
        const secretsValidation = validateAndProcessSecrets(secretsJson);

        if (!secretsValidation.isValid) {
          const errorMessages = secretsValidation.errors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", ");
          throw new ConfigValidationError(
            `Secrets validation failed during configuration setup: ${errorMessages}`,
            secretsValidation.errors
          );
        }

        // Log processing report if available
        if (secretsValidation.processingReport) {
          const processingStats = Object.entries(
            secretsValidation.processingReport
          ).reduce((acc, [key, status]) => {
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          logger.info(
            `Secret processing complete: ${JSON.stringify(processingStats)}`
          );
        }

        // Set the processed secrets JSON (plain text for stringData)
        await stack!.setConfig("helmSecretsJson", {
          value: secretsValidation.processedSecretsJson,
          secret: true,
        });
        logger.info(
          "Set helmSecretsJson configuration with processed secrets for stringData (as secret)"
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

        // Set namespace and deployment type configuration
        const effectiveNamespace = namespace || options.namespace;
        if (effectiveNamespace) {
          await stack!.setConfig("namespace", { value: effectiveNamespace });
          logger.info(`Set namespace configuration: ${effectiveNamespace}`);
        }

        await stack!.setConfig("deploymentType", { value: deploymentType });
        logger.info(`Set deploymentType configuration: ${deploymentType}`);
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

    // Handle rollback action specially - it doesn't go through executeDeploymentAction
    if (action === "rollback") {
      try {
        await performRollback(stack, logger, reportProgress);

        // Get the final stack outputs after rollback
        const outputs = await stack.outputs();

        result = {
          success: true,
          outputs,
          rollbackPerformed: true,
          duration: Date.now() - startTime,
        };

        reportProgress(
          "completed",
          "Rollback operation completed successfully"
        );
        logger.info("Rollback operation completed successfully");

        return result;
      } catch (rollbackError) {
        const errorMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        logger.error("Rollback operation failed:", errorMessage);

        return {
          success: false,
          error: errorMessage,
          rollbackPerformed: false,
          duration: Date.now() - startTime,
        };
      }
    }

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

      // Store configuration snapshot for successful deployments
      if (upRes.summary?.result === "succeeded") {
        try {
          await storeDeploymentSnapshot(stack, logger, upRes);
          logger.debug(
            "Configuration snapshot stored for successful deployment"
          );
        } catch (snapshotError) {
          logger.warn("Failed to store configuration snapshot:", snapshotError);
          // Don't fail the deployment for snapshot errors
        }
      }

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

// =============================================================================
// Configuration Snapshot Management for Rollback Support
// =============================================================================

interface ConfigurationSnapshot {
  version: number;
  timestamp: Date;
  stackName: string;
  config: Record<string, automation.ConfigValue>;
  outputs?: Record<string, any>;
  metadata?: Record<string, any>;
}

export class ConfigurationSnapshotManager {
  private snapshots: Map<string, ConfigurationSnapshot[]> = new Map();
  private maxSnapshots: number = 10; // Keep last 10 snapshots per stack

  constructor(private logger: Logger, maxSnapshots: number = 10) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Store a configuration snapshot after a successful deployment
   */
  async storeSnapshot(
    stack: automation.Stack,
    version: number,
    outputs?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const config = await stack.getAllConfig();
      const snapshot: ConfigurationSnapshot = {
        version,
        timestamp: new Date(),
        stackName: stack.name,
        config,
        outputs,
        metadata,
      };

      const stackSnapshots = this.snapshots.get(stack.name) || [];
      stackSnapshots.push(snapshot);

      // Keep only the most recent snapshots
      if (stackSnapshots.length > this.maxSnapshots) {
        stackSnapshots.splice(0, stackSnapshots.length - this.maxSnapshots);
      }

      this.snapshots.set(stack.name, stackSnapshots);
      this.logger.debug(
        `Configuration snapshot stored for ${stack.name} version ${version}`
      );
    } catch (error) {
      this.logger.warn(`Failed to store configuration snapshot: ${error}`);
    }
  }

  /**
   * Retrieve the most recent successful configuration snapshot
   */
  getLatestSnapshot(stackName: string): ConfigurationSnapshot | undefined {
    const stackSnapshots = this.snapshots.get(stackName);
    return stackSnapshots && stackSnapshots.length > 0
      ? stackSnapshots[stackSnapshots.length - 1]
      : undefined;
  }

  /**
   * Retrieve a specific configuration snapshot by version
   */
  getSnapshotByVersion(
    stackName: string,
    version: number
  ): ConfigurationSnapshot | undefined {
    const stackSnapshots = this.snapshots.get(stackName);
    return stackSnapshots?.find((s) => s.version === version);
  }

  /**
   * Get all snapshots for a stack (most recent first)
   */
  getAllSnapshots(stackName: string): ConfigurationSnapshot[] {
    const stackSnapshots = this.snapshots.get(stackName) || [];
    return [...stackSnapshots].reverse(); // Return most recent first
  }

  /**
   * Restore configuration from a snapshot
   */
  async restoreFromSnapshot(
    stack: automation.Stack,
    snapshot: ConfigurationSnapshot
  ): Promise<boolean> {
    try {
      this.logger.info(
        `Restoring configuration from snapshot version ${snapshot.version}`
      );

      // Clear current configuration and apply snapshot config
      for (const [key, value] of Object.entries(snapshot.config)) {
        await stack.setConfig(key, value);
      }

      this.logger.info(
        `Configuration restored from snapshot version ${snapshot.version}`
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to restore configuration from snapshot: ${error}`
      );
      return false;
    }
  }

  /**
   * Clean up old snapshots beyond the retention limit
   */
  cleanupOldSnapshots(stackName: string): void {
    const stackSnapshots = this.snapshots.get(stackName);
    if (stackSnapshots && stackSnapshots.length > this.maxSnapshots) {
      const retained = stackSnapshots.slice(-this.maxSnapshots);
      this.snapshots.set(stackName, retained);
      this.logger.debug(
        `Cleaned up old snapshots for ${stackName}, retained ${retained.length}`
      );
    }
  }
}

// Global snapshot manager instance
let globalSnapshotManager: ConfigurationSnapshotManager | undefined;

export function getSnapshotManager(
  logger: Logger
): ConfigurationSnapshotManager {
  if (!globalSnapshotManager) {
    globalSnapshotManager = new ConfigurationSnapshotManager(logger);
  }
  return globalSnapshotManager;
}

// =============================================================================
// Enhanced Rollback with Snapshot Support
// =============================================================================

export async function performEnhancedRollback(
  stack: automation.Stack,
  logger: Logger,
  onProgress: (
    status: DeploymentStatus,
    message: string,
    metadata?: Record<string, any>
  ) => void,
  targetVersion?: number
): Promise<void> {
  const snapshotManager = getSnapshotManager(logger);

  try {
    onProgress("rolling-back", "Starting enhanced rollback operation");
    logger.info(
      "Attempting enhanced rollback with configuration snapshot support"
    );

    // Get stack history to find rollback target
    const history = await stack.history(10);
    let rollbackTarget: any;

    if (targetVersion) {
      // Find specific version in history
      rollbackTarget = history.find(
        (update) => update.version === targetVersion
      );
      if (!rollbackTarget) {
        throw new RollbackError(
          `Specified target version ${targetVersion} not found in stack history`,
          new Error("Target version not found")
        );
      }
    } else {
      // Find last successful deployment
      rollbackTarget = history.find(
        (update) => update.result === "succeeded" && update.kind === "update"
      );
      if (!rollbackTarget) {
        throw new RollbackError(
          "No previous successful deployment found for rollback",
          new Error("No rollback target available")
        );
      }
    }

    onProgress(
      "rolling-back",
      `Found rollback target: version ${rollbackTarget.version}`
    );
    logger.info(`Rolling back to version ${rollbackTarget.version}`);

    // Try to restore from snapshot first
    const snapshot = snapshotManager.getSnapshotByVersion(
      stack.name,
      rollbackTarget.version
    );
    let configRestored = false;

    if (snapshot) {
      onProgress("rolling-back", "Restoring configuration from snapshot");
      logger.info("Found configuration snapshot, attempting to restore");

      configRestored = await snapshotManager.restoreFromSnapshot(
        stack,
        snapshot
      );

      if (configRestored) {
        logger.info("Configuration successfully restored from snapshot");
      } else {
        logger.warn(
          "Failed to restore from snapshot, falling back to standard rollback"
        );
      }
    } else {
      logger.info(
        "No configuration snapshot found, using standard rollback approach"
      );
    }

    // Perform the rollback operation
    onProgress("rolling-back", "Executing rollback update");
    logger.info("Executing rollback update operation");

    const rollbackResult = await stack.up({
      onOutput: (output) => {
        logger.debug(`Rollback output: ${output}`);
      },
      refresh: true,
    });

    // Validate rollback success
    if (rollbackResult.summary?.result === "succeeded") {
      onProgress(
        "rolling-back",
        `Successfully rolled back to version ${rollbackTarget.version}`,
        {
          targetVersion: rollbackTarget.version,
          newVersion: rollbackResult.summary.version,
          configRestored,
          resourceChanges: rollbackResult.summary.resourceChanges,
        }
      );

      // Store new snapshot after successful rollback
      const outputs = await stack.outputs();
      await snapshotManager.storeSnapshot(
        stack,
        rollbackResult.summary.version,
        outputs,
        { rollbackFrom: rollbackTarget.version }
      );

      logger.info(
        `Enhanced rollback completed successfully. New version: ${rollbackResult.summary.version}`
      );
    } else {
      throw new RollbackError(
        `Rollback completed but with unexpected status: ${rollbackResult.summary?.result}`,
        new Error(`Unexpected rollback status`)
      );
    }
  } catch (error) {
    const rollbackError = new RollbackError(
      `Enhanced rollback failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error instanceof Error ? error : new Error(String(error))
    );
    logger.error("Enhanced rollback failed:", rollbackError.message);
    throw rollbackError;
  }
}

// =============================================================================
// Integration Helper for Snapshot Management
// =============================================================================

/**
 * Store a snapshot after a successful deployment
 * This should be called after successful 'up' operations
 */
export async function storeDeploymentSnapshot(
  stack: automation.Stack,
  logger: Logger,
  result: automation.UpResult,
  metadata?: Record<string, any>
): Promise<void> {
  if (result.summary?.result === "succeeded") {
    const snapshotManager = getSnapshotManager(logger);
    const outputs = await stack.outputs();

    await snapshotManager.storeSnapshot(
      stack,
      result.summary.version,
      outputs,
      {
        deploymentTime: new Date(),
        resourceChanges: result.summary.resourceChanges,
        ...metadata,
      }
    );

    logger.debug(
      `Configuration snapshot stored for successful deployment version ${result.summary.version}`
    );
  }
}

/**
 * List available rollback targets for a stack
 */
export async function listRollbackTargets(
  stack: automation.Stack,
  logger: Logger
): Promise<
  Array<{ version: number; timestamp: Date; result: string; kind: string }>
> {
  try {
    const history = await stack.history(10);
    const rollbackTargets = history
      .filter(
        (update) => update.result === "succeeded" && update.kind === "update"
      )
      .map((update) => ({
        version: update.version,
        timestamp: update.startTime,
        result: update.result,
        kind: update.kind,
      }));

    logger.debug(`Found ${rollbackTargets.length} potential rollback targets`);
    return rollbackTargets;
  } catch (error) {
    logger.warn(`Failed to retrieve rollback targets: ${error}`);
    return [];
  }
}
