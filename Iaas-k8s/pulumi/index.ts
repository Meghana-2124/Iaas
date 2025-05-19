import * as awsInfra from "./aws-infra.js";
import * as gcpInfra from "./gcp-infra.js"; // Import GCP infra
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";

// Define interfaces for Kubernetes resource statuses for better type safety
interface K8sLoadBalancerIngress {
  hostname?: string;
  ip?: string;
}

interface K8sLoadBalancerStatus {
  ingress?: K8sLoadBalancerIngress[];
}

interface IngressStatus {
  loadBalancer?: K8sLoadBalancerStatus;
}

interface ServiceStatus {
  loadBalancer?: K8sLoadBalancerStatus;
}

const stack = pulumi.getStack();
const generalConfig = new pulumi.Config();
const cloudProvider = generalConfig.require("cloudProvider"); // 'aws' or 'gcp'

let cluster: any; // To hold cluster info from AWS or GCP
let k8sProvider: k8s.Provider;
let dependsOnResources: any[] = [];

// Declare outputs at the top level
let eksClusterNameOutput: pulumi.Output<string> | undefined;
let vpcIdOutput: pulumi.Output<string> | undefined;
let gkeClusterNameOutput: pulumi.Output<string> | undefined;
let gcpProjectOutput: pulumi.Output<string> | undefined;
let gcpZoneOutput: pulumi.Output<string> | undefined;
let staticIpNameOutput: pulumi.Output<string> | undefined; // Declare staticIpNameOutput

if (cloudProvider === "aws") {
  cluster = awsInfra.createEksCluster("chimoney-rafiki-eks", stack);
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
} else if (cloudProvider === "gcp") {
  cluster = gcpInfra.createGkeCluster("chimoney-rafiki-gke", stack);
  k8sProvider = new k8s.Provider("k8s-provider-gcp", {
    kubeconfig: cluster.kubeconfig,
  });
  pulumi.log.info(
    "GCP GKE cluster selected. Default GCE Ingress will be used for services of type LoadBalancer or Ingress resources."
  );
  gkeClusterNameOutput = cluster.clusterName;
  gcpProjectOutput = cluster.gcpProject;
  gcpZoneOutput = cluster.gcpZone;
  staticIpNameOutput = cluster.staticIpName; // Assign to staticIpNameOutput
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
export const staticIpName = staticIpNameOutput; // Export staticIpNameOutput

// Function to load and merge YAML files
function loadAndMergeValues(filePaths: string[]): any {
  let mergedValues = {};
  for (const filePath of filePaths) {
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, "utf8");
      const parsedValues = yaml.load(fileContents);
      if (parsedValues && typeof parsedValues === "object") {
        mergedValues = { ...mergedValues, ...parsedValues };
      }
    } else {
      pulumi.log.warn(`Values file not found: ${filePath}`);
    }
  }
  return mergedValues;
}

const chartPathDir = path.join(__dirname, "../..", "helm-chart");
const chartConfigPathDir = path.join(__dirname, "..", "chart-config");

const valuesFilesPaths: string[] = [
  path.join(chartConfigPathDir, "values.yaml"),
  path.join(chartConfigPathDir, `values.${stack}.yaml`),
];

if (stack === "prod") {
  const prodSecretsFile = path.join(chartConfigPathDir, "secrets.prod.yaml");
  valuesFilesPaths.push(prodSecretsFile);
  pulumi.log.info(
    "Attempting to include production secrets from secrets.prod.yaml"
  );
}

const mergedChartValues = loadAndMergeValues(valuesFilesPaths);

if (cloudProvider === "gcp") {
  if (!mergedChartValues.ingress) {
    mergedChartValues.ingress = {};
  }
  if (!mergedChartValues.ingress.annotations) {
    mergedChartValues.ingress.annotations = {};
  }
  // Use the created static IP name for the Ingress annotation
  mergedChartValues.ingress.annotations[
    "kubernetes.io/ingress.global-static-ip-name"
  ] = cluster.staticIpName;
  pulumi.log.info(
    "For GCP/GKE, ensure your Helm chart's Ingress and Service resources are configured appropriately."
  );
}

const helmReleaseName = "chimoney-rafiki"; // Define the Helm release name

const chimoneyRafikiChart = new k8s.helm.v3.Chart(
  helmReleaseName, // Use the defined release name
  {
    path: chartPathDir,
    values: mergedChartValues,
  },
  { provider: k8sProvider, dependsOn: dependsOnResources }
);

pulumi.log.info(
  "Chimoney Rafiki Helm chart deployment initiated. Check Pulumi logs for status."
);

// Construct resource names based on Helm release name and chart resource names
// The Helm chart's ingress.yaml uses `name: {{ .Values.ingress.name }}`.
// We assume .Values.ingress.name is set to 'rafiki-ingress' in the Helm values,
// as indicated by the original comment.
const ingressResourceName = "rafiki-ingress";
// The Helm chart's nginx-service.yaml uses a helper that resolves to `ReleaseName-{{.Values.nginx.name}}`.
// We assume .Values.nginx.name is 'nginx' (as per the original comment),
// so the K8s service name will be `${helmReleaseName}-nginx`.
const nginxServicePlainName = `${helmReleaseName}-nginx`; // Changed from pulumi.interpolate

export const ingressHostname = chimoneyRafikiChart
  .getResourceProperty(
    "networking.k8s.io/v1/Ingress",
    ingressResourceName, // Use constructed name
    "status"
  )
  .apply((status: IngressStatus | undefined) => {
    // Add type assertion for status
    if (
      status &&
      status.loadBalancer &&
      status.loadBalancer.ingress &&
      status.loadBalancer.ingress[0]
    ) {
      return (
        status.loadBalancer.ingress[0].hostname ||
        status.loadBalancer.ingress[0].ip
      );
    }
    return "Ingress status not available yet.";
  });

export const nginxLoadBalancer = chimoneyRafikiChart
  .getResourceProperty(
    "v1/Service",
    nginxServicePlainName, // Use the new plain string variable
    "status"
  )
  .apply((status: ServiceStatus | undefined) => {
    // Add type assertion for status
    if (
      status &&
      status.loadBalancer &&
      status.loadBalancer.ingress &&
      status.loadBalancer.ingress[0]
    ) {
      return (
        status.loadBalancer.ingress[0].hostname ||
        status.loadBalancer.ingress[0].ip
      );
    }
    return "Nginx LoadBalancer status not available yet (or service not of Type=LoadBalancer).";
  });
