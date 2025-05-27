#!/usr/bin/env node

/**
 * Test script to validate dynamic secrets encoding with actual secrets.json
 */

import fs from "fs";
import path from "path";
import { validateAndEncodeSecrets } from "./dist/src/utils/validation.js";

console.log(
  "🔍 Testing Dynamic Secrets Encoding with actual secrets.json...\n"
);

try {
  // Read the actual secrets.json file
  const secretsPath = path.join(process.cwd(), "config", "secrets.json");
  const secretsContent = fs.readFileSync(secretsPath, "utf8");

  console.log("📄 Testing with actual secrets.json file...\n");

  // Test the encoding
  const result = validateAndEncodeSecrets(secretsContent);

  console.log(
    `Validation Status: ${result.isValid ? "✅ VALID" : "❌ INVALID"}`
  );
  console.log(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log("\n❌ Validation Errors:");
    result.errors.forEach((error) => {
      console.log(`  - ${error.field}: ${error.message}`);
    });
  }

  if (result.encodingReport) {
    console.log("\n📊 Encoding Report:");
    const summary = {};
    Object.entries(result.encodingReport).forEach(([field, status]) => {
      const emoji = {
        encoded: "🔐",
        already_encoded: "✅",
        placeholder: "⚠️",
        skipped: "⏭️",
      };
      console.log(`  ${emoji[status]} ${field}: ${status}`);
      summary[status] = (summary[status] || 0) + 1;
    });

    console.log("\n📈 Summary:");
    Object.entries(summary).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} fields`);
    });
  }

  console.log("\n✅ Testing complete!");
} catch (error) {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
}
