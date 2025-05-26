# Helm Chart Testing Guide

This guide provides comprehensive methods to test your Helm chart to ensure that values and secrets are being templated properly with the current setup.

## Overview

Your Helm chart has several unique characteristics that require specific testing approaches:

1. **Dynamic Chart Name**: Uses `{{ .Values.companyName }}-rafiki` in Chart.yaml
2. **Secrets Encoding**: Automatic base64 encoding via Pulumi automation
3. **Multi-Environment Support**: AWS/GCP specific configurations
4. **Complex Templating**: Service discovery, ingress configuration, ConfigMaps

## Project Structure

The test configuration files are located in:

```
helm-chart/tests/config/
├── aws-values.yaml
├── aws-dev-values.yaml
├── aws-prod-values.yaml
├── gcp-values.yaml
├── gcp-dev-values.yaml
├── gcp-prod-values.yaml
└── test-secrets.yaml
```

## Testing Tools Provided

### 1. Basic Helm Chart Testing (`test-chart.sh`)

A comprehensive shell script that tests various aspects of the chart:

```bash
# Make the script executable
chmod +x ./test-chart.sh

# Run all tests
./test-chart.sh all

# Run specific test types
./test-chart.sh lint           # Chart linting
./test-chart.sh template       # Template rendering
./test-chart.sh secrets        # Secrets templating
./test-chart.sh values         # Values interpolation
./test-chart.sh configmap      # ConfigMap templating
./test-chart.sh dry-run        # Dry-run deployment
./test-chart.sh pulumi         # Pulumi-style testing
./test-chart.sh validate       # Output validation
```

### 2. Integration Testing (`test-integration.mjs`)

A Node.js script that tests the complete integration between secrets encoding and Helm templating:

```bash
# Run the integration test
cd helm-chart
node test-integration.mjs
```

## Quick Start Testing

### Step 1: Basic Chart Validation

```bash
cd helm-chart

# Lint the chart
helm lint . --set companyName=testcompany

# Test template rendering
helm template testrelease . --set companyName=testcompany --debug
```

### Step 2: Test with Real Configuration

```bash
# Test with AWS configuration
helm template testrelease . \
  -f tests/config/aws-values.yaml \
  -f tests/config/aws-dev-values.yaml \
  --set companyName=mycompany \
  --output-dir ./test-output/aws

# Test with GCP configuration
helm template testrelease . \
  -f tests/config/gcp-values.yaml \
  -f tests/config/gcp-dev-values.yaml \
  --set companyName=mycompany \
  --output-dir ./test-output/gcp
```

### Step 3: Test Secrets Handling

Create a test secrets file:

```bash
# Create test secrets
cat > test-secrets.yaml << 'EOF'
kubernetesSecrets:
  rafikiAuth:
    create: true
    name: rafiki-auth-secrets
    data:
      RAFIKI_AUTH_DATABASE_URL: cG9zdGdyZXNxbDovL3VzZXI6cGFzc0Bsb2NhbGhvc3Q6NTQzMi9kYg==
      RAFIKI_AUTH_COOKIE_KEY: dGVzdC1jb29raWUta2V5
  rafikiBackend:
    create: true
    name: rafiki-backend-secrets
    data:
      RAFIKI_BACKEND_DATABASE_URL: cG9zdGdyZXNxbDovL3VzZXI6cGFzc0Bsb2NhbGhvc3Q6NTQzMi9iYWNrZW5k
EOF

# Test with secrets
helm template testrelease . \
  -f test-secrets.yaml \
  --set companyName=testcompany \
  --show-only templates/secret.yaml
```

## Detailed Testing Scenarios

### 1. Testing Chart Name Templating

The chart name is dynamically generated. Test this:

```bash
# This should show chartName as "mycompany-rafiki"
helm template myrelease . --set companyName=mycompany --debug | grep -A5 "CHART:"
```

### 2. Testing Service Discovery

Verify service names are properly templated:

```bash
helm template testrelease . \
  --set companyName=testcompany \
  --show-only templates/configmap.yaml | \
  grep -E "(rafiki-auth|rafiki-backend)"
```

Expected output should show service names like `testrelease-rafiki-auth` and `testrelease-rafiki-backend`.

### 3. Testing Ingress Configuration

Check ingress host templating:

```bash
helm template testrelease . \
  --set companyName=mycompany \
  --set nginx.config.serverNameIlp="ilp.mycompany.com" \
  --set nginx.config.serverNameAuth="auth-ilp.mycompany.io" \
  --show-only templates/ingress.yaml
```

### 4. Testing Environment-Specific Values

Test with different environments:

```bash
# Development environment
helm template dev-release . \
  -f tests/config/aws-values.yaml \
  -f tests/config/aws-dev-values.yaml \
  --set companyName=mycompany \
  --set global.environment=dev

# Production environment
helm template prod-release . \
  -f tests/config/aws-values.yaml \
  -f tests/config/aws-prod-values.yaml \
  --set companyName=mycompany \
  --set global.environment=prod
```

## Testing with Pulumi-Style Values

Your Pulumi automation merges values from multiple sources. Test this:

```bash
# Run the automated integration test
node test-integration.mjs

# Or manually create merged values
cat > pulumi-style-values.yaml << 'EOF'
companyName: mycompany
global:
  environment: production
rafikiAuth:
  enabled: true
  replicaCount: 2
rafikiBackend:
  enabled: true
  replicaCount: 3
nginx:
  enabled: true
  config:
    serverNameIlp: "ilp.mycompany.com"
    serverNameAuth: "auth-ilp.mycompany.io"
kubernetesSecrets:
  rafikiAuth:
    create: true
    name: rafiki-auth-secrets
    data:
      RAFIKI_AUTH_DATABASE_URL: <base64-encoded-value>
EOF

helm template mycompany-prod . -f pulumi-style-values.yaml
```

## Testing Secrets Encoding Integration

To test the complete secrets encoding flow:

```bash
cd ../pulumi

# Test the encoding functions
node src/examples/test-secrets-encoding.mjs

# Then use the encoded output in Helm
# (The integration test script automates this)
```

## Validation Checklist

After running tests, verify:

### ✅ Chart Structure

- [ ] Chart lints without errors
- [ ] All templates render successfully
- [ ] No unresolved `{{ }}` expressions in output

### ✅ Naming and Labels

- [ ] Resources use correct naming pattern: `{releaseName}-{componentName}`
- [ ] Company name is properly interpolated
- [ ] Labels are consistent across resources

### ✅ Secrets

- [ ] Secret resources are created when `create: true`
- [ ] Secret data is base64 encoded
- [ ] Deployments reference secrets correctly
- [ ] No plain-text secrets in rendered output

### ✅ Services and Networking

- [ ] Services have correct selectors
- [ ] ConfigMap has proper service references
- [ ] Ingress has correct host names
- [ ] Service discovery names match

### ✅ Environment Configuration

- [ ] AWS-specific values work correctly
- [ ] GCP-specific values work correctly
- [ ] Environment overrides apply properly

## Debugging Common Issues

### Issue: Unresolved Template Expressions

```bash
# Find unresolved templates
find test-output -name "*.yaml" -exec grep -l "{{" {} \;

# Check specific files
grep "{{" test-output/rendered/**/*.yaml
```

### Issue: Missing companyName

```bash
# Verify companyName is set
helm template test . --set companyName=test --debug | grep companyName
```

### Issue: Secret Not Properly Encoded

```bash
# Check secret data format
helm template test . -f test-secrets.yaml --show-only templates/secret.yaml | \
  grep -A10 "data:"
```

### Issue: Service Discovery Names

```bash
# Check service names in ConfigMap
helm template test . --set companyName=test --show-only templates/configmap.yaml | \
  grep -E "rafiki-(auth|backend)"
```

## Automated Testing in CI/CD

For automated testing, use:

```bash
#!/bin/bash
set -e

echo "Running Helm chart tests..."

# Basic validation
helm lint helm-chart --set companyName=ci-test

# Template rendering test
helm template ci-test helm-chart --set companyName=ci-test > /dev/null

# Integration test
cd helm-chart
node test-integration.mjs

echo "All tests passed!"
```

## Next Steps

1. **Run the test suite**: Start with `./test-chart.sh all`
2. **Review output**: Check the generated files in `test-output/`
3. **Test real deployment**: Use `helm install` with `--dry-run` first
4. **Monitor secrets**: Ensure secrets are properly mounted in pods
5. **Validate networking**: Test service-to-service communication

The provided testing tools will help you ensure your Helm chart works correctly with the Pulumi automation and secrets encoding system.
