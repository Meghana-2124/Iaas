import { automation } from "@pulumi/pulumi";
import * as path from "path";
import * as process from "process";

const main = async () => {
  const rawArgs = process.argv.slice(2); // Changed from 'args'
  let action: string | undefined;
  let stackName: string | undefined;
  let secretsJsonString: string | undefined;
  let valuesJsonString: string | undefined;
  let companyName: string | undefined; // Added companyName

  // Updated argument parsing logic
  if (rawArgs.length < 2) {
    // Adjusted for potentially more args
    // Updated usage message
    console.error(
      "Usage: node automation.js <action> <stackName> --secretsJson <json_string> --valuesJson <json_string> [--companyName <string>]"
    );
    console.error("Actions: up, preview, destroy, outputs, refresh");
    console.error(
      "Example: node automation.js up dev --secretsJson '{\"dbPassword\":\"s3cr3t\"}' --valuesJson '{\"replicaCount\":3}' --companyName 'mycorp'"
    );
    process.exit(1);
  }

  action = rawArgs[0];
  stackName = rawArgs[1];

  // Parse additional optional arguments
  for (let i = 2; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--secretsJson") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        secretsJsonString = rawArgs[i + 1];
        i++; // consume value
      } else {
        console.error("Error: --secretsJson requires a JSON string value.");
        process.exit(1);
      }
    } else if (arg === "--valuesJson") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        valuesJsonString = rawArgs[i + 1];
        i++; // consume value
      } else {
        console.error("Error: --valuesJson requires a JSON string value.");
        process.exit(1);
      }
    } else if (arg === "--companyName") {
      // Added companyName parsing
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        companyName = rawArgs[i + 1];
        i++; // consume value
      } else {
        console.error("Error: --companyName requires a string value.");
        process.exit(1);
      }
    } else {
      console.warn(`Ignoring unknown argument or malformed pair: ${arg}`);
    }
  }

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

  // New block: Set configuration from JSON strings if provided
  // This is placed after stack initialization and before other console logs or the main switch.
  if (secretsJsonString) {
    try {
      JSON.parse(secretsJsonString); // Basic validation: ensure it's a parseable JSON string
      await stack.setConfig("helmSecretsJson", {
        value: secretsJsonString,
        secret: true,
      });
      console.log(
        "Set helmSecretsJson configuration for the stack (as secret)."
      );
    } catch (e: any) {
      console.error(
        "Failed to parse --secretsJson. Please provide a valid JSON string. Error:",
        e.message
      );
      process.exit(1);
    }
  } else {
    console.error(
      "Error: --secretsJson is required. Please provide a valid JSON string."
    );
    process.exit(1);
  }

  if (valuesJsonString) {
    try {
      JSON.parse(valuesJsonString); // Basic validation: ensure it's a parseable JSON string
      await stack.setConfig("helmValuesJson", { value: valuesJsonString });
      console.log("Set helmValuesJson configuration for the stack.");
    } catch (e: any) {
      console.error(
        "Failed to parse --valuesJson. Please provide a valid JSON string. Error:",
        e.message
      );
      process.exit(1);
    }
  } // Removed else block that exited if valuesJsonString was not present, making it optional.

  // Set companyName configuration if provided
  if (companyName) {
    await stack.setConfig("companyName", { value: companyName });
    console.log("Set companyName configuration for the stack.");
  } else {
    // If not provided, we can choose to default it or make it required.
    // For now, let's make it required for clarity in this refactoring.
    // Later, we can decide if a default (like "iaas") is acceptable if not passed.
    console.error(
      "Error: --companyName is required. Please provide a company name string."
    );
    process.exit(1);
  }

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
