import { generateDynamicHelmValues } from "../core/helm/helm-values-generator.js";
import { DeploymentOptions } from "../types/index.js";
import { PlanTier } from "../types/plans.js";

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe("Helm Parameter Coverage Validation", () => {
  const baseOptions: DeploymentOptions = {
    companyName: "test-company",
    namespace: "test-namespace",
    deploymentType: "shared",
    planTier: PlanTier.STANDARD,
    cloudProvider: "gcp",
    defaultDomain: "example.com",
    environment: "production",
    clusterName: "test-cluster",
    prometheusFqdn: "prometheus.example.com",
    managedCertificateEnabled: true,
    createKubernetesSecrets: true,
    kubecostEnabled: true,
    action: "up",
    stackName: "test-stack",
    secretsJson: "{}",
  };

  it("should generate all critical monitoring parameters", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    // Phase 1 Critical Parameter Generation Validation
    expect(helmValues.monitoring).toBeDefined();
    expect(helmValues.monitoring?.dashboards?.enabled).toBe(true);

    expect(helmValues.tierConfig).toBeDefined();
    expect(helmValues.tierConfig?.costBudget).toBe(299); // Standard tier budget

    expect(helmValues.tierResources).toBeDefined();
    expect(helmValues.tierResources?.cpu).toBe("4000m"); // Standard tier CPU limits
    expect(helmValues.tierResources?.memory).toBe("8Gi"); // Standard tier memory limits
  });

  it("should generate all kubecost configuration parameters", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    expect(helmValues.kubecost).toBeDefined();
    expect(helmValues.kubecost?.enabled).toBe(true);
    expect(helmValues.kubecost?.prometheus?.fqdn).toBe(
      "prometheus.example.com"
    );
    expect(helmValues.kubecost?.["cost-analyzer"]?.nodeSelector).toBeDefined();
    expect(helmValues.kubecost?.["cost-analyzer"]?.tolerations).toEqual([]);
    expect(helmValues.kubecost?.networkCosts?.enabled).toBe(false); // shared deployment
    expect(helmValues.kubecost?.clusterName).toBe("test-cluster");
  });

  it("should generate tier resource quota configuration", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    expect(helmValues.tierResourceQuota).toBeDefined();
    expect(helmValues.tierResourceQuota?.enabled).toBe(true); // shared deployment
    expect(helmValues.tierResourceQuota?.requests?.cpu).toBe("2400m");
    expect(helmValues.tierResourceQuota?.requests?.memory).toBe("5Gi");
    expect(helmValues.tierResourceQuota?.requests?.storage).toBe("30Gi");
    expect(helmValues.tierResourceQuota?.limits?.cpu).toBe("4000m");
    expect(helmValues.tierResourceQuota?.limits?.memory).toBe("8Gi");
    expect(helmValues.tierResourceQuota?.limits?.storage).toBe("40Gi");
    expect(
      helmValues.tierResourceQuota?.claims?.["persistent-volume-claims"]
    ).toBe("6");
  });

  it("should generate enhanced network policy configuration", () => {
    const helmValues = generateDynamicHelmValues(
      {
        ...baseOptions,
        sharedDeploymentNetworkPolicyEnabled: true,
      },
      mockLogger
    );

    expect(helmValues.networkPolicy).toBeDefined();
    expect(helmValues.networkPolicy?.enabled).toBe(true);
    expect(helmValues.networkPolicy?.allowIngressFrom).toHaveLength(3);
    expect(helmValues.networkPolicy?.allowEgressTo).toHaveLength(1);
    expect(helmValues.networkPolicy?.allowEgressPorts).toHaveLength(5);
  });

  it("should generate cloud-specific configurations for GCP", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    expect(helmValues.gcp).toBeDefined();
    expect(helmValues.gcp?.backendConfig?.healthCheck).toEqual({
      checkIntervalSec: 60,
      port: 8080,
      type: "HTTP",
      requestPath: "/health",
    });
    expect(helmValues.gcp?.managedCertificate?.enabled).toBe(true);
    expect(helmValues.gcp?.managedCertificate?.domains).toEqual([
      "example.com",
      "*.example.com",
    ]);
  });

  it("should generate cloud-specific configurations for AWS", () => {
    const awsOptions = { ...baseOptions, cloudProvider: "aws" as const };
    const helmValues = generateDynamicHelmValues(awsOptions, mockLogger);

    expect(helmValues.aws).toBeDefined();
    expect(helmValues.aws?.loadBalancer?.healthCheck).toEqual({
      enabled: true,
      intervalSeconds: 30,
      path: "/health",
      port: "traffic-port",
      protocol: "HTTP",
      timeoutSeconds: 5,
      unhealthyThresholdCount: 2,
      healthyThresholdCount: 2,
    });
  });

  it("should generate kubernetes secrets configuration", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    expect(helmValues.kubernetesSecrets).toBeDefined();
    expect(helmValues.kubernetesSecrets?.rafikiAuth?.create).toBe(true);
    expect(helmValues.kubernetesSecrets?.rafikiAuth?.name).toBe(
      "test-company-rafiki-auth-secret"
    );
    expect(helmValues.kubernetesSecrets?.rafikiBackend?.create).toBe(true);
    expect(helmValues.kubernetesSecrets?.rafikiBackend?.name).toBe(
      "test-company-rafiki-backend-secret"
    );
  });

  it("should handle dedicated deployment configuration", () => {
    const dedicatedOptions = {
      ...baseOptions,
      deploymentType: "dedicated" as const,
    };
    const helmValues = generateDynamicHelmValues(dedicatedOptions, mockLogger);

    // Monitoring should still be enabled for dedicated
    expect(helmValues.monitoring?.dashboards?.enabled).toBe(true);

    // Kubecost network costs should be enabled for dedicated
    expect(helmValues.kubecost?.networkCosts?.enabled).toBe(true);

    // Resource quota should be disabled for dedicated
    expect(helmValues.tierResourceQuota?.enabled).toBe(false);

    // Network policy should be disabled for dedicated
    expect(helmValues.networkPolicy?.enabled).toBe(false);
  });

  it("should validate all template parameters match generated values", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    // Validate all critical template parameters are covered
    const criticalParams = [
      "monitoring.dashboards.enabled",
      "tierConfig.costBudget",
      "tierResources.cpu",
      "tierResources.memory",
      "kubecost.enabled",
      "kubecost.prometheus.fqdn",
      "kubecost.cost-analyzer.nodeSelector",
      "kubecost.clusterName",
      "tierResourceQuota.enabled",
      "tierResourceQuota.requests.cpu",
      "tierResourceQuota.requests.memory",
      "tierResourceQuota.limits.cpu",
      "tierResourceQuota.limits.memory",
      "gcp.backendConfig.healthCheck",
      "gcp.managedCertificate.enabled",
      "kubernetesSecrets.rafikiAuth.create",
      "kubernetesSecrets.rafikiBackend.create",
    ];

    criticalParams.forEach((param) => {
      const value = param
        .split(".")
        .reduce((obj: any, key) => obj?.[key], helmValues as any);
      expect(value).toBeDefined();
    });
  });

  it("should validate tier budget calculation accuracy", () => {
    // Test all tiers
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const expectedBudgets = [99, 299, 599, 1299];

    tiers.forEach((tier, index) => {
      const tierOptions = { ...baseOptions, planTier: tier };
      const helmValues = generateDynamicHelmValues(tierOptions, mockLogger);
      expect(helmValues.tierConfig?.costBudget).toBe(expectedBudgets[index]);
    });
  });

  it("should validate tier resource limits accuracy", () => {
    const standardOptions = { ...baseOptions, planTier: PlanTier.STANDARD };
    const helmValues = generateDynamicHelmValues(standardOptions, mockLogger);

    // Validate Standard tier specific values
    expect(helmValues.tierResources?.cpu).toBe("4000m"); // Standard tier CPU limits
    expect(helmValues.tierResources?.memory).toBe("8Gi"); // Standard tier memory limits
    expect(helmValues.tierResourceQuota?.requests?.cpu).toBe("2400m"); // Standard tier CPU requests
    expect(helmValues.tierResourceQuota?.requests?.memory).toBe("5Gi"); // Standard tier memory requests
  });
});
