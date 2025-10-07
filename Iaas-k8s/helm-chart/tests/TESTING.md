# Helm Chart Testing Guide

This guide provides comprehensive methods to test your Helm chart with the streamlined deployment system.

## Overview

The Helm chart supports modern Kubernetes deployment patterns with:

1. **Flexible Deployment Configurations**: Customizable resource allocation and scaling
2. **Enhanced Security**: NetworkPolicies, RBAC, and secure secrets management
3. **Multi-Environment Support**: AWS/GCP specific configurations
4. **StringData Secrets**: Direct secret values without base64 encoding
5. **Automated Testing**: Comprehensive test suites for validation

## Testing Features

### Core Testing Areas

- **Template Rendering**: Tests Helm template generation
- **Values Validation**: Tests configuration interpolation
- **Security Validation**: Tests NetworkPolicies and RBAC
- **Resource Management**: Tests resource requests and limits
- **Multi-Cloud Support**: Tests AWS and GCP specific configurations

## Project Structure

The test configuration files support comprehensive testing:

```
helm-chart/tests/config/
├── values.yaml              # Base configuration
├── values-aws.yaml           # AWS-specific values
├── values-gcp.yaml           # GCP-specific values
├── secrets.yaml              # Test secrets (stringData format)
└── test-configs/             # Additional test configurations
    ├── minimal-values.yaml
    ├── full-values.yaml
    └── security-test.yaml
```

## Testing Tools Provided

### 1. Enhanced Helm Chart Testing (`test-chart.sh`)

A comprehensive shell script that tests all deployment scenarios:

```bash
# Make the script executable
chmod +x ./test-chart.sh

# Run all tests
./test-chart.sh all

# Test specific components
./test-chart.sh lint           # Chart linting
./test-chart.sh template       # Template rendering
./test-chart.sh secrets        # StringData secrets templating
./test-chart.sh values         # Values interpolation
./test-chart.sh configmap      # ConfigMap templating
./test-chart.sh dry-run        # Dry-run deployment
./test-chart.sh security       # NetworkPolicy and RBAC testing
./test-chart.sh validate       # Output validation
```

### 2. Manual Testing Guide (`manual-test-guide.sh`)

Interactive testing scripts for manual validation:

```bash
# Run manual testing guide
./manual-test-guide.sh
```

## Quick Start Testing

### Step 1: Basic Chart Validation

```bash
cd helm-chart

# Lint the chart with deployment type support
helm lint . --set companyName=testcompany --set deploymentType=shared
helm lint . --set companyName=testcompany --set deploymentType=dedicated

# Test template rendering for both deployment types
helm template testrelease . \
  --set companyName=testcompany \
  --set deploymentType=shared \
  --set namespace=test-namespace \
  --debug
```

### Step 2: Test Multi-Cloud Configurations

Test cloud-specific configurations:

```bash
# Test AWS configuration
helm template aws-test . \
  -f tests/config/values-aws.yaml \
  --set companyName=client-a \
  --output-dir ./test-output/aws

# Test GCP configuration
helm template gcp-test . \
  -f tests/config/values-gcp.yaml \
  --set companyName=client-b \
  --output-dir ./test-output/gcp
```

### Step 3: Test Security Features

Test NetworkPolicy and RBAC configurations:

```bash
# Test NetworkPolicy creation
helm template security-test . \
  --set companyName=testcompany \
  --set networkPolicy.enabled=true \
  --show-only templates/networkpolicy-*.yaml

# Test RBAC configuration
helm template rbac-test . \
  --set companyName=testcompany \
  --show-only templates/rbac.yaml
```

### Step 4: Test StringData Secrets

Test the stringData format (no base64 encoding required):

```bash
# Create test secrets file with stringData
cat > test-secrets.yaml << 'EOF'
kubernetesSecrets:
  rafikiAuth:
    create: true
    name: rafiki-auth-secrets
    stringData:
      RAFIKI_AUTH_DATABASE_URL: "postgresql://user:pass@localhost:5432/db"
      RAFIKI_AUTH_COOKIE_KEY: "auth-cookie-key"
  rafikiBackend:
    create: true
    name: rafiki-backend-secrets
    stringData:
      RAFIKI_BACKEND_DATABASE_URL: "postgresql://user:pass@localhost:5432/db"
      RAFIKI_BACKEND_REDIS_URL: "redis://localhost:6379"
EOF

# Test secret generation
helm template secrets-test . -f test-secrets.yaml --show-only templates/secret.yaml
```

## Common Testing Scenarios

### Scenario 1: Production Deployment Test

```bash
# Test production-like configuration
helm template prod-test . \
  --set companyName=production-client \
  --set environment=production \
  --set rafikiAuth.replicaCount=3 \
  --set rafikiBackend.replicaCount=5 \
  --set ingress.enabled=true \
  --set monitoring.enabled=true
```

### Scenario 2: Development Deployment Test

```bash
# Test minimal development configuration
helm template dev-test . \
  --set companyName=dev-client \
  --set environment=development \
  --set rafikiAuth.replicaCount=1 \
  --set rafikiBackend.replicaCount=1 \
  --set resources.requests.memory=256Mi
```

### Scenario 3: High Availability Test

```bash
# Test HA configuration
helm template ha-test . \
  --set companyName=ha-client \
  --set rafikiAuth.replicaCount=3 \
  --set rafikiBackend.replicaCount=5 \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=3 \
  --set autoscaling.maxReplicas=20
```

## Troubleshooting Common Issues

### Issue: Template Rendering Errors

```bash
# Debug template issues
helm template debug . --debug
```

### Issue: Values Not Applied

```bash
# Check values application
helm template test . --set companyName=test --debug | grep -A5 -B5 "companyName"
```

### Issue: Secret Format Problems

```bash
# Validate secret data format
helm template test . -f test-secrets.yaml --show-only templates/secret.yaml | \
  grep -A10 "stringData:"
```

### Issue: Service Discovery Names

```bash
# Check service names in ConfigMap
helm template test . --set companyName=test --show-only templates/configmap.yaml | \
  grep -E "rafiki-(auth|backend)"
```

## Integration Testing

### Full Integration Test

```bash
# Create test namespace
kubectl create namespace helm-test-integration

# Deploy with test values
helm install integration-test . \
  -f tests/config/values.yaml \
  --set companyName=integration-test \
  --namespace helm-test-integration \
  --dry-run

# Cleanup
kubectl delete namespace helm-test-integration
```
