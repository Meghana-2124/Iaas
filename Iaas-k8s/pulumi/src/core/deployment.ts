/**
 * @fileoverview Deployment module - Re-exports for backwards compatibility
 *
 * This file has been refactored to improve maintainability. The original
 * monolithic implementation has been split into focused modules:
 *
 * - errors/         - Error classes and handling
 * - logging/        - Logger implementations
 * - validation/     - Configuration validation
 * - progress/       - Progress tracking utilities
 * - rollback/       - Rollback functionality
 * - helm/           - Helm values generation
 * - deployment/     - Core deployment logic
 *
 * All exports maintain the same interface for backwards compatibility.
 */

// =============================================================================
// Re-exports from separated modules for backwards compatibility
// =============================================================================

// Error classes
export {
  DeploymentError,
  ConfigValidationError,
  RollbackError,
} from "./errors/index.js";

// Logger implementation
export { ConsoleLogger } from "./logging/index.js";

// Configuration validation
export { validateDeploymentConfig } from "./validation/index.js";

// Progress tracking
export { createProgressCallback } from "./progress/index.js";

// Rollback functionality
export {
  performRollback,
  performEnhancedRollback,
  listRollbackTargets,
  storeDeploymentSnapshot,
  getSnapshotManager,
  ConfigurationSnapshotManager,
} from "./rollback/index.js";

// Helm values generation
export { generateDynamicHelmValues, mergeHelmValues } from "./helm/index.js";

// Error handling and deployment execution
export {
  withErrorHandling,
  executeDeploymentAction,
  handleDeployment,
} from "./deployment/index.js";
