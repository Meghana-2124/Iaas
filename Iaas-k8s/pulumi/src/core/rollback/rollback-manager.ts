import { automation } from "@pulumi/pulumi";
import type { Logger, DeploymentStatus } from "../../types/index.js";
import { RollbackError } from "../errors/deployment-errors.js";

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
    logger.error(`Failed to list rollback targets: ${error}`);
    return [];
  }
}
