import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import * as pulumi from "@pulumi/pulumi"; // Added for pulumi.log

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
  };
}
