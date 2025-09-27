# Contributing Cloud Provider Support

This guide provides comprehensive instructions for extending the IaaS-k8s package to support additional cloud providers beyond AWS and GCP, such as Azure, DigitalOcean, Linode, and others supported by Pulumi.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Current Implementation Patterns](#current-implementation-patterns)
3. [Adding a New Cloud Provider](#adding-a-new-cloud-provider)
4. [Implementation Checklist](#implementation-checklist)
5. [Code Templates and Examples](#code-templates-and-examples)
6. [Configuration Management](#configuration-management)
7. [Testing Guidelines](#testing-guidelines)
8. [Documentation Requirements](#documentation-requirements)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Architecture Overview

The IaaS-k8s package follows a modular, cloud-agnostic architecture that separates cloud-specific infrastructure provisioning from Kubernetes workload deployment. This design enables easy extension to support additional cloud providers.

### Key Components

```
pulumi/
├── index.ts                    # Main orchestration logic
├── src/
│   ├── core/
│   │   ├── aws-infra.ts       # AWS EKS implementation
│   │   ├── gcp-infra.ts       # GCP GKE implementation
│   │   └── [provider]-infra.ts # Template for new providers
│   ├── types/
│   │   └── index.ts           # Shared type definitions
│   ├── utils/                 # Shared utilities
│   └── tests/                 # Provider-specific tests
├── config/                    # Configuration templates
└── helm-chart/               # Kubernetes workload definitions
```

### Core Principles

1. **Separation of Concerns**: Infrastructure provisioning is separate from workload deployment
2. **Consistent Interface**: All cloud providers implement the same interface
3. **Configuration-Driven**: Provider behavior is controlled through configuration
4. **Type Safety**: Strong TypeScript types ensure consistency
5. **Shared Resources**: Support for both dedicated and shared cluster deployments

## Current Implementation Patterns

### Cloud Provider Interface

Each cloud provider module must implement the following functions:

```typescript
// Core cluster operations
export function createCluster(name: string, stack: string): ClusterResult;
export function lookupSharedClusterSync(
  name: string
): pulumi.Output<ClusterLookupResult>;
export function deleteCluster(name: string): Promise<void>;

// Configuration and validation
export function validateCloudConfig(config: CloudConfig): boolean;
export function getDefaultConfig(stack: string): ProviderConfig;
```

### Configuration Pattern

Cloud providers use a tiered configuration approach:

1. **Environment-specific configs** (dev/prod)
2. **Stack-specific overrides**
3. **Runtime configuration injection**

Example from GCP implementation:

```typescript
const devGkeConfig: GkeConfig = {
  machineType: "e2-standard-2",
  initialNodeCount: 2,
  minNodeCount: 2,
  maxNodeCount: 4,
};

const prodGkeConfig: GkeConfig = {
  machineType: "e2-standard-4",
  initialNodeCount: 3,
  minNodeCount: 2,
  maxNodeCount: 6,
};
```

### Resource Naming Convention

All resources follow a consistent naming pattern:

- Clusters: `${companyName}-${stack}-${provider}-cluster`
- Shared clusters: `${companyName}-shared-${provider}-cluster`
- Static IPs: `${name}-global-ip` or `${name}-static-ip`
- Network resources: `${name}-vpc`, `${name}-subnet`, etc.

## Adding a New Cloud Provider

### Step 1: Create Provider Infrastructure Module

Create a new file `src/core/[provider]-infra.ts` following the established pattern:

```typescript
import * as [provider] from "@pulumi/[provider]";
import * as pulumi from "@pulumi/pulumi";
import { ClusterLookupResult } from "../types/index.js";

// Provider-specific configuration interfaces
interface [Provider]Config {
  // Define provider-specific configuration options
  instanceType: string;
  nodeCount: number;
  region: string;
  // Add other relevant options
}

// Environment configurations
const dev[Provider]Config: [Provider]Config = {
  // Development environment settings
};

const prod[Provider]Config: [Provider]Config = {
  // Production environment settings
};

// Main cluster creation function
export function create[Provider]Cluster(name: string, stack: string) {
  const config = stack === "prod" ? prod[Provider]Config : dev[Provider]Config;
  const [provider]Config = new pulumi.Config("[provider]");

  // Provider-specific resource creation logic
  // Follow the pattern from aws-infra.ts or gcp-infra.ts
}

// Shared cluster lookup function
export function lookupShared[Provider]ClusterSync(name: string): pulumi.Output<ClusterLookupResult> {
  // Implementation for finding existing shared clusters
}
```

### Step 2: Update Type Definitions

Add provider-specific types to `src/types/index.ts`:

```typescript
export interface [Provider]CloudConfig {
  region: string;
  subscriptionId?: string; // For Azure
  resourceGroup?: string;  // For Azure
  // Add other provider-specific configuration fields
}

// Update the union type
export type CloudConfig = AwsCloudConfig | GcpCloudConfig | [Provider]CloudConfig;

// Update the cloudProvider type
cloudProvider?: "aws" | "gcp" | "[provider]";
```

### Step 3: Update Main Orchestration Logic

Modify `index.ts` to include the new provider:

```typescript
import * as [provider]Infra from "./src/core/[provider]-infra.js";

// Add provider validation
const cloudProvider = config.require("cloudProvider"); // 'aws', 'gcp', or '[provider]'

// Update infrastructure setup function
function setupInfrastructure() {
  if (deploymentType === "dedicated") {
    // Add dedicated cluster logic for new provider
    if (cloudProvider === "[provider]") {
      const clusterName = `${companyName}-${stack}-${cloudProvider}-cluster`;
      cluster = [provider]Infra.create[Provider]Cluster(clusterName, stack);
      pulumi.log.info(`[Provider] cluster creation initiated: ${clusterName}`);
    }
  } else if (deploymentType === "shared") {
    // Add shared cluster logic for new provider
    if (cloudProvider === "[provider]") {
      const sharedClusterName = `${companyName}-shared-${cloudProvider}-cluster`;
      const lookupResult = [provider]Infra.lookupShared[Provider]ClusterSync(sharedClusterName);

      cluster = lookupResult.apply((result) => {
        if (result.exists && result.kubeconfig) {
          pulumi.log.info(`Using existing shared [provider] cluster: ${sharedClusterName}`);
          return {
            kubeconfig: result.kubeconfig,
            clusterName: result.clusterName,
            // Add provider-specific properties
          };
        } else {
          pulumi.log.info(`Creating new shared [provider] cluster: ${sharedClusterName}`);
          return [provider]Infra.create[Provider]Cluster(sharedClusterName, stack);
        }
      });
    }
  }
}
```

### Step 4: Add Provider Dependencies

Update `package.json` to include the new provider's Pulumi package:

```json
{
  "dependencies": {
    "@pulumi/[provider]": "^X.X.X"
    // Existing dependencies
  }
}
```

### Step 5: Create Configuration Templates

Create provider-specific configuration files in the `config/` directory:

```json
// config/[provider]-config.json
{
  "region": "eastus",
  "subscriptionId": "your-subscription-id",
  "resourceGroup": "your-resource-group",
  "environment": "development"
}
```

## Implementation Checklist

### Core Implementation

- [ ] Create `src/core/[provider]-infra.ts` with cluster creation functions
- [ ] Implement both dedicated and shared cluster support
- [ ] Add provider-specific configuration interfaces
- [ ] Update type definitions in `src/types/index.ts`
- [ ] Update main orchestration logic in `index.ts`
- [ ] Add provider dependencies to `package.json`

### Configuration Management

- [ ] Create environment-specific configurations (dev/prod)
- [ ] Add provider-specific configuration validation
- [ ] Create configuration templates and examples
- [ ] Document required environment variables/secrets
- [ ] Add configuration file templates in `config/` directory

### Kubernetes Integration

- [ ] Implement kubeconfig generation
- [ ] Add load balancer/ingress controller setup (if applicable)
- [ ] Configure provider-specific networking
- [ ] Add managed certificate support (if available)
- [ ] Implement provider-specific monitoring integrations

### Testing

- [ ] Create unit tests for provider-specific functions
- [ ] Add integration tests for cluster operations
- [ ] Test both dedicated and shared deployment modes
- [ ] Validate configuration parsing and validation
- [ ] Test error handling and rollback scenarios

### Documentation

- [ ] Add provider-specific setup instructions
- [ ] Document configuration options and examples
- [ ] Create troubleshooting guides
- [ ] Add cost estimation guidelines
- [ ] Update README with provider support information

## Code Templates and Examples

### Azure Implementation Example

Here's a complete example for adding Azure Kubernetes Service (AKS) support:

```typescript
// src/core/azure-infra.ts
import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import { ClusterLookupResult } from "../types/index.js";

interface AksConfig {
  location: string;
  nodeSize: string;
  nodeCount: number;
  minNodeCount: number;
  maxNodeCount: number;
  kubernetesVersion?: string;
}

const devAksConfig: AksConfig = {
  location: "East US",
  nodeSize: "Standard_B2s",
  nodeCount: 2,
  minNodeCount: 1,
  maxNodeCount: 3,
  kubernetesVersion: "1.28.0",
};

const prodAksConfig: AksConfig = {
  location: "East US",
  nodeSize: "Standard_D2s_v3",
  nodeCount: 3,
  minNodeCount: 2,
  maxNodeCount: 5,
  kubernetesVersion: "1.28.0",
};

export function createAksCluster(name: string, stack: string) {
  const config = stack === "prod" ? prodAksConfig : devAksConfig;
  const azureConfig = new pulumi.Config("azure-native");
  const resourceGroupName = azureConfig.require("resourceGroupName");
  const subscriptionId = azureConfig.get("subscriptionId");

  pulumi.log.info(`Creating AKS cluster: ${name} in ${config.location}`);

  // Create resource group if it doesn't exist
  const resourceGroup = new azure.resources.ResourceGroup(`${name}-rg`, {
    resourceGroupName: resourceGroupName,
    location: config.location,
  });

  // Create AKS cluster
  const cluster = new azure.containerservice.ManagedCluster(`${name}-aks`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    dnsPrefix: name,
    kubernetesVersion: config.kubernetesVersion,
    agentPoolProfiles: [
      {
        name: "nodepool1",
        count: config.nodeCount,
        vmSize: config.nodeSize,
        mode: "System",
        enableAutoScaling: true,
        minCount: config.minNodeCount,
        maxCount: config.maxNodeCount,
      },
    ],
    identity: {
      type: azure.containerservice.ResourceIdentityType.SystemAssigned,
    },
    networkProfile: {
      networkPlugin: "kubenet",
      loadBalancerSku: "standard",
    },
  });

  // Generate kubeconfig
  const creds = azure.containerservice.listManagedClusterUserCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    resourceName: cluster.name,
  });

  const kubeconfig = creds.apply((c) =>
    Buffer.from(c.kubeconfigs[0].value, "base64").toString()
  );

  return {
    cluster: cluster,
    kubeconfig: kubeconfig,
    clusterName: cluster.name,
    resourceGroupName: resourceGroup.name,
    location: config.location,
  };
}

export function lookupSharedAksClusterSync(
  name: string
): pulumi.Output<ClusterLookupResult> {
  const azureConfig = new pulumi.Config("azure-native");
  const resourceGroupName = azureConfig.require("resourceGroupName");

  // Try to find existing cluster
  const existingCluster = azure.containerservice.getManagedClusterOutput({
    resourceGroupName: resourceGroupName,
    resourceName: name,
  });

  return existingCluster.apply((cluster) => {
    if (cluster && cluster.id) {
      // Get kubeconfig for existing cluster
      const creds =
        azure.containerservice.listManagedClusterUserCredentialsOutput({
          resourceGroupName: resourceGroupName,
          resourceName: cluster.name,
        });

      const kubeconfig = creds.apply((c) =>
        Buffer.from(c.kubeconfigs[0].value, "base64").toString()
      );

      return kubeconfig.apply((kc) => ({
        exists: true,
        kubeconfig: kc,
        clusterName: cluster.name,
        resourceGroupName: resourceGroupName,
        location: cluster.location,
      }));
    } else {
      return {
        exists: false,
        kubeconfig: "",
        clusterName: "",
        resourceGroupName: resourceGroupName,
        location: "",
      };
    }
  });
}
```

### Configuration Type Updates

```typescript
// Add to src/types/index.ts
export interface AzureCloudConfig {
  subscriptionId: string;
  resourceGroupName: string;
  location: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

// Update union types
export type CloudConfig = AwsCloudConfig | GcpCloudConfig | AzureCloudConfig;

// Update deployment options
export interface DeploymentOptions {
  cloudProvider?: "aws" | "gcp" | "azure";
  cloudConfig?: AwsCloudConfig | GcpCloudConfig | AzureCloudConfig;
  // ... other properties
}
```

## Configuration Management

### Environment Variables

Each cloud provider requires specific environment variables or configuration files:

#### AWS

```bash
export AWS_REGION=us-west-2
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

#### GCP

```bash
export GOOGLE_CREDENTIALS=path/to/service-account.json
export GOOGLE_PROJECT=your-project-id
export GOOGLE_REGION=us-central1
```

#### Azure (Example)

```bash
export AZURE_CLIENT_ID=your-client-id
export AZURE_CLIENT_SECRET=your-client-secret
export AZURE_TENANT_ID=your-tenant-id
export AZURE_SUBSCRIPTION_ID=your-subscription-id
```

### Pulumi Configuration

Create stack-specific configuration files following the pattern:

```yaml
# Pulumi.[stack].yaml
config:
  [provider]:subscriptionId: "12345678-1234-1234-1234-123456789012"
  [provider]:resourceGroupName: "my-resource-group"
  [provider]:location: "East US"
  iaas-k8s-deployment:cloudProvider: "[provider]"
  iaas-k8s-deployment:companyName: "mycompany"
  iaas-k8s-deployment:deploymentType: "dedicated"
```

### Configuration Validation

Implement configuration validation for each provider:

```typescript
export function validateAzureCloudConfig(config: AzureCloudConfig): boolean {
  const required = ["subscriptionId", "resourceGroupName", "location"];
  return required.every((field) => config[field] && config[field].length > 0);
}
```

## Testing Guidelines

### Unit Tests

Create comprehensive unit tests for each provider:

```typescript
// src/tests/azure-infra.test.ts
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as azureInfra from "../core/azure-infra";
import * as pulumi from "@pulumi/pulumi";

describe("Azure Infrastructure", () => {
  beforeEach(() => {
    // Setup test environment
  });

  afterEach(() => {
    // Cleanup
  });

  it("should create AKS cluster with correct configuration", () => {
    // Test cluster creation
  });

  it("should lookup existing shared clusters", () => {
    // Test shared cluster lookup
  });

  it("should validate Azure configuration", () => {
    // Test configuration validation
  });
});
```

### Integration Tests

Create integration tests that validate end-to-end functionality:

```typescript
// src/tests/integration/azure.test.ts
import { describe, it, expect } from "@jest/globals";
import { deployToCluster } from "../automation";

describe("Azure Integration Tests", () => {
  it("should deploy successfully to AKS cluster", async () => {
    const deploymentOptions = {
      stackName: "test-azure",
      cloudProvider: "azure",
      secretsJson: JSON.stringify(testSecrets),
      companyName: "test-company",
      deploymentType: "dedicated",
    };

    const result = await deployToCluster(deploymentOptions);
    expect(result.success).toBe(true);
    expect(result.kubeconfig).toBeDefined();
  });
});
```

### Test Configuration

Update test configuration files:

```json
// src/tests/config/azure-test-config.json
{
  "subscriptionId": "test-subscription-id",
  "resourceGroupName": "test-resource-group",
  "location": "East US",
  "nodeSize": "Standard_B2s",
  "nodeCount": 1
}
```

## Documentation Requirements

### Provider-Specific Documentation

Create comprehensive documentation for each new provider:

1. **Setup Guide** (`docs/[provider]-setup.md`)

   - Prerequisites and account setup
   - Required permissions and roles
   - CLI tool installation
   - Authentication configuration

2. **Configuration Reference** (`docs/[provider]-configuration.md`)

   - All available configuration options
   - Environment-specific recommendations
   - Security best practices
   - Cost optimization tips

3. **Deployment Examples** (`docs/[provider]-examples.md`)
   - Basic deployment scenarios
   - Advanced configuration examples
   - Multi-environment setups
   - Troubleshooting common issues

### Code Documentation

Ensure all provider-specific code is well-documented:

````typescript
/**
 * Creates an AKS cluster in Azure with the specified configuration.
 *
 * @param name - The name of the cluster to create
 * @param stack - The deployment stack (dev/prod) which determines resource sizing
 * @returns Object containing cluster information and kubeconfig
 *
 * @example
 * ```typescript
 * const cluster = createAksCluster('my-company-prod-azure-cluster', 'prod');
 * ```
 */
export function createAksCluster(name: string, stack: string) {
  // Implementation
}
````

## Best Practices

### Code Organization

1. **Consistent Structure**: Follow the established pattern from AWS/GCP implementations
2. **Error Handling**: Implement comprehensive error handling with meaningful messages
3. **Logging**: Add appropriate logging for debugging and monitoring
4. **Resource Cleanup**: Ensure resources are properly cleaned up on failure

### Security Considerations

1. **Credential Management**: Never hardcode credentials; use secure configuration methods
2. **Network Security**: Implement appropriate network policies and security groups
3. **RBAC**: Configure proper role-based access control
4. **Encryption**: Enable encryption at rest and in transit where available

### Performance Optimization

1. **Resource Sizing**: Provide appropriate default configurations for different environments
2. **Auto-scaling**: Implement cluster auto-scaling where supported
3. **Monitoring**: Integrate with provider-native monitoring solutions
4. **Cost Optimization**: Include cost-aware defaults and recommendations

### Maintainability

1. **Version Pinning**: Pin provider package versions for stability
2. **Backward Compatibility**: Ensure changes don't break existing deployments
3. **Configuration Migration**: Provide migration paths for configuration changes
4. **Deprecation Handling**: Handle deprecated APIs gracefully

## Troubleshooting

### Common Issues

1. **Authentication Failures**

   - Verify credentials are correctly configured
   - Check required permissions and roles
   - Validate environment variables and configuration files

2. **Resource Provisioning Errors**

   - Check quota limits and resource availability
   - Verify region/zone configurations
   - Review network and firewall settings

3. **Kubernetes Integration Issues**
   - Validate kubeconfig generation
   - Check cluster network configuration
   - Verify DNS and service discovery setup

### Debugging Tips

1. **Enable Debug Logging**

   ```bash
   pulumi up --logtostderr -v=9
   ```

2. **Validate Configuration**

   ```typescript
   const config = new pulumi.Config("[provider]");
   pulumi.log.info(`Using config: ${JSON.stringify(config)}`);
   ```

3. **Test Provider Connectivity**
   ```bash
   # Azure CLI example
   az account show
   az aks list --resource-group your-resource-group
   ```

### Error Recovery

1. **Rollback Strategies**: Implement proper rollback mechanisms
2. **State Recovery**: Handle Pulumi state corruption gracefully
3. **Resource Cleanup**: Provide scripts for manual resource cleanup
4. **Monitoring**: Set up alerts for deployment failures

## Contribution Workflow

### Development Process

1. **Fork and Branch**: Create a feature branch from `develop`
2. **Implementation**: Follow this guide to implement the new provider
3. **Testing**: Run all tests and add new provider-specific tests
4. **Documentation**: Update all relevant documentation
5. **Review**: Submit PR with comprehensive description and examples

### Code Review Checklist

- [ ] Follows established patterns and conventions
- [ ] Includes comprehensive error handling
- [ ] Has appropriate logging and debugging information
- [ ] Includes unit and integration tests
- [ ] Documentation is complete and accurate
- [ ] Configuration validation is implemented
- [ ] Security best practices are followed
- [ ] Performance considerations are addressed

### Release Process

1. **Testing**: Validate on multiple environments
2. **Documentation**: Ensure all docs are up to date
3. **Versioning**: Follow semantic versioning
4. **Changelog**: Update with new provider support
5. **Examples**: Provide working examples and tutorials

## Additional Resources

### Pulumi Provider Documentation

- [Pulumi Azure Native Provider](https://www.pulumi.com/registry/packages/azure-native/)
- [Pulumi DigitalOcean Provider](https://www.pulumi.com/registry/packages/digitalocean/)
- [Pulumi Linode Provider](https://www.pulumi.com/registry/packages/linode/)

### Kubernetes Integration

- [Kubernetes Provider for Pulumi](https://www.pulumi.com/registry/packages/kubernetes/)
- [Helm Charts with Pulumi](https://www.pulumi.com/docs/guides/adopting/from_kubernetes/)

### Cloud Provider Specific Resources

- [Azure Kubernetes Service (AKS)](https://docs.microsoft.com/en-us/azure/aks/)
- [DigitalOcean Kubernetes](https://docs.digitalocean.com/products/kubernetes/)
- [Linode Kubernetes Engine (LKE)](https://www.linode.com/products/kubernetes/)

---

For questions or support with cloud provider implementation, please:

1. Check existing issues and discussions
2. Refer to provider-specific documentation
3. Create detailed issue reports with configuration and error logs
4. Join our community discussions for implementation guidance

Happy contributing! 🚀
