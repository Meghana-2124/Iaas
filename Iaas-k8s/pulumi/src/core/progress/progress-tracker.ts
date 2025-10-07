import type {
  Logger,
  DeploymentProgress,
  DeploymentStatus,
} from "../../types/index.js";

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

    logger.info(`[${status.toUpperCase()}] ${message}`);
    if (metadata) {
      logger.debug("Progress metadata:", metadata);
    }

    if (onProgress) {
      onProgress(progress);
    }
  };
}
