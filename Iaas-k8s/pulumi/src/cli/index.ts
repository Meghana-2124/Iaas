#!/usr/bin/env node

import { runCLI } from "../index.js";

// CLI entry point
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
