#!/bin/bash

# Simple Helm Chart Values and Secrets Testing Guide
# This script provides manual testing approaches for your Helm chart

set -e

CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎯 Helm Chart Testing Guide${NC}"
echo "=================================="
echo ""

echo -e "${YELLOW}1. Testing Values Interpolation:${NC}"
echo "   Test that companyName gets properly interpolated in templates"
echo ""
echo "   Command:"
echo "   helm template testrelease . --set companyName=mycompany --dry-run"
echo ""

echo -e "${YELLOW}2. Testing Secrets Template:${NC}"
echo "   Test that secrets are properly templated with base64 encoded values"
echo ""
echo "   Create a test secrets file:"
cat << 'EOF'
cat > test-secrets.yaml << 'EOL'
companyName: testcompany
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
EOL
EOF
echo ""
echo "   Test the secrets template:"
echo "   helm template testrelease . -f test-secrets.yaml --show-only templates/secret.yaml"
echo ""

echo -e "${YELLOW}3. Validate Base64 Encoding:${NC}"
echo "   Verify that your secrets are properly base64 encoded"
echo ""
echo "   Encode a secret:"
echo "   echo -n 'your-secret-value' | base64"
echo ""
echo "   Decode to verify:"
echo "   echo 'cG9zdGdyZXNxbDovL3VzZXI6cGFzc0Bsb2NhbGhvc3Q6NTQzMi9kYg==' | base64 -d"
echo ""

echo -e "${YELLOW}4. Test with AWS/GCP Values:${NC}"
echo "   Test with your environment-specific values"
echo ""
echo "   AWS:"
echo "   helm template testrelease . -f ../aws/chart-config/values.yaml --set companyName=mycompany"
echo ""
echo "   GCP:"
echo "   helm template testrelease . -f ../gcp/chart-config/values.yaml --set companyName=mycompany"
echo ""

echo -e "${YELLOW}5. Lint the Chart:${NC}"
echo "   Validate chart structure and templates"
echo ""
echo "   helm lint . --set companyName=testcompany"
echo ""

echo -e "${YELLOW}6. Dry Run Deployment:${NC}"
echo "   Test actual deployment without applying to cluster"
echo ""
echo "   helm install testrelease . --set companyName=mycompany --dry-run --debug"
echo ""

echo -e "${GREEN}Quick Test Commands:${NC}"
echo "=================="

# Quick test for base64 encoding
echo ""
echo -e "${BLUE}Testing base64 encoding/decoding:${NC}"
test_value="postgresql://user:pass@localhost:5432/db"
encoded=$(echo -n "$test_value" | base64)
decoded=$(echo "$encoded" | base64 -d)

echo "Original: $test_value"
echo "Encoded:  $encoded"
echo "Decoded:  $decoded"

if [ "$test_value" = "$decoded" ]; then
    echo -e "${GREEN}✅ Base64 encoding/decoding works correctly${NC}"
else
    echo -e "${RED}❌ Base64 encoding/decoding failed${NC}"
fi

echo ""
echo -e "${BLUE}Testing companyName interpolation:${NC}"
echo "Template expression: {{ .Values.companyName }}-rafiki"
echo "With companyName=mycompany, becomes: mycompany-rafiki"

echo ""
echo -e "${GREEN}🎉 Testing guide complete!${NC}"
echo ""
echo "💡 Tips:"
echo "   - Always use base64 encoded values for secrets"
echo "   - Test with different companyName values" 
echo "   - Use helm lint to catch template errors"
echo "   - Use --dry-run to test without deploying"
echo "   - Check rendered YAML for proper interpolation"
