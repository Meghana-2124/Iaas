import type {
  DeploymentConfig,
  FieldValidationError,
} from "../../types/index.js";

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
    } catch (error) {
      errors.push({
        field: "secretsJson",
        message: "Secrets JSON must be valid JSON",
        value: config.secretsJson,
      });
    }
  }

  return errors;
}
