import { automation } from "@pulumi/pulumi";
import * as path from "path";

export interface DeploymentOptions {
  action: "up" | "preview" | "destroy" | "outputs" | "refresh";
  stackName: string;
  secretsJson: string;
  valuesJson?: string;
  companyName: string;
  workDir?: string;
}

export interface DeploymentResult {
  success: boolean;
  outputs?: any;
  summary?: any;
  error?: string;
  kubeconfig?: string;
}

export async function handleDeployment(
  options: DeploymentOptions
): Promise<DeploymentResult> {
  const { action, stackName, secretsJson, valuesJson, companyName, workDir } =
    options;

  try {
    // Validate required parameters
    if (!secretsJson) {
      throw new Error("secretsJson is required");
    }
    if (!companyName) {
      throw new Error("companyName is required");
    }

    const resolvedWorkDir = workDir || path.resolve(".");

    const projectSettings: automation.LocalProgramArgs = {
      stackName: stackName,
      workDir: resolvedWorkDir,
    };

    // Create or select a stack using the local workspace.
    const stack = await automation.LocalWorkspace.createOrSelectStack(
      projectSettings
    );

    console.log(`Successfully initialized stack: ${stack.name}`);
    console.log(`Working directory for Pulumi program: ${resolvedWorkDir}`);

    // Set configuration from JSON strings
    try {
      JSON.parse(secretsJson); // Validate JSON
      await stack.setConfig("helmSecretsJson", {
        value: secretsJson,
        secret: true,
      });
      console.log(
        "Set helmSecretsJson configuration for the stack (as secret)."
      );
    } catch (e: any) {
      throw new Error(`Failed to parse secretsJson: ${e.message}`);
    }

    if (valuesJson) {
      try {
        JSON.parse(valuesJson); // Validate JSON
        await stack.setConfig("helmValuesJson", { value: valuesJson });
        console.log("Set helmValuesJson configuration for the stack.");
      } catch (e: any) {
        throw new Error(`Failed to parse valuesJson: ${e.message}`);
      }
    }

    // Set companyName configuration
    await stack.setConfig("companyName", { value: companyName });
    console.log("Set companyName configuration for the stack.");

    console.log("Starting Pulumi operation...");

    let result: DeploymentResult = { success: false };

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
        }
        console.log("\n--- Outputs ---");
        console.log(JSON.stringify(upRes.outputs, null, 2));

        result = {
          success: true,
          outputs: upRes.outputs,
          summary: upRes.summary,
        };

        // Add kubeconfig instructions if available
        if (upRes.outputs.kubeconfig && upRes.outputs.kubeconfig.value) {
          const kubeconfigValue =
            typeof upRes.outputs.kubeconfig.value === "string"
              ? upRes.outputs.kubeconfig.value
              : JSON.stringify(upRes.outputs.kubeconfig.value);

          result.kubeconfig = kubeconfigValue;

          console.log("\n--- To configure kubectl for cluster ---");
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
        result = { success: true };
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
        }
        result = {
          success: true,
          summary: destroyRes.summary,
        };
        break;

      case "outputs":
        console.log(`Fetching outputs for stack: ${stackName}...`);
        const outputs = await stack.outputs();
        console.log("\n--- Stack Outputs ---");
        console.log(JSON.stringify(outputs, null, 2));
        result = {
          success: true,
          outputs: outputs,
        };
        break;

      case "refresh":
        console.log(`Running pulumi refresh for stack: ${stackName}...`);
        const refreshRes = await stack.refresh({ onOutput: console.log });
        console.log("\n--- Refresh Summary ---");
        if (refreshRes.summary) {
          console.log(`Status: ${refreshRes.summary.result}`);
        }
        result = {
          success: true,
          summary: refreshRes.summary,
        };
        break;

      default:
        throw new Error(
          `Unknown action: ${action}. Available actions: up, preview, destroy, outputs, refresh`
        );
    }

    console.log("\nPulumi operation completed successfully.");
    return result;
  } catch (err: any) {
    console.error("\nPulumi operation failed.");

    let errorMessage = "Unknown error occurred";
    if (err.message) {
      errorMessage = err.message;
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
      console.error("Stack trace:", err.stack);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Keep the original CLI functionality for backward compatibility
export async function runCLI() {
  const rawArgs = process.argv.slice(2);
  let action: string | undefined;
  let stackName: string | undefined;
  let secretsJsonString: string | undefined;
  let valuesJsonString: string | undefined;
  let companyName: string | undefined;

  if (rawArgs.length < 2) {
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
        i++;
      } else {
        console.error("Error: --secretsJson requires a JSON string value.");
        process.exit(1);
      }
    } else if (arg === "--valuesJson") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        valuesJsonString = rawArgs[i + 1];
        i++;
      } else {
        console.error("Error: --valuesJson requires a JSON string value.");
        process.exit(1);
      }
    } else if (arg === "--companyName") {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        companyName = rawArgs[i + 1];
        i++;
      } else {
        console.error("Error: --companyName requires a string value.");
        process.exit(1);
      }
    } else {
      console.warn(`Ignoring unknown argument or malformed pair: ${arg}`);
    }
  }

  if (!secretsJsonString) {
    console.error(
      "Error: --secretsJson is required. Please provide a valid JSON string."
    );
    process.exit(1);
  }

  if (!companyName) {
    console.error(
      "Error: --companyName is required. Please provide a company name string."
    );
    process.exit(1);
  }

  const options: DeploymentOptions = {
    action: action as any,
    stackName: stackName!,
    secretsJson: secretsJsonString,
    valuesJson: valuesJsonString,
    companyName: companyName,
  };

  const result = await handleDeployment(options);

  if (!result.success) {
    process.exit(1);
  }
}
