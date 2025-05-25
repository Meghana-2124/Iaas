import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// Define configurations for different environments for GKE
interface GkeConfig {
  machineType: pulumi.Input<string>;
  initialNodeCount: pulumi.Input<number>;
  minNodeCount: pulumi.Input<number>;
  maxNodeCount: pulumi.Input<number>;
}

const devGkeConfig: GkeConfig = {
  machineType: "n1-standard-1", // Standard machine type for dev
  initialNodeCount: 1,
  minNodeCount: 1,
  maxNodeCount: 2,
};

const prodGkeConfig: GkeConfig = {
  machineType: "n1-standard-2", // Larger machine type for production
  initialNodeCount: 2,
  minNodeCount: 2,
  maxNodeCount: 4,
};

// Function to create a GKE cluster
export function createGkeCluster(name: string, stack: string) {
  const config = stack === "prod" ? prodGkeConfig : devGkeConfig;
  const gcpConfig = new pulumi.Config("gcp");
  const project = gcpConfig.require("project");
  const region = gcpConfig.get("region") || "us-central1";
  const zone = gcpConfig.get("zone") || "us-central1-a"; // GKE clusters are zonal or regional

  // Create a Global Static IP Address for Ingress
  const staticIp = new gcp.compute.GlobalAddress(`${name}-static-ip`, {
    project: project,
    // name: `${name}-static-ip`, // Optional: Pulumi auto-generates a name
    description: "Static IP for GKE Ingress",
  });

  pulumi.log.info(
    `Using ${stack} configuration for GKE cluster. Machine type: ${config.machineType}`
  );

  // Create a GKE cluster
  const engineVersion = gcp.container
    .getEngineVersions({ project, location: zone })
    .then((v: gcp.container.GetEngineVersionsResult) => v.latestMasterVersion);

  const cluster = new gcp.container.Cluster(`${name}-gke-cluster`, {
    project: project,
    location: zone,
    initialNodeCount: config.initialNodeCount,
    minMasterVersion: engineVersion,
    nodeVersion: engineVersion,
    nodeConfig: {
      machineType: config.machineType,
      oauthScopes: [
        "https://www.googleapis.com/auth/compute",
        "https://www.googleapis.com/auth/devstorage.read_only",
        "https://www.googleapis.com/auth/logging.write",
        "https://www.googleapis.com/auth/monitoring",
      ],
    },
    // Example of enabling autoscaling on the default node pool
    nodePools: [
      {
        name: "default-pool",
        initialNodeCount: config.initialNodeCount,
        autoscaling: {
          minNodeCount: config.minNodeCount,
          maxNodeCount: config.maxNodeCount,
        },
        management: {
          autoRepair: true,
          autoUpgrade: true,
        },
        nodeConfig: {
          machineType: config.machineType,
          oauthScopes: [
            "https://www.googleapis.com/auth/compute",
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring",
          ],
        },
      },
    ],
    // To make the cluster private, you would configure masterAuthorizedNetworksConfig and privateClusterConfig
    // For simplicity, this example creates a public cluster.
  });

  // Manufacture a Kubeconfig for GKE
  // Note: Pulumi's GKE component does not export a kubeconfig directly like EKS.
  // We construct it manually.
  const kubeconfig = pulumi
    .all([cluster.name, cluster.endpoint, cluster.masterAuth])
    .apply(([name, endpoint, masterAuth]) => {
      const context = `${project}_${zone}_${name}`;
      return `
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
    });

  return {
    kubeconfig: kubeconfig,
    clusterName: cluster.name,
    gcpProject: project,
    gcpZone: zone,
    staticIpName: staticIp.name, // Export the name of the static IP
  };
}
