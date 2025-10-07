// Core functionality exports - automation functions only for external use
export {
  DeploymentError,
  ConfigValidationError,
  RollbackError,
  ConsoleLogger,
  validateDeploymentConfig,
  createProgressCallback,
  withErrorHandling,
  performRollback,
  handleDeployment,
} from "./core/deployment.js";

// Type exports
export * from "./types/index.js";

// Utility exports for automation
export * from "./utils/validation.js";
export * from "./utils/monitoring.js";
export * from "./utils/config-manager.js";

// Infrastructure modules should NOT be exported from here
// They should only be imported directly by the Pulumi program
