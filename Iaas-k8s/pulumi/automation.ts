#!/usr/bin/env node

// Export the main deployment functionality for use as a library
export { handleDeployment, runCLI } from "./deployment.js";
export type { DeploymentOptions, DeploymentResult } from "./deployment.js";

// Keep the CLI functionality when run directly
import { runCLI } from "./deployment.js";

const main = async () => {
  await runCLI();
};

// Only run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Unhandled error in main:", err);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}
