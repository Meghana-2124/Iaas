import type { Logger, DeploymentOptions } from "../../types/index.js";
import { TierCalculator } from "../../utils/tier-calculator.js";
import { PlanTier } from "../../types/plans.js";

// =============================================================================
// Helm Chart Values Generation
// =============================================================================

interface HelmChartValues {
  companyName: string;
  namespace?: string;
  deploymentType: "shared" | "dedicated";
  planTier?: string;

  rafikiAuth: {
    enabled: boolean;
    name: string;
    image: {
      repository: string;
      tag: string;
      pullPolicy: string;
    };
    hpa?: {
      enabled: boolean;
    };
    ports: {
      main: number; // Main service port
      grant: number; // Grant service port
      admin: number; // Admin service port
    };
    service: {
      type: string; // Service type (e.g., ClusterIP, LoadBalancer)
      ports: {
        main: number; // Main service port
        grant: number; // Grant service port
        admin: number; // Admin service port
      };
    };
    secrets: {
      name: string; // Name of the Kubernetes secret for Rafiki Auth
    };
  };

  rafikiBackend: {
    enabled: boolean;
    name: string;
    image: {
      repository: string;
      tag: string;
      pullPolicy: string;
    };
    hpa?: {
      enabled: boolean;
    };
    ports: {
      openPayments: number;
      graphql: number;
      connector: number;
      admin: number;
      autopeering: number;
    };
    service: {
      type: string; // Service type (e.g., ClusterIP, LoadBalancer)
      ports: {
        openPayments: number;
        graphql: number;
        connector: number;
        admin: number;
        autopeering: number;
      };
    };
    secrets: {
      name: string; // Name of the Kubernetes secret for Rafiki Auth
    };
  };

  nginx: {
    enabled: boolean;
    name: string;
    image: {
      repository: string;
      tag: string;
      pullPolicy: string;
    };
    hpa?: {
      enabled: boolean;
    };
    ports: {
      http: number; // HTTP port
    };
    service: {
      type: string;
      port: number;
    };
    config?: {
      serverNameIlp: string; // Open Payments hostname
      serverNameAuth: string; // Rafiki Auth hostname
      serverNameConnector: string; // Rafiki Connector hostname
      graphqlAllowedIps: Array<string>;
    };
    configMap: {
      name: string;
    };
  };

  redis: {
    enabled: boolean;
    name: string;
    image: {
      repository: string;
      tag: string;
      pullPolicy: string;
    };
    ports: {
      redis: number; // HTTP port
    };
    service: {
      type: string;
      port: number;
    };
  };

  ingress: {
    enabled: boolean;
    name: string;
    className: string;
    annotations: Record<string, string>;
    hosts: {
      [key: string]: {
        host: string;
        paths: Array<{
          path: string;
          pathType: string;
          serviceNameSuffix: string;
          servicePort: number;
        }>;
      };
    };
  };

  networkPolicy?: {
    enabled: boolean;
    allowIngressFrom?: Array<Record<string, any>>;
    allowEgressTo?: Array<{
      cidr?: string;
      namespaceSelector?: Record<string, any>;
      ports?: Array<{
        port: number;
        protocol: string;
      }>;
    }>;
    allowEgressPorts?: Array<{
      port: number;
      protocol: string;
    }>;
  };

  // Phase 1 Critical Parameter Generation
  monitoring?: {
    dashboards: {
      enabled: boolean;
    };
  };

  tierConfig?: {
    costBudget: number;
  };

  tierResources?: {
    cpu: string;
    memory: string;
  };

  kubecost?: {
    enabled: boolean;
    prometheus: {
      fqdn: string;
    };
    "cost-analyzer": {
      nodeSelector: Record<string, string>;
      tolerations: Array<any>;
    };
    networkCosts: {
      enabled: boolean;
    };
    clusterName: string;
  };

  tierResourceQuota?: {
    enabled: boolean;
    requests: {
      cpu: string;
      memory: string;
      storage: string;
    };
    limits: {
      cpu: string;
      memory: string;
      storage: string;
    };
    claims: {
      "persistent-volume-claims": string;
    };
  };

  gcp?: {
    backendConfig?: {
      healthCheck: {
        checkIntervalSec: number;
        port: number;
        type: string;
        requestPath: string;
      };
    };
    managedCertificate?: {
      enabled: boolean;
      domains: string[];
    };
  };

  aws?: {
    loadBalancer?: {
      healthCheck: {
        enabled: boolean;
        intervalSeconds: number;
        path: string;
        port: string;
        protocol: string;
        timeoutSeconds: number;
        unhealthyThresholdCount: number;
        healthyThresholdCount: number;
      };
    };
  };

  kubernetesSecrets?: {
    rafikiAuth: {
      create: boolean;
      name: string;
      stringData: Record<string, any>;
    };
    rafikiBackend: {
      create: boolean;
      name: string;
      stringData: Record<string, any>;
    };
  };
}

export function generateDynamicHelmValues(
  options: DeploymentOptions,
  logger: Logger
): HelmChartValues {
  logger.info("Generating dynamic Helm chart values");

  // Construct hostnames
  const defaultDomain = options.defaultDomain || "example.com";
  const openPaymentsHostname =
    options.openPaymentsDomain || `ilp.${defaultDomain}`;
  const authHostname = options.authDomain || `auth-ilp.${defaultDomain}`;
  const connectorHostname =
    options.connectorDomain || `ilp-connector.${defaultDomain}`;
  const getHostPrefix = (hostDomain: string, defaultDomain: string) => {
    return hostDomain.replace(defaultDomain, "");
  };

  const helmValues: HelmChartValues = {
    companyName: options.companyName,
    namespace: options.namespace,
    deploymentType: options.deploymentType,
    planTier: options.planTier,

    rafikiAuth: {
      enabled: options.enableRafikiAuth ?? true,
      name: "rafiki-auth",
      image: {
        repository:
          options.rafikiAuthImage?.repository ??
          "ghcr.io/interledger/rafiki-auth",
        tag: options.rafikiAuthImage?.tag ?? "v1.0.0-alpha.20",
        pullPolicy: options.rafikiAuthImage?.pullPolicy ?? "IfNotPresent",
      },
      ports: {
        main: 3006,
        grant: 3009,
        admin: 3001,
      },
      service: {
        type: "ClusterIP",
        ports: {
          main: 3006,
          grant: 3009,
          admin: 3001,
        },
      },
      secrets: {
        name: "rafiki-auth-secrets",
      },
    },

    rafikiBackend: {
      enabled: options.enableRafikiBackend ?? true,
      name: "rafiki-backend",
      image: {
        repository:
          options.rafikiBackendImage?.repository ??
          "ghcr.io/interledger/rafiki-backend",
        tag: options.rafikiBackendImage?.tag ?? "v1.0.0-alpha.20",
        pullPolicy: options.rafikiBackendImage?.pullPolicy ?? "IfNotPresent",
      },
      ports: {
        openPayments: 80,
        graphql: 3001,
        connector: 3002,
        admin: 3003,
        autopeering: 3004,
      },
      service: {
        type: "ClusterIP",
        ports: {
          openPayments: 80,
          graphql: 3001,
          connector: 3002,
          admin: 3003,
          autopeering: 3004,
        },
      },
      secrets: {
        name: "rafiki-backend-secrets",
      },
    },

    nginx: {
      enabled: options.enableNginx ?? true,
      name: "nginx",
      image: {
        repository: options.nginxImage?.repository ?? "nginx",
        tag: options.nginxImage?.tag ?? "latest",
        pullPolicy: options.nginxImage?.pullPolicy ?? "IfNotPresent",
      },
      ports: {
        http: 80,
      },
      service: {
        type: "ClusterIP",
        port: 80,
      },
      config: {
        serverNameIlp: openPaymentsHostname,
        serverNameAuth: authHostname,
        serverNameConnector: connectorHostname,
        graphqlAllowedIps: options.graphqlAllowedIps || [],
      },
      configMap: {
        name: "nginx-config",
      },
    },

    redis: {
      enabled: options.enableRedis ?? true,
      name: "redis",
      image: {
        repository: options.redisImage?.repository ?? "redis",
        tag: options.redisImage?.tag ?? "7-alpine",
        pullPolicy: options.redisImage?.pullPolicy ?? "IfNotPresent",
      },
      ports: {
        redis: 6379,
      },
      service: {
        type: "ClusterIP",
        port: 6379,
      },
    },

    ingress: {
      enabled: true,
      name: "rafiki-ingress",
      className: options.ingressClassName ?? "gce",
      annotations: {},
      hosts: {
        [getHostPrefix(openPaymentsHostname, defaultDomain)]: {
          host: openPaymentsHostname,
          paths: [
            {
              path: "/",
              pathType: "Prefix",
              serviceNameSuffix: "nginx",
              servicePort: 80,
            },
          ],
        },
        [getHostPrefix(authHostname, defaultDomain)]: {
          host: authHostname,
          paths: [
            {
              path: "/",
              pathType: "Prefix",
              serviceNameSuffix: "nginx",
              servicePort: 80,
            },
          ],
        },
        [getHostPrefix(connectorHostname, defaultDomain)]: {
          host: connectorHostname,
          paths: [
            {
              path: "/",
              pathType: "Prefix",
              serviceNameSuffix: "nginx",
              servicePort: 80,
            },
          ],
        },
      },
    },
  };

  // Configure ingress annotations based on options
  if (options.cloudProvider === "gcp") {
    helmValues.ingress.annotations = {
      "kubernetes.io/ingress.class": "gce",
      "kubernetes.io/ingress.global-static-ip-name": "rafiki-global-ip",
      "kubernetes.io/ingress.allow-http": "true",
      "cloud.google.com/neg": '{"ingress": true}',
    };
  } else if (options.cloudProvider === "aws") {
    helmValues.ingress.annotations = {
      "kubernetes.io/ingress.class": "alb",
      "alb.ingress.kubernetes.io/scheme": "internet-facing",
      "alb.ingress.kubernetes.io/listen-ports": JSON.stringify([
        { HTTP: 80 },
        { HTTPS: 443 },
      ]),
      "alb.ingress.kubernetes.io/target-type": "ip",
    };
  }

  // Configure HPA for dedicated deployments
  if (options.deploymentType === "dedicated") {
    const hpaEnabled = options.dedicatedDeploymentHpaEnabledByDefault ?? true;
    if (hpaEnabled) {
      logger.info("Enabling HPA for dedicated deployment components");
      helmValues.rafikiAuth.hpa = { enabled: true };
      helmValues.rafikiBackend.hpa = { enabled: true };
      helmValues.nginx.hpa = { enabled: true };
    }
  }

  // Configure network policies for shared deployments
  if (options.deploymentType === "shared") {
    const networkPolicyEnabled =
      options.sharedDeploymentNetworkPolicyEnabled ?? true;
    if (networkPolicyEnabled) {
      logger.info("Configuring network policies for shared deployment");
      helmValues.networkPolicy = {
        enabled: true,
        allowIngressFrom: [
          {
            name: options.ingressControllerNamespace ?? "ingress-nginx",
            ...(options.ingressControllerPodSelectorLabels ?? {
              "app.kubernetes.io/name": "ingress-nginx",
            }),
          },
        ],
        allowEgressTo: options.allowedExternalEgressRules ?? [
          {
            cidr: "0.0.0.0/0",
            ports: [
              { port: 53, protocol: "UDP" }, // DNS
              { port: 53, protocol: "TCP" }, // DNS over TCP
              { port: 443, protocol: "TCP" }, // HTTPS
              { port: 5432, protocol: "TCP" }, // PostgreSQL
              { port: 6379, protocol: "TCP" }, // Redis
            ],
          },
        ],
      };
    } else {
      helmValues.networkPolicy = { enabled: false };
    }
  } else {
    // Disable network policies for dedicated deployments
    helmValues.networkPolicy = { enabled: false };
  }

  // =========================================================================
  // Phase 1 Critical Parameter Generation
  // =========================================================================

  // Initialize tier calculator for monitoring and resource calculations
  const tierCalculator = new TierCalculator(logger);
  const tier = (options.planTier as PlanTier) || PlanTier.BASIC;

  // Add monitoring dashboard configuration
  const monitoring = {
    dashboards: {
      enabled:
        options.deploymentType === "shared" ||
        options.deploymentType === "dedicated",
    },
  };

  // Add tier configuration for monitoring dashboards
  const tierConfig = {
    costBudget: tierCalculator.getTierBudget(tier),
  };

  // Add tier resources for monitoring dashboards
  const tierResources = {
    cpu: tierCalculator.getTierCpuLimits(tier),
    memory: tierCalculator.getTierMemoryLimits(tier),
  };

  // Add comprehensive Kubecost configuration aligned with helm templates
  const kubecost = {
    // Core configuration (using only available DeploymentOptions properties)
    enabled: options.kubecostEnabled ?? options.deploymentType === "shared",
    prometheus: {
      fqdn:
        options.prometheusFqdn ||
        "prometheus-server.kubecost.svc.cluster.local",
    },
    "cost-analyzer": {
      nodeSelector: {},
      tolerations: [],
    },
    networkCosts: {
      enabled: false,
    },
    clusterName:
      options.clusterName ||
      `${options.companyName}-${options.deploymentType}-cluster`,
  };

  // Add enhanced network policy configuration
  if (helmValues.networkPolicy && helmValues.networkPolicy.enabled) {
    helmValues.networkPolicy.allowIngressFrom = [
      { namespaceSelector: { matchLabels: { name: "kube-system" } } },
      { namespaceSelector: { matchLabels: { name: "monitoring" } } },
      { namespaceSelector: { matchLabels: { name: "ingress-nginx" } } },
    ];
    helmValues.networkPolicy.allowEgressTo = [
      { namespaceSelector: { matchLabels: { name: "kube-system" } } },
    ];
    helmValues.networkPolicy.allowEgressPorts = [
      { port: 443, protocol: "TCP" },
      { port: 53, protocol: "UDP" },
      { port: 53, protocol: "TCP" },
      { port: 5432, protocol: "TCP" },
      { port: 6379, protocol: "TCP" },
    ];
  }

  // Add resource quota configuration for shared deployments
  const tierResourceQuota = {
    enabled: options.deploymentType === "shared",
    requests: {
      cpu: tierCalculator.getTierResourceQuota(tier, "cpu", "requests"),
      memory: tierCalculator.getTierResourceQuota(tier, "memory", "requests"),
      storage: tierCalculator.getTierResourceQuota(tier, "storage", "requests"),
    },
    limits: {
      cpu: tierCalculator.getTierResourceQuota(tier, "cpu", "limits"),
      memory: tierCalculator.getTierResourceQuota(tier, "memory", "limits"),
      storage: tierCalculator.getTierResourceQuota(tier, "storage", "limits"),
    },
    claims: {
      "persistent-volume-claims": tierCalculator.getTierResourceQuota(
        tier,
        "storage",
        "claims"
      ),
    },
  };

  // Add cloud-specific configurations
  const gcp = {
    ...(options.cloudProvider === "gcp"
      ? {
          backendConfig: {
            healthCheck: {
              checkIntervalSec: 60,
              port: 8080,
              type: "HTTP",
              requestPath: "/health",
            },
          },
          managedCertificate: {
            enabled: options.managedCertificateEnabled ?? true,
            domains: [defaultDomain, `*.${defaultDomain}`],
          },
        }
      : {}),
  };

  const aws = {
    ...(options.cloudProvider === "aws"
      ? {
          loadBalancer: {
            healthCheck: {
              enabled: true,
              intervalSeconds: 30,
              path: "/health",
              port: "traffic-port",
              protocol: "HTTP",
              timeoutSeconds: 5,
              unhealthyThresholdCount: 2,
              healthyThresholdCount: 2,
            },
          },
        }
      : {}),
  };

  // Add Kubernetes secrets configuration
  const kubernetesSecrets = {
    rafikiAuth: {
      create: options.createKubernetesSecrets ?? false,
      name: `${options.companyName}-rafiki-auth-secret`,
      stringData: {}, // Will be populated by secrets manager
    },
    rafikiBackend: {
      create: options.createKubernetesSecrets ?? false,
      name: `${options.companyName}-rafiki-backend-secret`,
      stringData: {}, // Will be populated by secrets manager
    },
  };

  // Merge all new configurations into helmValues
  const enhancedHelmValues = {
    ...helmValues,
    monitoring,
    tierConfig,
    tierResources,
    kubecost,
    tierResourceQuota,
    gcp,
    aws,
    kubernetesSecrets,
  };

  logger.info(
    "Dynamic Helm chart values generated successfully with enhanced parameter coverage"
  );
  return enhancedHelmValues;
}

// =============================================================================
// Helper Functions for Enhanced Kubecost Configuration
// =============================================================================

/**
 * Generate tier-specific pricing configuration for kubecost
 */
function generateTierPricing(tier: PlanTier, cloudProvider: string): any {
  // Base pricing (these would be real cloud provider pricing in production)
  const basePricing = {
    cpu: "0.031611", // $ per CPU hour
    memory: "0.004446", // $ per GB hour
    storage: "0.04", // $ per GB month
  };

  // Tier-specific multipliers for pricing optimization
  const tierMultipliers: Record<
    PlanTier,
    { cpu: number; memory: number; storage: number }
  > = {
    [PlanTier.BASIC]: { cpu: 1.0, memory: 1.0, storage: 1.0 },
    [PlanTier.STANDARD]: { cpu: 1.1, memory: 1.1, storage: 1.0 },
    [PlanTier.PREMIUM]: { cpu: 1.2, memory: 1.2, storage: 1.1 },
    [PlanTier.ENTERPRISE]: { cpu: 1.3, memory: 1.3, storage: 1.2 },
  };

  const multiplier = tierMultipliers[tier];

  return {
    basic: { ...basePricing },
    standard: { ...basePricing },
    premium: { ...basePricing },
    enterprise: { ...basePricing },
    [tier]: {
      cpu: (parseFloat(basePricing.cpu) * multiplier.cpu).toFixed(6),
      memory: (parseFloat(basePricing.memory) * multiplier.memory).toFixed(6),
      storage: (parseFloat(basePricing.storage) * multiplier.storage).toFixed(
        6
      ),
    },
  };
}

/**
 * Generate ingress annotations for kubecost based on cloud provider
 */
function generateIngressAnnotations(
  cloudProvider: string
): Record<string, string> {
  switch (cloudProvider) {
    case "gcp":
      return {
        "kubernetes.io/ingress.class": "gce",
        "kubernetes.io/ingress.allow-http": "false",
        "cloud.google.com/neg": '{"ingress": true}',
      };
    case "aws":
      return {
        "kubernetes.io/ingress.class": "alb",
        "alb.ingress.kubernetes.io/scheme": "internet-facing",
        "alb.ingress.kubernetes.io/listen-ports": '[{"HTTPS":443}]',
      };
    default:
      return {
        "kubernetes.io/ingress.class": "nginx",
      };
  }
}

export function mergeHelmValues(
  baseValues: HelmChartValues,
  tierValues: any,
  logger: Logger
): any {
  logger.info("Merging Helm values: base + tier");

  // Start with base values
  let mergedValues = JSON.parse(JSON.stringify(baseValues));

  // Merge tier values (tier resource allocations take precedence for resource limits/requests)
  if (tierValues && Object.keys(tierValues).length > 0) {
    logger.info("Applying tier-based resource allocations");
    // Deep merge tier values, preserving resource allocations
    mergedValues = {
      ...mergedValues,
      ...tierValues,

      // Preserve base configuration for services but merge resources
      rafikiAuth: {
        ...mergedValues.rafikiAuth,
        ...tierValues.rafikiAuth,
        image: mergedValues.rafikiAuth?.image, // Preserve image config from base
        hpa: mergedValues.rafikiAuth?.hpa || tierValues.rafikiAuth?.hpa, // Preserve HPA config from base if set
        resources:
          tierValues.rafikiAuth?.resources ||
          mergedValues.rafikiAuth?.resources, // Tier resources take precedence
      },
      rafikiBackend: {
        ...mergedValues.rafikiBackend,
        ...tierValues.rafikiBackend,
        image: mergedValues.rafikiBackend?.image,
        hpa: mergedValues.rafikiBackend?.hpa || tierValues.rafikiBackend?.hpa,
        resources:
          tierValues.rafikiBackend?.resources ||
          mergedValues.rafikiBackend?.resources,
      },
      nginx: {
        ...mergedValues.nginx,
        ...tierValues.nginx,
        image: mergedValues.nginx?.image,
        config: mergedValues.nginx?.config, // Preserve hostname config
        hpa: mergedValues.nginx?.hpa || tierValues.nginx?.hpa,
        resources: tierValues.nginx?.resources || mergedValues.nginx?.resources,
      },
      redis: {
        ...mergedValues.redis,
        ...tierValues.redis,
        image: mergedValues.redis?.image,
        resources: tierValues.redis?.resources || mergedValues.redis?.resources,
      },

      // Preserve network policy and ingress from base
      networkPolicy: mergedValues.networkPolicy,
      ingress: mergedValues.ingress,

      // Ensure tier-specific labels are preserved
      labels: {
        ...mergedValues.labels,
        ...tierValues.labels,
      },
    };
  }

  logger.info("Helm values merging completed");
  return mergedValues;
}
