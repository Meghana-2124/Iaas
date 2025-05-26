import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// Define configurations for different environments for GKE
interface GkeConfig {
  machineType: pulumi.Input<string>;
  initialNodeCount: pulumi.Input<number>; // This will be used for the node pool
  minNodeCount: pulumi.Input<number>;
  maxNodeCount: pulumi.Input<number>;
}

const devGkeConfig: GkeConfig = {
  machineType: "n1-standard-1",
  initialNodeCount: 1,
  minNodeCount: 1,
  maxNodeCount: 2,
};

const prodGkeConfig: GkeConfig = {
  machineType: "n1-standard-2",
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
  const zone = gcpConfig.get("zone") || "us-central1-a";

  const staticIp = new gcp.compute.GlobalAddress("rafiki-global-ip", {
    project: project,
    description: "Static IP for GKE Ingress",
  });

  pulumi.log.info(
    `Using ${stack} configuration for GKE cluster. Machine type (for default-pool): ${config.machineType}`
  );

  const engineVersion = gcp.container
    .getEngineVersions({ project, location: zone })
    .then((v: gcp.container.GetEngineVersionsResult) => v.latestMasterVersion);

  const cluster = new gcp.container.Cluster(`${name}-gke-cluster`, {
    project: project,
    location: zone,
    minMasterVersion: engineVersion,
    removeDefaultNodePool: true,
    initialNodeCount: 1, // This is required but will be removed since removeDefaultNodePool is true
    deletionProtection: false, // Allow deletion of the cluster
  });

  // Create a separate node pool
  const nodePool = new gcp.container.NodePool(`${name}-node-pool`, {
    project: project,
    location: zone,
    cluster: cluster.name,
    initialNodeCount: config.initialNodeCount,
    version: engineVersion,
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
        "https://www.googleapis.com/auth/cloud-platform",
      ],
    },
  });

  const kubeconfig = pulumi
    .all([
      cluster.name,
      cluster.endpoint,
      cluster.masterAuth,
      pulumi.output(project),
      pulumi.output(zone),
    ])
    .apply(
      ([clusterNameValue, endpoint, masterAuth, projectValue, zoneValue]) => {
        const context = `${projectValue}_${zoneValue}_${clusterNameValue}`;
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
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: gke-gcloud-auth-plugin
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following
        https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true
`;
      }
    );

  return {
    kubeconfig: kubeconfig,
    clusterName: cluster.name,
    gcpProject: project,
    gcpZone: zone,
    staticIpName: staticIp.name,
  };
}
