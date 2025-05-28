#!/bin/bash

# Simple validation script for the updated Helm chart

set -e

CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/config" && pwd)"

echo "🧪 Running simple validation tests..."

echo ""
echo "1. Testing basic chart lint..."
cd "$CHART_DIR"
helm lint . -f tests/config/values.yaml --set companyName=testcompany

echo ""
echo "2. Testing AWS configuration lint..."
helm lint . -f tests/config/values-aws.yaml --set companyName=testcompany

echo ""
echo "3. Testing GCP configuration lint..."
helm lint . -f tests/config/values-gcp.yaml --set companyName=testcompany

echo ""
echo "4. Testing template rendering..."
helm template testrelease . -f tests/config/values.yaml --set companyName=testcompany > /dev/null

echo ""
echo "5. Testing secrets rendering..."
helm template testrelease . -f tests/config/values.yaml -f tests/config/secrets.yaml --set companyName=testcompany --show-only templates/secret.yaml > /dev/null

echo ""
echo "✅ All validation tests passed!"
echo ""
echo "📋 Summary of Updated Features:"
echo "   • Streamlined single deployment model (no deployment types)"
echo "   • Enhanced multi-cloud support (AWS/GCP)"
echo "   • Simplified secrets management with stringData"
echo "   • Updated test configurations and documentation"
echo "   • Modernized validation scripts"
