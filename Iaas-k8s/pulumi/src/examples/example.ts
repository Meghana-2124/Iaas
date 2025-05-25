#!/usr/bin/env node

// Example usage of the enhanced IaaS K8s deployment package
import {
  handleDeployment,
  DeploymentOptions,
  DeploymentProgress,
  DeploymentError,
  ConfigValidationError,
  validateDeploymentConfig,
  ConsoleLogger,
} from "../../automation.js";
import * as fs from "fs";

// =============================================================================
// Enhanced Deployment Example with All Features
// =============================================================================

async function enhancedDeploymentExample() {
  console.log("🚀 Starting enhanced deployment example with all features...\n");

  // Example configuration for a company deployment
  const options: DeploymentOptions = {
    action: "up",
    stackName: "acme-corp-dev",
    secretsJson: JSON.stringify({
      // These would typically come from your secret management system
      dbPassword: "supersecret123",
      redisPassword: "redissecret456",
      jwtSecret: "jwt-signing-key",
      apiKeys: {
        stripe: "sk_test_...",
        sendgrid: "SG...",
      },
    }),
    valuesJson: JSON.stringify({
      // These are non-sensitive configuration values
      environment: "development",
      replicaCount: 2,
      resources: {
        requests: {
          cpu: "100m",
          memory: "128Mi",
        },
        limits: {
          cpu: "500m",
          memory: "512Mi",
        },
      },
      ingress: {
        enabled: true,
        hostname: "acme-dev.example.com",
      },
    }),
    companyName: "acme-corp",
    workDir: process.cwd(),

    // ✨ New Enhanced Features ✨
    logLevel: "info",
    validateConfig: true,
    enableRollback: true,
    timeout: 1800, // 30 minutes
    helmChartPath: "../helm-chart", // Custom Helm chart path

    // Progress callback to track deployment status
    onProgress: (progress: DeploymentProgress) => {
      console.log(
        `📊 [${progress.timestamp.toISOString()}] ${progress.status.toUpperCase()}: ${
          progress.message
        }`
      );
      if (progress.metadata) {
        console.log(
          `   📋 Metadata:`,
          JSON.stringify(progress.metadata, null, 2)
        );
      }
    },
  };

  console.log(`🏢 Starting deployment for ${options.companyName}...`);

  try {
    // Manual configuration validation example
    console.log("🔍 Validating configuration manually...");
    const validationErrors = validateDeploymentConfig({
      stackName: options.stackName,
      secretsJson: options.secretsJson,
      valuesJson: options.valuesJson,
      companyName: options.companyName,
      helmChartPath: options.helmChartPath,
    });

    if (validationErrors.length > 0) {
      console.log("❌ Configuration validation failed:");
      validationErrors.forEach((error: any) => {
        console.log(`   • ${error.field}: ${error.message}`);
      });
      return;
    }
    console.log("✅ Configuration validation passed!\n");

    // Perform the deployment
    const result = await handleDeployment(options);

    if (result.success) {
      console.log("\n🎉 Deployment successful!");
      console.log(`⏱️  Duration: ${result.duration}ms`);

      if (result.outputs) {
        console.log("\n📋 Stack Outputs:");
        console.log(JSON.stringify(result.outputs, null, 2));
      }

      if (result.kubeconfig) {
        // Save kubeconfig for kubectl access
        const kubeconfigPath = `kubeconfig-${options.stackName}.yaml`;
        fs.writeFileSync(kubeconfigPath, result.kubeconfig);
        console.log(`\n🔧 Kubeconfig saved to: ${kubeconfigPath}`);
        console.log(
          `   To use kubectl: export KUBECONFIG=$(pwd)/${kubeconfigPath}`
        );
        console.log(`   Test connection: kubectl get nodes`);
      }

      if (result.rollbackPerformed) {
        console.log("\n🔄 Note: Rollback was performed during this deployment");
      }
    } else {
      console.error("\n❌ Deployment failed:", result.error);
      console.error(`⏱️  Duration: ${result.duration}ms`);

      if (result.rollbackPerformed) {
        console.log("🔄 Automatic rollback was performed");
      }

      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 Unexpected error during deployment:");

    if (error instanceof ConfigValidationError) {
      console.error("Configuration validation failed:");
      error.errors.forEach((err: any) => {
        console.error(`  • ${err.field}: ${err.message}`);
      });
    } else if (error instanceof DeploymentError) {
      console.error(
        `Deployment error (${(error as any).code}):`,
        (error as any).message
      );
      if ((error as any).details) {
        console.error(
          "Details:",
          JSON.stringify((error as any).details, null, 2)
        );
      }
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

// =============================================================================
// Multi-Company Example with Enhanced Features
// =============================================================================

async function multiCompanyEnhancedExample() {
  console.log("🏢 Starting multi-company deployment example...\n");

  const companies = [
    {
      name: "acme-corp",
      env: "dev",
      secrets: {
        dbPassword: "acme-dev-secret",
        apiKey: "acme-dev-api-key",
      },
      values: {
        replicaCount: 1,
        environment: "development",
        resources: {
          requests: { cpu: "100m", memory: "128Mi" },
        },
      },
      logLevel: "debug" as const,
    },
    {
      name: "globex-inc",
      env: "prod",
      secrets: {
        dbPassword: "globex-prod-secret",
        apiKey: "globex-prod-api-key",
      },
      values: {
        replicaCount: 5,
        environment: "production",
        resources: {
          requests: { cpu: "500m", memory: "512Mi" },
          limits: { cpu: "1000m", memory: "1Gi" },
        },
      },
      logLevel: "info" as const,
    },
  ];

  const results = [];

  for (const company of companies) {
    console.log(`\n🏢 Deploying for ${company.name}-${company.env}...`);

    const options: DeploymentOptions = {
      action: "preview", // Use preview to see what would be deployed
      stackName: `${company.name}-${company.env}`,
      secretsJson: JSON.stringify(company.secrets),
      valuesJson: JSON.stringify(company.values),
      companyName: company.name,
      workDir: process.cwd(),
      logLevel: company.logLevel,
      validateConfig: true,
      enableRollback: false, // No rollback needed for preview
      onProgress: (progress: DeploymentProgress) => {
        console.log(`  📊 ${progress.status}: ${progress.message}`);
      },
    };

    try {
      const result = await handleDeployment(options);
      console.log(
        `  Result for ${company.name}: ${
          result.success ? "✅ Success" : "❌ Failed"
        }`
      );
      results.push({
        company: company.name,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      console.error(
        `  Error for ${company.name}:`,
        error instanceof Error ? error.message : String(error)
      );
      results.push({
        company: company.name,
        success: false,
        error: String(error),
      });
    }
  }

  console.log("\n📊 Summary of all deployments:");
  results.forEach((result) => {
    const status = result.success ? "✅" : "❌";
    console.log(
      `  ${status} ${result.company}: ${
        result.success ? "Success" : result.error
      }`
    );
  });
}

// =============================================================================
// Custom Logger Example
// =============================================================================

async function customLoggerExample() {
  console.log("📝 Custom logger example...\n");

  // Create a custom logger with debug level
  const logger = new ConsoleLogger("debug");

  logger.debug("This is a debug message");
  logger.info("This is an info message");
  logger.warn("This is a warning message");
  logger.error("This is an error message");

  // Example with silent logging
  const silentLogger = new ConsoleLogger("silent");
  silentLogger.info("You won't see this message");

  console.log("✅ Logger example completed");
}

// =============================================================================
// Error Handling Example
// =============================================================================

async function errorHandlingExample() {
  console.log("⚠️  Error handling example...\n");

  // Example with invalid configuration
  const invalidOptions: DeploymentOptions = {
    action: "up",
    stackName: "invalid-stack-name!@#", // Invalid characters
    secretsJson: "invalid-json", // Invalid JSON
    valuesJson: JSON.stringify({ environment: "test" }),
    companyName: "", // Empty company name
    validateConfig: true,
  };

  try {
    await handleDeployment(invalidOptions);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.log("✅ Caught configuration validation error as expected:");
      error.errors.forEach((err: any) => {
        console.log(`  • ${err.field}: ${err.message}`);
      });
    } else {
      console.log("❌ Unexpected error type:", error);
    }
  }
}

// =============================================================================
// Main Runner
// =============================================================================

async function main() {
  const examples = {
    enhanced: enhancedDeploymentExample,
    multi: multiCompanyEnhancedExample,
    logger: customLoggerExample,
    errors: errorHandlingExample,
  };

  const exampleType = process.argv[2] || "enhanced";

  if (!(exampleType in examples)) {
    console.log("Usage: node example.js [enhanced|multi|logger|errors]");
    console.log("Examples:");
    console.log("  enhanced - Full deployment with all enhanced features");
    console.log("  multi    - Multi-company deployment example");
    console.log("  logger   - Custom logger demonstration");
    console.log("  errors   - Error handling demonstration");
    process.exit(1);
  }

  try {
    await examples[exampleType as keyof typeof examples]();
  } catch (error) {
    console.error("\n💥 Example failed:", error);
    process.exit(1);
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
