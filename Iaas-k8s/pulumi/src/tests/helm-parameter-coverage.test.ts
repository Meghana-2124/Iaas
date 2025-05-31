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
    expect(helmValues.tierConfig?.standard?.cpu).toBe("8"); // Standard tier CPU
    expect(helmValues.tierConfig?.standard?.memory).toBe("16Gi"); // Standard tier memory

    expect(helmValues.tierResources).toBeDefined();
    expect(helmValues.tierResources?.cpu).toBe("4000m"); // Standard tier CPU limits
    expect(helmValues.tierResources?.memory).toBe("8Gi"); // Standard tier memory limits
  });

  it("should generate all application service parameters", () => {
    const helmValues = generateDynamicHelmValues(baseOptions, mockLogger);

    // Validate core application services are enabled
    expect(helmValues.rafikiAuth).toBeDefined();
    expect(helmValues.rafikiAuth?.enabled).toBe(true);
    expect(helmValues.rafikiBackend).toBeDefined();
    expect(helmValues.rafikiBackend?.enabled).toBe(true);
    expect(helmValues.nginx).toBeDefined();
    expect(helmValues.nginx?.enabled).toBe(true);
    expect(helmValues.redis).toBeDefined();
    expect(helmValues.redis?.enabled).toBe(true);
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

    // HPA should be enabled for dedicated deployments
    expect(helmValues.rafikiAuth?.hpa?.enabled).toBe(true);
    expect(helmValues.rafikiBackend?.hpa?.enabled).toBe(true);
    expect(helmValues.nginx?.hpa?.enabled).toBe(true);

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
      "tierConfig.standard.cpu",
      "tierResources.cpu",
      "tierResources.memory",
      "tierResourceQuota.enabled",
      "tierResourceQuota.requests.cpu",
      "tierResourceQuota.requests.memory",
      "tierResourceQuota.limits.cpu",
      "tierResourceQuota.limits.memory",
      "gcp.backendConfig.healthCheck",
      "gcp.managedCertificate.enabled",
      "kubernetesSecrets.rafikiAuth.create",
      "kubernetesSecrets.rafikiBackend.create",
      "rafikiAuth.enabled",
      "rafikiBackend.enabled",
      "nginx.enabled",
      "redis.enabled",
    ];

    criticalParams.forEach((param) => {
      const value = param
        .split(".")
        .reduce((obj: any, key) => obj?.[key], helmValues as any);
      expect(value).toBeDefined();
    });
  });

  it("should validate tier configuration accuracy", () => {
    // Test all tiers have their configuration
    const tiers = [
      PlanTier.BASIC,
      PlanTier.STANDARD,
      PlanTier.PREMIUM,
      PlanTier.ENTERPRISE,
    ];
    const expectedCpuLimits = ["2", "8", "32", "128"];

    tiers.forEach((tier, index) => {
      const tierOptions = { ...baseOptions, planTier: tier };
      const helmValues = generateDynamicHelmValues(tierOptions, mockLogger);

      // Check that the tier config exists and has expected CPU limits
      expect(helmValues.tierConfig).toBeDefined();
      const tierName = tier.toLowerCase();
      const tierConfig =
        helmValues.tierConfig?.[tierName as keyof typeof helmValues.tierConfig];
      expect(tierConfig?.cpu).toBe(expectedCpuLimits[index]);
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
