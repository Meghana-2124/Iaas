import type { Logger, DeploymentOptions } from "../../types/index.js";

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
      ports?: Array<{
        port: number;
        protocol: string;
      }>;
    }>;
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

  logger.info("Dynamic Helm chart values generated successfully");
  return helmValues;
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
