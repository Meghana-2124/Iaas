#!/usr/bin/env node

// Example usage of the IaaS K8s deployment package
import { handleDeployment, DeploymentOptions } from "./automation.js";
import * as fs from "fs";

async function exampleDeployment() {
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
    workDir: process.cwd(), // Use current directory where Pulumi files are located
  };

  console.log(`Starting deployment for ${options.companyName}...`);

  try {
    const result = await handleDeployment(options);

    if (result.success) {
      console.log("✅ Deployment successful!");

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
          `To use kubectl: export KUBECONFIG=$(pwd)/${kubeconfigPath}`
        );
      }
    } else {
      console.error("❌ Deployment failed:", result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  }
}

// Example of how different companies might use this
async function multiCompanyExample() {
  const companies = [
    {
      name: "acme-corp",
      env: "dev",
      secrets: { dbPassword: "acme-dev-secret" },
      values: { replicaCount: 1, environment: "development" },
    },
    {
      name: "globex-inc",
      env: "prod",
      secrets: { dbPassword: "globex-prod-secret" },
      values: { replicaCount: 5, environment: "production" },
    },
  ];

  for (const company of companies) {
    console.log(`\n🏢 Deploying for ${company.name}-${company.env}...`);

    const options: DeploymentOptions = {
      action: "preview", // Use preview to see what would be deployed
      stackName: `${company.name}-${company.env}`,
      secretsJson: JSON.stringify(company.secrets),
      valuesJson: JSON.stringify(company.values),
      companyName: company.name,
      workDir: process.cwd(),
    };

    const result = await handleDeployment(options);
    console.log(`Result for ${company.name}: ${result.success ? "✅" : "❌"}`);
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "single";

  if (mode === "multi") {
    multiCompanyExample().catch(console.error);
  } else {
    exampleDeployment().catch(console.error);
  }
}
