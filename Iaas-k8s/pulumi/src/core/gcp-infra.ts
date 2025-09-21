import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { ClusterLookupResult } from "../types/index.js";

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
      // Enable workload identity for better authentication
      workloadIdentityConfig: {
        workloadPool: pulumi.interpolate`${project}.svc.id.goog`,
      },
      // Add authentication and authorization settings
      masterAuth: {
        clientCertificateConfig: {
          issueClientCertificate: false,
        },
      },
      // Enable network policy for security
      addonsConfig: {
        networkPolicyConfig: {
          disabled: false,
        },
      },
      networkPolicy: {
        enabled: true,
      },
    },
    { provider: gcpProvider }
  );

  // Create a separate node pool - wait for cluster to be fully ready
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
        oauthScopes: [
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/devstorage.read_only",
          "https://www.googleapis.com/auth/logging.write",
          "https://www.googleapis.com/auth/monitoring",
        ],
        // Enable workload identity on nodes
        workloadMetadataConfig: {
          mode: "GKE_METADATA",
        },
      },
    },
    {
      provider: gcpProvider,
      dependsOn: [cluster],
      // Add custom timeouts to ensure proper initialization
      customTimeouts: {
        create: "20m",
        update: "20m",
        delete: "20m",
      },
    }
  );

  // Generate kubeconfig only after both cluster and node pool are ready
  const kubeconfig = pulumi
    .all([
      cluster.name,
      cluster.endpoint,
      cluster.masterAuth,
      pulumi.output(project),
      pulumi.output(zone),
      nodePool.id, // Ensure node pool is ready
    ])
    .apply(
      ([
        clusterNameValue,
        endpoint,
        masterAuth,
        projectValue,
        zoneValue,
        nodePoolId,
      ]) => {
        pulumi.log.info(
          `Generating kubeconfig for cluster ${clusterNameValue} with node pool ${nodePoolId}`
        );

        // Use the standard GKE context naming convention: gke_project_zone_clustername
        const context = `gke_${projectValue}_${zoneValue}_${clusterNameValue}`;
        // Generate kubeconfig with gke-gcloud-auth-plugin and enhanced authentication
        return `apiVersion: v1
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true
      interactiveMode: Never
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"
      - name: GOOGLE_APPLICATION_CREDENTIALS
        value: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || ""}
      - name: CLOUDSDK_CORE_PROJECT
        value: ${projectValue}
      - name: CLOUDSDK_COMPUTE_ZONE
        value: ${zoneValue}
      - name: CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE
        value: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || ""}`;
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

// Function to look up existing shared GKE cluster and static IP (using Pulumi data sources)
export function lookupSharedGkeClusterSync(
  sharedClusterName: string
): pulumi.Output<ClusterLookupResult> {
  const gcpConfig = new pulumi.Config("gcp");
  const configProject = gcpConfig.require("project");
  const region = gcpConfig.get("region") || "us-central1";
  const zone = gcpConfig.get("zone") || "us-central1-a";

  pulumi.log.info(
    `Looking up shared GKE cluster: ${sharedClusterName} in project: ${configProject}, zone: ${zone}`
  );

  // Look for existing GKE cluster using Pulumi data source
  const clusterLookup = gcp.container
    .getCluster(
      {
        name: sharedClusterName,
        location: zone,
        project: configProject,
      },
      { async: true }
    )
    .then((existingCluster) => {
      if (existingCluster) {
        pulumi.log.info(
          `Found existing shared GKE cluster: ${sharedClusterName}`
        );

        // Look for existing static IP
        return gcp.compute
          .getGlobalAddress(
            {
              name: "rafiki-global-ip",
              project: configProject,
            },
            { async: true }
          )
          .then((existingStaticIp) => {
            const staticIpName = existingStaticIp
              ? existingStaticIp.name
              : undefined;
            if (staticIpName) {
              pulumi.log.info(`Found existing static IP: ${staticIpName}`);
            } else {
              pulumi.log.info(
                "No existing static IP found, will create new one if needed"
              );
            }

            // Generate kubeconfig for existing cluster
            const context = `gke_${configProject}_${zone}_${existingCluster.name}`;
            const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${
      existingCluster.masterAuths?.[0]?.clusterCaCertificate
    }
    server: https://${existingCluster.endpoint}
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"
      - name: GOOGLE_APPLICATION_CREDENTIALS
        value: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || ""}
      - name: CLOUDSDK_CORE_PROJECT
        value: ${configProject}
      - name: CLOUDSDK_COMPUTE_ZONE
        value: ${zone}`;

            return {
              exists: true,
              kubeconfig: kubeconfig,
              clusterName: existingCluster.name,
              staticIpName: staticIpName,
              region: region,
              zone: zone,
              project: configProject,
            };
          })
          .catch(() => {
            // Static IP lookup failed but cluster exists
            const context = `gke_${configProject}_${zone}_${existingCluster.name}`;
            const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${
      existingCluster.masterAuths?.[0]?.clusterCaCertificate
    }
    server: https://${existingCluster.endpoint}
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"
      - name: GOOGLE_APPLICATION_CREDENTIALS
        value: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || ""}
      - name: CLOUDSDK_CORE_PROJECT
        value: ${configProject}
      - name: CLOUDSDK_COMPUTE_ZONE
        value: ${zone}`;

            return {
              exists: true,
              kubeconfig: kubeconfig,
              clusterName: existingCluster.name,
              staticIpName: undefined,
              region: region,
              zone: zone,
              project: configProject,
            };
          });
      } else {
        return {
          exists: false,
          project: configProject,
          region: region,
          zone: zone,
        };
      }
    })
    .catch(() => {
      pulumi.log.info(
        `Shared GKE cluster ${sharedClusterName} not found, will create new one`
      );
      return {
        exists: false,
        project: configProject,
        region: region,
        zone: zone,
      };
    });

  return pulumi.output(clusterLookup);
}

// Function to look up existing shared GKE cluster and static IP
export async function lookupSharedGkeCluster(
  sharedClusterName: string,
  cloudProvider: string = "gcp",
  project?: string
): Promise<ClusterLookupResult> {
  try {
    const gcpConfig = new pulumi.Config("gcp");
    const configProject = project || gcpConfig.require("project");
    const region = gcpConfig.get("region") || "us-central1";
    const zone = gcpConfig.get("zone") || "us-central1-a";

    pulumi.log.info(
      `Looking up shared GKE cluster: ${sharedClusterName} in project: ${configProject}, zone: ${zone}`
    );

    try {
      // Look for existing GKE cluster
      const existingCluster = await gcp.container.getCluster({
        name: sharedClusterName,
        location: zone,
        project: configProject,
      });

      if (existingCluster) {
        pulumi.log.info(
          `Found existing shared GKE cluster: ${sharedClusterName}`
        );

        // Look for existing static IP
        let staticIpName: string | undefined;
        try {
          const existingStaticIp = await gcp.compute.getGlobalAddress({
            name: "rafiki-global-ip",
            project: configProject,
          });
          staticIpName = existingStaticIp.name;
          pulumi.log.info(`Found existing static IP: ${staticIpName}`);
        } catch (ipError) {
          pulumi.log.info(
            "No existing static IP found, will create new one if needed"
          );
        }

        // Generate kubeconfig for existing cluster
        const context = `gke_${configProject}_${zone}_${existingCluster.name}`;
        const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${
      existingCluster.masterAuths?.[0]?.clusterCaCertificate
    }
    server: https://${existingCluster.endpoint}
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"
      - name: GOOGLE_APPLICATION_CREDENTIALS
        value: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || ""}
      - name: CLOUDSDK_CORE_PROJECT
        value: ${configProject}
      - name: CLOUDSDK_COMPUTE_ZONE
        value: ${zone}`;

        return {
          exists: true,
          kubeconfig: kubeconfig,
          clusterName: existingCluster.name,
          staticIpName: staticIpName,
          region: region,
          zone: zone,
          project: configProject,
        };
      }
    } catch (error) {
      pulumi.log.info(
        `Shared GKE cluster ${sharedClusterName} not found, will create new one`
      );
    }

    return {
      exists: false,
      project: configProject,
      region: region,
      zone: zone,
    };
  } catch (error) {
    pulumi.log.warn(`Error looking up shared GKE cluster: ${error}`);
    return {
      exists: false,
    };
  }
}

// Function to look up or create static IP for shared deployments
export function getOrCreateStaticIp(
  name: string,
  project: string,
  gcpProvider: gcp.Provider
) {
  try {
    // Try to get existing static IP
    const existingIp = gcp.compute.getGlobalAddress({
      name: name,
      project: project,
    });

    return existingIp.then((ip) => {
      pulumi.log.info(`Using existing static IP: ${ip.name}`);
      return {
        name: ip.name,
        address: ip.address,
      };
    });
  } catch (error) {
    // Create new static IP if it doesn't exist
    pulumi.log.info(`Creating new static IP: ${name}`);
    const staticIp = new gcp.compute.GlobalAddress(
      name,
      {
        project: project,
        description: "Static IP for shared GKE Ingress",
      },
      { provider: gcpProvider }
    );

    return {
      name: staticIp.name,
      address: staticIp.address,
    };
  }
}
