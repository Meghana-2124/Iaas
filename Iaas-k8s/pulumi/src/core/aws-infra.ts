import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi"; // Added for pulumi.log
import { ClusterLookupResult } from "../types/index.js";

// Define configurations for different environments
interface EksConfig {
  instanceType: pulumi.Input<string>;
  desiredCapacity: pulumi.Input<number>;
  minSize: pulumi.Input<number>;
  maxSize: pulumi.Input<number>;
}

const devConfig: EksConfig = {
  instanceType: "t3.medium",
  desiredCapacity: 2,
  minSize: 1,
  maxSize: 3,
};

const prodConfig: EksConfig = {
  instanceType: "m5.large", // Larger instance type for production
  desiredCapacity: 3, // More nodes for production
  minSize: 2,
  maxSize: 5,
};

// Function to create an EKS cluster
export function createEksCluster(name: string, stack: string) {
  const config = stack === "prod" ? prodConfig : devConfig;
  pulumi.log.info(
    `Using ${stack} configuration for EKS cluster. Instance type: ${config.instanceType}`
  );

  // Create a VPC for our cluster.
  const vpc = new awsx.ec2.Vpc(`${name}-vpc`, {
    numberOfAvailabilityZones: 2, // Configure as needed
  });

  // Create an EKS cluster with the default configuration.
  const cluster = new eks.Cluster(`${name}-cluster`, {
    vpcId: vpc.vpcId,
    subnetIds: vpc.privateSubnetIds, // Use private subnets for EKS workers
    instanceType: config.instanceType, // Use stack-specific instance type
    desiredCapacity: config.desiredCapacity, // Use stack-specific desired capacity
    minSize: config.minSize, // Use stack-specific min size
    maxSize: config.maxSize, // Use stack-specific max size
    storageClasses: "gp2", // Default storage class
  });

  return {
    kubeconfig: cluster.kubeconfig,
    vpcId: vpc.vpcId,
    clusterName: cluster.eksCluster.name, // Export the EKS cluster name
    region: aws.getRegion().then((r) => r.name),
  };
}

// Function to look up existing shared EKS cluster (using Pulumi data sources)
export function lookupSharedEksClusterSync(
  sharedClusterName: string,
  cloudProvider: string = "aws",
  project?: string
): pulumi.Output<ClusterLookupResult> {
  const region = aws.getRegion().then((r) => r.name);

  // Look for existing EKS cluster using Pulumi data source
  const clusterLookup = aws.eks
    .getCluster(
      {
        name: sharedClusterName,
      },
      { async: true }
    )
    .then((existingCluster) => {
      if (existingCluster) {
        pulumi.log.info(
          `Found existing shared EKS cluster: ${sharedClusterName}`
        );

        // Generate kubeconfig for existing cluster
        const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${existingCluster.certificateAuthorities?.[0]?.data}
    server: ${existingCluster.endpoint}
  name: ${sharedClusterName}
contexts:
- context:
    cluster: ${sharedClusterName}
    user: ${sharedClusterName}
  name: ${sharedClusterName}
current-context: ${sharedClusterName}
kind: Config
preferences: {}
users:
- name: ${sharedClusterName}
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: aws
      args:
        - eks
        - get-token
        - --cluster-name
        - ${sharedClusterName}
        - --region
        - ${region}`;

        return {
          exists: true,
          kubeconfig: kubeconfig,
          clusterName: existingCluster.name,
          region: region,
        };
      } else {
        return {
          exists: false,
        };
      }
    })
    .catch(() => {
      pulumi.log.info(
        `Shared EKS cluster ${sharedClusterName} not found, will create new one`
      );
      return {
        exists: false,
      };
    });

  return pulumi.output(clusterLookup);
}
