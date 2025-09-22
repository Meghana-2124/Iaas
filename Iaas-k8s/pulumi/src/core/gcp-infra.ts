import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { ClusterLookupResult } from "../types/index.js";

// Simple configurations for different environments
interface GkeConfig {
  machineType: string;
  initialNodeCount: number;
  minNodeCount: number;
  maxNodeCount: number;
}

const devGkeConfig: GkeConfig = {
  machineType: "e2-standard-2",
  initialNodeCount: 2,
  minNodeCount: 2,
  maxNodeCount: 4,
};

const prodGkeConfig: GkeConfig = {
  machineType: "e2-standard-4",
  initialNodeCount: 3,
  minNodeCount: 2,
  maxNodeCount: 6,
};

// Simple GKE cluster creation
export function createGkeCluster(name: string, stack: string) {
  const config = stack === "prod" ? prodGkeConfig : devGkeConfig;
  const gcpConfig = new pulumi.Config("gcp");
  const project = gcpConfig.require("project");
  const region = gcpConfig.get("region") || "us-central1";
  const zone = gcpConfig.get("zone") || "us-central1-a";
  const credentials = gcpConfig.get("credentials");
  const credentialsPath = gcpConfig.get("credentialsPath");

  pulumi.log.info(`Creating simple GKE cluster: ${name} in ${zone}`);
  pulumi.log.info(`Using credentials from: ${JSON.stringify(credentials)}`);
  pulumi.log.info(`Using credentials path from: ${JSON.stringify(credentialsPath)}`);

  // Simple GCP provider
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
  
  // Simple static IP
  const staticIp = new gcp.compute.GlobalAddress(
    "rafiki-global-ip",
    {
      project: project,
      description: "Static IP for GKE Ingress",
    },
    { provider: gcpProvider }
  );

  // Simple GKE cluster - no complexity
  const cluster = new gcp.container.Cluster(
    `${name}-gke-cluster`,
    {
      project: project,
      location: zone,
      initialNodeCount: config.initialNodeCount,
      nodeConfig: {
        machineType: config.machineType,
        oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
      },
      deletionProtection: false,
    },
    { provider: gcpProvider }
  );

  // Simple kubeconfig
  const kubeconfig = pulumi
    .all([cluster.name, cluster.endpoint, cluster.masterAuth])
    .apply(([clusterName, endpoint, masterAuth]) => {
      const context = `gke_${project}_${zone}_${clusterName}`;
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl
      provideClusterInfo: true
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"
      - name: GOOGLE_APPLICATION_CREDENTIALS
        value: "${credentialsPath || ""}"
        `;
    });

  return {
    kubeconfig: kubeconfig,
    clusterName: cluster.name,
    gcpProject: project,
    gcpZone: zone,
    staticIpName: staticIp.name,
  };
}

// Simple shared cluster lookup
export function lookupSharedGkeClusterSync(
  sharedClusterName: string
): pulumi.Output<ClusterLookupResult> {
  const gcpConfig = new pulumi.Config("gcp");
  const project = gcpConfig.require("project");
  const region = gcpConfig.get("region") || "us-central1";
  const zone = gcpConfig.get("zone") || "us-central1-a";

  pulumi.log.info(`Looking up shared GKE cluster: ${sharedClusterName}`);

  const clusterLookup = gcp.container
    .getCluster(
      {
        name: sharedClusterName,
        location: zone,
        project: project,
      },
      { async: true }
    )
    .then((existingCluster) => {
      if (existingCluster) {
        const context = `gke_${project}_${zone}_${existingCluster.name}`;
        const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${existingCluster.masterAuths?.[0]?.clusterCaCertificate}
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl
      provideClusterInfo: true
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"`;

        return {
          exists: true,
          kubeconfig: kubeconfig,
          clusterName: existingCluster.name,
          region: region,
          zone: zone,
          project: project,
        };
      }
      return {
        exists: false,
        project: project,
        region: region,
        zone: zone,
      };
    })
    .catch(() => {
      return {
        exists: false,
        project: project,
        region: region,
        zone: zone,
      };
    });

  return pulumi.output(clusterLookup);
}

// Simple async lookup
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

    const existingCluster = await gcp.container.getCluster({
      name: sharedClusterName,
      location: zone,
      project: configProject,
    });

    if (existingCluster) {
      const context = `gke_${configProject}_${zone}_${existingCluster.name}`;
      const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${existingCluster.masterAuths?.[0]?.clusterCaCertificate}
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
      installHint: Install gke-gcloud-auth-plugin for use with kubectl
      provideClusterInfo: true
      env:
      - name: USE_GKE_GCLOUD_AUTH_PLUGIN
        value: "True"`;

      return {
        exists: true,
        kubeconfig: kubeconfig,
        clusterName: existingCluster.name,
        region: region,
        zone: zone,
        project: configProject,
      };
    }

    return {
      exists: false,
      project: configProject,
      region: region,
      zone: zone,
    };
  } catch (error) {
    return {
      exists: false,
    };
  }
}

// Simple static IP function
export function getOrCreateStaticIp(
  name: string,
  project: string,
  gcpProvider: gcp.Provider
): pulumi.Output<{ name: string; address: string }> {
  const existingIpLookup = gcp.compute
    .getGlobalAddress(
      {
        name: name,
        project: project,
      },
      { async: true }
    )
    .then((ip) => {
      return {
        name: ip.name,
        address: ip.address,
      };
    })
    .catch(() => {
      const staticIp = new gcp.compute.GlobalAddress(
        name,
        {
          project: project,
          description: "Static IP for shared GKE Ingress",
        },
        { provider: gcpProvider }
      );

      return pulumi
        .all([staticIp.name, staticIp.address])
        .apply(([name, address]) => ({
          name,
          address,
        }));
    });

  return pulumi.output(existingIpLookup);
}
