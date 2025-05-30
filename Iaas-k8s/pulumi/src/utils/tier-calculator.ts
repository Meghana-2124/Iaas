// =============================================================================
// Tier-Based Resource Calculator
// =============================================================================

import {
  PlanTier,
  TierConfiguration,
  TierResourceAllocation,
  PLAN_TIER_DEFINITIONS,
  getTierConfiguration,
  validateTierConfiguration,
  calculateTierCosts,
  compareTiers,
} from "../types/plans.js";
import { Logger } from "../types/index.js";

export interface ClusterCapacity {
  totalCpu: string; // e.g., "32000m"
  totalMemory: string; // e.g., "128Gi"
  totalStorage: string; // e.g., "1000Gi"
  availableCpu: string;
  availableMemory: string;
  availableStorage: string;
  nodeCount: number;
}

export interface TierAllocationResult {
  success: boolean;
  tierConfig: TierConfiguration;
  helmValues: any;
  resourceQuota: any;
  limitRange: any;
  estimatedCosts: {
    monthly: number;
    yearly: number;
    currency: string;
  };
  warnings: string[];
  errors: string[];
}

export interface TierValidationResult {
  isValid: boolean;
  canAllocate: boolean;
  resourceUtilization: {
    cpuUsagePercent: number;
    memoryUsagePercent: number;
    storageUsagePercent: number;
  };
  recommendations: string[];
  errors: string[];
}

export class TierCalculator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Calculate resource allocation for a given tier
   */
  calculateTierAllocation(
    planTier: PlanTier,
    companyName: string,
    namespace: string,
    options: {
      kubecostEnabled?: boolean;
      billingAccountId?: string;
      customLabels?: Record<string, string>;
    } = {}
  ): TierAllocationResult {
    this.logger.info(`Calculating tier allocation for ${planTier} tier`);

    const result: TierAllocationResult = {
      success: false,
      tierConfig: getTierConfiguration(planTier),
      helmValues: {},
      resourceQuota: {},
      limitRange: {},
      estimatedCosts: {
        monthly: 0,
        yearly: 0,
        currency: "USD",
      },
      warnings: [],
      errors: [],
    };

    try {
      // Validate tier configuration
      const validationErrors = validateTierConfiguration(result.tierConfig);
      if (validationErrors.length > 0) {
        result.errors.push(...validationErrors);
        return result;
      }

      // Generate Helm values
      result.helmValues = this.generateHelmValues(
        result.tierConfig,
        companyName,
        namespace,
        options
      );

      // Generate resource quota
      result.resourceQuota = this.generateResourceQuota(
        result.tierConfig,
        namespace
      );

      // Generate limit range
      result.limitRange = this.generateLimitRange(result.tierConfig, namespace);

      // Calculate costs
      const costs = calculateTierCosts(planTier);
      result.estimatedCosts = {
        monthly: costs.totalEstimatedCost,
        yearly: costs.totalEstimatedCost * 12,
        currency: "USD",
      };

      // Add any warnings
      this.addTierWarnings(result);

      result.success = true;
      this.logger.info(
        `Tier allocation calculated successfully for ${planTier}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(
        `Failed to calculate tier allocation: ${errorMessage}`
      );
      this.logger.error(`Tier calculation failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Validate if a tier can be allocated given cluster capacity
   */
  validateTierAgainstCapacity(
    planTier: PlanTier,
    clusterCapacity: ClusterCapacity,
    existingAllocations: TierConfiguration[] = []
  ): TierValidationResult {
    this.logger.info(`Validating ${planTier} against cluster capacity`);

    const tierConfig = getTierConfiguration(planTier);
    const tierDef = tierConfig.resourceAllocation;

    // Calculate total required resources
    const requiredResources = this.calculateTotalTierResources(tierDef);

    // Calculate existing allocations
    const existingResources = existingAllocations.reduce(
      (total, config) => {
        const resources = this.calculateTotalTierResources(
          config.resourceAllocation
        );
        return {
          cpu: total.cpu + resources.cpu,
          memory: total.memory + resources.memory,
          storage: total.storage + resources.storage,
        };
      },
      { cpu: 0, memory: 0, storage: 0 }
    );

    // Convert cluster capacity to numbers
    const clusterCpu = this.parseResourceValue(clusterCapacity.totalCpu, "cpu");
    const clusterMemory = this.parseResourceValue(
      clusterCapacity.totalMemory,
      "memory"
    );
    const clusterStorage = this.parseResourceValue(
      clusterCapacity.totalStorage,
      "storage"
    );

    // Calculate utilization
    const totalCpuAfter = existingResources.cpu + requiredResources.cpu;
    const totalMemoryAfter =
      existingResources.memory + requiredResources.memory;
    const totalStorageAfter =
      existingResources.storage + requiredResources.storage;

    const cpuUsagePercent = (totalCpuAfter / clusterCpu) * 100;
    const memoryUsagePercent = (totalMemoryAfter / clusterMemory) * 100;
    const storageUsagePercent = (totalStorageAfter / clusterStorage) * 100;

    // Check if allocation is possible (with 80% safety margin)
    const canAllocate =
      cpuUsagePercent <= 80 &&
      memoryUsagePercent <= 80 &&
      storageUsagePercent <= 80;

    const result: TierValidationResult = {
      isValid: true,
      canAllocate,
      resourceUtilization: {
        cpuUsagePercent: Math.round(cpuUsagePercent * 100) / 100,
        memoryUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
        storageUsagePercent: Math.round(storageUsagePercent * 100) / 100,
      },
      recommendations: [],
      errors: [],
    };

    // Add recommendations
    if (cpuUsagePercent > 70) {
      result.recommendations.push(
        "Consider adding more CPU capacity to the cluster"
      );
    }
    if (memoryUsagePercent > 70) {
      result.recommendations.push(
        "Consider adding more memory capacity to the cluster"
      );
    }
    if (storageUsagePercent > 70) {
      result.recommendations.push(
        "Consider adding more storage capacity to the cluster"
      );
    }

    if (!canAllocate) {
      result.errors.push(
        `Insufficient cluster capacity for ${planTier} tier allocation`
      );
    }

    return result;
  }

  /**
   * Calculate optimal cluster capacity for a set of tier allocations
   */
  calculateOptimalClusterCapacity(
    tierAllocations: { tier: PlanTier; count: number }[]
  ): ClusterCapacity {
    let totalCpu = 0;
    let totalMemory = 0;
    let totalStorage = 0;

    tierAllocations.forEach(({ tier, count }) => {
      const tierDef = PLAN_TIER_DEFINITIONS[tier];
      const tierResources = this.calculateTotalTierResources(tierDef);

      totalCpu += tierResources.cpu * count;
      totalMemory += tierResources.memory * count;
      totalStorage += tierResources.storage * count;
    });

    // Add 30% buffer for system overhead and future growth
    const bufferMultiplier = 1.3;

    return {
      totalCpu: `${Math.ceil(totalCpu * bufferMultiplier)}m`,
      totalMemory: `${Math.ceil(totalMemory * bufferMultiplier)}Mi`,
      totalStorage: `${Math.ceil(totalStorage * bufferMultiplier)}Gi`,
      availableCpu: `${Math.ceil(totalCpu * bufferMultiplier)}m`,
      availableMemory: `${Math.ceil(totalMemory * bufferMultiplier)}Mi`,
      availableStorage: `${Math.ceil(totalStorage * bufferMultiplier)}Gi`,
      nodeCount: Math.max(3, Math.ceil((totalCpu * bufferMultiplier) / 4000)), // Assume 4 CPU per node
    };
  }

  /**
   * Generate Helm values for tier-based deployment
   */
  private generateHelmValues(
    tierConfig: TierConfiguration,
    companyName: string,
    namespace: string,
    options: {
      kubecostEnabled?: boolean;
      billingAccountId?: string;
      customLabels?: Record<string, string>;
    }
  ): any {
    const tierDef = tierConfig.resourceAllocation;
    const services = tierDef.services;

    const helmValues = {
      companyName,
      namespace,
      deploymentType: "shared",
      planTier: tierConfig.planTier,

      // Disable HPA for tier-based deployments
      autoscaling: {
        enabled: false,
      },

      // Service configurations with tier-based resources
      rafikiAuth: {
        enabled: true,
        name: "rafiki-auth",
        replicaCount: services.rafikiAuth.replicas,
        resources: {
          requests: {
            cpu: services.rafikiAuth.cpu,
            memory: services.rafikiAuth.memory,
          },
          limits: {
            cpu: this.calculateLimitFromRequest(services.rafikiAuth.cpu),
            memory: this.calculateLimitFromRequest(services.rafikiAuth.memory),
          },
        },
        hpa: {
          enabled: false, // Explicitly disable HPA
        },
        storage: {
          size: services.rafikiAuth.storage,
        },
      },

      rafikiBackend: {
        enabled: true,
        name: "rafiki-backend",
        replicaCount: services.rafikiBackend.replicas,
        resources: {
          requests: {
            cpu: services.rafikiBackend.cpu,
            memory: services.rafikiBackend.memory,
          },
          limits: {
            cpu: this.calculateLimitFromRequest(services.rafikiBackend.cpu),
            memory: this.calculateLimitFromRequest(
              services.rafikiBackend.memory
            ),
          },
        },
        hpa: {
          enabled: false, // Explicitly disable HPA
        },
        storage: {
          size: services.rafikiBackend.storage,
        },
      },

      nginx: {
        enabled: true,
        name: "nginx",
        replicaCount: services.nginx.replicas,
        resources: {
          requests: {
            cpu: services.nginx.cpu,
            memory: services.nginx.memory,
          },
          limits: {
            cpu: this.calculateLimitFromRequest(services.nginx.cpu),
            memory: this.calculateLimitFromRequest(services.nginx.memory),
          },
        },
        hpa: {
          enabled: false, // Explicitly disable HPA
        },
        storage: {
          size: services.nginx.storage,
        },
      },

      redis: {
        enabled: true,
        name: "redis",
        replicaCount: services.redis.replicas,
        resources: {
          requests: {
            cpu: services.redis.cpu,
            memory: services.redis.memory,
          },
          limits: {
            cpu: this.calculateLimitFromRequest(services.redis.cpu),
            memory: this.calculateLimitFromRequest(services.redis.memory),
          },
        },
        storage: {
          size: services.redis.storage,
        },
      },

      // Tier-specific labels
      labels: {
        "iaas.deployment/tier": tierConfig.planTier,
        "iaas.deployment/company": companyName,
        "iaas.deployment/type": "shared",
        ...(options.customLabels || {}),
      },

      // Kubecost configuration
      kubecost: {
        enabled: options.kubecostEnabled || false,
        labels: {
          tier: tierConfig.planTier,
          company: companyName,
          billingAccount: options.billingAccountId || "",
        },
      },

      // Network policies for tier isolation
      networkPolicy: {
        enabled: tierDef.networkPoliciesEnabled,
        policyTypes: ["Ingress", "Egress"],
      },
    };

    return helmValues;
  }

  /**
   * Generate Kubernetes ResourceQuota for tier
   */
  public generateResourceQuota(
    tierConfig: TierConfiguration,
    namespace: string
  ): any {
    const quota = tierConfig.resourceAllocation.quota;

    return {
      apiVersion: "v1",
      kind: "ResourceQuota",
      metadata: {
        name: `${namespace}-quota`,
        namespace: namespace,
        labels: {
          "iaas.deployment/tier": tierConfig.planTier,
          "iaas.deployment/managed-by": "pulumi",
        },
      },
      spec: {
        hard: {
          "requests.cpu": quota.requests.cpu,
          "requests.memory": quota.requests.memory,
          "requests.storage": quota.requests.storage,
          "limits.cpu": quota.limits.cpu,
          "limits.memory": quota.limits.memory,
          pods: quota.pods.toString(),
          services: quota.services.toString(),
          secrets: quota.secrets.toString(),
          configmaps: quota.configmaps.toString(),
          persistentvolumeclaims: quota.persistentvolumeclaims.toString(),
        },
      },
    };
  }

  /**
   * Generate Kubernetes LimitRange for tier
   */
  public generateLimitRange(
    tierConfig: TierConfiguration,
    namespace: string
  ): any {
    return {
      apiVersion: "v1",
      kind: "LimitRange",
      metadata: {
        name: `${namespace}-limits`,
        namespace: namespace,
        labels: {
          "iaas.deployment/tier": tierConfig.planTier,
          "iaas.deployment/managed-by": "pulumi",
        },
      },
      spec: {
        limits: [
          {
            type: "Container",
            default: {
              cpu: "500m",
              memory: "512Mi",
            },
            defaultRequest: {
              cpu: "100m",
              memory: "128Mi",
            },
            max: {
              cpu: "4000m",
              memory: "8Gi",
            },
            min: {
              cpu: "50m",
              memory: "64Mi",
            },
          },
          {
            type: "PersistentVolumeClaim",
            max: {
              storage: "100Gi",
            },
            min: {
              storage: "1Gi",
            },
          },
        ],
      },
    };
  }

  /**
   * Calculate total resources required for a tier
   */
  private calculateTotalTierResources(tierDef: TierResourceAllocation): {
    cpu: number;
    memory: number;
    storage: number;
  } {
    let totalCpu = 0;
    let totalMemory = 0;
    let totalStorage = 0;

    Object.values(tierDef.services).forEach((service) => {
      const cpuValue = this.parseResourceValue(service.cpu, "cpu");
      const memoryValue = this.parseResourceValue(service.memory, "memory");
      const storageValue = this.parseResourceValue(service.storage, "storage");

      totalCpu += cpuValue * service.replicas;
      totalMemory += memoryValue * service.replicas;
      totalStorage += storageValue * service.replicas;
    });

    return {
      cpu: totalCpu,
      memory: totalMemory,
      storage: totalStorage,
    };
  }

  /**
   * Parse resource value string to number
   */
  private parseResourceValue(
    value: string,
    type: "cpu" | "memory" | "storage"
  ): number {
    if (type === "cpu") {
      // Convert CPU value to millicores
      if (value.endsWith("m")) {
        return parseInt(value.slice(0, -1));
      }
      return parseInt(value) * 1000;
    }

    if (type === "memory" || type === "storage") {
      // Convert memory/storage to Mi (mebibytes) or Gi (gibibytes)
      if (value.endsWith("Mi")) {
        return parseInt(value.slice(0, -2));
      }
      if (value.endsWith("Gi")) {
        return parseInt(value.slice(0, -2)) * 1024;
      }
      if (value.endsWith("Ti")) {
        return parseInt(value.slice(0, -2)) * 1024 * 1024;
      }
      // Assume bytes, convert to Mi
      return parseInt(value) / (1024 * 1024);
    }

    return parseInt(value);
  }

  /**
   * Calculate limit from request (typically 1.5-2x request)
   */
  private calculateLimitFromRequest(request: string): string {
    if (request.endsWith("m")) {
      const value = parseInt(request.slice(0, -1));
      return `${Math.ceil(value * 1.5)}m`;
    }
    if (request.endsWith("Mi")) {
      const value = parseInt(request.slice(0, -2));
      return `${Math.ceil(value * 1.5)}Mi`;
    }
    if (request.endsWith("Gi")) {
      const value = parseInt(request.slice(0, -2));
      return `${Math.ceil(value * 1.5)}Gi`;
    }
    return request;
  }

  /**
   * Add tier-specific warnings
   */
  private addTierWarnings(result: TierAllocationResult): void {
    const tierDef = result.tierConfig.resourceAllocation;

    if (tierDef.tier === PlanTier.BASIC) {
      result.warnings.push(
        "Basic tier provides minimal resources. Consider upgrading for production workloads."
      );
    }

    if (!tierDef.networkPoliciesEnabled) {
      result.warnings.push(
        "Network policies are disabled for this tier. Consider upgrading for enhanced security."
      );
    }

    if (tierDef.monthlyPriceUSD > 1000) {
      result.warnings.push(
        "This is a high-cost tier. Please ensure resources are utilized efficiently."
      );
    }
  }

  /**
   * Calculate resources for a given tier
   */
  calculateResources(planTier: PlanTier): TierResourceAllocation {
    const tierConfig = getTierConfiguration(planTier);
    return tierConfig.resourceAllocation;
  }

  /**
   * Validate tier resources
   */
  validateTierResources(
    planTier: PlanTier,
    resources: TierResourceAllocation
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const validationErrors = validateTierConfiguration({
      planTier,
      resourceAllocation: resources,
    });

    return {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: [],
    };
  }

  /**
   * Calculate monthly cost for a tier
   */
  calculateMonthlyCost(planTier: PlanTier): number {
    const tierDef = PLAN_TIER_DEFINITIONS[planTier];
    return tierDef.monthlyPriceUSD;
  }

  /**
   * Make generateHelmValues public for CLI usage
   */
  public generateHelmValuesForTier(
    planTier: PlanTier,
    companyName: string,
    namespace: string,
    options: {
      kubecostEnabled?: boolean;
      billingAccountId?: string;
      customLabels?: Record<string, string>;
    } = {}
  ): any {
    const tierConfig = getTierConfiguration(planTier);
    return this.generateHelmValues(tierConfig, companyName, namespace, options);
  }
}

/**
 * Helper function to create tier calculator instance
 */
export function createTierCalculator(logger: Logger): TierCalculator {
  return new TierCalculator(logger);
}

/**
 * Quick tier allocation for shared deployments
 */
export function quickTierAllocation(
  planTier: PlanTier,
  companyName: string,
  namespace: string,
  logger: Logger
): TierAllocationResult {
  const calculator = createTierCalculator(logger);
  return calculator.calculateTierAllocation(planTier, companyName, namespace);
}
