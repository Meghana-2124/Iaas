import { automation } from "@pulumi/pulumi";
import * as path from "path";
import * as process from "process";

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node automation.js <action> <stackName>");
    console.error("Actions: up, preview, destroy, outputs, refresh");
    console.error("Example: node automation.js up dev");
    process.exit(1);
  }

  const action = args[0];
  const stackName = args[1];

  // Assuming this script (automation.js) is in 'dist/' and run from the 'pulumi/' project root directory.
  // The workDir should be the root of the Pulumi project (where Pulumi.yaml is).
  const workDir = path.resolve(".");

  const projectSettings: automation.LocalProgramArgs = {
    stackName: stackName,
    workDir: workDir, // workDir is where Pulumi.yaml and the compiled Pulumi program (e.g., dist/index.js) are located.
  };

  // Create or select a stack using the local workspace.
  const stack = await automation.LocalWorkspace.createOrSelectStack(
    projectSettings
  );

  console.log(`Successfully initialized stack: ${stack.name}`);
  console.log(`Working directory for Pulumi program: ${workDir}`);
  console.log(
    "Executing Pulumi program located in the 'main' directory specified in Pulumi.yaml (e.g. ./dist) within the working directory."
  );

  console.log("Starting Pulumi operation...");

  try {
    switch (action) {
      case "up":
        console.log(`Running pulumi up for stack: ${stackName}...`);
        const upRes: automation.UpResult = await stack.up({
          onOutput: console.log,
        });
        console.log("\n--- Update Summary ---");
        if (upRes.summary) {
          console.log(`Status: ${upRes.summary.result}`);
          console.log(`Version: ${upRes.summary.version}`);
          console.log(
            "Resource changes:",
            JSON.stringify(upRes.summary.resourceChanges, null, 2)
          );
        } else {
          console.log("No summary available for the update.");
        }
        console.log("\n--- Outputs ---");
        console.log(JSON.stringify(upRes.outputs, null, 2));

        if (upRes.outputs.kubeconfig && upRes.outputs.kubeconfig.value) {
          const kubeconfigValue =
            typeof upRes.outputs.kubeconfig.value === "string"
              ? upRes.outputs.kubeconfig.value
              : JSON.stringify(upRes.outputs.kubeconfig.value);

          console.log("\n--- To configure kubectl for EKS ---");
          const kubeconfigFileName = `kubeconfig-${stackName}.yaml`;
          console.log(`1. Save the kubeconfig:`);
          console.log(
            `   echo '${kubeconfigValue.replace(
              /'/g,
              "'''"
            )}' > ${kubeconfigFileName}`
          );
          console.log(`2. Set KUBECONFIG environment variable:`);
          console.log(`   export KUBECONFIG=$(pwd)/${kubeconfigFileName}`);
          console.log(`3. Test connection:`);
          console.log(`   kubectl get nodes`);
        }
        break;
      case "preview":
        console.log(`Running pulumi preview for stack: ${stackName}...`);
        await stack.preview({ onOutput: console.log });
        console.log("\nPreview finished. Review the output above.");
        break;
      case "destroy":
        console.log(`Running pulumi destroy for stack: ${stackName}...`);
        const destroyRes = await stack.destroy({ onOutput: console.log });
        console.log("\n--- Destroy Summary ---");
        if (destroyRes.summary) {
          console.log(`Status: ${destroyRes.summary.result}`);
          console.log(
            "Resource changes:",
            JSON.stringify(destroyRes.summary.resourceChanges, null, 2)
          );
        } else {
          console.log("No summary available for the destroy operation.");
        }
        break;
      case "outputs":
        console.log(`Fetching outputs for stack: ${stackName}...`);
        const outputs = await stack.outputs();
        console.log("\n--- Stack Outputs ---");
        console.log(JSON.stringify(outputs, null, 2));
        break;
      case "refresh":
        console.log(`Running pulumi refresh for stack: ${stackName}...`);
        const refreshRes = await stack.refresh({ onOutput: console.log });
        console.log("\n--- Refresh Summary ---");
        if (refreshRes.summary) {
          console.log(`Status: ${refreshRes.summary.result}`);
        } else {
          console.log("No summary available for the refresh operation.");
        }
        console.log("Refresh finished. Review the output above.");
        break;
      default:
        console.error(`Unknown action: ${action}`);
        console.error(
          "Available actions: up, preview, destroy, outputs, refresh"
        );
        process.exit(1);
    }
    console.log("\nPulumi operation completed successfully.");
  } catch (err: any) {
    console.error("\nPulumi operation failed.");
    if (err.message) {
      console.error("Error message:", err.message);
    }
    // Automation API errors often include stdout/stderr from the underlying Pulumi CLI
    if (err.stdout) {
      console.error("Stdout:", err.stdout);
    }
    if (err.stderr) {
      console.error("Stderr:", err.stderr);
    }
    if (err.stack && !err.stdout && !err.stderr) {
      // Avoid redundant stack trace if stdout/stderr is present
      console.error("Stack trace:", err.stack);
    }
    process.exit(1);
  }
};

main().catch((err) => {
  console.error("Unhandled error in main:", err);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
