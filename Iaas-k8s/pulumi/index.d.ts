// Type definitions for @chimoney/iaas-k8s-deployment
// Project: https://github.com/Chimoney/Iaas
// Definitions by: Chimoney Team

export * from "./dist/automation";

declare module "@chimoney/iaas-k8s-deployment" {
  // Re-export all types and interfaces for better IDE support
  export type {
    DeploymentOptions,
    DeploymentResult,
    DeploymentAction,
    DeploymentStatus,
    LogLevel,
    Logger,
    DeploymentProgress,
    DeploymentConfig,
    FieldValidationError,
  } from "./dist/deployment";

  export {
    DeploymentError,
    ConfigValidationError,
    RollbackError,
    ConsoleLogger,
    handleDeployment,
    runCLI,
    validateDeploymentConfig,
    createProgressCallback,
    withErrorHandling,
    performRollback,
  } from "./dist/deployment";
}
