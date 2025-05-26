import * as awsInfra from "./src/core/aws-infra.js";
import * as gcpInfra from "./src/core/gcp-infra.js";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";
import { fileURLToPath } from "url";

// Define __filename and __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stack = pulumi.getStack();
const generalConfig = new pulumi.Config();
const cloudProvider = generalConfig.require("cloudProvider"); // 'aws' or 'gcp'

// Get JSON strings from Pulumi config
const helmSecretsJson = generalConfig.get("helmSecretsJson");
const helmValuesJson = generalConfig.get("helmValuesJson");
const companyName = generalConfig.require("companyName"); // Get companyName from Pulumi config

let cluster: any; // To hold cluster info from AWS or GCP
let k8sProvider: k8s.Provider;
let dependsOnResources: any[] = [];

// Declare outputs at the top level
let eksClusterNameOutput: pulumi.Output<string> | undefined;
let vpcIdOutput: pulumi.Output<string> | undefined;
let gkeClusterNameOutput: pulumi.Output<string> | undefined;
let gcpProjectOutput: pulumi.Output<string> | undefined;
let gcpZoneOutput: pulumi.Output<string> | undefined;
let staticIpNameOutput: pulumi.Output<string> | undefined;

// Holds the resolved IP or hostname for ingress
let ingressIpOutput: pulumi.Output<string> | undefined;
// Holds the full Ingress status object, typically Output<any>
let loadBalancerIngressOutput: pulumi.Output<any> | undefined;

if (cloudProvider === "aws") {
  cluster = awsInfra.createEksCluster(`${companyName}-rafiki-eks`, stack);
  k8sProvider = new k8s.Provider("k8s-provider-aws", {
    kubeconfig: cluster.kubeconfig,
  });

  const awsLoadBalancerControllerChart = new k8s.helm.v3.Chart(
    "aws-load-balancer-controller",
    {
      chart: "aws-load-balancer-controller",
      version: "1.7.1",
      namespace: "kube-system",
      fetchOpts: {
        repo: "https://aws.github.io/eks-charts",
      },
      values: {
        clusterName: cluster.clusterName,
        serviceAccount: {
          create: true,
          name: "aws-load-balancer-controller",
        },
      },
    },
    { provider: k8sProvider }
  );
  dependsOnResources.push(awsLoadBalancerControllerChart);
  pulumi.log.info("AWS Load Balancer Controller deployment initiated.");
  eksClusterNameOutput = cluster.clusterName;
  vpcIdOutput = cluster.vpcId;

  // For AWS, get the ALB DNS name from the Ingress resource's status
  // Note: iaasRafikiChart must be defined before this point, which it is (later in the script).
  // This implies that the actual assignment to loadBalancerIngressOutput and ingressIpOutput
  // happens *after* iaasRafikiChart is created. The current snippet order is fine.
} else if (cloudProvider === "gcp") {
  cluster = gcpInfra.createGkeCluster(`${companyName}-rafiki-gke`, stack);
  k8sProvider = new k8s.Provider("k8s-provider-gcp", {
    kubeconfig: cluster.kubeconfig,
  });
  pulumi.log.info(
    "GCP GKE cluster selected. Default GCE Ingress will be used for services of type LoadBalancer or Ingress resources."
  );
  gkeClusterNameOutput = cluster.clusterName;
  gcpProjectOutput = cluster.gcpProject;
  gcpZoneOutput = cluster.gcpZone;
  staticIpNameOutput = cluster.staticIpName; // This is Output<string> from gcpInfra

  // For GCP, the ingress uses the static IP. cluster.staticIpName is the *name* of the static IP resource.
  ingressIpOutput = cluster.staticIpName; // Assigning Output<string>
} else {
  throw new Error(
    "Invalid cloudProvider specified in Pulumi config. Must be 'aws' or 'gcp'."
  );
}

// Export the Kubeconfig
export const kubeconfig = cluster.kubeconfig;

// Export cloud-specific outputs
export const eksClusterName = eksClusterNameOutput;
export const vpcId = vpcIdOutput;
export const gkeClusterName = gkeClusterNameOutput;
export const gcpProject = gcpProjectOutput;
export const gcpZone = gcpZoneOutput;
export const staticIpName = staticIpNameOutput; // Export staticIpName (GCP specific)

function loadAndMergeValues(secretsJson?: string, valuesJson?: string): any {
  let mergedValues: { [key: string]: any } = {}; // Explicitly type mergedValues

  if (secretsJson) {
    try {
      const secrets = JSON.parse(secretsJson);
      // Deep merge secrets into mergedValues
      for (const key in secrets) {
        if (secrets.hasOwnProperty(key)) {
          if (
            typeof secrets[key] === "object" &&
            secrets[key] !== null &&
            !Array.isArray(secrets[key]) &&
            mergedValues[key] &&
            typeof mergedValues[key] === "object"
          ) {
            mergedValues[key] = { ...mergedValues[key], ...secrets[key] };
          } else {
            mergedValues[key] = secrets[key];
          }
        }
      }
      pulumi.log.info("Successfully loaded and merged helmSecretsJson.");
    } catch (e: any) {
      pulumi.log.error(
        `Critical: Failed to parse helmSecretsJson. Error: ${e.message}. Ensure it's valid JSON.`
      );
    }
  } else {
    pulumi.log.warn(
      "Warning: helmSecretsJson was not provided. Proceeding without secrets. This is not recommended for production."
    );
  }

  if (valuesJson) {
    try {
      const values = JSON.parse(valuesJson);
      // Deep merge values into mergedValues
      for (const key in values) {
        if (values.hasOwnProperty(key)) {
          if (
            typeof values[key] === "object" &&
            values[key] !== null &&
            !Array.isArray(values[key]) &&
            mergedValues[key] &&
            typeof mergedValues[key] === "object"
          ) {
            // If the key exists in mergedValues and both are objects, merge them
            mergedValues[key] = { ...mergedValues[key], ...values[key] };
          } else if (
            secretsJson &&
            JSON.parse(secretsJson).hasOwnProperty(key) &&
            typeof mergedValues[key] === "object" &&
            typeof values[key] === "object"
          ) {
            // If the key is from secrets and is an object, and the new value is also an object,
            // merge the new value into the existing secret object (secrets take precedence for top-level keys, but object properties can be added/overridden by values)
            mergedValues[key] = { ...values[key], ...mergedValues[key] };
          } else if (!mergedValues.hasOwnProperty(key)) {
            // If the key does not exist in mergedValues (i.e., not set by secrets), add it
            mergedValues[key] = values[key];
          }
          // If the key was set by secrets and is not an object, valuesJson will not overwrite it.
        }
      }
      pulumi.log.info("Successfully loaded and merged helmValuesJson.");
    } catch (e: any) {
      pulumi.log.error(
        `Critical: Failed to parse helmValuesJson. Error: ${e.message}. Ensure it's valid JSON.`
      );
    }
  } else {
    pulumi.log.error(
      "Critical: helmValuesJson was not provided to the Pulumi program. The automation script should enforce this."
    );
  }

  return mergedValues;
}

const defaultChartPath = path.join(__dirname, "../..", "helm-chart");
const chartPathDir = process.env.HELM_CHART_PATH || defaultChartPath;
pulumi.log.info(`Using Helm chart path: ${chartPathDir}`);

if (!helmSecretsJson) {
  pulumi.log.error(
    "Error: helmSecretsJson is missing. It must be provided via Pulumi config by the automation script."
  );
}
if (!helmValuesJson) {
  pulumi.log.error(
    "Error: helmValuesJson is missing. It must be provided via Pulumi config by the automation script."
  );
}

const mergedChartValues = loadAndMergeValues(helmSecretsJson, helmValuesJson);

if (!mergedChartValues.nginx) {
  mergedChartValues.nginx = {};
}
if (!mergedChartValues.nginx.hpa) {
  mergedChartValues.nginx.hpa = {
    enabled: true,
    minReplicas: 1,
    maxReplicas: 5,
    targetCPUUtilizationPercentage: 80,
  };
}

mergedChartValues.companyName = companyName;

if (cloudProvider === "gcp") {
  if (!mergedChartValues.ingress) {
    mergedChartValues.ingress = {};
  }
  if (!mergedChartValues.ingress.annotations) {
    mergedChartValues.ingress.annotations = {};
  }
  mergedChartValues.ingress.annotations[
    "kubernetes.io/ingress.global-static-ip-name"
  ] = cluster.staticIpName; // cluster.staticIpName is Output<string>
  pulumi.log.info(
    "For GCP/GKE, Ingress annotation 'kubernetes.io/ingress.global-static-ip-name' set with the provisioned static IP name. Ensure Helm chart's Ingress and Service resources are configured appropriately."
  );
}

const helmReleaseName = `${companyName}-rafiki`;
const ingressResourceName = "rafiki-ingress";
// const nginxServiceName = `${helmReleaseName}-nginx`; // Not directly used in fixed section

const iaasRafikiChart = new k8s.helm.v3.Chart(
  helmReleaseName,
  {
    path: chartPathDir,
    values: mergedChartValues,
  },
  { provider: k8sProvider, dependsOn: dependsOnResources }
);

pulumi.log.info(
  `${companyName} Rafiki Helm chart deployment initiated. Release name: ${helmReleaseName}.`
);

// This section is moved after iaasRafikiChart definition for AWS case
if (cloudProvider === "aws") {
  // For AWS, get the ALB DNS name from the Ingress resource's status
  loadBalancerIngressOutput = iaasRafikiChart.getResourceProperty(
    "networking.k8s.io/v1/Ingress",
    ingressResourceName, // Ensure this is the correct name of the Ingress resource created by your Helm chart
    "status"
  ); // This is Output<any>

  // ***** FIX APPLIED HERE *****
  // Explicitly type the .apply generic and the callback's return type
  ingressIpOutput = loadBalancerIngressOutput.apply<string>(
    (status: any): string => {
      if (
        status &&
        status.loadBalancer &&
        status.loadBalancer.ingress &&
        status.loadBalancer.ingress[0]
      ) {
        const hostname = status.loadBalancer.ingress[0].hostname;
        if (typeof hostname === "string" && hostname.length > 0) {
          return hostname;
        }
        const ip = status.loadBalancer.ingress[0].ip;
        if (typeof ip === "string" && ip.length > 0) {
          return ip;
        }
        // If neither hostname nor ip is a non-empty string, return "Pending"
        return "Pending";
      }
      // If the status structure is not as expected, return "Pending"
      return "Pending";
    }
  );
}
// Note: ingressIpOutput for GCP is already set earlier if cloudProvider === "gcp"

export const loadBalancerAddress =
  cloudProvider === "aws"
    ? ingressIpOutput // Now correctly Output<string> | undefined
    : cluster.staticIpName.apply(
        (
          name: any // cluster.staticIpName is Output<string>
        ) =>
          `GCP Static IP Name: ${name}. Use 'gcloud compute addresses describe ${name} --global --format="value(address)"' to get the IP.`
      );

export const serviceEndpoints = pulumi
  .all([mergedChartValues, companyName]) // Removed cluster dependency as it wasn't used directly
  .apply(([values, cName]) => {
    const ilpDomain = values.nginx?.config?.serverNameIlp || `ilp.${cName}.com`;
    const authDomain =
      values.nginx?.config?.serverNameAuth || `auth-ilp.${cName}.io`;

    return {
      ilpEndpoint: `https://${ilpDomain}`,
      authEndpoint: `https://${authDomain}`,
      graphqlEndpoint: `https://${ilpDomain}/graphql`,
      connectorEndpoint: `https://${ilpDomain}/connector`,
      grantEndpoint: `https://${authDomain}/grant`,
      adminEndpoints: {
        auth: `https://${authDomain}/admin`,
        backend: `https://${ilpDomain}/admin`,
      },
    };
  });
export const endpoints = serviceEndpoints;

export const dnsConfiguration = pulumi
  .all([
    companyName,
    cloudProvider,
    mergedChartValues,
    staticIpNameOutput, // GCP: Name of the static IP resource (Output<string> | undefined)
    ingressIpOutput, // AWS: ALB Hostname (Output<string> | undefined), GCP: Name of static IP (Output<string> | undefined)
  ])
  .apply(
    ([
      company,
      provider,
      values,
      gcpStaticIpNameFromOutput,
      resolvedIngressIp,
    ]) => {
      const ilpDomain =
        values.nginx?.config?.serverNameIlp || `ilp.${company}.com`;
      const authDomain =
        values.nginx?.config?.serverNameAuth || `auth-ilp.${company}.io`;

      if (provider === "gcp") {
        const ipName =
          resolvedIngressIp ||
          gcpStaticIpNameFromOutput ||
          "your-static-ip-name"; // resolvedIngressIp should be the static IP name for GCP
        return {
          provider: "gcp",
          domains: [ilpDomain, authDomain],
          staticIpName: ipName,
          dnsRecords: [
            {
              type: "A",
              name: ilpDomain,
              value: "[GET_STATIC_IP_ADDRESS_VIA_GCLOUD]",
              instruction: `To get IP: gcloud compute addresses describe ${ipName} --global --format="value(address)"`,
            },
            {
              type: "A",
              name: authDomain,
              value: "[GET_STATIC_IP_ADDRESS_VIA_GCLOUD]",
              instruction: `To get IP: gcloud compute addresses describe ${ipName} --global --format="value(address)"`,
            },
          ],
          instructions: `
GCP DNS Setup Instructions:
1. Get your static IP address by running:
   gcloud compute addresses describe ${ipName} --global --format="value(address)"
   (Replace ${ipName} if it's a placeholder with the actual static IP name from 'staticIpName' or 'loadBalancerAddress' export)

2. Create A records in your DNS provider:
   - ${ilpDomain} → [STATIC_IP_ADDRESS_FROM_STEP_1]
   - ${authDomain} → [STATIC_IP_ADDRESS_FROM_STEP_1]

3. Configure SSL certificates (Google-managed certificates are recommended):
   - Create a ManagedCertificate resource (see sslSetup.managedCertificateExample).
   - Add the 'networking.gke.io/managed-certificates' annotation to your Ingress resource, referencing the ManagedCertificate.
   
4. Wait for DNS propagation (can take up to 48 hours).
`,
          sslSetup: {
            managedCertificateExample: `
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: ${company}-rafiki-ssl-cert # Example name
spec:
  domains:
    - ${ilpDomain}
    - ${authDomain}`,
            ingressAnnotationExample: `networking.gke.io/managed-certificates: "${company}-rafiki-ssl-cert"`,
          },
        };
      } else {
        // AWS
        const albHostname = resolvedIngressIp || "pending-alb-hostname";
        return {
          provider: "aws",
          domains: [ilpDomain, authDomain],
          albDnsName: albHostname, // This is now string | undefined from Output<string> | undefined
          dnsRecords: [
            {
              type: "CNAME",
              name: ilpDomain,
              value: albHostname,
              instruction:
                "Create CNAME record pointing to the ALB DNS name (see 'albDnsName' export).",
            },
            {
              type: "CNAME",
              name: authDomain,
              value: albHostname,
              instruction: "Create CNAME record pointing to the ALB DNS name.",
            },
          ],
          instructions: `
AWS DNS Setup Instructions:
1. Use the ALB DNS name (see 'albDnsName' export or 'loadBalancerAddress' export, it might be '${albHostname}').
   Wait for it to become available if 'Pending'.

2. Create CNAME records in your DNS provider:
   - ${ilpDomain} → [ALB_DNS_NAME_FROM_STEP_1]
   - ${authDomain} → [ALB_DNS_NAME_FROM_STEP_1]

3. Configure SSL certificates in AWS Certificate Manager (ACM):
   - Request or import certificates for ${ilpDomain} and ${authDomain}.
   - Add the 'alb.ingress.kubernetes.io/certificate-arn' annotation to your Ingress resource with the ARNs of the certificates.
   
4. Wait for DNS propagation (can take up to 48 hours).
`,
          sslSetup: {
            certificateManagerInfo: `Create or import SSL certificates in AWS Certificate Manager for your domains (${ilpDomain}, ${authDomain}).`,
            ingressAnnotationExample: `alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:REGION:ACCOUNT_ID:certificate/CERTIFICATE_ID,arn:aws:acm:REGION:ACCOUNT_ID:certificate/ANOTHER_CERT_ID"
alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS":443}]'
alb.ingress.kubernetes.io/scheme: internet-facing`,
          },
        };
      }
    }
  );

export const staticIpAddressCommand =
  cloudProvider === "gcp"
    ? pulumi
        .all([cluster.staticIpName, cluster.gcpProject]) // cluster.staticIpName is Output<string>
        .apply(async ([ipName, project]) => {
          return `To get Static IP value, run: gcloud compute addresses describe ${ipName} --global --project=${project} --format="value(address)"`;
        })
    : undefined;

// ***** THIS IS THE LINE WITH THE ORIGINAL ERROR (221 in previous version) *****
// With the fix above, ingressIpOutput should now be Output<string> | undefined for AWS.
export const albDnsName = cloudProvider === "aws" ? ingressIpOutput : undefined;

export const managementTools = pulumi
  .all([helmReleaseName, ingressResourceName, companyName])
  .apply(([releaseName, actualIngressResourceName, _]) => ({
    kubectl: {
      getPods: `kubectl get pods -l app.kubernetes.io/instance=${releaseName}`,
      getServices: `kubectl get services -l app.kubernetes.io/instance=${releaseName}`,
      getIngress: `kubectl get ingress ${actualIngressResourceName}`,
      getLogs: `kubectl logs -l app.kubernetes.io/instance=${releaseName} -f --all-containers=true`,
      describeIngress: `kubectl describe ingress ${actualIngressResourceName}`,
      getEvents: `kubectl get events --sort-by=.metadata.creationTimestamp`,
    },
    helm: {
      status: `helm status ${releaseName}`,
      values: `helm get values ${releaseName}`,
      history: `helm history ${releaseName}`,
      upgrade: `helm upgrade ${releaseName} [CHART_PATH] -f [VALUES_FILE]`,
      rollback: `helm rollback ${releaseName} [REVISION]`,
      uninstall: `helm uninstall ${releaseName}`,
    },
    monitoring: {
      checkHealth: `kubectl get pods,services,ingress -A -l app.kubernetes.io/instance=${releaseName}`,
      watchPods: `kubectl get pods -l app.kubernetes.io/instance=${releaseName} -w`,
      portForward: {
        nginx: `kubectl port-forward service/${releaseName}-nginx 8080:80`,
        backend: `kubectl port-forward service/${releaseName}-rafiki-backend 3001:3001`,
        auth: `kubectl port-forward service/${releaseName}-rafiki-auth 3006:3006`,
      },
    },
  }));

export const quickStart = pulumi
  .all([companyName, cloudProvider, serviceEndpoints, dnsConfiguration])
  .apply(([company, provider, currentEndpoints, dnsConfig]) => ({
    title: `🚀 ${company} Rafiki Quick Start Guide (${provider.toUpperCase()})`,
    provider: provider.toUpperCase(),
    step1_VerifyDeployment: {
      title: "1️⃣ Verify Kubernetes Deployment",
      commands: [
        `kubectl get pods -A # Filter or use namespace if not default`,
        `kubectl get services -A # Look for ${helmReleaseName}-nginx, -rafiki-backend, -rafiki-auth`,
        `kubectl get ingress ${ingressResourceName} # Check for an ADDRESS`,
      ],
      successCriteria:
        "All relevant pods should be 'Running'. Services should have appropriate types and selectors. Ingress should have an address/IP/hostname assigned.",
    },
    step2_ConfigureDNS: {
      title: "2️⃣ Configure DNS Records",
      action:
        "Use the DNS records and instructions from the 'dnsConfiguration' export.",
      details: dnsConfig.instructions,
      domainsToConfigure: dnsConfig.domains,
      providerInfo: `Cloud Provider: ${dnsConfig.provider}`,
      expectedWaitTime: "DNS propagation can take 5 minutes to 48 hours.",
    },
    step3_TestEndpoints: {
      title: "3️⃣ Test Endpoints (after DNS propagation)",
      note: "Ensure SSL/TLS is configured for HTTPS, or test with HTTP initially if SSL is not yet set up (and adjust URLs).",
      endpointsToTest: {
        healthCheck: `${currentEndpoints.ilpEndpoint}/health`,
        graphqlApi: currentEndpoints.graphqlEndpoint,
        connectorInterface: currentEndpoints.connectorEndpoint,
        authService: currentEndpoints.authEndpoint,
      },
      sampleTestCommand: `curl -k ${currentEndpoints.ilpEndpoint}/health # -k ignores SSL errors for initial testing`,
    },
    step4_ConfigureSSL: {
      title: "4️⃣ Configure SSL/TLS Certificates",
      action:
        provider === "gcp"
          ? "For GCP, create a ManagedCertificate resource and annotate your Ingress as per 'dnsConfiguration.sslSetup.managedCertificateExample' and 'dnsConfiguration.sslSetup.ingressAnnotationExample'."
          : "For AWS, provision certificates in AWS Certificate Manager (ACM) and update your Ingress annotations with the certificate ARN(s) as per 'dnsConfiguration.sslSetup.ingressAnnotationExample'.",
      details: dnsConfig.sslSetup,
    },
    troubleshootingTips: {
      dnsNotResolving:
        "Use 'dig your-domain.com' or 'nslookup your-domain.com' to check DNS propagation. Verify NS records at your registrar.",
      podsNotRunning:
        "Use 'kubectl describe pod [pod-name]' and 'kubectl logs [pod-name] -c [container-name]' to investigate.",
      ingressIssues: `Use 'kubectl describe ingress ${ingressResourceName}' for events and status. Check controller logs (AWS Load Balancer Controller or GKE Ingress Controller).`,
      certificateProblems:
        provider === "gcp"
          ? "Check status of ManagedCertificate: 'kubectl describe managedcertificate [cert-name]'. Check Ingress events."
          : "Verify ACM certificate is 'Issued' and ARN is correct in Ingress. Check AWS Load Balancer Controller logs.",
    },
  }));

export const deploymentGuide = pulumi
  .all([
    companyName,
    cloudProvider,
    serviceEndpoints,
    dnsConfiguration,
    quickStart,
    managementTools,
    kubeconfig, // Use the exported kubeconfig directly
  ])
  .apply(
    ([
      company,
      provider,
      currentEndpoints,
      dnsConfig,
      qsGuide,
      mgmtTools,
      resolvedKubeconfig,
    ]) => ({
      header: {
        guideTitle: `${company} Rafiki IaC Deployment Guide`,
        cloudProvider: provider.toUpperCase(),
        deploymentStatus: "✅ Successfully Provisioned via Pulumi",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
      contactInfo: {
        supportEmail: "devops@example.com",
        documentationLink:
          "https://internal-wiki.example.com/rafiki-deployment",
      },
      quickAccess: {
        domains: dnsConfig.domains,
        endpoints: currentEndpoints,
        kubeconfigSaveCommand: `echo '${resolvedKubeconfig}' > ./${companyName}-rafiki-kubeconfig.yaml && export KUBECONFIG=./${companyName}-rafiki-kubeconfig.yaml`,
        viewAllOutputsCommand: "pulumi stack output",
      },
      setupSteps: {
        step1_VerifyDeployment: qsGuide.step1_VerifyDeployment,
        step2_ConfigureDNS: qsGuide.step2_ConfigureDNS,
        step3_TestEndpoints: qsGuide.step3_TestEndpoints,
        step4_ConfigureSSL: qsGuide.step4_ConfigureSSL,
      },
      operationalManagement: {
        title: "🛠️ Ongoing Management & Operations",
        kubectlCommands: mgmtTools.kubectl,
        helmCommands: mgmtTools.helm,
        monitoringChecks: mgmtTools.monitoring,
      },
      importantNotesAndBestPractices: [
        `Kubeconfig: Your KUBECONFIG has been outputted. Save the command from 'quickAccess.kubeconfigSaveCommand' to a secure location.`,
        "SSL/TLS: Production environments MUST use valid SSL/TLS certificates. Follow Step 4 carefully.",
        "Monitoring & Alerting: Implement robust monitoring and alerting for all components.",
        "Backup & Recovery: Establish and test backup and disaster recovery procedures.",
        "Security: Regularly review and update security configurations.",
        "Updates: Keep Kubernetes versions, Helm charts, and application images up-to-date.",
        "Cost Management: Monitor cloud resource consumption.",
      ],
      troubleshooting: qsGuide.troubleshootingTips,
      nextStepsImmediate: [
        "1. Save your Kubeconfig using the command in 'quickAccess.kubeconfigSaveCommand'.",
        "2. Follow 'setupSteps' starting with DNS configuration.",
        "3. Implement SSL/TLS certificates.",
        "4. Test all application endpoints thoroughly.",
      ],
      postDeploymentChecklist: [
        "✅ Kubeconfig secured.",
        "✅ DNS records configured and propagated.",
        "✅ SSL/TLS certificates installed and active.",
        "✅ All application endpoints reachable and functional.",
        "✅ Basic monitoring/logging in place.",
        "✅ Backup strategy defined.",
      ],
    })
  );

export const summary = pulumi
  .all([
    companyName,
    cloudProvider,
    helmReleaseName,
    serviceEndpoints,
    dnsConfiguration,
    cluster.clusterName,
  ])
  .apply(
    ([
      company,
      provider,
      release,
      currentEndpoints,
      dnsConfig,
      currentClusterName,
    ]) => ({
      status: "🎉 DEPLOYMENT PROVISIONING COMPLETE",
      companyName: company,
      deploymentDetails: {
        cloudProvider: provider.toUpperCase(),
        kubernetesClusterName: currentClusterName,
        helmReleaseName: release,
        primaryNamespace: "default",
        deploymentDate: new Date().toUTCString(),
      },
      accessInformation: {
        domains: dnsConfig.domains,
        serviceEndpointsSummary: Object.keys(currentEndpoints).map((key) => ({
          name: key,
          url: (currentEndpoints as any)[key],
        })),
        dnsSetupRequired: `Yes, refer to 'dnsConfiguration' or 'deploymentGuide' exports.`,
        sslConfigurationRequired: `Yes, critical for production. Refer to 'deploymentGuide'.`,
      },
      immediateNextActions: [
        "1. Configure DNS records as per the 'dnsConfiguration' or 'deploymentGuide' export.",
        "2. Implement SSL/TLS certificates for all public-facing domains.",
        "3. Test all application endpoints after DNS and SSL setup.",
        "4. Secure and distribute Kubeconfig access as needed ('kubeconfig' export).",
      ],
      keyExportsForOperators: [
        "'deploymentGuide': Comprehensive step-by-step instructions.",
        "'dnsConfiguration': Detailed DNS setup information.",
        "'managementTools': Essential commands for day-to-day operations.",
        "'quickStart': Initial verification and setup steps.",
        "'kubeconfig': For cluster access.",
        "'endpoints': List of service URLs.",
      ],
      successMessage: `🚀 ${company}'s Rafiki infrastructure on ${provider.toUpperCase()} has been provisioned. Please complete the post-deployment steps outlined in 'deploymentGuide'.`,
    })
  );

export const finalStatusOverview = pulumi
  .all([
    companyName,
    cloudProvider,
    serviceEndpoints,
    dnsConfiguration.apply((dc) => dc.domains),
  ])
  .apply(([company, provider, currentEndpoints, domains]) => ({
    status: "✅ Deployment Infrastructure Provisioned",
    message: `${company} Rafiki infrastructure components successfully created on ${provider.toUpperCase()}.`,
    summary: {
      company: company,
      cloudProvider: provider.toUpperCase(),
      servicesDeployed: Object.keys(currentEndpoints).length,
      domainsToConfigure: domains,
      nextMajorAction:
        "Configure DNS records and SSL/TLS as per 'deploymentGuide' or 'dnsConfiguration' export.",
    },
    reminder: `Refer to the 'deploymentGuide' and 'summary' exports for complete details and next steps.`,
  }));
