import { z } from "zod";
import type {
  DeploymentOptions,
  DeploymentConfig,
  FieldValidationError,
  CloudConfig,
  AwsCloudConfig,
  GcpCloudConfig,
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
  credentials: z.string().optional(), // Path to service account JSON or JSON content
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
  autoSetupConfig: z.boolean().optional(), // 1 second to 2 hours
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

export function validateSecretsStructure(
  secretsJson: string
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  try {
    const secrets = JSON.parse(secretsJson);

    // Check for required secret fields (customize based on your needs)
    const requiredSecrets = ["dbPassword"];
    const recommendedSecrets = ["jwtSecret", "redisPassword"];

    for (const required of requiredSecrets) {
      if (!secrets[required]) {
        errors.push({
          field: `secrets.${required}`,
          message: `Required secret '${required}' is missing`,
          value: undefined,
        });
      }
    }

    for (const recommended of recommendedSecrets) {
      if (!secrets[recommended]) {
        // This is a warning, not an error
        console.warn(`Recommended secret '${recommended}' is missing`);
      }
    }

    // Validate secret values are not empty
    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value === "string" && value.trim() === "") {
        errors.push({
          field: `secrets.${key}`,
          message: `Secret '${key}' cannot be empty`,
          value: value,
        });
      }
    }
  } catch (e) {
    errors.push({
      field: "secretsJson",
      message: "Invalid JSON format for secrets",
      value: secretsJson,
    });
  }

  return errors;
}

export function validateValuesStructure(
  valuesJson: string
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  if (!valuesJson) return errors;

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

      if (resources.requests) {
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
  } catch (e) {
    errors.push({
      field: "valuesJson",
      message: "Invalid JSON format for values",
      value: valuesJson,
    });
  }

  return errors;
}

// =============================================================================
// Secret Encoding Utilities
// =============================================================================

export function encodeSecretValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function decodeSecretValue(encodedValue: string): string {
  return Buffer.from(encodedValue, "base64").toString("utf8");
}

export function isBase64Encoded(value: string): boolean {
  try {
    // Skip obvious non-base64 values
    if (!value || value.length < 4) return false;

    // Check for placeholder values
    if (
      value.startsWith("PLEASE_REPLACE_WITH_") ||
      value.startsWith("<REPLACE_WITH_") ||
      value.includes("REPLACE_WITH")
    ) {
      return false;
    }

    // Check if the string contains only valid base64 characters
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(value)) return false;

    // Check if length is valid for base64 (multiple of 4)
    if (value.length % 4 !== 0) return false;

    // Try to decode and re-encode to verify it's valid base64
    const decoded = Buffer.from(value, "base64").toString("base64");
    return decoded === value;
  } catch {
    return false;
  }
}

export function encodeSecretsForKubernetes(secrets: any): any {
  const encodedSecrets = JSON.parse(JSON.stringify(secrets)); // Deep clone

  // Function to recursively encode all string values
  function encodeObject(obj: any): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        // Skip placeholder values that indicate they need replacement
        if (
          value.startsWith("PLEASE_REPLACE_WITH_") ||
          value.startsWith("<REPLACE_WITH_") ||
          value.includes("REPLACE_WITH")
        ) {
          console.warn(`Found placeholder value for ${key}: ${value}`);
          continue;
        }

        // Encode all string values if not already base64 encoded
        if (!isBase64Encoded(value)) {
          obj[key] = encodeSecretValue(value);
        }
      } else if (typeof value === "object" && value !== null) {
        // Recursively process objects
        encodeObject(value);
      }
    }
  }

  encodeObject(encodedSecrets);
  return encodedSecrets;
}

export function validateAndEncodeSecrets(secretsJson: string): {
  isValid: boolean;
  encodedSecretsJson: string;
  errors: FieldValidationError[];
  encodingReport?: {
    [key: string]: "encoded" | "already_encoded" | "placeholder" | "skipped";
  };
} {
  const errors: FieldValidationError[] = [];
  const encodingReport: {
    [key: string]: "encoded" | "already_encoded" | "placeholder" | "skipped";
  } = {};

  try {
    const secrets = JSON.parse(secretsJson);

    // Validate structure first
    const structureErrors = validateSecretsStructure(secretsJson);
    errors.push(...structureErrors);

    if (errors.length > 0) {
      return {
        isValid: false,
        encodedSecretsJson: secretsJson,
        errors,
        encodingReport,
      };
    }

    // Encode secrets for Kubernetes with tracking
    const { encodedSecrets, report } =
      encodeSecretsForKubernetesWithReport(secrets);

    console.log("Secret encoding report:", report);

    return {
      isValid: true,
      encodedSecretsJson: JSON.stringify(encodedSecrets),
      errors: [],
      encodingReport: report,
    };
  } catch (e) {
    errors.push({
      field: "secretsJson",
      message: `Invalid JSON format for secrets: ${
        e instanceof Error ? e.message : "Unknown error"
      }`,
      value: secretsJson,
    });

    return {
      isValid: false,
      encodedSecretsJson: secretsJson,
      errors,
      encodingReport,
    };
  }
}

/**
 * Enhanced version that provides detailed reporting of encoding operations
 */
function encodeSecretsForKubernetesWithReport(secrets: any): {
  encodedSecrets: any;
  report: {
    [key: string]: "encoded" | "already_encoded" | "placeholder" | "skipped";
  };
} {
  const encodedSecrets = JSON.parse(JSON.stringify(secrets)); // Deep clone
  const report: {
    [key: string]: "encoded" | "already_encoded" | "placeholder" | "skipped";
  } = {};

  // Function to recursively encode all string values
  function encodeObject(obj: any, path: string = ""): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === "string") {
        // Skip placeholder values that indicate they need replacement
        if (
          value.startsWith("PLEASE_REPLACE_WITH_") ||
          value.startsWith("<REPLACE_WITH_") ||
          value.includes("REPLACE_WITH")
        ) {
          report[currentPath] = "placeholder";
          console.warn(`Found placeholder value for ${currentPath}: ${value}`);
          continue;
        }

        // Encode all string values if not already base64 encoded
        if (isBase64Encoded(value)) {
          report[currentPath] = "already_encoded";
        } else {
          obj[key] = encodeSecretValue(value);
          report[currentPath] = "encoded";
        }
      } else if (typeof value === "object" && value !== null) {
        // Recursively process objects
        encodeObject(value, currentPath);
      }
    }
  }

  encodeObject(encodedSecrets);
  return { encodedSecrets, report };
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
