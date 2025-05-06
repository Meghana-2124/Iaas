import * as awsInfra from "./aws-infra.js";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";
import * as fs from "fs"; // Import fs for checking file existence
import * as yaml from "js-yaml"; // Import js-yaml

const stack = pulumi.getStack(); // Get current stack (e.g., 'dev', 'prod')

// Provision AWS EKS cluster and node group based on stack
const cluster = awsInfra.createEksCluster("chimoney-rafiki-eks", stack);

// Export the Kubeconfig
export const kubeconfig = cluster.kubeconfig;

// Create a Kubernetes provider instance using the kubeconfig from the EKS cluster.
const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig: cluster.kubeconfig,
});

// Deploy AWS Load Balancer Controller Helm chart
// Required for Ingress of type 'alb'
const awsLoadBalancerControllerChart = new k8s.helm.v3.Chart(
  "aws-load-balancer-controller",
  {
    chart: "aws-load-balancer-controller",
    version: "1.7.1", // Specify a version to ensure consistent deployments
    namespace: "kube-system", // Recommended namespace for the controller
    fetchOpts: {
      repo: "https://aws.github.io/eks-charts",
    },
    values: {
      clusterName: cluster.clusterName, // Pass the EKS cluster name
      serviceAccount: {
        create: true,
        name: "aws-load-balancer-controller",
      },
      // Additional recommended values, consult AWS LBC Helm chart documentation
      // region: aws.config.region, // Optional: if not set, derived from the node
      // vpcId: cluster.vpcId,     // Optional: if not set, derived from the node
    },
  },
  { provider: k8sProvider }
);

// Deploy Chimoney Rafiki Helm chart
const chartPathDir = path.join(__dirname, "..", "helm-chart"); // Renamed to avoid confusion, this is a directory

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

const valuesFilesPaths: string[] = [
  path.join(chartPathDir, "values.yaml"),
  path.join(chartPathDir, `values.${stack}.yaml`),
];

if (stack === "prod") {
  const prodSecretsFile = path.join(chartPathDir, "secrets.prod.yaml");
  // We will check existence in loadAndMergeValues, but good to log intent
  valuesFilesPaths.push(prodSecretsFile);
  pulumi.log.info(
    "Attempting to include production secrets from secrets.prod.yaml"
  );
}

const mergedChartValues = loadAndMergeValues(valuesFilesPaths);

const chimoneyRafikiChart = new k8s.helm.v3.Chart(
  "chimoney-rafiki",
  {
    path: chartPathDir,
    values: mergedChartValues, // Use the merged values object
    // namespace: "default", // Specify namespace if needed
  },
  { provider: k8sProvider, dependsOn: [awsLoadBalancerControllerChart] } // Ensure LBC is deployed before the app chart
);

pulumi.log.info(
  "Chimoney Rafiki Helm chart deployment initiated with merged values. Check Pulumi logs for status."
);

// Example: Export Ingress endpoint if Ingress is enabled and an ALB is used
// This depends on the Ingress controller updating the status.
export const ingressHostname = chimoneyRafikiChart
  .getResourceProperty(
    "networking.k8s.io/v1/Ingress",
    "chimoney-rafiki-rafiki-ingress", // Helm release name 'chimoney-rafiki' + Ingress name 'rafiki-ingress' from values.yaml
    "status"
  )
  .apply(
    (status) =>
      status?.loadBalancer?.ingress[0]?.hostname ||
      status?.loadBalancer?.ingress[0]?.ip
  );

// To get the Nginx LoadBalancer IP/hostname if Nginx service is Type=LoadBalancer
export const nginxLoadBalancer = chimoneyRafikiChart
  .getResourceProperty(
    "v1/Service",
    "chimoney-rafiki-nginx", // Helm release name + Nginx service name
    "status"
  )
  .apply(
    (status) =>
      status?.loadBalancer?.ingress[0]?.hostname ||
      status?.loadBalancer?.ingress[0]?.ip
  );
