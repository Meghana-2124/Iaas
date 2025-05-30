import type { FieldValidationError } from "../../types/index.js";

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
