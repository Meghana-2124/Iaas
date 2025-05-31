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
  // Namespace-based deployment support
  namespace?: string; // Kubernetes namespace for the deployment
  deploymentType: "shared" | "dedicated"; // Deployment strategy
  // Tier-based resource allocation support
  planTier?: import("./plans.js").PlanTier; // Plan tier for shared deployments
  billingAccountId?: string; // Billing account for cost attribution

  // Dynamic Helm values configuration
  defaultDomain?: string; // Default domain for constructing hostnames (e.g., "example.com")
  authDomain?: string; // Domain for authentication service (e.g., "auth-ilp.example.com")
  openPaymentsDomain?: string; // Domain for open payments service (e.g., "ilp.example.com")
  connectorDomain?: string; // Domain for connector service (e.g., "ilp-connector.example.com")

  // Service enablement flags
  enableRafikiAuth?: boolean; // Enable rafiki-auth service
  enableRafikiBackend?: boolean; // Enable rafiki-backend service
  enableNginx?: boolean; // Enable nginx service
  enableRedis?: boolean; // Enable redis service
  graphqlAllowedIps?: string[]; // Allowed IPs for GraphQL API access

  // Image configuration
  rafikiAuthImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  rafikiBackendImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  nginxImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  redisImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };

  // Ingress configuration
  ingressClassName?: string; // Ingress class name for the Ingress resource

  // HPA configuration for dedicated deployments
  dedicatedDeploymentHpaEnabledByDefault?: boolean; // Control default HPA enablement for dedicated deployments

  // Network policy configuration for shared deployments
  sharedDeploymentNetworkPolicyEnabled?: boolean; // Enable network policies for shared deployments
  ingressControllerNamespace?: string; // Namespace of the ingress controller
  ingressControllerPodSelectorLabels?: Record<string, string>; // Pod selector labels for ingress controller
  allowedExternalEgressRules?: Array<{
    cidr: string;
    ports?: Array<{
      port: number;
      protocol: "TCP" | "UDP";
    }>;
  }>; // External egress rules for network policies

  // Additional monitoring and cloud configuration properties
  prometheusFqdn?: string; // FQDN for Prometheus monitoring
  clusterName?: string; // Kubernetes cluster name
  environment?: string; // Deployment environment (dev, staging, prod)
  managedCertificateEnabled?: boolean; // Enable managed certificates (GCP/AWS)
  createKubernetesSecrets?: boolean; // Enable Kubernetes secrets creation
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
  credentials?: string; // Path to service account JSON
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
  costMonitoring?: {
    enabled: boolean;
    namespace?: string;
    tier?: string;
    budget?: number;
    currency?: string;
    dashboardUrl?: string;
    reason?: string;
    error?: string;
  };
}

export interface FieldValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface DeploymentConfig {
  stackName: string;
  secretsJson: string;
  companyName: string;
  cloudProvider?: "aws" | "gcp";
  helmChartPath?: string;
  cloudConfig?: CloudConfig;
  namespace?: string;
  deploymentType?: "shared" | "dedicated";
  // Tier-based configuration
  planTier?: import("./plans.js").PlanTier;
  kubecostEnabled?: boolean;

  // Dynamic Helm values configuration
  defaultDomain?: string;
  enableRafikiAuth?: boolean;
  enableRafikiBackend?: boolean;
  enableNginx?: boolean;
  enableRedis?: boolean;
  rafikiAuthImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  rafikiBackendImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  nginxImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  redisImage?: {
    repository?: string;
    tag?: string;
    pullPolicy?: string;
  };
  ingressClassName?: string;
  dedicatedDeploymentHpaEnabledByDefault?: boolean;
  sharedDeploymentNetworkPolicyEnabled?: boolean;
  ingressControllerNamespace?: string;
  ingressControllerPodSelectorLabels?: Record<string, string>;
  allowedExternalEgressRules?: Array<{
    cidr: string;
    ports?: Array<{
      port: number;
      protocol: "TCP" | "UDP";
    }>;
  }>;
}

// Namespace-specific configuration
export interface NamespaceConfig {
  name: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  resourceQuota?: {
    requests?: {
      cpu?: string;
      memory?: string;
      storage?: string;
    };
    limits?: {
      cpu?: string;
      memory?: string;
      storage?: string;
    };
    persistentvolumeclaims?: string;
  };
}

// Shared cluster configuration
export interface SharedClusterConfig {
  clusterName: string;
  kubeconfig?: string;
  namespaces?: NamespaceConfig[];
  staticIpName?: string; // For GCP shared deployments
  region?: string;
  zone?: string;
  project?: string; // For GCP
  vpcId?: string; // For AWS
  kubecostEnabled?: boolean; // Whether Kubecost is installed
  tierCapacity?: {
    maxBasicTenants: number;
    maxStandardTenants: number;
    maxPremiumTenants: number;
    maxEnterpriseTenants: number;
  };
}

// Tier-based deployment result
export interface TierDeploymentResult extends DeploymentResult {
  tierInfo?: {
    planTier: import("./plans.js").PlanTier;
    resourceAllocation: import("./plans.js").TierResourceAllocation;
    costEstimate?: {
      monthly: number;
      currency: string;
    };
    costMonitoring?: {
      enabled: boolean;
      dashboardUrl?: string;
      budgetAllocated?: number;
      budgetThresholds?: number[];
      alertsEnabled?: boolean;
    };
  };
}

// Infrastructure lookup results
export interface ClusterLookupResult {
  exists: boolean;
  kubeconfig?: string;
  clusterName?: string;
  staticIpName?: string; // GCP specific
  vpcId?: string; // AWS specific
  region?: string;
  zone?: string;
  project?: string;
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
