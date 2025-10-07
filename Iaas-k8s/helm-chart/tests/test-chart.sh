#!/bin/bash

# Enhanced Helm Chart Testing Script
# Tests the streamlined deployment system with multi-cloud support,
# stringData secrets, and enhanced automation features.

set -e

CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/config" && pwd)"
PROJECT_ROOT="$(dirname "$CHART_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${CYAN}[DEBUG]${NC} $1"
}

log_feature() {
    echo -e "${PURPLE}[FEATURE]${NC} $1"
}

# Enhanced test functions for the streamlined deployment system

test_basic_deployment() {
    log_feature "🚀 Testing basic deployment functionality..."
    
        local output_dir="$CHART_DIR/test-output/basic"
    mkdir -p "$output_dir"
    
    # Test 1: Basic deployment with minimal config
    echo "Testing basic deployment..."
    helm template basic-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=test-company \
        --output-dir "$output_dir/minimal"
    
    # Test 2: Deployment with custom resources
    echo "Testing deployment with custom resources..."
    helm template resource-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=test-company \
        --set rafikiAuth.replicaCount=2 \
        --set rafikiBackend.replicaCount=3 \
        --set rafikiAuth.resources.requests.cpu=250m \
        --set rafikiAuth.resources.requests.memory=512Mi \
        --output-dir "$output_dir/resources"
    
    # Test 3: Production-like configuration
    echo "Testing production configuration..."
    helm template prod-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=production-client \
        --set environment=production \
        --set rafikiAuth.replicaCount=3 \
        --set rafikiBackend.replicaCount=5 \
        --set ingress.enabled=true \
        --set monitoring.enabled=true \
        --output-dir "$output_dir/production"
    
    # Validation checks
    echo "Validating basic deployment features..."
    
    # Check company name interpolation
    if grep -r "test-company" "$output_dir/minimal" >/dev/null; then
        log_success "Company name correctly interpolated"
    else
        log_warning "Company name not found in basic deployment"
    fi
    
    # Check resource configuration
    if grep -r "250m" "$output_dir/resources" >/dev/null; then
        log_success "Custom resources correctly applied"
    else
        log_warning "Custom resources not found"
    fi
    
    log_success "Basic deployment testing completed"
}

test_multi_cloud_deployment() {
    log_feature "☁️ Testing multi-cloud deployment configurations..."
    
    local output_dir="$CHART_DIR/test-output/multicloud"
    mkdir -p "$output_dir"
    
    # Test 1: AWS deployment configuration
    echo "Testing AWS deployment configuration..."
    helm template aws-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        --set companyName=aws-client \
        --set cloudProvider=aws \
        --set aws.region=us-west-2 \
        --output-dir "$output_dir/aws"
    
    # Test 2: GCP deployment configuration
    echo "Testing GCP deployment configuration..."
    helm template gcp-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values-gcp.yaml" \
        --set companyName=gcp-client \
        --set cloudProvider=gcp \
        --set gcp.region=us-central1 \
        --output-dir "$output_dir/gcp"
    
    # Test 3: Multi-environment testing
    echo "Testing different environments..."
    for env in development staging production; do
        helm template "env-$env" "$CHART_DIR" \
            -f "$CONFIG_DIR/values.yaml" \
            --set companyName=multi-env-client \
            --set environment=$env \
            --output-dir "$output_dir/$env"
    done
    
    # Validation checks
    echo "Validating multi-cloud deployment features..."
    
    # Check AWS-specific configurations
    if grep -r "aws" "$output_dir/aws" >/dev/null; then
        log_success "AWS-specific configurations found"
    else
        log_warning "AWS-specific configurations not found"
    fi
    
    # Check GCP-specific configurations
    if grep -r "gcp" "$output_dir/gcp" >/dev/null; then
        log_success "GCP-specific configurations found"
    else
        log_warning "GCP-specific configurations not found"
    fi
    
    log_success "Multi-cloud deployment testing completed"
}

test_security_features() {
    log_feature "🔐 Testing security and networking features..."
    local output_dir="$CHART_DIR/test-output/security"
    mkdir -p "$output_dir"
    
    # Test 1: NetworkPolicy configurations
    echo "Testing NetworkPolicy configurations..."
    helm template security-network "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=secure-client \
        --set networkPolicy.enabled=true \
        --show-only templates/networkpolicy-*.yaml \
        > "$output_dir/networkpolicy.yaml" 2>/dev/null || echo "NetworkPolicy templates not found"
    
    # Test 2: RBAC configurations
    echo "Testing RBAC configurations..."
    helm template security-rbac "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=secure-client \
        --set rbac.enabled=true \
        --show-only templates/rbac.yaml \
        > "$output_dir/rbac.yaml" 2>/dev/null || echo "RBAC template not found"
    
    # Test 3: Security context configurations
    echo "Testing security context configurations..."
    helm template security-context "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=secure-client \
        --set securityContext.enabled=true \
        --set securityContext.runAsNonRoot=true \
        --set securityContext.runAsUser=1000 \
        --output-dir "$output_dir/context"
    
    # Validation checks
    echo "Validating security features..."
    
    # Check for security context in deployments
    if grep -r "securityContext" "$output_dir/context" >/dev/null; then
        log_success "Security context configurations found"
    else
        log_warning "Security context configurations not found"
    fi
    
    # Check for RBAC resources
    if [ -f "$output_dir/rbac.yaml" ] && [ -s "$output_dir/rbac.yaml" ]; then
        log_success "RBAC configurations generated"
    else
        log_warning "RBAC configurations not found"
    fi
    
    log_success "Security features testing completed"
}

test_resource_management() {
    log_feature "📊 Testing resource management and scaling..."
    
    local output_dir="$CHART_DIR/test-output/resources"
    mkdir -p "$output_dir"
    
    # Test 1: Resource requests and limits
    echo "Testing resource requests and limits..."
    helm template resources-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=resource-client \
        --set rafikiAuth.resources.requests.cpu=250m \
        --set rafikiAuth.resources.requests.memory=512Mi \
        --set rafikiAuth.resources.limits.cpu=500m \
        --set rafikiAuth.resources.limits.memory=1Gi \
        --set rafikiBackend.resources.requests.cpu=500m \
        --set rafikiBackend.resources.requests.memory=1Gi \
        --output-dir "$output_dir/limits"
    
    # Test 2: Horizontal Pod Autoscaler (HPA)
    echo "Testing HPA configurations..."
    helm template hpa-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=scaling-client \
        --set autoscaling.enabled=true \
        --set autoscaling.minReplicas=2 \
        --set autoscaling.maxReplicas=10 \
        --set autoscaling.targetCPUUtilizationPercentage=70 \
        --show-only templates/*hpa.yaml \
        > "$output_dir/hpa.yaml" 2>/dev/null || echo "HPA templates not found"
    
    # Test 3: Multiple replica configurations
    echo "Testing replica configurations..."
    for replicas in 1 3 5; do
        helm template "replicas-$replicas" "$CHART_DIR" \
            -f "$CONFIG_DIR/values.yaml" \
            --set companyName=replica-client \
            --set rafikiAuth.replicaCount=$replicas \
            --set rafikiBackend.replicaCount=$replicas \
            --output-dir "$output_dir/replicas-$replicas"
    done
    
    # Validation checks
    echo "Validating resource management..."
    
    # Check resource limits are applied
    if grep -r "250m" "$output_dir/limits" >/dev/null; then
        log_success "Resource requests correctly applied"
    else
        log_warning "Resource requests not found"
    fi
    
    # Check HPA configuration
    if [ -f "$output_dir/hpa.yaml" ] && [ -s "$output_dir/hpa.yaml" ]; then
        log_success "HPA configurations generated"
    else
        log_warning "HPA configurations not found"
    fi
    
    log_success "Resource management testing completed"
}
        if grep -r "namespace: $company-production" "$output_dir/$company" >/dev/null; then
            log_success "Namespace pattern correct for $company"
        else
            log_warning "Namespace pattern not found for $company"
        fi
    done
    
    log_success "Namespace management testing completed"
}

test_stringdata_secrets() {
    log_feature "🔐 Testing stringData secrets (no base64 encoding)..."
    
    local output_dir="$CHART_DIR/test-output/stringdata"
    mkdir -p "$output_dir"
    
    # Create test secrets with stringData format
    cat > "$output_dir/test-stringdata-values.yaml" << 'EOF'
kubernetesSecrets:
  rafikiAuth:
    create: true
    name: rafiki-auth-secrets
    stringData:
      RAFIKI_AUTH_DATABASE_URL: "postgresql://user:password@postgres:5432/rafiki_auth"
      RAFIKI_AUTH_COOKIE_KEY: "super-secret-cookie-key-123"
      RAFIKI_AUTH_JWT_SECRET: "jwt-signing-secret-456"
  rafikiBackend:
    create: true
    name: rafiki-backend-secrets
    stringData:
      RAFIKI_BACKEND_DATABASE_URL: "postgresql://user:password@postgres:5432/rafiki_backend"
      REDIS_URL: "redis://redis:6379"
      API_SECRET: "backend-api-secret-789"
EOF
    
    # Test stringData secret rendering
    echo "Testing stringData secret rendering..."
    helm template stringdata-test "$CHART_DIR" \
        -f "$output_dir/test-stringdata-values.yaml" \
        --set companyName=testcompany \
        --show-only templates/secret.yaml \
        > "$output_dir/rendered-secrets.yaml"
    
    echo "StringData secrets content:"
    cat "$output_dir/rendered-secrets.yaml"
    
    # Validation checks
    echo "Validating stringData secrets..."
    
    # Check that stringData field is used (not data field)
    if grep -q "stringData:" "$output_dir/rendered-secrets.yaml"; then
        log_success "StringData field found in secrets"
    else
        log_warning "StringData field not found in secrets"
    fi
    
    # Check that values are not base64 encoded
    if grep -q "postgresql://user:password" "$output_dir/rendered-secrets.yaml"; then
        log_success "Plain text values found (not base64 encoded)"
    else
        log_warning "Plain text values not found in secrets"
    fi
    
    # Test with both deployment types
    echo "Testing stringData with shared deployment..."
    helm template stringdata-shared "$CHART_DIR" \
        -f "$output_dir/test-stringdata-values.yaml" \
        --set companyName=client-shared \
        --set deploymentType=shared \
        --set namespace=client-shared-prod \
        --show-only templates/secret.yaml \
        > "$output_dir/shared-secrets.yaml"
    
    echo "Testing stringData with dedicated deployment..."
    helm template stringdata-dedicated "$CHART_DIR" \
        -f "$output_dir/test-stringdata-values.yaml" \
        --set companyName=client-dedicated \
        --set deploymentType=dedicated \
        --show-only templates/secret.yaml \
        > "$output_dir/dedicated-secrets.yaml"
    
    log_success "StringData secrets testing completed"
}

test_security_features() {
    log_feature "🛡️ Testing security features (NetworkPolicies, RBAC)..."
    
    local output_dir="$CHART_DIR/test-output/security"
    mkdir -p "$output_dir"
    
    # Test 1: NetworkPolicy creation for shared deployments
    echo "Testing NetworkPolicy creation..."
    helm template security-network "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=secure-client \
        --set deploymentType=shared \
        --set namespace=secure-client-prod \
        --set networkPolicy.enabled=true \
        --set networkPolicy.allowIngressFrom[0].name=ingress-nginx \
        --set networkPolicy.allowIngressFrom[1].cidr=10.0.0.0/16 \
        --set networkPolicy.allowEgressTo[0].cidr=10.0.0.0/8 \
        --set networkPolicy.allowEgressPorts[0].protocol=TCP \
        --set networkPolicy.allowEgressPorts[0].port=443 \
        --set networkPolicy.allowEgressPorts[1].protocol=TCP \
        --set networkPolicy.allowEgressPorts[1].port=5432 \
        --output-dir "$output_dir/networkpolicy"
    
    # Test 2: RBAC configuration
    echo "Testing RBAC configuration..."
    helm template security-rbac "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=rbac-client \
        --set deploymentType=shared \
        --set namespace=rbac-client-prod \
        --set rbac.enabled=true \
        --set serviceAccount.create=true \
        --output-dir "$output_dir/rbac"
    
    # Validation checks
    echo "Validating security features..."
    
    # Check NetworkPolicy files
    if find "$output_dir/networkpolicy" -name "*networkpolicy*" | grep -q .; then
        log_success "NetworkPolicy templates found"
        
        # Check specific NetworkPolicy rules
        if grep -r "allowIngressFrom" "$output_dir/networkpolicy" >/dev/null; then
            log_success "Ingress rules configured"
        fi
        
        if grep -r "allowEgressTo" "$output_dir/networkpolicy" >/dev/null; then
            log_success "Egress rules configured"
        fi
    else
        log_warning "NetworkPolicy templates not found"
    fi
    
    # Check RBAC files
    if find "$output_dir/rbac" -name "*rbac*" -o -name "*role*" -o -name "*serviceaccount*" | grep -q .; then
        log_success "RBAC templates found"
    else
        log_warning "RBAC templates not found"
    fi
    
    log_success "Security features testing completed"
}

test_template_rendering() {
    log_info "🎨 Testing template rendering..."
    
    local output_dir="$CHART_DIR/test-output"
    mkdir -p "$output_dir"
    
    # Test 1: Basic rendering with minimal values
    echo "Rendering with basic values..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=testcompany \
        --output-dir "$output_dir/basic"
    
    # Test 2: AWS configuration
    echo "Rendering with AWS configuration..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --output-dir "$output_dir/aws"
    
    # Test 3: GCP configuration
    echo "Rendering with GCP configuration..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values-gcp.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --output-dir "$output_dir/gcp"
    
    log_success "Template rendering completed. Check $output_dir/ for results"
}

test_secrets_templating() {
    log_info "🔐 Testing secrets templating..."
    
    local output_dir="$CHART_DIR/test-output/secrets"
    mkdir -p "$output_dir"
    
    # Test secrets rendering with the new secrets.yaml file
    echo "Rendering with secrets.yaml file..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --show-only templates/secret.yaml \
        > "$output_dir/rendered-secrets.yaml"
    
    echo "Secrets template output:"
    cat "$output_dir/rendered-secrets.yaml"
    
    # Test AWS-specific secrets rendering
    echo "Rendering with AWS configuration and secrets..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --show-only templates/secret.yaml \
        > "$output_dir/aws-secrets.yaml"
    
    # Test GCP-specific secrets rendering
    echo "Rendering with GCP configuration and secrets..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values-gcp.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --show-only templates/secret.yaml \
        > "$output_dir/gcp-secrets.yaml"
    
    log_success "Secrets templating test completed"
}

test_values_interpolation() {
    log_info "🔧 Testing values interpolation..."
    
    local output_dir="$CHART_DIR/test-output/interpolation"
    mkdir -p "$output_dir"
    
    # Test company name interpolation
    echo "Testing companyName interpolation..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=mycompany \
        --show-only templates/ingress.yaml \
        > "$output_dir/ingress-interpolation.yaml"
    
    echo "Checking if companyName is properly interpolated in ingress:"
    grep -E "(mycompany|companyName)" "$output_dir/ingress-interpolation.yaml" || log_warning "No companyName interpolation found"
    
    # Test service name interpolation
    echo "Testing service name interpolation..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=mycompany \
        --show-only templates/nginx-service.yaml \
        --show-only templates/rafiki-auth-service.yaml \
        --show-only templates/rafiki-backend-service.yaml \
        > "$output_dir/services-interpolation.yaml"
    
    echo "Services template output:"
    cat "$output_dir/services-interpolation.yaml"
    
    log_success "Values interpolation test completed"
}

test_configmap_templating() {
    log_info "📄 Testing ConfigMap templating..."
    
    local output_dir="$CHART_DIR/test-output/configmap"
    mkdir -p "$output_dir"
    
    # Test ConfigMap with different company names
    echo "Testing ConfigMap with testcompany..."
    helm template testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --set companyName=testcompany \
        --set nginx.config.serverNameIlp="ilp.testcompany.com" \
        --set nginx.config.serverNameAuth="auth-ilp.testcompany.io" \
        --show-only templates/configmap.yaml \
        > "$output_dir/configmap-testcompany.yaml"
    
    echo "ConfigMap content:"
    cat "$output_dir/configmap-testcompany.yaml"
    
    log_success "ConfigMap templating test completed"
}

test_dry_run_deployment() {
    log_info "🚀 Testing dry-run deployment..."
    
    # Test with a temporary namespace
    local test_namespace="helm-test-$(date +%s)"
    
    echo "Creating test namespace: $test_namespace"
    kubectl create namespace "$test_namespace" --dry-run=client -o yaml
    
    echo "Testing deployment with dry-run..."
    helm install testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values.yaml" \
        --namespace "$test_namespace" \
        --set companyName=testcompany \
        --dry-run \
        --debug
    
    log_success "Dry-run deployment test completed"
}

test_helm_with_pulumi_values() {
    log_info "🌐 Testing with Pulumi-style values..."
    
    local output_dir="$CHART_DIR/test-output/pulumi-style"
    mkdir -p "$output_dir"
    
    # Simulate Pulumi-style merged values
    cat > "$output_dir/pulumi-merged-values.yaml" << 'EOF'
companyName: mycompany
global:
  environment: development
rafikiAuth:
  enabled: true
  name: rafiki-auth
  replicaCount: 1
  image:
    repository: ghcr.io/interledger/rafiki-auth
    tag: v1.0.0-alpha.20
    pullPolicy: IfNotPresent
  ports:
    main: 3006
    grant: 3009
    admin: 3001
  service:
    type: ClusterIP
    ports:
      main: 3006
      grant: 3009
      admin: 3001
  secrets:
    name: rafiki-auth-secrets
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 250m
      memory: 256Mi
  hpa:
    enabled: false
rafikiBackend:
  enabled: true
  name: rafiki-backend
  replicaCount: 1
  image:
    repository: ghcr.io/interledger/rafiki-backend
    tag: v1.0.0-alpha.20
    pullPolicy: IfNotPresent
  ports:
    openPayments: 80
    graphql: 3001
    connector: 3002
    admin: 3003
    autopeering: 3004
  service:
    type: ClusterIP
    ports:
      openPayments: 80
      graphql: 3001
      connector: 3002
      admin: 3003
      autopeering: 3004
  secrets:
    name: rafiki-backend-secrets
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 500m
      memory: 512Mi
  hpa:
    enabled: false
nginx:
  enabled: true
  name: nginx
  replicaCount: 2
  image:
    repository: nginx
    tag: latest
    pullPolicy: IfNotPresent
  ports:
    http: 80
  service:
    type: ClusterIP
    port: 80
  resources:
    limits:
      cpu: 200m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
  hpa:
    enabled: false
  configMap:
    name: nginx-config
  config:
    serverNameIlp: "ilp.mycompany.com"
    serverNameAuth: "auth-ilp.mycompany.io"
redis:
  enabled: true
  name: redis
  replicaCount: 1
  image:
    repository: redis
    tag: 7-alpine
    pullPolicy: IfNotPresent
  service:
    type: ClusterIP
    port: 6379
  ports:
    redis: 6379
  resources:
    limits:
      cpu: 200m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
ingress:
  enabled: true
  name: rafiki-ingress
  className: "nginx"
  annotations: {}
  hosts:
    ilp:
      host: "ilp.mycompany.com"
      paths:
        - path: /
          pathType: Prefix
          serviceNameSuffix: nginx
          servicePort: 80
  tls: []
kubernetesSecrets:
  rafikiAuth:
    create: true
    name: rafiki-auth-secrets
    stringData:
      RAFIKI_AUTH_DATABASE_URL: postgresql://user:pass@localhost:5432/db
      RAFIKI_AUTH_COOKIE_KEY: auth-cookie-key
  rafikiBackend:
    create: true
    name: rafiki-backend-secrets
    stringData:
      RAFIKI_BACKEND_DATABASE_URL: postgresql://user:pass@localhost:5432/db
EOF

    echo "Testing with Pulumi-style merged values..."
    helm template mycompany-testrelease "$CHART_DIR" \
        -f "$output_dir/pulumi-merged-values.yaml" \
        --output-dir "$output_dir/rendered"
    
    echo "Checking rendered output for proper templating..."
    find "$output_dir/rendered" -name "*.yaml" -exec echo "=== {} ===" \; -exec cat {} \;
    
    log_success "Pulumi-style values test completed"
}

test_complete_cloud_rendering() {
    log_info "☁️ Testing complete cloud provider rendering..."
    
    local output_dir="$CHART_DIR/test-output/complete-cloud"
    mkdir -p "$output_dir"
    
    # Test complete AWS rendering
    echo "Testing complete AWS rendering..."
    helm template aws-testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=mycompany \
        --output-dir "$output_dir/aws-complete" \
        > "$output_dir/aws-complete.yaml"
    
    # Test complete GCP rendering
    echo "Testing complete GCP rendering..."
    helm template gcp-testrelease "$CHART_DIR" \
        -f "$CONFIG_DIR/values-gcp.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=mycompany \
        --output-dir "$output_dir/gcp-complete" \
        > "$output_dir/gcp-complete.yaml"
    
    # Test rendering with missing backend port values (to catch template errors)
    echo "Testing with port configuration fixes..."
    helm template port-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=mycompany \
        --set rafikiBackend.ports.connector=3002 \
        --set rafikiBackend.ports.admin=3003 \
        --show-only templates/rafiki-backend-service.yaml \
        > "$output_dir/backend-service-test.yaml"
    
    # Validate AWS rendering
    echo "Validating AWS rendering..."
    if grep -q "alb.ingress.kubernetes.io" "$output_dir/aws-complete.yaml"; then
        log_success "AWS ALB annotations found in rendering"
    else
        log_warning "AWS ALB annotations not found in rendering"
    fi
    
    # Validate GCP rendering
    echo "Validating GCP rendering..."
    if grep -q "kubernetes.io/ingress.global-static-ip-name" "$output_dir/gcp-complete.yaml"; then
        log_success "GCP static IP annotations found in rendering"
    else
        log_warning "GCP static IP annotations not found in rendering"
    fi
    
    # Check for AWS-specific configurations
    echo "Checking AWS-specific configurations..."
    if grep -q "eks.amazonaws.com/role-arn" "$output_dir/aws-complete.yaml"; then
        log_success "AWS IAM role annotations found"
    else
        log_warning "AWS IAM role annotations not found"
    fi
    
    # Check for GCP-specific configurations
    echo "Checking GCP-specific configurations..."
    if grep -q "iam.gke.io/gcp-service-account" "$output_dir/gcp-complete.yaml"; then
        log_success "GCP Workload Identity annotations found"
    else
        log_warning "GCP Workload Identity annotations not found"
    fi
    
    # Compare secret outputs
    echo "Comparing secret outputs between AWS and GCP..."
    aws_secrets=$(grep -c "kind: Secret" "$output_dir/aws-complete.yaml" 2>/dev/null || echo "0")
    gcp_secrets=$(grep -c "kind: Secret" "$output_dir/gcp-complete.yaml" 2>/dev/null || echo "0")
    
    if [ "$aws_secrets" -eq "$gcp_secrets" ] 2>/dev/null; then
        log_success "Secret count matches between AWS and GCP renderings ($aws_secrets secrets)"
    else
        log_warning "Secret count differs: AWS=$aws_secrets, GCP=$gcp_secrets"
    fi
    
    # Test backend service port configuration
    echo "Validating backend service port configuration..."
    if grep -q "port: 3002" "$output_dir/backend-service-test.yaml" && \
       grep -q "port: 3003" "$output_dir/backend-service-test.yaml"; then
        log_success "Backend service ports correctly configured"
    else
        log_warning "Backend service ports may be misconfigured"
        echo "Backend service test output:"
        cat "$output_dir/backend-service-test.yaml"
    fi
    
    # Test cloud-specific storage classes
    echo "Testing cloud-specific storage configurations..."
    if grep -q 'storageClass: "gp3"' "$output_dir/aws-complete.yaml"; then
        log_success "AWS GP3 storage class found"
    fi
    
    if grep -q 'storageClass: "ssd"' "$output_dir/gcp-complete.yaml"; then
        log_success "GCP SSD storage class found"
    fi
    
    log_success "Complete cloud provider rendering test completed"
}

test_comprehensive_cloud_features() {
    log_info "🔬 Testing comprehensive cloud provider features..."
    
    local output_dir="$CHART_DIR/test-output/comprehensive"
    mkdir -p "$output_dir"
    
    # Test AWS-specific features
    echo "Testing AWS-specific features..."
    helm template aws-features "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --set monitoring.cloudWatch.enabled=true \
        --output-dir "$output_dir/aws-features"
    
    # Test GCP-specific features
    echo "Testing GCP-specific features..."
    helm template gcp-features "$CHART_DIR" \
        -f "$CONFIG_DIR/values-gcp.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --set monitoring.stackdriver.enabled=true \
        --set gcp.workloadIdentity.enabled=true \
        --set gcp.managedCertificate.enabled=true \
        --output-dir "$output_dir/gcp-features"
    
    # Test autoscaling configurations
    echo "Testing autoscaling configurations..."
    helm template autoscaling-test "$CHART_DIR" \
        -f "$CONFIG_DIR/values-aws.yaml" \
        -f "$CONFIG_DIR/secrets.yaml" \
        --set companyName=testcompany \
        --set rafikiAuth.autoscaling.enabled=true \
        --set rafikiBackend.autoscaling.enabled=true \
        --set nginx.autoscaling.enabled=true \
        > "$output_dir/autoscaling-test.yaml"
    
    # Validate AWS features
    echo "Validating AWS-specific features..."
    if find "$output_dir/aws-features" -name "*.yaml" -exec grep -l "eks.amazonaws.com/role-arn" {} \; | head -1 | grep -q .; then
        log_success "AWS EKS role ARN found"
    fi
    
    # Validate GCP features
    echo "Validating GCP-specific features..."
    if find "$output_dir/gcp-features" -name "*.yaml" -exec grep -l "iam.gke.io/gcp-service-account" {} \; | head -1 | grep -q .; then
        log_success "GCP Workload Identity found"
    fi
    
    log_success "Comprehensive cloud provider features test completed"
}

validate_rendered_output() {
    log_info "✅ Validating rendered output..."
    
    local output_dir="$CHART_DIR/test-output"
    
    if [ ! -d "$output_dir" ]; then
        log_error "No test output directory found. Run other tests first."
        return 1
    fi
    
    echo "Checking for template artifacts in rendered files..."
    local template_artifacts=0
    
    # Check for unresolved template expressions
    find "$output_dir" -name "*.yaml" -exec grep -l "{{" {} \; | while read -r file; do
        log_warning "Found template artifacts in $file:"
        grep "{{" "$file" | head -5
        template_artifacts=$((template_artifacts + 1))
    done
    
    # Check for proper resource naming
    echo "Checking resource naming patterns..."
    find "$output_dir" -name "*.yaml" -exec grep -l "name:" {} \; | while read -r file; do
        echo "Resource names in $file:"
        grep "  name:" "$file" | head -3
    done
    
    log_success "Output validation completed"
}

# Main execution
main() {
    log_info "🎯 Starting Helm Chart Testing Suite"
    
    case "${1:-all}" in
        "lint")
            test_chart_lint
            ;;
        "template")
            test_template_rendering
            ;;
        "secrets")
            test_secrets_templating
            ;;
        "values")
            test_values_interpolation
            ;;
        "configmap")
            test_configmap_templating
            ;;
        "dry-run")
            test_dry_run_deployment
            ;;
        "basic")
            test_basic_deployment
            ;;
        "multicloud")
            test_multi_cloud_deployment
            ;;
        "security")
            test_security_features
            ;;
        "resources")
            test_resource_management
            ;;
        "validate")
            validate_rendered_output
            ;;
        "aws")
            helm template aws-test "$CHART_DIR" \
                -f "$CONFIG_DIR/values-aws.yaml" \
                -f "$CONFIG_DIR/secrets.yaml" \
                --set companyName=testcompany \
                --output-dir "$CHART_DIR/test-output/aws-only"
            log_success "AWS-only test completed"
            ;;
        "gcp")
            helm template gcp-test "$CHART_DIR" \
                -f "$CONFIG_DIR/values-gcp.yaml" \
                -f "$CONFIG_DIR/secrets.yaml" \
                --set companyName=testcompany \
                --output-dir "$CHART_DIR/test-output/gcp-only"
            log_success "GCP-only test completed"
            ;;
        "all")
            test_chart_lint
            test_basic_deployment
            test_multi_cloud_deployment
            test_security_features
            test_resource_management
            test_template_rendering
            test_secrets_templating
            test_values_interpolation
            validate_rendered_output
            ;;
        *)
            echo "Usage: $0 [lint|template|secrets|values|configmap|dry-run|basic|multicloud|security|resources|validate|aws|gcp|all]"
            echo ""
            echo "Available test types:"
            echo "  lint       - Run helm lint on the chart"
            echo "  basic      - Test basic deployment functionality"
            echo "  multicloud - Test multi-cloud configurations (AWS/GCP)"
            echo "  security   - Test security features (NetworkPolicies, RBAC)"
            echo "  resources  - Test resource management and scaling"
            echo "  template   - Test template rendering with different configurations"
            echo "  secrets    - Test secrets templating with stringData"
            echo "  values     - Test values interpolation (companyName, etc.)"
            echo "  configmap  - Test ConfigMap templating"
            echo "  dry-run    - Test deployment with dry-run"
            echo "  validate   - Validate rendered output for issues"
            echo "  aws        - Test AWS-specific configurations only"
            echo "  gcp        - Test GCP-specific configurations only"
            echo "  all        - Run all tests (default)"
            exit 1
            ;;
    esac
    
    log_success "🎉 Helm Chart Testing Suite completed!"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed. Please install Helm 3.x"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install kubectl"
        exit 1
    fi
    
    local helm_version=$(helm version --short | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$helm_version" -lt 3 ]; then
        log_error "Helm version 3.x or higher is required"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Run prerequisites check first
check_prerequisites

# Execute main function with all arguments
main "$@"
