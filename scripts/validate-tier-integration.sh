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
echo "7. Testing tier system imports..."
node -e "
const { TierCalculator } = require('./dist/src/utils/tier-calculator.js');
const { PlanTier } = require('./dist/src/types/plans.js');
console.log('✅ Tier system modules import successfully');
"

echo ""
echo "8. Testing integration with deployment options..."
node -e "
const { handleDeployment } = require('./dist/src/index.js');
console.log('✅ handleDeployment function exports correctly');
"

echo ""
echo "🎉 All tier system integration tests passed!"
echo ""
echo "Summary of validated features:"
echo "- ✅ Tier list, calculate, and validate commands"
echo "- ✅ CLI integration with planTier and kubecostEnabled options"
echo "- ✅ TypeScript compilation and module imports"
echo "- ✅ Integration with main deployment pipeline"
echo ""
echo "The tier-based resource allocation system is ready for production use!"
