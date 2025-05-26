// =============================================================================
// Shared Type Definitions
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type DeploymentAction =
  | "up"
  | "preview"
  | "destroy"
  | "outputs"
  | "refresh"
  | "rollback";

export type DeploymentStatus =
  | "initializing"
  | "configuring"
  | "deploying"
  | "completed"
  | "failed"
  | "rolling-back";

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface DeploymentProgress {
  status: DeploymentStatus;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface DeploymentOptions {
  action: DeploymentAction;
  stackName: string;
  secretsJson: string;
  valuesJson?: string;
  companyName: string;
  workDir?: string;
  helmChartPath?: string;
  logLevel?: LogLevel;
  onProgress?: (progress: DeploymentProgress) => void;
  validateConfig?: boolean;
  enableRollback?: boolean;
  timeout?: number; // in seconds
  // Enhanced cloud configuration
  cloudProvider?: "aws" | "gcp";
  cloudConfig?: AwsCloudConfig | GcpCloudConfig;
  autoSetupConfig?: boolean; // Automatically setup Pulumi config
}

export interface AwsCloudConfig {
  region: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface GcpCloudConfig {
  project: string;
  region: string;
  zone?: string;
  credentials?: string | object; // Path to service account JSON, JSON content string, or service account object
}

export type CloudConfig = AwsCloudConfig | GcpCloudConfig;

export interface DeploymentResult {
  success: boolean;
  outputs?: any;
  summary?: any;
  error?: string;
  kubeconfig?: string;
  rollbackPerformed?: boolean;
  duration?: number; // in milliseconds
}

export interface FieldValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface DeploymentConfig {
  stackName: string;
  secretsJson: string;
  valuesJson?: string;
  companyName: string;
  cloudProvider?: "aws" | "gcp";
  helmChartPath?: string;
  cloudConfig?: CloudConfig;
}

// Kubernetes-specific types
export interface K8sLoadBalancerIngress {
  hostname?: string;
  ip?: string;
}

export interface K8sLoadBalancerStatus {
  ingress?: K8sLoadBalancerIngress[];
}

export interface IngressStatus {
  loadBalancer?: K8sLoadBalancerStatus;
}

export interface ServiceStatus {
  loadBalancer?: K8sLoadBalancerStatus;
}
