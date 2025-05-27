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
  machineType: "e2-standard-2", // 2 vCPUs, 8GB RAM - more suitable for workloads
  initialNodeCount: 2,
  minNodeCount: 2,
  maxNodeCount: 4,
};

const prodGkeConfig: GkeConfig = {
  machineType: "e2-standard-4", // 4 vCPUs, 16GB RAM for production
  initialNodeCount: 2,
  minNodeCount: 2,
  maxNodeCount: 6,
};

// Function to create a GKE cluster
export function createGkeCluster(name: string, stack: string) {
  const config = stack === "prod" ? prodGkeConfig : devGkeConfig;
  const gcpConfig = new pulumi.Config("gcp");
  const project = gcpConfig.require("project");
  const region = gcpConfig.get("region") || "us-central1";
  const zone = gcpConfig.get("zone") || "us-central1-a";
  const credentials = gcpConfig.get("credentials");

  pulumi.log.info(
    `Using GCP project: ${project}, region: ${region}, zone: ${zone}`
  );

  // Create a GCP provider with explicit credentials if available
  const gcpProvider = credentials
    ? new gcp.Provider("gcp-provider", {
        project: project,
        region: region,
        zone: zone,
        credentials: credentials,
      })
    : new gcp.Provider("gcp-provider", {
        project: project,
        region: region,
        zone: zone,
      });

  const staticIp = new gcp.compute.GlobalAddress(
    "rafiki-global-ip",
    {
      project: project,
      description: "Static IP for GKE Ingress",
    },
    { provider: gcpProvider }
  );

  pulumi.log.info(
    `Using ${stack} configuration for GKE cluster. Machine type (for default-pool): ${config.machineType}`
  );

  // Use a specific Kubernetes version that meets Helm chart requirements (>=1.25.0)
  const engineVersion = gcp.container
    .getEngineVersions({ project, location: zone }, { provider: gcpProvider })
    .then((v: gcp.container.GetEngineVersionsResult) => {
      // Find a version that meets our minimum requirement of 1.25.0
      const validVersions = v.validMasterVersions.filter(
        (version) =>
          version.startsWith("1.25.") ||
          version.startsWith("1.26.") ||
          version.startsWith("1.27.") ||
          version.startsWith("1.28.") ||
          version.startsWith("1.29.") ||
          version.startsWith("1.30.") ||
          version.startsWith("1.31.") ||
          version.startsWith("1.32.") ||
          version.startsWith("1.33.") ||
          version.startsWith("1.34.")
      );

      if (validVersions.length === 0) {
        // Fallback to latest master version if no valid versions found
        pulumi.log.warn(
          "No Kubernetes versions >=1.25.0 found, using latest master version"
        );
        return v.latestMasterVersion;
      }

      // Use the latest valid version
      const selectedVersion = validVersions[0];
      pulumi.log.info(
        `Selected Kubernetes version: ${selectedVersion} (meets Helm chart requirement >=1.25.0)`
      );
      return selectedVersion;
    });

  const cluster = new gcp.container.Cluster(
    `${name}-gke-cluster`,
    {
      project: project,
      location: zone,
      minMasterVersion: engineVersion,
      removeDefaultNodePool: true,
      initialNodeCount: 1, // This is required but will be removed since removeDefaultNodePool is true
      deletionProtection: false, // Allow deletion of the cluster
    },
    { provider: gcpProvider }
  );

  // Create a separate node pool
  const nodePool = new gcp.container.NodePool(
    `${name}-node-pool`,
    {
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
        oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
      },
    },
    { provider: gcpProvider }
  );

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
