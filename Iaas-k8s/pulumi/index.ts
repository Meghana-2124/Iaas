import * as awsInfra from "./src/index.js";
import * as gcpInfra from "./src/index.js";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";
import type {
  IngressStatus,
  ServiceStatus,
} from "./src/index.js";

const stack = pulumi.getStack();
const generalConfig = new pulumi.Config();
const cloudProvider = generalConfig.require("cloudProvider"); // 'aws' or 'gcp'

// New: Get JSON strings from Pulumi config
const helmSecretsJson = generalConfig.get("helmSecretsJson");
const helmValuesJson = generalConfig.get("helmValuesJson");
const companyName = generalConfig.require("companyName"); // Added: Get companyName from Pulumi config

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
  cluster = awsInfra.createEksCluster(`${companyName}-rafiki-eks`, stack); // Modified: Use companyName
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
  cluster = gcpInfra.createGkeCluster(`${companyName}-rafiki-gke`, stack); // Modified: Use companyName
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
function loadAndMergeValues(
  secretsJson?: string, // Changed order and made it optional for clarity
  valuesJson?: string
): any {
  let mergedValues = {};

  // Values are now primarily from JSON strings.
  // File-based values are completely removed.

  if (secretsJson) {
    try {
      const secrets = JSON.parse(secretsJson);
      mergedValues = { ...mergedValues, ...secrets };
      pulumi.log.info("Merged secrets from helmSecretsJson config.");
    } catch (e: any) {
      // Error handling for secretsJson parsing already in automation.ts
      // This warning is a fallback, but ideally, automation.ts catches it first.
      pulumi.log.error(
        `Critical: Failed to parse helmSecretsJson in Pulumi program: ${e.message}. This should have been caught by the automation script.`
      );
      // Depending on policy, you might want to throw an error here to stop execution
      // throw new Error(`Failed to parse helmSecretsJson: ${e.message}`);
    }
  } else {
    // This case should ideally not be reached if automation.ts enforces the argument.
    pulumi.log.error(
      "Critical: helmSecretsJson was not provided to the Pulumi program. The automation script should enforce this."
    );
    // throw new Error("helmSecretsJson is required and was not provided.");
  }

  if (valuesJson) {
    try {
      const values = JSON.parse(valuesJson);
      mergedValues = { ...mergedValues, ...values };
      pulumi.log.info("Merged values from helmValuesJson config.");
    } catch (e: any) {
      // Similar to secretsJson, automation.ts should catch this.
      pulumi.log.error(
        `Critical: Failed to parse helmValuesJson in Pulumi program: ${e.message}. This should have been caught by the automation script.`
      );
      // throw new Error(`Failed to parse helmValuesJson: ${e.message}`);
    }
  } else {
    // This case should ideally not be reached.
    pulumi.log.error(
      "Critical: helmValuesJson was not provided to the Pulumi program. The automation script should enforce this."
    );
    // throw new Error("helmValuesJson is required and was not provided.");
  }

  return mergedValues;
}

// Support for custom Helm chart path via environment variable
const defaultChartPath = path.join(__dirname, "../..", "helm-chart");
const chartPathDir = process.env.HELM_CHART_PATH || defaultChartPath;

pulumi.log.info(`Using Helm chart path: ${chartPathDir}`);

// Removed chartConfigPathDir and valuesFilesPaths as they are no longer used for loading values or secrets.
// All configurations are expected to come from helmSecretsJson and helmValuesJson.

if (!helmSecretsJson) {
  // This log is more of a safeguard; automation.ts should prevent this state.
  pulumi.log.error(
    "Error: helmSecretsJson is missing. It must be provided via Pulumi config by the automation script."
  );
  // Optionally, throw an error to halt deployment if essential secrets are missing
  // throw new Error("helmSecretsJson is required and was not set in Pulumi config.");
}

if (!helmValuesJson) {
  // Similar safeguard for helmValuesJson
  pulumi.log.error(
    "Error: helmValuesJson is missing. It must be provided via Pulumi config by the automation script."
  );
  // Optionally, throw an error
  // throw new Error("helmValuesJson is required and was not set in Pulumi config.");
}

// Pass only the JSON strings to loadAndMergeValues.
// File paths array is removed as it's no longer used.
const mergedChartValues = loadAndMergeValues(helmSecretsJson, helmValuesJson);

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

  // Add companyName to mergedChartValues for Helm chart
  mergedChartValues.companyName = companyName;
}

const helmReleaseName = `${companyName}-rafiki`; // Modified: Use companyName

const iaasRafikiChart = new k8s.helm.v3.Chart(
  helmReleaseName, // Use the defined release name
  {
    path: chartPathDir,
    values: mergedChartValues,
  },
  { provider: k8sProvider, dependsOn: dependsOnResources }
);

pulumi.log.info(
  `${companyName} Rafiki Helm chart deployment initiated. Check Pulumi logs for status.` // Modified: Use companyName
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

export const ingressHostname = iaasRafikiChart
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

export const nginxLoadBalancer = iaasRafikiChart
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
