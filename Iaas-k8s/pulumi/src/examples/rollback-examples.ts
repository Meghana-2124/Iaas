/**
 * Example: Using the Rollback Functionality
 *
 * This example demonstrates how to use the various rollback features
 * in the deployment system.
 */

import { automation } from "@pulumi/pulumi";
import {
  performRollback,
  performEnhancedRollback,
  listRollbackTargets,
  storeDeploymentSnapshot,
  getSnapshotManager,
  ConsoleLogger,
  createProgressCallback,
} from "../core/deployment.js";
import type { DeploymentStatus } from "../types/index.js";

async function exampleRollbackUsage() {
  const logger = new ConsoleLogger("info");

  // Create progress callback
  const onProgress = createProgressCallback(logger, (progress) => {
    console.log(`[${progress.status}] ${progress.message}`);
    if (progress.metadata) {
      console.log("Metadata:", JSON.stringify(progress.metadata, null, 2));
    }
  });

  try {
    // Initialize stack
    const stack = await automation.LocalWorkspace.createOrSelectStack({
      stackName: "organization/iaas-k8s/example-stack",
      workDir: process.cwd(),
    });

    console.log("=== Rollback Examples ===\n");

    // Example 1: List available rollback targets
    console.log("1. Listing available rollback targets...");
    const targets = await listRollbackTargets(stack, logger);
    console.log("Available rollback targets:");
    targets.forEach((target) => {
      console.log(
        `  - Version ${target.version} (${target.timestamp.toISOString()})`
      );
    });
    console.log();

    // Example 2: Check snapshot manager status
    console.log("2. Checking snapshot manager...");
    const snapshotManager = getSnapshotManager(logger);
    const snapshots = snapshotManager.getAllSnapshots(stack.name);
    console.log(`Found ${snapshots.length} configuration snapshots`);
    snapshots.forEach((snapshot) => {
      console.log(
        `  - Version ${snapshot.version} (${snapshot.timestamp.toISOString()})`
      );
    });
    console.log();

    // Example 3: Basic rollback (to last successful deployment)
    console.log("3. Performing basic rollback...");
    try {
      await performRollback(stack, logger, onProgress);
      console.log("Basic rollback completed successfully");
    } catch (error) {
      console.error("Basic rollback failed:", error);
    }
    console.log();

    // Example 4: Enhanced rollback to specific version (if targets available)
    if (targets.length > 1) {
      console.log("4. Performing enhanced rollback to specific version...");
      const targetVersion = targets[1].version; // Second most recent
      try {
        await performEnhancedRollback(stack, logger, onProgress, targetVersion);
        console.log(
          `Enhanced rollback to version ${targetVersion} completed successfully`
        );
      } catch (error) {
        console.error(
          `Enhanced rollback to version ${targetVersion} failed:`,
          error
        );
      }
    } else {
      console.log("4. Skipping enhanced rollback - insufficient targets");
    }
    console.log();

    // Example 5: Store a snapshot manually (typically done automatically)
    console.log("5. Storing configuration snapshot manually...");
    try {
      // Simulate a successful deployment result
      const mockUpResult: automation.UpResult = {
        outputs: await stack.outputs(),
        summary: {
          result: "succeeded" as const,
          version: Date.now(), // Use timestamp as mock version
          resourceChanges: {},
          kind: "update",
          startTime: new Date(),
          endTime: new Date(),
          message: "Mock deployment for example",
          environment: {},
          config: {},
        },
        stdout: "",
        stderr: "",
      };

      await storeDeploymentSnapshot(stack, logger, mockUpResult, {
        example: true,
        manualSnapshot: true,
      });
      console.log("Configuration snapshot stored successfully");
    } catch (error) {
      console.error("Failed to store snapshot:", error);
    }
  } catch (error) {
    console.error("Example execution failed:", error);
  }
}

// Example usage in deployment context
async function exampleWithDeployment() {
  const logger = new ConsoleLogger("info");

  console.log("=== Rollback Integration Example ===\n");

  try {
    const stack = await automation.LocalWorkspace.createOrSelectStack({
      stackName: "organization/iaas-k8s/example-stack",
      workDir: process.cwd(),
    });

    // Simulate a deployment
    console.log("1. Simulating deployment...");
    try {
      const result = await stack.up({
        onOutput: (output) => logger.debug(output),
      });

      if (result.summary?.result === "succeeded") {
        console.log("Deployment succeeded - storing snapshot");
        await storeDeploymentSnapshot(stack, logger, result);
      } else {
        console.log("Deployment failed - attempting rollback");
        await performRollback(stack, logger, (status, message, metadata) => {
          console.log(`[ROLLBACK ${status}] ${message}`);
        });
      }
    } catch (deploymentError) {
      console.log("Deployment failed with error - attempting rollback");
      await performRollback(stack, logger, (status, message, metadata) => {
        console.log(`[ROLLBACK ${status}] ${message}`);
      });
    }
  } catch (error) {
    console.error("Deployment example failed:", error);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running rollback examples...\n");

  exampleRollbackUsage()
    .then(() => {
      console.log("\n" + "=".repeat(50) + "\n");
      return exampleWithDeployment();
    })
    .then(() => {
      console.log("\nAll examples completed!");
    })
    .catch((error) => {
      console.error("Examples failed:", error);
      process.exit(1);
    });
}

export { exampleRollbackUsage, exampleWithDeployment };
