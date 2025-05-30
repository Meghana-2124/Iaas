import { automation } from "@pulumi/pulumi";
import type {
  Logger,
  DeploymentAction,
  DeploymentResult,
} from "../../types/index.js";
import { DeploymentError } from "../errors/deployment-errors.js";
import { storeDeploymentSnapshot } from "../rollback/rollback-manager.js";

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
// Deployment Action Executor
// =============================================================================

export async function executeDeploymentAction(
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
