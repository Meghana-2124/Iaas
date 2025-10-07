// =============================================================================
// Plan Tier Definitions and Resource Specifications
// =============================================================================

export enum PlanTier {
  BASIC = "basic",
  STANDARD = "standard",
  PREMIUM = "premium",
  ENTERPRISE = "enterprise",
}

export interface ResourceAllocation {
  cpu: string; // e.g., "1000m", "2000m"
  memory: string; // e.g., "2Gi", "4Gi"
  storage: string; // e.g., "10Gi", "20Gi"
  replicas: number;
}

export interface ServiceResourceAllocation {
  rafikiAuth: ResourceAllocation;
  rafikiBackend: ResourceAllocation;
  nginx: ResourceAllocation;
  redis: ResourceAllocation;
}

export interface TierResourceAllocation {
  tier: PlanTier;
  displayName: string;
  description: string;
  monthlyPriceUSD: number;
  maxNamespaces: number;
  maxPersistentVolumeClaims: number;
  networkPoliciesEnabled: boolean;
  services: ServiceResourceAllocation;
  quota: {
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
    pods: number;
    services: number;
    secrets: number;
    configmaps: number;
    persistentvolumeclaims: number;
  };
}

export interface KubecostConfig {
  enabled: boolean;
  namespace: string;
  currency: string;
  billingAccountId?: string;
  costAllocationLabels: string[];
  alertingEnabled: boolean;
  budgetAlerts: {
    enabled: boolean;
    thresholds: number[]; // Percentage thresholds (e.g., [50, 80, 100])
  };
}

export interface TierConfiguration {
  planTier: PlanTier;
  resourceAllocation: TierResourceAllocation;
  kubecostConfig?: KubecostConfig;
  billingMetadata?: {
    customerId: string;
    subscriptionId: string;
    billingCycle: "monthly" | "annual";
  };
}

// =============================================================================
// Pre-defined Tier Specifications
// =============================================================================

export const PLAN_TIER_DEFINITIONS: Record<PlanTier, TierResourceAllocation> = {
  [PlanTier.BASIC]: {
    tier: PlanTier.BASIC,
    displayName: "Basic Plan",
    description: "Ideal for small applications and development environments",
    monthlyPriceUSD: 99,
    maxNamespaces: 1,
    maxPersistentVolumeClaims: 3,
    networkPoliciesEnabled: false,
    services: {
      rafikiAuth: {
        cpu: "500m",
        memory: "1Gi",
        storage: "5Gi",
        replicas: 1,
      },
      rafikiBackend: {
        cpu: "500m",
        memory: "1Gi",
        storage: "5Gi",
        replicas: 1,
      },
      nginx: {
        cpu: "100m",
        memory: "256Mi",
        storage: "1Gi",
        replicas: 1,
      },
      redis: {
        cpu: "100m",
        memory: "256Mi",
        storage: "2Gi",
        replicas: 1,
      },
    },
    quota: {
      requests: {
        cpu: "1200m", // Sum of all service requests + 20% buffer
        memory: "2.5Gi",
        storage: "15Gi",
      },
      limits: {
        cpu: "2000m", // ~66% overhead for bursting
        memory: "4Gi",
        storage: "20Gi",
      },
      pods: 10,
      services: 10,
      secrets: 20,
      configmaps: 20,
      persistentvolumeclaims: 3,
    },
  },

  [PlanTier.STANDARD]: {
    tier: PlanTier.STANDARD,
    displayName: "Standard Plan",
    description: "Perfect for growing businesses with moderate traffic",
    monthlyPriceUSD: 299,
    maxNamespaces: 2,
    maxPersistentVolumeClaims: 6,
    networkPoliciesEnabled: true,
    services: {
      rafikiAuth: {
        cpu: "1000m",
        memory: "2Gi",
        storage: "10Gi",
        replicas: 2,
      },
      rafikiBackend: {
        cpu: "1000m",
        memory: "2Gi",
        storage: "10Gi",
        replicas: 2,
      },
      nginx: {
        cpu: "200m",
        memory: "512Mi",
        storage: "2Gi",
        replicas: 2,
      },
      redis: {
        cpu: "200m",
        memory: "512Mi",
        storage: "5Gi",
        replicas: 1,
      },
    },
    quota: {
      requests: {
        cpu: "2400m", // Sum of all service requests + 20% buffer
        memory: "5Gi",
        storage: "30Gi",
      },
      limits: {
        cpu: "4000m",
        memory: "8Gi",
        storage: "40Gi",
      },
      pods: 20,
      services: 15,
      secrets: 30,
      configmaps: 30,
      persistentvolumeclaims: 6,
    },
  },

  [PlanTier.PREMIUM]: {
    tier: PlanTier.PREMIUM,
    displayName: "Premium Plan",
    description: "High-performance solution for production workloads",
    monthlyPriceUSD: 599,
    maxNamespaces: 3,
    maxPersistentVolumeClaims: 10,
    networkPoliciesEnabled: true,
    services: {
      rafikiAuth: {
        cpu: "2000m",
        memory: "4Gi",
        storage: "20Gi",
        replicas: 3,
      },
      rafikiBackend: {
        cpu: "2000m",
        memory: "4Gi",
        storage: "20Gi",
        replicas: 3,
      },
      nginx: {
        cpu: "500m",
        memory: "1Gi",
        storage: "5Gi",
        replicas: 3,
      },
      redis: {
        cpu: "500m",
        memory: "1Gi",
        storage: "10Gi",
        replicas: 2,
      },
    },
    quota: {
      requests: {
        cpu: "5000m", // Sum of all service requests + 20% buffer
        memory: "10Gi",
        storage: "60Gi",
      },
      limits: {
        cpu: "8000m",
        memory: "16Gi",
        storage: "80Gi",
      },
      pods: 40,
      services: 25,
      secrets: 50,
      configmaps: 50,
      persistentvolumeclaims: 10,
    },
  },

  [PlanTier.ENTERPRISE]: {
    tier: PlanTier.ENTERPRISE,
    displayName: "Enterprise Plan",
    description: "Scalable solution for enterprise applications",
    monthlyPriceUSD: 1299,
    maxNamespaces: 5,
    maxPersistentVolumeClaims: 20,
    networkPoliciesEnabled: true,
    services: {
      rafikiAuth: {
        cpu: "4000m",
        memory: "8Gi",
        storage: "40Gi",
        replicas: 5,
      },
      rafikiBackend: {
        cpu: "4000m",
        memory: "8Gi",
        storage: "40Gi",
        replicas: 5,
      },
      nginx: {
        cpu: "1000m",
        memory: "2Gi",
        storage: "10Gi",
        replicas: 5,
      },
      redis: {
        cpu: "1000m",
        memory: "2Gi",
        storage: "20Gi",
        replicas: 3,
      },
    },
    quota: {
      requests: {
        cpu: "10000m", // Sum of all service requests + 20% buffer
        memory: "20Gi",
        storage: "120Gi",
      },
      limits: {
        cpu: "16000m",
        memory: "32Gi",
        storage: "160Gi",
      },
      pods: 80,
      services: 50,
      secrets: 100,
      configmaps: 100,
      persistentvolumeclaims: 20,
    },
  },
};

// =============================================================================
// Default Kubecost Configuration
// =============================================================================

export const DEFAULT_KUBECOST_CONFIG: KubecostConfig = {
  enabled: true,
  namespace: "kubecost",
  currency: "USD",
  costAllocationLabels: [
    "app.kubernetes.io/name",
    "app.kubernetes.io/component",
    "iaas.deployment/company",
    "iaas.deployment/tier",
    "iaas.deployment/type",
  ],
  alertingEnabled: true,
  budgetAlerts: {
    enabled: true,
    thresholds: [75, 90, 100], // Alert at 75%, 90%, and 100% of budget
  },
};

// =============================================================================
// Tier Validation Functions
// =============================================================================

export function validateTierConfiguration(config: TierConfiguration): string[] {
  const errors: string[] = [];

  // Validate tier exists
  if (!Object.values(PlanTier).includes(config.planTier)) {
    errors.push(`Invalid plan tier: ${config.planTier}`);
  }

  // Validate resource allocation matches tier definition
  const tierDef = PLAN_TIER_DEFINITIONS[config.planTier];
  if (!tierDef) {
    errors.push(`No definition found for tier: ${config.planTier}`);
    return errors;
  }

  // Validate CPU and memory formats
  const resourceRegex = /^\d+(\.\d+)?(m|Mi|Gi|Ti)?$/;
  const services = config.resourceAllocation.services;

  Object.entries(services).forEach(([serviceName, allocation]) => {
    if (!resourceRegex.test(allocation.cpu)) {
      errors.push(`Invalid CPU format for ${serviceName}: ${allocation.cpu}`);
    }
    if (!resourceRegex.test(allocation.memory)) {
      errors.push(
        `Invalid memory format for ${serviceName}: ${allocation.memory}`
      );
    }
    if (!resourceRegex.test(allocation.storage)) {
      errors.push(
        `Invalid storage format for ${serviceName}: ${allocation.storage}`
      );
    }
    if (allocation.replicas < 1 || allocation.replicas > 10) {
      errors.push(
        `Invalid replica count for ${serviceName}: ${allocation.replicas} (must be 1-10)`
      );
    }
  });

  return errors;
}

export function getTierConfiguration(tier: PlanTier): TierConfiguration {
  const tierDef = PLAN_TIER_DEFINITIONS[tier];
  if (!tierDef) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  return {
    planTier: tier,
    resourceAllocation: tierDef,
    kubecostConfig: DEFAULT_KUBECOST_CONFIG,
  };
}

export function calculateTierCosts(
  tier: PlanTier,
  usageDays: number = 30
): {
  baseCost: number;
  estimatedResourceCost: number;
  totalEstimatedCost: number;
} {
  const tierDef = PLAN_TIER_DEFINITIONS[tier];
  const baseCost = tierDef.monthlyPriceUSD;

  // Rough resource cost estimation (this would be replaced with actual Kubecost data)
  const cpuCostPerCore = 0.03; // $0.03 per CPU hour
  const memoryCostPerGi = 0.004; // $0.004 per GB hour
  const storageCostPerGi = 0.0001; // $0.0001 per GB hour

  const services = tierDef.services;
  let totalCpuHours = 0;
  let totalMemoryGiHours = 0;
  let totalStorageGiHours = 0;

  Object.values(services).forEach((service) => {
    const cpuCores = parseFloat(service.cpu.replace("m", "")) / 1000;
    const memoryGi = parseFloat(service.memory.replace("Gi", ""));
    const storageGi = parseFloat(service.storage.replace("Gi", ""));

    totalCpuHours += cpuCores * service.replicas * 24 * usageDays;
    totalMemoryGiHours += memoryGi * service.replicas * 24 * usageDays;
    totalStorageGiHours += storageGi * service.replicas * 24 * usageDays;
  });

  const estimatedResourceCost =
    totalCpuHours * cpuCostPerCore +
    totalMemoryGiHours * memoryCostPerGi +
    totalStorageGiHours * storageCostPerGi;

  return {
    baseCost,
    estimatedResourceCost: Math.round(estimatedResourceCost * 100) / 100,
    totalEstimatedCost:
      Math.round((baseCost + estimatedResourceCost) * 100) / 100,
  };
}

// =============================================================================
// Tier Comparison Utilities
// =============================================================================

export function compareTiers(
  currentTier: PlanTier,
  targetTier: PlanTier
): {
  isUpgrade: boolean;
  isDowngrade: boolean;
  resourceDelta: {
    cpu: string;
    memory: string;
    storage: string;
    replicas: number;
  };
  costDelta: number;
} {
  const currentDef = PLAN_TIER_DEFINITIONS[currentTier];
  const targetDef = PLAN_TIER_DEFINITIONS[targetTier];

  const tierOrder = [
    PlanTier.BASIC,
    PlanTier.STANDARD,
    PlanTier.PREMIUM,
    PlanTier.ENTERPRISE,
  ];
  const currentIndex = tierOrder.indexOf(currentTier);
  const targetIndex = tierOrder.indexOf(targetTier);

  const isUpgrade = targetIndex > currentIndex;
  const isDowngrade = targetIndex < currentIndex;

  // Calculate total resource differences
  const currentTotal = calculateTotalResources(currentDef);
  const targetTotal = calculateTotalResources(targetDef);

  return {
    isUpgrade,
    isDowngrade,
    resourceDelta: {
      cpu: `${targetTotal.cpu - currentTotal.cpu}m`,
      memory: `${targetTotal.memory - currentTotal.memory}Mi`,
      storage: `${targetTotal.storage - currentTotal.storage}Gi`,
      replicas: targetTotal.replicas - currentTotal.replicas,
    },
    costDelta: targetDef.monthlyPriceUSD - currentDef.monthlyPriceUSD,
  };
}

function calculateTotalResources(tierDef: TierResourceAllocation): {
  cpu: number;
  memory: number;
  storage: number;
  replicas: number;
} {
  let totalCpu = 0;
  let totalMemory = 0;
  let totalStorage = 0;
  let totalReplicas = 0;

  Object.values(tierDef.services).forEach((service) => {
    totalCpu += parseFloat(service.cpu.replace("m", "")) * service.replicas;
    totalMemory +=
      parseFloat(service.memory.replace(/[^0-9.]/g, "")) * service.replicas;
    totalStorage +=
      parseFloat(service.storage.replace(/[^0-9.]/g, "")) * service.replicas;
    totalReplicas += service.replicas;
  });

  return {
    cpu: totalCpu,
    memory: totalMemory,
    storage: totalStorage,
    replicas: totalReplicas,
  };
}
