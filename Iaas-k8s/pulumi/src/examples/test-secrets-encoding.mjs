#!/usr/bin/env node

/**
 * Test script to validate dynamic secrets encoding functionality
 * Run with: node test-secrets-encoding.mjs
 */

import {
  validateAndEncodeSecrets,
  encodeSecretValue,
  isBase64Encoded,
} from "../utils/validation.js";

console.log("🧪 Testing Dynamic Secrets Encoding...\n");

// Test 1: Basic encoding functions
console.log("1️⃣ Testing basic encoding functions:");
const testValue = "my-secret-password-123";
const encoded = encodeSecretValue(testValue);
console.log(`   Original: ${testValue}`);
console.log(`   Encoded:  ${encoded}`);
console.log(`   Is Base64: ${isBase64Encoded(encoded)}`);
console.log(`   Is Original Base64: ${isBase64Encoded(testValue)}\n`);

// Test 2: Real secrets structure with mixed content
console.log("2️⃣ Testing mixed secrets structure:");
const testSecrets = {
  kubernetesSecrets: {
    rafikiAuth: {
      data: {
        RAFIKI_AUTH_DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        RAFIKI_AUTH_IDENTITY_SERVER_SECRET: "super-secret-key-123",
        RAFIKI_AUTH_COOKIE_KEY: "Y29va2llLWtleS0xMjM=", // Already base64
      },
    },
    rafikiBackend: {
      data: {
        RAFIKI_BACKEND_DATABASE_URL:
          "postgresql://backend:secret@localhost:5432/backend",
        RAFIKI_BACKEND_STREAM_SECRET: "stream-secret-456",
        RAFIKI_BACKEND_ADMIN_KEY: "admin-key-789",
        RAFIKI_BACKEND_REDIS_URL: "redis://localhost:6379",
      },
    },
  },
  dbPassword: "database-password-123",
  redisPassword: "redis-password-456",
  jwtSecret: "jwt-secret-key-789",
  apiKeys: {
    stripe: "sk_test_4eC39HqLyjWDarjtT1zdp7dc",
    sendgrid: "SG.1234567890abcdef.1234567890abcdef1234567890abcdef12345678",
  },
  webhookSecret: "webhook-secret-abc",
  encryptionKey: "encryption-key-def",
};

const result = validateAndEncodeSecrets(JSON.stringify(testSecrets));

console.log(
  `   Validation Status: ${result.isValid ? "✅ VALID" : "❌ INVALID"}`
);
console.log(`   Errors: ${result.errors.length}`);

if (result.encodingReport) {
  console.log("   Encoding Report:");
  Object.entries(result.encodingReport).forEach(([field, status]) => {
    const emoji = {
      encoded: "🔐",
      already_encoded: "✅",
      placeholder: "⚠️",
      skipped: "⏭️",
    };
    console.log(`     ${emoji[status]} ${field}: ${status}`);
  });
}

// Test 3: Placeholder values
console.log("\n3️⃣ Testing placeholder values:");
const placeholderSecrets = {
  kubernetesSecrets: {
    test: {
      data: {
        DATABASE_URL: "PLEASE_REPLACE_WITH_BASE64_ENCODED_PROD_DATABASE_URL",
        API_KEY: "<REPLACE_WITH_API_KEY>",
        REAL_SECRET: "actual-secret-value",
      },
    },
  },
};

const placeholderResult = validateAndEncodeSecrets(
  JSON.stringify(placeholderSecrets)
);
console.log(
  `   Validation Status: ${
    placeholderResult.isValid ? "✅ VALID" : "❌ INVALID"
  }`
);

if (placeholderResult.encodingReport) {
  console.log("   Placeholder Handling:");
  Object.entries(placeholderResult.encodingReport).forEach(
    ([field, status]) => {
      const emoji = {
        encoded: "🔐",
        already_encoded: "✅",
        placeholder: "⚠️",
        skipped: "⏭️",
      };
      console.log(`     ${emoji[status]} ${field}: ${status}`);
    }
  );
}

// Test 4: Edge cases
console.log("\n4️⃣ Testing edge cases:");
const edgeCases = {
  normalField: "not-a-secret",
  Password: "should-be-encoded",
  user_token: "should-be-encoded-too",
  regularValue: "regular-value",
  PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----",
  databaseUrl: "mysql://user:pass@localhost:3306/db",
};

const edgeResult = validateAndEncodeSecrets(JSON.stringify(edgeCases));
console.log(
  `   Validation Status: ${edgeResult.isValid ? "✅ VALID" : "❌ INVALID"}`
);

if (edgeResult.encodingReport) {
  console.log("   Edge Case Handling:");
  Object.entries(edgeResult.encodingReport).forEach(([field, status]) => {
    const emoji = {
      encoded: "🔐",
      already_encoded: "✅",
      placeholder: "⚠️",
      skipped: "⏭️",
    };
    console.log(`     ${emoji[status]} ${field}: ${status}`);
  });
}

console.log("\n✅ Testing complete!");
