import * as awsInfra from "./src/core/aws-infra.js";
import * as gcpInfra from "./src/core/gcp-infra.js";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";
import { fileURLToPath } from "url";

// Define __filename and __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const stack = pulumi.getStack();
const config = new pulumi.Config();
const cloudProvider = config.require("cloudProvider"); // 'aws' or 'gcp'
const companyName = config.require("companyName");
const helmSecretsJson = config.get("helmSecretsJson");
const helmValuesJson = config.get("helmValuesJson");

// Helper function to merge values
function loadAndMergeValues(secretsJson?: string, valuesJson?: string): any {
  let mergedValues: { [key: string]: any } = {};

  if (secretsJson) {
    try {
      const secrets = JSON.parse(secretsJson);
      Object.assign(mergedValues, secrets);
      pulumi.log.info("Successfully loaded helmSecretsJson.");
    } catch (e: any) {
      pulumi.log.error(`Failed to parse helmSecretsJson: ${e.message}`);
    }
  }

  if (valuesJson) {
    try {
      const values = JSON.parse(valuesJson);
      Object.assign(mergedValues, values);
      pulumi.log.info("Successfully loaded helmValuesJson.");
    } catch (e: any) {
      pulumi.log.error(`Failed to parse helmValuesJson: ${e.message}`);
    }
  } else {
    pulumi.log.error("helmValuesJson is required but not provided.");
  }

  return mergedValues;
}

// Infrastructure setup
let cluster: any;
let k8sProvider: k8s.Provider;
let dependsOnResources: any[] = [];

if (cloudProvider === "aws") {
  cluster = awsInfra.createEksCluster(`${companyName}-rafik`, stack);
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
} else if (cloudProvider === "gcp") {
  cluster = gcpInfra.createGkeCluster(`${companyName}-rafiki`, stack);
  k8sProvider = new k8s.Provider("k8s-provider-gcp", {
    kubeconfig: cluster.kubeconfig,
  });
  pulumi.log.info("GCP GKE cluster deployment initiated.");
} else {
  throw new Error("Invalid cloudProvider. Must be 'aws' or 'gcp'.");
}

// Prepare Helm values
const defaultChartPath = path.join(__dirname, "../..", "helm-chart");
const chartPathDir = process.env.HELM_CHART_PATH || defaultChartPath;
const mergedChartValues = loadAndMergeValues(helmSecretsJson, helmValuesJson);

// Set default nginx HPA configuration
if (!mergedChartValues.nginx) mergedChartValues.nginx = {};
if (!mergedChartValues.nginx.hpa) {
  mergedChartValues.nginx.hpa = {
    enabled: true,
    minReplicas: 1,
    maxReplicas: 5,
    targetCPUUtilizationPercentage: 80,
  };
}

mergedChartValues.companyName = companyName;

// Configure GCP-specific ingress settings
if (cloudProvider === "gcp") {
  if (!mergedChartValues.ingress) mergedChartValues.ingress = {};
  if (!mergedChartValues.ingress.annotations)
    mergedChartValues.ingress.annotations = {};
  mergedChartValues.ingress.annotations[
    "kubernetes.io/ingress.global-static-ip-name"
  ] = cluster.staticIpName;
}

// Deploy Helm chart
const helmReleaseName = `${companyName}-rafiki`;
const ingressResourceName = "rafiki-ingress";

const iaasRafikiChart = new k8s.helm.v3.Chart(
  helmReleaseName,
  {
    path: chartPathDir,
    values: mergedChartValues,
  },
  { provider: k8sProvider, dependsOn: dependsOnResources }
);

// Get ingress IP/hostname for AWS
let ingressIpOutput: pulumi.Output<string> | undefined;
if (cloudProvider === "aws") {
  const loadBalancerIngressOutput = iaasRafikiChart.getResourceProperty(
    "networking.k8s.io/v1/Ingress",
    ingressResourceName,
    "status"
  );

  ingressIpOutput = loadBalancerIngressOutput.apply((status: any): string => {
    if (status?.loadBalancer?.ingress?.[0]) {
      const hostname = status.loadBalancer.ingress[0].hostname;
      const ip = status.loadBalancer.ingress[0].ip;
      return hostname || ip || "Pending";
    }
    return "Pending";
  });
} else {
  ingressIpOutput = cluster.staticIpName;
}

// =================
// EXPORTS
// =================

// Essential cluster information
export const kubeconfig = cluster.kubeconfig;
export const clusterName = cluster.clusterName;

// Cloud-specific outputs
export const clusterInfo =
  cloudProvider === "aws"
    ? {
        provider: "aws",
        clusterName: cluster.clusterName,
        vpcId: cluster.vpcId,
        region: cluster.region,
      }
    : {
        provider: "gcp",
        clusterName: cluster.clusterName,
        project: cluster.gcpProject,
        zone: cluster.gcpZone,
        staticIpName: cluster.staticIpName,
      };

// Service endpoints
export const endpoints = pulumi
  .all([mergedChartValues, companyName])
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

// DNS and load balancer information
export const dnsInfo = pulumi
  .all([companyName, cloudProvider, mergedChartValues, ingressIpOutput])
  .apply(([company, provider, values, ingressIp]) => {
    const ilpDomain =
      values.nginx?.config?.serverNameIlp || `ilp.${company}.com`;
    const authDomain =
      values.nginx?.config?.serverNameAuth || `auth-ilp.${company}.io`;

    if (provider === "gcp") {
      return {
        provider: "gcp",
        domains: [ilpDomain, authDomain],
        staticIpName: ingressIp || "unknown",
        ipCommand: ingressIp
          ? `gcloud compute addresses describe ${ingressIp} --global --format="value(address)"`
          : "Static IP name not available",
        dnsRecords: [
          {
            type: "A",
            domain: ilpDomain,
            target: "[Get IP with command above]",
          },
          {
            type: "A",
            domain: authDomain,
            target: "[Get IP with command above]",
          },
        ],
      };
    } else {
      return {
        provider: "aws",
        domains: [ilpDomain, authDomain],
        albHostname: ingressIp || "pending",
        dnsRecords: [
          { type: "CNAME", domain: ilpDomain, target: ingressIp || "pending" },
          { type: "CNAME", domain: authDomain, target: ingressIp || "pending" },
        ],
      };
    }
  });

// Management commands
export const managementCommands = pulumi
  .all([helmReleaseName, ingressResourceName])
  .apply(([releaseName, ingressName]) => ({
    kubectl: {
      getPods: `kubectl get pods -l app.kubernetes.io/instance=${releaseName}`,
      getServices: `kubectl get services -l app.kubernetes.io/instance=${releaseName}`,
      getIngress: `kubectl get ingress ${ingressName}`,
      getLogs: `kubectl logs -l app.kubernetes.io/instance=${releaseName} -f`,
    },
    helm: {
      status: `helm status ${releaseName}`,
      values: `helm get values ${releaseName}`,
      upgrade: `helm upgrade ${releaseName} [CHART_PATH] -f [VALUES_FILE]`,
      uninstall: `helm uninstall ${releaseName}`,
    },
  }));

// Deployment summary
export const deploymentSummary = pulumi
  .all([companyName, cloudProvider, endpoints, dnsInfo])
  .apply(([company, provider, serviceEndpoints, dns]) => ({
    status: "✅ Deployment Complete",
    company: company,
    provider: provider.toUpperCase(),
    domains: dns.domains,
    endpoints: serviceEndpoints,
    nextSteps: [
      "1. Configure DNS records as shown in 'dnsInfo' export",
      "2. Set up SSL/TLS certificates",
      "3. Test all endpoints",
      "4. Configure monitoring and alerting",
    ],
    quickCommands: {
      saveKubeconfig: `pulumi stack output kubeconfig > ${company}-kubeconfig.yaml`,
      checkDeployment: "kubectl get pods,services,ingress",
      testHealth: `curl -k https://${dns.domains[0]}/health`,
    },
  }));
