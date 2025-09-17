import { automation } from "@pulumi/pulumi";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  validateDeploymentOptionsWithZod,
  validateSecretsStructure,
  validateAndProcessSecrets,
  validateNamespaceConfiguration,
} from "../../utils/validation.js";
import { DeploymentMonitor } from "../../utils/monitoring.js";
import { PulumiConfigManager } from "../../utils/config-manager.js";
import { TierCalculator } from "../../utils/tier-calculator.js";
import type {
  DeploymentOptions,
  DeploymentResult,
  TierDeploymentResult,
  FieldValidationError,
  DeploymentConfig,
} from "../../types/index.js";

// Import the separated modules
import {
  DeploymentError,
  ConfigValidationError,
} from "../errors/deployment-errors.js";
import { ConsoleLogger } from "../logging/console-logger.js";
import { validateDeploymentConfig } from "../validation/config-validator.js";
import { createProgressCallback } from "../progress/progress-tracker.js";
import { performRollback } from "../rollback/rollback-manager.js";
import {
  generateDynamicHelmValues,
  mergeHelmValues,
} from "../helm/helm-values-generator.js";
import {
  withErrorHandling,
  executeDeploymentAction,
} from "./deployment-executor.js";

// =============================================================================
// Main Deployment Handler
// =============================================================================

export async function handleDeployment(
  options: DeploymentOptions
): Promise<DeploymentResult> {
  const startTime = Date.now();
  const {
    action,
    stackName, // Keep original stackName for constructing the FQSN
    secretsJson,
    companyName, // This will be used as the organization
    workDir,
    logLevel = "info",
    onProgress,
    validateConfig = true,
    enableRollback = true,
    timeout = 1800, // 30 minutes default
    // New namespace-based deployment parameters
    namespace,
    deploymentType,
  } = options;

  const projectName = "iaas-k8s";
  const organizationName = process.env.PULUMI_ORG_NAME || "organization"; // Using "organization", needed for Pulumi LocalWorkspace

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
  let result: DeploymentResult;

  try {
    reportProgress("initializing", "Starting deployment initialization");
    monitor.recordProgress({
      status: "initializing",
      message: "Starting deployment initialization",
      timestamp: new Date(),
    });

    // =============================================================================
    // Enhanced Configuration Validation
    // helmChartPath removed
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

      if (secretErrors.length > 0) {
        const errorMessage = `Configuration structure validation failed: ${secretErrors
          .map((e: FieldValidationError) => `${e.field}: ${e.message}`)
          .join(", ")}`;
        throw new ConfigValidationError(errorMessage, secretErrors);
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
    // Tier-Based Resource Allocation Validation
    // =============================================================================
    let tierAllocationResult: any;
    if (options.planTier && deploymentType === "shared") {
      logger.info(
        `Processing tier-based deployment for ${options.planTier} tier`
      );

      const tierCalculator = new TierCalculator(logger);
      const effectiveNamespace = namespace || options.namespace!;

      // Calculate tier allocation for resource planning
      tierAllocationResult = tierCalculator.calculateTierAllocation(
        options.planTier,
        companyName,
        effectiveNamespace,
        {
          kubecostEnabled: false, // Kubecost integration removed
          billingAccountId: options.billingAccountId,
        }
      );

      if (!tierAllocationResult.success) {
        const errorMessage = `Tier allocation failed: ${tierAllocationResult.errors.join(
          ", "
        )}`;
        logger.error(errorMessage);
        throw new ConfigValidationError(errorMessage, []);
      }

      if (tierAllocationResult.warnings.length > 0) {
        tierAllocationResult.warnings.forEach((warning: string) => {
          logger.warn(`Tier warning: ${warning}`);
        });
      }

      logger.info(
        `Tier allocation calculated successfully for ${options.planTier} tier`
      );
      logger.debug(
        `Estimated monthly cost: $${tierAllocationResult.estimatedCosts.monthly}`
      );
    } else if (options.planTier && deploymentType === "dedicated") {
      logger.warn(
        "Plan tier specified for dedicated deployment - tier-based resource allocation is only supported for shared deployments"
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
        companyName,
      };

      const validationErrors = validateDeploymentConfig(config);
      if (validationErrors.length > 0) {
        const errorMessage = validationErrors
          .map((e) => `${e.field}: ${e.message}`)
          .join(", ");
        throw new ConfigValidationError(
          `Configuration validation failed: ${errorMessage}`,
          validationErrors
        );
      }
    }

    // =============================================================================
    // Stack Initialization
    // =============================================================================
    // Determine the correct working directory - use the npm package root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Navigate to the package root where index.ts and Pulumi.yaml are located
    const packageRoot = resolve(__dirname, "../../../");
    const resolvedWorkDir = workDir || packageRoot;

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

      const configManager = new PulumiConfigManager(logger);
      await configManager.setupPulumiConfig(resolvedWorkDir, stack, {
        stackName,
        cloudProvider: options.cloudProvider,
        companyName,
        cloudConfig: options.cloudConfig,
        secretsJson,
      });
      logger.info("Pulumi config auto-setup complete.");
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

        logger.info("Secrets validation passed");

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

        // Generate dynamic Helm values
        logger.info(
          "Generating dynamic Helm chart values with Kubernetes secrets enabled"
        );

        const dynamicHelmValues = generateDynamicHelmValues(options, logger);

        // Merge with tier-based values if applicable
        let finalHelmValues = dynamicHelmValues;
        if (tierAllocationResult && tierAllocationResult.success) {
          logger.info(`Merging tier-based values for ${options.planTier} tier`);
          finalHelmValues = mergeHelmValues(
            dynamicHelmValues,
            tierAllocationResult.helmValues,
            logger
          );
        }

        const finalValuesJson = JSON.stringify(finalHelmValues);
        await stack!.setConfig("helmValuesJson", { value: finalValuesJson });
        logger.info(
          "Set helmValuesJson configuration with dynamically generated values"
        );

        // Set company name
        await stack!.setConfig("companyName", { value: companyName });
        logger.info("Set companyName configuration");

        // Set cloud provider config
        if (options.cloudProvider) {
          await stack!.setConfig("cloudProvider", {
            value: options.cloudProvider,
          });
          logger.info(
            `Set cloudProvider configuration: ${options.cloudProvider}`
          );
        }

        // Set Helm chart path if provided
        // helmChartPath configuration removed

        // Set namespace and deployment type configuration
        const effectiveNamespace = namespace || options.namespace;
        if (effectiveNamespace) {
          await stack!.setConfig("namespace", { value: effectiveNamespace });
          logger.info(`Set namespace configuration: ${effectiveNamespace}`);
        }

        await stack!.setConfig("deploymentType", { value: deploymentType });
        logger.info(`Set deploymentType configuration: ${deploymentType}`);

        // Set tier-based configuration if applicable
        if (options.planTier) {
          await stack!.setConfig("planTier", { value: options.planTier });
          logger.info(`Set planTier configuration: ${options.planTier}`);
        }
      },
      logger,
      "configuration setup"
    );

    // =============================================================================
    // Execute Deployment Action
    // =============================================================================
    reportProgress("deploying", `Executing ${action} operation`);

    if (action === "rollback") {
      try {
        reportProgress("rolling-back", "Starting manual rollback operation");
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

    // Initialize the result with basic information
    result = {
      success: true,
      ...operationResult,
      duration: Date.now() - startTime,
    };

    // Add tier-specific information to the result if available
    if (tierAllocationResult && tierAllocationResult.success) {
      // Cast to TierDeploymentResult type to add tierInfo
      (result as TierDeploymentResult) = {
        success: true,
        ...operationResult,
        tierInfo: {
          planTier: options.planTier!,
          resourceAllocation: tierAllocationResult.resourceAllocation,
          costEstimate: {
            monthly: tierAllocationResult.estimatedCosts.monthly,
            currency: "USD",
          },
          costMonitoring: {
            enabled: false, // Kubecost integration removed
            dashboardUrl: undefined,
            budgetAllocated: undefined,
            budgetThresholds: [75, 90, 100], // Standard thresholds
            alertsEnabled: false,
          },
        },
        duration: Date.now() - startTime,
      };
    } else {
      // Standard result format
      result = {
        success: true,
        ...operationResult,
        duration: Date.now() - startTime,
      };
    }

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
    } else {
      errorMessage = String(error);
    }

    // Include rollback error in the message if it occurred
    if (rollbackError) {
      errorMessage += ` (Rollback also failed: ${rollbackError.message})`;
    }

    return {
      success: false,
      error: errorMessage,
      rollbackPerformed,
      duration: Date.now() - startTime,
    };
  }
}
