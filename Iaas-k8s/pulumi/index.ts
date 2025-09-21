import * as awsInfra from "./src/core/aws-infra.js";
import * as gcpInfra from "./src/core/gcp-infra.js";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";
import * as fs from "fs";
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
// New namespace-based deployment configuration
const namespace = config.get("namespace");
const deploymentType = config.get("deploymentType") || "dedicated"; // Default to dedicated for backward compatibility

// Helper function to merge values with deep merge support
function loadAndMergeValues(secretsJson?: string, valuesJson?: string): any {
  let mergedValues: { [key: string]: any } = {};

  // Helper function for deep merge
  function deepMerge(target: any, source: any): any {
    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        if (!target[key] || typeof target[key] !== "object") {
          target[key] = {};
        }
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  if (secretsJson) {
    try {
      const secrets = JSON.parse(secretsJson);
      deepMerge(mergedValues, secrets);
      pulumi.log.info("Successfully loaded helmSecretsJson.");
    } catch (e: any) {
      pulumi.log.error(`Failed to parse helmSecretsJson: ${e.message}`);
    }
  }

  if (valuesJson) {
    try {
      const values = JSON.parse(valuesJson);
      deepMerge(mergedValues, values);
      pulumi.log.info("Successfully loaded helmValuesJson.");
    } catch (e: any) {
      pulumi.log.error(`Failed to parse helmValuesJson: ${e.message}`);
    }
  } else {
    pulumi.log.error("helmValuesJson is required but not provided.");
  }

  return mergedValues;
}

// Infrastructure setup based on deployment type
let cluster: any;
let dependsOnResources: any[] = [];

function setupInfrastructure() {
  if (deploymentType === "dedicated") {
    // For dedicated deployments, create a new cluster for this company
    if (cloudProvider === "aws") {
      cluster = awsInfra.createEksCluster(`${companyName}-rafiki`, stack);
      pulumi.log.info(
        "AWS EKS cluster deployment initiated for dedicated cluster."
      );
    } else if (cloudProvider === "gcp") {
      cluster = gcpInfra.createGkeCluster(`${companyName}-rafiki`, stack);
      pulumi.log.info(
        "GCP GKE cluster deployment initiated for dedicated cluster."
      );
    } else {
      throw new Error("Invalid cloudProvider. Must be 'aws' or 'gcp'.");
    }
  } else if (deploymentType === "shared") {
    // For shared deployments, look for existing cluster first, create if not found
    const sharedClusterName = `shared-${cloudProvider}-cluster`;

    if (cloudProvider === "aws") {
      // Use the lookup function which returns a pulumi output
      const lookupResult =
        awsInfra.lookupSharedEksClusterSync(sharedClusterName);

      // Create cluster based on lookup result
      cluster = lookupResult.apply((result) => {
        if (result.exists && result.kubeconfig) {
          pulumi.log.info(
            `Using existing shared AWS EKS cluster: ${sharedClusterName}`
          );
          return {
            kubeconfig: result.kubeconfig,
            clusterName: result.clusterName,
            vpcId: result.vpcId,
            region: result.region,
          };
        } else {
          pulumi.log.info(
            `Creating new shared AWS EKS cluster: ${sharedClusterName}`
          );
          return awsInfra.createEksCluster(sharedClusterName, stack);
        }
      });
      pulumi.log.info("AWS EKS shared cluster lookup initiated.");
    } else if (cloudProvider === "gcp") {
      // Use the lookup function which returns a pulumi output
      const lookupResult =
        gcpInfra.lookupSharedGkeClusterSync(sharedClusterName);

      // Create cluster based on lookup result
      cluster = lookupResult.apply((result) => {
        if (result.exists && result.kubeconfig) {
          pulumi.log.info(
            `Using existing shared GCP GKE cluster: ${sharedClusterName}`
          );
          return {
            kubeconfig: result.kubeconfig,
            clusterName: result.clusterName,
            staticIpName: result.staticIpName,
            gcpProject: result.project,
            gcpZone: result.zone,
          };
        } else {
          pulumi.log.info(
            `Creating new shared GCP GKE cluster: ${sharedClusterName}`
          );
          return gcpInfra.createGkeCluster(sharedClusterName, stack);
        }
      });
      pulumi.log.info("GCP GKE shared cluster lookup initiated.");
    } else {
      throw new Error("Invalid cloudProvider. Must be 'aws' or 'gcp'.");
    }
  } else {
    throw new Error("Invalid deploymentType. Must be 'dedicated' or 'shared'.");
  }
}

// Setup infrastructure
setupInfrastructure();

// Deploy helm chart and create resources based on infrastructure setup
const deploymentOutputs = pulumi
  .output(cluster)
  .apply(async (clusterData: any) => {
    // Wait for cluster to be ready before proceeding with Helm deployment
    // This ensures the cluster is fully operational before we try to deploy

    // Create Kubernetes provider here, after cluster is ready
    let k8sProvider: k8s.Provider;

    if (cloudProvider === "aws") {
      k8sProvider = new k8s.Provider("k8s-provider-aws", {
        kubeconfig: clusterData.kubeconfig,
      });

      // Create AWS Load Balancer Controller for dedicated clusters
      if (deploymentType === "dedicated") {
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
              clusterName: clusterData.clusterName,
              serviceAccount: {
                create: true,
                name: "aws-load-balancer-controller",
              },
            },
          },
          { provider: k8sProvider }
        );
        dependsOnResources.push(awsLoadBalancerControllerChart);
        pulumi.log.info(
          "AWS Load Balancer Controller deployment initiated for dedicated cluster."
        );
      }
    } else if (cloudProvider === "gcp") {
      // Simple GCP provider
      k8sProvider = new k8s.Provider("k8s-provider-gcp", {
        kubeconfig: clusterData.kubeconfig,
      });
    } else {
      throw new Error("Invalid cloudProvider. Must be 'aws' or 'gcp'.");
    }

    // Prepare Helm values and resolve bundled chart path only
    // Resolve bundled Helm chart path. Packaged layout: <pkgRoot>/dist (this file), <pkgRoot>/helm-chart
    // Use top-level monorepo helm-chart during development; during publish it's copied beside dist.
    const packagedChart = path.resolve(__dirname, "..", "helm-chart");
    const monorepoChart = path.resolve(__dirname, "../..", "helm-chart");
    const chartCandidates = [packagedChart, monorepoChart];
    let resolvedChartPath: string | undefined;
    for (const candidate of chartCandidates) {
      if (fs.existsSync(path.join(candidate, "Chart.yaml"))) {
        resolvedChartPath = candidate;
        break;
      }
    }
    if (!resolvedChartPath) {
      throw new Error(
        `Bundled Helm chart missing. Checked: ${chartCandidates.join(", ")}`
      );
    }
    const chartYaml = path.join(resolvedChartPath, "Chart.yaml");
    pulumi.log.info(`Using bundled Helm chart at ${resolvedChartPath}`);
    const mergedChartValues = loadAndMergeValues(
      helmSecretsJson,
      helmValuesJson
    );

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

    // Optimize resource requests for better scheduling on smaller nodes
    if (!mergedChartValues.rafikiAuth) mergedChartValues.rafikiAuth = {};
    if (!mergedChartValues.rafikiAuth.enabled) {
      mergedChartValues.rafikiAuth.enabled = true; // Ensure rafiki-auth is enabled
    }

    if (!mergedChartValues.rafikiBackend) mergedChartValues.rafikiBackend = {};
    if (!mergedChartValues.rafikiBackend.enabled) {
      mergedChartValues.rafikiBackend.enabled = true; // Ensure rafiki-backend is enabled
    }

    mergedChartValues.companyName = companyName;

    // Set namespace and deployment type in chart values
    if (namespace) {
      mergedChartValues.namespace = namespace;
    }
    mergedChartValues.deploymentType = deploymentType;

    // Configure GCP-specific ingress settings
    if (cloudProvider === "gcp") {
      if (!mergedChartValues.ingress) mergedChartValues.ingress = {};
      if (!mergedChartValues.ingress.annotations)
        mergedChartValues.ingress.annotations = {};

      // Set static IP annotation
      mergedChartValues.ingress.annotations[
        "kubernetes.io/ingress.global-static-ip-name"
      ] = clusterData.staticIpName;

      // Allow HTTP traffic (required for GCP ingress when no TLS is configured)
      mergedChartValues.ingress.annotations[
        "kubernetes.io/ingress.allow-http"
      ] = "true";

      // Set ingress class for GCP
      mergedChartValues.ingress.annotations["kubernetes.io/ingress.class"] =
        "gce";
    }

    // Deploy Helm chart with namespace support
    const helmReleaseName =
      deploymentType === "shared" && namespace
        ? `${namespace}-rafiki`
        : `${companyName}-rafiki`;
    const ingressResourceName = "rafiki-ingress";

    // Create namespace for shared deployments
    let namespaceResource: k8s.core.v1.Namespace | undefined;
    if (deploymentType === "shared" && namespace) {
      namespaceResource = new k8s.core.v1.Namespace(
        `namespace-${namespace}`,
        {
          metadata: {
            name: namespace,
            labels: {
              "app.kubernetes.io/managed-by": "pulumi",
              "iaas.deployment/type": deploymentType,
              "iaas.deployment/company": companyName,
            },
          },
        },
        { provider: k8sProvider }
      );
      dependsOnResources.push(namespaceResource);
    }

    // Simple cluster readiness - just wait for the k8s provider to be ready
    // No complex connectivity tests needed - k8s provider handles this

    const iaasRafikiChart = new k8s.helm.v3.Chart(
      helmReleaseName,
      {
        path: resolvedChartPath,
        values: mergedChartValues,
        namespace: namespace || "default",
      },
      {
        provider: k8sProvider,
        dependsOn: dependsOnResources,
      }
    );

    // Get ingress IP/hostname - simplified approach
    let ingressIpOutput: pulumi.Output<string> | undefined;
    if (cloudProvider === "aws") {
      // For AWS, return a placeholder that can be resolved later
      ingressIpOutput = pulumi.output("pending-aws-alb");
    } else {
      // For GCP, use the static IP name
      ingressIpOutput = pulumi.output(
        clusterData.staticIpName || "pending-gcp-ip"
      ) as pulumi.Output<string>;
    }

    return {
      kubeconfig: clusterData.kubeconfig,
      clusterName: clusterData.clusterName,
      ingressIp: ingressIpOutput,
      helmChart: iaasRafikiChart,
      clusterData: clusterData,
    };
  });

// =================
// EXPORTS
// =================

// Essential cluster information
export const kubeconfig = deploymentOutputs.apply(
  (outputs: any) => outputs.kubeconfig
);
export const clusterName = deploymentOutputs.apply(
  (outputs: any) => outputs.clusterName
);

// Cloud-specific outputs
export const clusterInfo = deploymentOutputs.apply((outputs: any) => {
  const clusterData = outputs.clusterData;
  return cloudProvider === "aws"
    ? {
        provider: "aws",
        clusterName: clusterData.clusterName,
        vpcId: clusterData.vpcId,
        region: clusterData.region,
      }
    : {
        provider: "gcp",
        clusterName: clusterData.clusterName,
        project: clusterData.gcpProject,
        zone: clusterData.gcpZone,
        staticIpName: clusterData.staticIpName,
      };
});

// Service endpoints
export const endpoints = deploymentOutputs.apply((outputs: any) => {
  // Get merged chart values from the helm chart
  const mergedChartValues = loadAndMergeValues(helmSecretsJson, helmValuesJson);
  const ilpDomain =
    mergedChartValues.nginx?.config?.serverNameIlp || `ilp.${companyName}.com`;
  const authDomain =
    mergedChartValues.nginx?.config?.serverNameAuth ||
    `auth-ilp.${companyName}.io`;

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
export const dnsInfo = deploymentOutputs.apply((outputs: any) => {
  const mergedChartValues = loadAndMergeValues(helmSecretsJson, helmValuesJson);
  const ilpDomain =
    mergedChartValues.nginx?.config?.serverNameIlp || `ilp.${companyName}.com`;
  const authDomain =
    mergedChartValues.nginx?.config?.serverNameAuth ||
    `auth-ilp.${companyName}.io`;

  return outputs.ingressIp.apply((ingressIp: string) => {
    if (cloudProvider === "gcp") {
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
});

// Management commands
export const managementCommands = deploymentOutputs.apply((outputs: any) => {
  const helmReleaseName =
    deploymentType === "shared" && namespace
      ? `${namespace}-rafiki`
      : `${companyName}-rafiki`;
  const ingressResourceName = "rafiki-ingress";

  return {
    kubectl: {
      getPods: `kubectl get pods -l app.kubernetes.io/instance=${helmReleaseName}`,
      getServices: `kubectl get services -l app.kubernetes.io/instance=${helmReleaseName}`,
      getIngress: `kubectl get ingress ${ingressResourceName}`,
      getLogs: `kubectl logs -l app.kubernetes.io/instance=${helmReleaseName} -f`,
    },
    helm: {
      status: `helm status ${helmReleaseName}`,
      values: `helm get values ${helmReleaseName}`,
      upgrade: `helm upgrade ${helmReleaseName} [CHART_PATH] -f [VALUES_FILE]`,
      uninstall: `helm uninstall ${helmReleaseName}`,
    },
  };
});

// Deployment summary
export const deploymentSummary = pulumi
  .all([deploymentOutputs, endpoints, dnsInfo])
  .apply(([outputs, serviceEndpoints, dns]: [any, any, any]) => ({
    status: "✅ Deployment Complete",
    company: companyName,
    provider: cloudProvider.toUpperCase(),
    deploymentType: deploymentType,
    namespace: namespace || "default",
    domains: dns.domains,
    endpoints: serviceEndpoints,
    nextSteps: [
      "1. Configure DNS records as shown in 'dnsInfo' export",
      "2. Set up SSL/TLS certificates",
      "3. Test all endpoints",
      "4. Configure monitoring and alerting",
    ],
    quickCommands: {
      saveKubeconfig: `pulumi stack output kubeconfig > ${companyName}-kubeconfig.yaml`,
      checkDeployment: "kubectl get pods,services,ingress",
      testHealth: `curl -k https://${dns.domains[0]}/health`,
    },
  }));
