#!/usr/bin/env node

/**
 * Test script to validate dynamic secrets processing functionality
 * Run with: node test-secrets-processing.mjs
 *
 * Note: Now tests stringData processing (no base64 encoding needed)
 */

import {
  validateAndProcessSecrets,
  validateAndEncodeSecrets,
  encodeSecretValue,
  isBase64Encoded,
} from "../utils/validation.js"; // Adjust path as needed

console.log("🧪 Testing Dynamic Secrets Processing for stringData...\n");

const printReport = (report, title = "Processing Report") => {
  if (report) {
    console.log(`   ${title}:`);
    Object.entries(report).forEach(([field, status]) => {
      const emoji = {
        processed: "✅", // New status for stringData
        placeholder: "⚠️",
        skipped: "⏭️",
        // Legacy statuses for backward compatibility
        encoded: "🔐", // Legacy - now just means "processed"
        already_encoded: "✅", // Legacy - now just means "processed"
      };
      console.log(`     ${emoji[status] || "❓"} ${field}: ${status}`);
    });
  }
};

const printValidationResult = (result, testName) => {
  console.log(
    `   ${testName} - Validation Status: ${
      result.isValid ? "✅ VALID" : "❌ INVALID"
    }`
  );
  if (result.errors.length > 0) {
    console.log(`   Errors (${result.errors.length}):`);
    result.errors.forEach((err) =>
      console.log(
        `     - Field: ${err.field}, Message: ${err.message.substring(0, 100)}${
          err.message.length > 100 ? "..." : ""
        }`
      )
    );
  }
  // Handle both new processingReport and legacy encodingReport
  printReport(result.processingReport || result.encodingReport);
};

// Test 1: Basic processing functions (legacy base64 functions still work)
console.log("1️⃣ Testing basic processing functions (legacy compatibility):");
const testValue = "my-secret-password-123";
const encoded = encodeSecretValue(testValue);
console.log(`   Original: ${testValue}`);
console.log(`   Legacy Base64 Encoded: ${encoded}`);
console.log(`   Is Base64 (after encoding): ${isBase64Encoded(encoded)}`);
console.log(`   Is Original Base64: ${isBase64Encoded(testValue)}\n`);
const alreadyEncodedValue = "Y29va2llLWtleS0xMjM="; // "cookie-key-123"
console.log(`   Pre-Encoded Value: ${alreadyEncodedValue}`);
console.log(
  `   Is Pre-Encoded Base64: ${isBase64Encoded(alreadyEncodedValue)}\n`
);

// Test 2: Real secrets structure with stringData (no encoding needed)
console.log("2️⃣ Testing stringData secrets structure (no base64 encoding):");
const testSecrets = {
  kubernetesSecrets: {
    rafikiAuth: {
      name: "rafiki-auth-secrets", // metadata, should be skipped
      create: "true", // metadata, should be skipped
      stringData: {
        RAFIKI_AUTH_DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        RAFIKI_AUTH_IDENTITY_SERVER_SECRET: "super-secret-key-123",
        RAFIKI_AUTH_COOKIE_KEY: "plain-text-cookie-key", // Now plain text for stringData
        RAFIKI_AUTH_PORT: "3006",
      },
    },
    rafikiBackend: {
      name: "rafiki-backend-secrets",
      stringData: {
        RAFIKI_BACKEND_DATABASE_URL:
          "postgresql://backend:secret@localhost:5432/backend",
        RAFIKI_BACKEND_STREAM_SECRET: "plainTextStreamSecret32BytesLong", // Now plain text for stringData
        RAFIKI_BACKEND_ADMIN_KEY: "admin-key-789",
        RAFIKI_BACKEND_REDIS_URL: "redis://localhost:6379",
        ADMIN_PORT: "3001", // Port as string, gets processed
        LOG_LEVEL: "debug", // Simple string, gets processed
      },
    },
  },
  // These top-level keys are outside 'kubernetesSecrets' and should be skipped by the k8s processor,
  // but your validateSecretsStructure might flag them if it's strict about top-level keys.
  // The current validateSecretsStructure in your provided code focuses on the internal structure of kubernetesSecrets.
  dbPassword: "database-password-123",
  redisPassword: "redis-password-456",
};

// Test 2: Real secrets structure with stringData (no encoding needed)
console.log("2️⃣ Testing stringData secrets structure (new processing method):");
const resultTest2 = validateAndProcessSecrets(JSON.stringify(testSecrets));
printValidationResult(resultTest2, "Test 2 (New Method)");

// Test 2b: Same test with legacy method for comparison
console.log("\n2️⃣b Testing with legacy method for comparison:");
const resultTest2Legacy = validateAndEncodeSecrets(JSON.stringify(testSecrets));
printValidationResult(resultTest2Legacy, "Test 2b (Legacy Method)");

// Test 3: Placeholder values
console.log("\n3️⃣ Testing placeholder values:");
const placeholderSecrets = {
  kubernetesSecrets: {
    testService: {
      name: "test-service-secrets",
      stringData: {
        DATABASE_URL: "PLEASE_REPLACE_WITH_ACTUAL_DATABASE_URL",
        API_KEY: "<REPLACE_WITH_API_KEY>",
        CONFIG_VALUE: "some value with REPLACE_WITH in middle",
        REAL_SECRET: "actual-secret-value", // Should be processed
      },
    },
  },
};

const placeholderResult = validateAndProcessSecrets(
  JSON.stringify(placeholderSecrets)
);
printValidationResult(placeholderResult, "Test 3");

// Test 4: Edge cases (input not conforming to 'kubernetesSecrets' structure)
// The processor is designed to work on the 'kubernetesSecrets.service.stringData' path.
// This test shows how it handles data NOT in that path.
console.log(
  "\n4️⃣ Testing edge cases (structure not matching 'kubernetesSecrets.*.stringData'):"
);
const edgeCases = {
  // These will be 'skipped' because they are not under a 'kubernetesSecrets.X.stringData' path
  normalField: "not-a-secret",
  Password: "should-be-processed-if-in-stringData",
  user_token: "should-be-processed-too-if-in-stringData",
  regularValue: "regular-value",
  PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----",
  databaseUrl: "mysql://user:pass@localhost:3306/db",
  // Add a valid structure to show some processing happening if desired
  kubernetesSecrets: {
    someService: {
      stringData: {
        ANOTHER_KEY: "anotherValueToProcess",
      },
    },
  },
};

const edgeResult = validateAndEncodeSecrets(JSON.stringify(edgeCases));
printValidationResult(edgeResult, "Test 4");

// Test 5: Specific port and secret scenarios for stringData
console.log("\n5️⃣ Testing specific port and secret scenarios for stringData:");
const adminAndStreamSecrets = {
  kubernetesSecrets: {
    myBackendService: {
      name: "my-backend-service-secrets",
      stringData: {
        ADMIN_PORT_AS_STRING: "3001", // Should be 'processed'
        ADMIN_PORT_AS_NUMBER: 3002, // Should be 'processed' (after string conversion)
        STREAM_SECRET_PLAIN_TEXT: "thisIsA32ByteSecretForStringData", // Plain text for stringData
        STREAM_SECRET_MIXED_CASE: "AnotherPlainTextSecret123", // Another plain text secret
        SHORT_SECRET: "short", // Plain text, processed normally for stringData
        OTHER_REGULAR_SECRET: "someOtherValue123", // Should be 'processed'
      },
    },
  },
};
const resultTest5 = validateAndEncodeSecrets(
  JSON.stringify(adminAndStreamSecrets)
);
printValidationResult(resultTest5, "Test 5");

// Test 6: Invalid JSON input
console.log("\n6️⃣ Testing invalid JSON input:");
const invalidJsonString = "{ kubernetesSecrets: { data: { key: value } } }"; // unquoted keys/values
const resultTest6 = validateAndEncodeSecrets(invalidJsonString);
printValidationResult(resultTest6, "Test 6");

// Test 7: Empty stringData object
console.log("\n7️⃣ Testing empty stringData object:");
const emptyDataSecrets = {
  kubernetesSecrets: {
    emptyDataService: {
      name: "empty-data-service-secrets",
      stringData: {}, // Empty stringData object
    },
  },
};
const resultTest7 = validateAndEncodeSecrets(JSON.stringify(emptyDataSecrets));
printValidationResult(resultTest7, "Test 7");

// Test 8: Secrets JSON missing kubernetesSecrets key
console.log("\n8️⃣ Testing secrets JSON missing 'kubernetesSecrets' key:");
const missingKeySecrets = {
  someOtherStructure: {
    stringData: {
      MY_KEY: "my_value",
    },
  },
};
const resultTest8 = validateAndEncodeSecrets(JSON.stringify(missingKeySecrets));
printValidationResult(resultTest8, "Test 8");

console.log("\n✅ Testing complete!");
console.log(
  "\n📝 Note: With stringData, secrets are stored as plain text in the JSON"
);
console.log(
  "and Kubernetes automatically handles any necessary encoding internally."
);
