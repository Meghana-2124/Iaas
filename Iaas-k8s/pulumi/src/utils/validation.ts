import { z } from "zod";
import { Buffer } from "buffer"; // In Node.js, Buffer is global. Add this if in a non-Node env needing explicit import.
import type {
  DeploymentOptions,
  DeploymentConfig,
  FieldValidationError,
} from "../types/index.js";

// =============================================================================
// Zod Schema Definitions
// =============================================================================

export const LogLevelSchema = z.enum([
  "debug",
  "info",
  "warn",
  "error",
  "silent",
]);

export const DeploymentActionSchema = z.enum([
  "up",
  "preview",
  "destroy",
  "outputs",
  "refresh",
  "rollback",
]);

export const DeploymentStatusSchema = z.enum([
  "initializing",
  "configuring",
  "deploying",
  "completed",
  "failed",
  "rolling-back",
]);

// Enhanced Cloud Configuration Schemas
export const AwsCloudConfigSchema = z.object({
  region: z.string().min(1, "AWS region is required"),
  profile: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

export const GcpCloudConfigSchema = z.object({
  project: z.string().min(1, "GCP project is required"),
  region: z.string().min(1, "GCP region is required"),
  zone: z.string().optional(),
  credentials: z.union([z.string(), z.object({}).passthrough()]).optional(), // Path, JSON string, or service account object
});

export const CloudConfigSchema = z.union([
  AwsCloudConfigSchema,
  GcpCloudConfigSchema,
]);

export const DeploymentConfigSchema = z.object({
  stackName: z
    .string()
    .min(1, "Stack name is required")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Stack name can only contain alphanumeric characters, hyphens, and underscores"
    ),

  secretsJson: z
    .string()
    .min(1, "Secrets JSON is required")
    .refine((val) => {
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === "object" && parsed !== null;
      } catch {
        return false;
      }
    }, "Secrets JSON must be valid JSON object"),

  valuesJson: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === "object" && parsed !== null;
      } catch {
        return false;
      }
    }, "Values JSON must be valid JSON object"),

  companyName: z
    .string()
    .min(1, "Company name is required")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Company name can only contain alphanumeric characters, hyphens, and underscores"
    ),

  cloudProvider: z.enum(["aws", "gcp"]).optional(),

  helmChartPath: z.string().optional(),
});

export const DeploymentOptionsSchema = z.object({
  action: DeploymentActionSchema,
  stackName: z
    .string()
    .min(1, "Stack name is required")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Stack name can only contain alphanumeric characters, hyphens, and underscores"
    ),

  secretsJson: z
    .string()
    .min(1, "Secrets JSON is required")
    .refine((val) => {
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === "object" && parsed !== null;
      } catch {
        return false;
      }
    }, "Secrets JSON must be valid JSON object"),

  valuesJson: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === "object" && parsed !== null;
      } catch {
        return false;
      }
    }, "Values JSON must be valid JSON object"),

  companyName: z
    .string()
    .min(1, "Company name is required")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Company name can only contain alphanumeric characters, hyphens, and underscores"
    ),

  workDir: z.string().optional(),
  helmChartPath: z.string().optional(),
  logLevel: LogLevelSchema.optional(),
  validateConfig: z.boolean().optional(),
  enableRollback: z.boolean().optional(),
  timeout: z.number().min(1).max(7200).optional(), // 1 second to 2 hours
  // Enhanced cloud configuration
  cloudProvider: z.enum(["aws", "gcp"]).optional(),
  cloudConfig: CloudConfigSchema.optional(),
  autoSetupConfig: z.boolean().optional(),
});

// =============================================================================
// Enhanced Validation Functions
// =============================================================================

export function validateDeploymentOptionsWithZod(
  options: DeploymentOptions
): FieldValidationError[] {
  const result = DeploymentOptionsSchema.safeParse(options);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
    value: issue.path.reduce((obj, key) => obj?.[key], options as any),
  }));
}

export function validateDeploymentConfigWithZod(
  config: DeploymentConfig
): FieldValidationError[] {
  const result = DeploymentConfigSchema.safeParse(config);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
    value: issue.path.reduce((obj, key) => obj?.[key], config as any),
  }));
}

// =============================================================================
// Additional Validation Helpers
// =============================================================================

// This function validates the expected structure for Kubernetes secrets processing.
export function validateSecretsStructure(
  secretsJson: string
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];
  try {
    const secrets = JSON.parse(secretsJson);
    if (!secrets.kubernetesSecrets) {
      errors.push({
        field: "kubernetesSecrets",
        message:
          "Top-level 'kubernetesSecrets' key is missing in secrets JSON.",
        value: secrets,
      });
      return errors; // Stop further validation if the main key is missing
    }

    for (const serviceName of Object.keys(secrets.kubernetesSecrets)) {
      const serviceSecretConfig = secrets.kubernetesSecrets[serviceName];
      if (
        typeof serviceSecretConfig !== "object" ||
        serviceSecretConfig === null
      ) {
        errors.push({
          field: `kubernetesSecrets.${serviceName}`,
          message: `Configuration for '${serviceName}' must be an object.`,
          value: serviceSecretConfig,
        });
        continue;
      }
      if (!serviceSecretConfig.stringData) {
        errors.push({
          field: `kubernetesSecrets.${serviceName}.stringData`,
          message: `'stringData' key is missing for service '${serviceName}' in secrets JSON.`,
          value: serviceSecretConfig,
        });
      } else if (
        typeof serviceSecretConfig.stringData !== "object" ||
        serviceSecretConfig.stringData === null
      ) {
        errors.push({
          field: `kubernetesSecrets.${serviceName}.stringData`,
          message: `'stringData' field for service '${serviceName}' must be an object.`,
          value: serviceSecretConfig.stringData,
        });
      }
    }
  } catch (e) {
    // This case is also handled by the main try-catch in validateAndEncodeSecrets,
    // but specific parsing errors for structure can be caught here too.
    errors.push({
      field: "secretsJson",
      message: `Invalid JSON format when validating secrets structure: ${
        e instanceof Error ? e.message : String(e)
      }`,
      value: secretsJson.substring(0, 100) + "...",
    });
  }
  return errors;
}

export function validateValuesStructure(
  valuesJson: string
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  if (!valuesJson) return errors; // Optional, so no error if not provided

  try {
    const values = JSON.parse(valuesJson);

    // Validate common value structures
    if (values.replicaCount !== undefined) {
      if (typeof values.replicaCount !== "number" || values.replicaCount < 1) {
        errors.push({
          field: "values.replicaCount",
          message: "replicaCount must be a positive number",
          value: values.replicaCount,
        });
      }
    }

    if (values.resources) {
      const resources = values.resources;
      if (typeof resources !== "object" || resources === null) {
        errors.push({
          field: "values.resources",
          message: "resources must be an object",
          value: resources,
        });
      } else {
        if (resources.requests) {
          if (
            typeof resources.requests !== "object" ||
            resources.requests === null
          ) {
            errors.push({
              field: "values.resources.requests",
              message: "resources.requests must be an object",
              value: resources.requests,
            });
          } else {
            if (
              resources.requests.cpu &&
              typeof resources.requests.cpu !== "string"
            ) {
              errors.push({
                field: "values.resources.requests.cpu",
                message: 'CPU request must be a string (e.g., "100m")',
                value: resources.requests.cpu,
              });
            }

            if (
              resources.requests.memory &&
              typeof resources.requests.memory !== "string"
            ) {
              errors.push({
                field: "values.resources.requests.memory",
                message: 'Memory request must be a string (e.g., "128Mi")',
                value: resources.requests.memory,
              });
            }
          }
        }
        // Add similar checks for limits if needed
      }
    }
  } catch (e) {
    errors.push({
      field: "valuesJson",
      message: `Invalid JSON format for values: ${
        e instanceof Error ? e.message : String(e)
      }`,
      value: valuesJson.substring(0, 100) + "...",
    });
  }

  return errors;
}

// =============================================================================
// Secret Processing Utilities (stringData support)
// =============================================================================

/**
 * @deprecated Base64 encoding is no longer needed for stringData secrets.
 * This function is kept for legacy compatibility only.
 * Encodes a single string value to Base64.
 */
export function encodeSecretValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/**
 * @deprecated Base64 decoding is no longer needed for stringData secrets.
 * This function is kept for legacy compatibility only.
 * Decodes a single Base64 encoded string value.
 */
export function decodeSecretValue(encodedValue: string): string {
  return Buffer.from(encodedValue, "base64").toString("utf8");
}

/**
 * @deprecated Base64 detection is no longer needed for stringData secrets.
 * This function is kept for legacy compatibility only.
 * Checks if a string is already Base64 encoded.
 */
export function isBase64Encoded(str: string): boolean {
  if (str === "" || str.trim() === "") {
    return false;
  }
  try {
    // The most reliable way: decode and re-encode. If it's the same, it was valid base64.
    return Buffer.from(str, "base64").toString("base64") === str;
  } catch (e) {
    // If decoding throws an error, it's not valid Base64.
    return false;
  }
}

/**
 * Enhanced version that provides detailed validation and processing for Kubernetes secrets.
 * This function recursively processes the secrets object and validates
 * string values found under any 'stringData' key within the 'kubernetesSecrets' structure.
 * Since we're using stringData, no base64 encoding is needed.
 */
function validateSecretsForKubernetesWithReport(secretsInput: any): {
  processedSecrets: any;
  report: {
    [key: string]: "processed" | "placeholder" | "skipped";
  };
} {
  // Expecting secretsInput to be the full parsed JSON, e.g., { kubernetesSecrets: { ... } }
  const processedSecrets = JSON.parse(JSON.stringify(secretsInput)); // Deep clone
  const report: {
    [key: string]: "processed" | "placeholder" | "skipped";
  } = {};

  function processObject(obj: any, currentPathParts: string[]): void {
    for (const [key, value] of Object.entries(obj)) {
      const newPathParts = [...currentPathParts, key];
      const fullPathKey = newPathParts.join(".");

      if (typeof value === "string") {
        // Check if the immediate parent key is 'stringData'.
        const isInTargetStringDataObject =
          currentPathParts.length > 0 &&
          currentPathParts[currentPathParts.length - 1] === "stringData";

        if (isInTargetStringDataObject) {
          if (
            value.startsWith("PLEASE_REPLACE_WITH_") ||
            value.startsWith("<REPLACE_WITH_") ||
            value.includes("REPLACE_WITH")
          ) {
            report[fullPathKey] = "placeholder";
            console.warn(
              `Found placeholder value for ${fullPathKey}: ${value}`
            );
            continue; // Skip processing for placeholders
          }

          // For stringData, we don't need to encode - just mark as processed
          report[fullPathKey] = "processed";
        } else {
          report[fullPathKey] = "skipped";
        }
      } else if (typeof value === "object" && value !== null) {
        processObject(value, newPathParts);
      } else {
        const isInTargetStringDataObject =
          currentPathParts.length > 0 &&
          currentPathParts[currentPathParts.length - 1] === "stringData";
        if (!isInTargetStringDataObject) {
          report[fullPathKey] = "skipped";
        } else {
          if (
            value !== null &&
            (typeof value === "number" || typeof value === "boolean")
          ) {
            // Convert numbers and booleans to strings for Kubernetes secret stringData values
            obj[key] = String(value);
            report[fullPathKey] = "processed";
          } else {
            report[fullPathKey] = "skipped"; // Other types (null, undefined under stringData)
          }
        }
      }
    }
  }

  // Start processing from the root of the cloned secrets object
  if (processedSecrets.kubernetesSecrets) {
    processObject(processedSecrets.kubernetesSecrets, ["kubernetesSecrets"]);
  } else {
    // If kubernetesSecrets key is missing, the report will be empty,
    // and no processing will happen. Structure validation should catch this.
    console.warn(
      "validateSecretsForKubernetesWithReport: 'kubernetesSecrets' key not found in input. No secrets will be processed."
    );
  }
  return { processedSecrets, report };
}

export function validateAndProcessSecrets(secretsJson: string): {
  isValid: boolean;
  processedSecretsJson: string;
  errors: FieldValidationError[];
  processingReport?: {
    [key: string]: "processed" | "placeholder" | "skipped";
  };
} {
  let errors: FieldValidationError[] = [];
  let processingReport: {
    [key: string]: "processed" | "placeholder" | "skipped";
  } = {};

  try {
    const secrets = JSON.parse(secretsJson);

    const structureErrors = validateSecretsStructure(secretsJson); // Pass the raw JSON string
    errors.push(...structureErrors);

    if (errors.length > 0) {
      return {
        isValid: false,
        processedSecretsJson: secretsJson,
        errors,
        // processingReport will be empty or undefined here
      };
    }

    const { processedSecrets, report } =
      validateSecretsForKubernetesWithReport(secrets); // Pass the parsed 'secrets' object

    processingReport = report;
    console.log("Secret processing report:", report);

    for (const [key, status] of Object.entries(report)) {
      if (status === "placeholder") {
        // Attempt to get the original placeholder value for the error message
        let placeholderValue = "PLACEHOLDER_VALUE_NOT_RETRIEVED";
        const pathParts = key.split(".");
        try {
          placeholderValue = pathParts.reduce(
            (acc, part) => acc && acc[part],
            secrets
          );
        } catch (e) {
          /* ignore if path is invalid, shouldn't happen */
        }

        errors.push({
          field: key,
          message: `Placeholder value found for '${key}'. Please replace '${placeholderValue}'.`,
          value: placeholderValue,
        });
      }
    }

    if (errors.length > 0) {
      return {
        isValid: false, // If placeholders are considered errors making it invalid
        processedSecretsJson: JSON.stringify(processedSecrets), // Still return the (partially) processed secrets
        errors,
        processingReport,
      };
    }

    return {
      isValid: true,
      processedSecretsJson: JSON.stringify(processedSecrets),
      errors: [], // errors is empty if we reach here
      processingReport: report,
    };
  } catch (e) {
    // This catch is primarily for JSON.parse(secretsJson) failure
    errors.push({
      field: "secretsJson",
      message: `Invalid JSON format for secrets: ${
        e instanceof Error ? e.message : String(e)
      }`,
      value: secretsJson.substring(0, 100) + "...",
    });

    return {
      isValid: false,
      processedSecretsJson: secretsJson,
      errors,
      processingReport,
    };
  }
}

// Legacy function name for backward compatibility - now just calls the new function
export function validateAndEncodeSecrets(secretsJson: string): {
  isValid: boolean;
  encodedSecretsJson: string;
  errors: FieldValidationError[];
  encodingReport?: {
    [key: string]: "encoded" | "already_encoded" | "placeholder" | "skipped";
  };
} {
  const result = validateAndProcessSecrets(secretsJson);

  // Map the new report statuses to old ones for backward compatibility
  const encodingReport: {
    [key: string]: "encoded" | "already_encoded" | "placeholder" | "skipped";
  } = {};

  if (result.processingReport) {
    for (const [key, status] of Object.entries(result.processingReport)) {
      switch (status) {
        case "processed":
          encodingReport[key] = "encoded"; // For backward compatibility
          break;
        case "placeholder":
          encodingReport[key] = "placeholder";
          break;
        case "skipped":
          encodingReport[key] = "skipped";
          break;
      }
    }
  }

  return {
    isValid: result.isValid,
    encodedSecretsJson: result.processedSecretsJson,
    errors: result.errors,
    encodingReport,
  };
}

// =============================================================================
// Type Guards
// =============================================================================

export function isValidDeploymentAction(
  action: string
): action is z.infer<typeof DeploymentActionSchema> {
  return DeploymentActionSchema.safeParse(action).success;
}

export function isValidLogLevel(
  level: string
): level is z.infer<typeof LogLevelSchema> {
  return LogLevelSchema.safeParse(level).success;
}

export function isValidDeploymentStatus(
  status: string
): status is z.infer<typeof DeploymentStatusSchema> {
  return DeploymentStatusSchema.safeParse(status).success;
}
