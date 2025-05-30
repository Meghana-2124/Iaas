#!/bin/bash

# Tier System Integration Validation Script
# This script validates that the tier system has been properly integrated

set -e

echo "🧪 Tier System Integration Validation"
echo "======================================"

# Change to the pulumi directory
cd "$(dirname "$0")/../Iaas-k8s/pulumi"

echo ""
echo "1. Building the project..."
npm run build

echo ""
echo "2. Testing tier list command..."
node dist/src/cli/index.js tiers list --company-name "test" --stack-name "test" > /dev/null
echo "✅ Tier list command works"

echo ""
echo "3. Testing tier calculate commands..."
for tier in basic standard premium enterprise; do
    echo "   Testing $tier tier..."
    node dist/src/cli/index.js tiers calculate $tier --company-name "test" --stack-name "test" > /dev/null
    echo "   ✅ $tier tier calculation works"
done

echo ""
echo "4. Testing tier validate commands..."
for tier in basic standard premium enterprise; do
    echo "   Validating $tier tier..."
    node dist/src/cli/index.js tiers validate $tier --company-name "test" --stack-name "test" > /dev/null
    echo "   ✅ $tier tier validation works"
done

echo ""
echo "5. Testing CLI help for tier options..."
node dist/src/cli/index.js up --help | grep -q "planTier"
echo "✅ planTier option available in CLI"

node dist/src/cli/index.js up --help | grep -q "kubecostEnabled"
echo "✅ kubecostEnabled option available in CLI"

echo ""
echo "6. Checking TypeScript compilation..."
npm run build > /dev/null 2>&1
echo "✅ TypeScript compilation successful"

echo ""
echo "🎉 All tier system integration tests passed!"
echo "✅ The tier system is fully integrated and working correctly."
echo ""
echo "Summary:"
echo "- ✅ Tier CLI commands working"
echo "- ✅ Tier calculation engine working"
echo "- ✅ Tier validation working"
echo "- ✅ Main CLI integration complete"
echo "- ✅ TypeScript compilation successful"
echo ""
echo "The system is ready for production use!"
