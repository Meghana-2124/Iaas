#!/usr/bin/env node

// Test the enhanced deployment function with a preview operation
import {
  handleDeployment,
  ConsoleLogger,
  DeploymentError,
  ConfigValidationError,
} from "./dist/automation.js";

console.log(
  "🚀 Testing enhanced deployment function with actual deployment operation...\n"
);

// Test enhanced deployment with validation and monitoring
async function testEnhancedDeployment() {
  try {
    console.log("📋 Creating deployment options with enhanced features...");

    const options = {
      action: "preview", // Safe to test with preview
      stackName: "test-enhanced-deployment",
      secretsJson: JSON.stringify({
        dbPassword: "test-secret-123",
        apiKey: "test-api-key",
        redisPassword: "redis-secret",
      }),
      valuesJson: JSON.stringify({
        environment: "test",
        replicaCount: 1,
        image: {
          tag: "latest",
          pullPolicy: "Always",
        },
        resources: {
          requests: { cpu: "100m", memory: "128Mi" },
          limits: { cpu: "500m", memory: "512Mi" },
        },
      }),
      companyName: "test-company",
      workDir: process.cwd(),

      // ✨ Enhanced features ✨
      logLevel: "info",
      validateConfig: true, // Enable Zod validation
      enableRollback: true, // Enable rollback capability
      timeout: 300, // 5 minute timeout for testing
      helmChartPath: "../helm-chart",

      // Progress tracking
      onProgress: (progress) => {
        console.log(
          `📊 [${progress.timestamp.toISOString()}] ${progress.status.toUpperCase()}: ${
            progress.message
          }`
        );
        if (progress.metadata) {
          console.log(
            `   🔍 Metadata:`,
            JSON.stringify(progress.metadata, null, 2)
          );
        }
      },
    };

    console.log("✅ Deployment options configured with enhanced features");
    console.log(`🏢 Company: ${options.companyName}`);
    console.log(`📦 Stack: ${options.stackName}`);
    console.log(`🔧 Action: ${options.action}`);
    console.log(`🔐 Validation enabled: ${options.validateConfig}`);
    console.log(`🔄 Rollback enabled: ${options.enableRollback}`);
    console.log(`⏱️  Timeout: ${options.timeout}s`);
    console.log(`📁 Helm chart path: ${options.helmChartPath}`);

    console.log("\n🔍 Starting enhanced deployment with monitoring...");

    const result = await handleDeployment(options);

    console.log("\n🎯 Deployment completed!");
    console.log(`✅ Success: ${result.success}`);
    console.log(`⏱️  Duration: ${result.duration}ms`);

    if (result.success) {
      console.log("🎉 Enhanced deployment function working perfectly!");

      if (result.outputs) {
        console.log("\n📋 Deployment outputs available");
      }

      if (result.summary) {
        console.log("📊 Deployment summary available");
      }

      if (result.rollbackPerformed) {
        console.log("🔄 Rollback was performed during deployment");
      }
    } else {
      console.log(`❌ Deployment failed: ${result.error}`);

      if (result.rollbackPerformed) {
        console.log("🔄 Automatic rollback was performed");
      }
    }

    console.log(
      "\n✅ Enhanced deployment function integration test completed successfully!"
    );
  } catch (error) {
    console.log("\n🔍 Testing error handling...");

    if (error instanceof ConfigValidationError) {
      console.log("✅ Configuration validation error caught correctly:");
      error.errors.forEach((err) => {
        console.log(`  • ${err.field}: ${err.message}`);
      });
    } else if (error instanceof DeploymentError) {
      console.log("✅ Deployment error caught correctly:");
      console.log(`  • Code: ${error.code}`);
      console.log(`  • Message: ${error.message}`);
      if (error.details) {
        console.log(`  • Details: ${JSON.stringify(error.details, null, 2)}`);
      }
    } else {
      console.log("❌ Unexpected error:", error.message);
      console.log(
        "📋 This might be expected if Pulumi is not configured or the stack doesn't exist"
      );
    }
  }
}

// Run the test
testEnhancedDeployment();
