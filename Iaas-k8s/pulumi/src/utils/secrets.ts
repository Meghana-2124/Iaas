import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";

export interface SecretConfig {
  length?: number;
  includeSpecialChars?: boolean;
  prefix?: string;
}

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureSecret(config: SecretConfig = {}): string {
  const {
    length = 32,
    includeSpecialChars = true,
    prefix = ""
  } = config;

  const charset = includeSpecialChars 
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
    : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return result;
}

/**
 * Generate secure database URL with random credentials
 */
export function generateDatabaseCredentials(dbHost: string, dbName: string): {
  user: string;
  password: pulumi.Output<string>;
  connectionString: pulumi.Output<string>;
} {
  const user = `rafiki_${generateSecureSecret({ length: 8, includeSpecialChars: false })}`;
  const password = pulumi.secret(generateSecureSecret({ length: 24 }));
  
  const connectionString = pulumi.interpolate`postgresql://${user}:${password}@${dbHost}:5432/${dbName}?ssl=true`;
  
  return {
    user,
    password,
    connectionString
  };
}

/**
 * Generate secure API keys and secrets for Rafiki services
 */
export function generateRafikiSecrets(): {
  authCookieKey: string;
  authIdentityServerSecret: string;
  streamSecret: string;
  adminKey: string;
  nonceRedisKey: string;
} {
  return {
    authCookieKey: generateSecureSecret({ length: 32 }),
    authIdentityServerSecret: generateSecureSecret({ length: 24 }),
    streamSecret: crypto.randomBytes(32).toString('base64'),
    adminKey: generateSecureSecret({ length: 16, includeSpecialChars: false }),
    nonceRedisKey: generateSecureSecret({ length: 16, includeSpecialChars: false })
  };
}

/**
 * Create secure environment variables configuration
 */
export function createSecureEnvironmentConfig(
  companyName: string,
  environment: string,
  databaseUrl: pulumi.Output<string>
): {
  auth: Record<string, any>;
  backend: Record<string, any>;
} {
  const secrets = generateRafikiSecrets();
  const baseUrl = `https://${companyName.toLowerCase()}-rafiki-${environment}.com`;
  
  return {
    auth: {
      AUTH_PORT: 3006,
      AUTH_ADMIN_PORT: 3008,
      AUTH_INTROSPECTION_PORT: 3007,
      AUTH_COOKIE_KEY: secrets.authCookieKey,
      AUTH_DATABASE_URL: databaseUrl,
      AUTH_IDENTITY_SERVER_URL: `${baseUrl}/auth/interledger/app?next=/consent`,
      AUTH_IDENTITY_SERVER_SECRET: secrets.authIdentityServerSecret,
      AUTH_SERVER_URL: `${baseUrl}/auth`,
      AUTH_WAIT_SECONDS: 5,
      AUTH_REDIS_URL: "redis://redis:6379/0"
    },
    backend: {
      LOG_LEVEL: environment === "production" ? "info" : "debug",
      ADMIN_PORT: 3001,
      CONNECTOR_PORT: 3002,
      OPEN_PAYMENTS_PORT: 80,
      DATABASE_URL: databaseUrl,
      USE_TIGERBEETLE: false,
      TIGERBEETLE_CLUSTER_ID: 0,
      TIGERBEETLE_REPLICA_ADDRESSES: "",
      NONCE_REDIS_KEY: secrets.nonceRedisKey,
      AUTH_SERVER_GRANT_URL: `${baseUrl}/auth`,
      AUTH_SERVER_INTROSPECTION_URL: "http://rafiki-auth:3007",
      ILP_ADDRESS: `test.${companyName.toLowerCase()}-rafiki`,
      STREAM_SECRET: secrets.streamSecret,
      ADMIN_KEY: secrets.adminKey,
      PUBLIC_HOST: baseUrl,
      OPEN_PAYMENTS_URL: baseUrl,
      REDIS_URL: "redis://redis:6379/1",
      WALLET_ADDRESS_URL: `${baseUrl}/.well-known/pay`,
      WEBHOOK_URL: `${baseUrl}/webhook/rafiki`,
      WEBHOOK_TIMEOUT: 60000,
      EXCHANGE_RATES_URL: `${baseUrl}/rates`,
      AUTOPEERING_PORT: 3005,
      ILP_CONNECTOR_URL: `${baseUrl}/connector`,
      INSTANCE_NAME: companyName,
      SLIPPAGE: 0.01
    }
  };
}
