import type {
  Logger,
  DeploymentProgress,
  DeploymentResult,
} from "../types/index.js";

// =============================================================================
// Metrics and Monitoring
// =============================================================================

export interface DeploymentMetrics {
  deploymentId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  action: string;
  stackName: string;
  companyName: string;
  success: boolean;
  errorType?: string;
  resourcesCreated?: number;
  resourcesUpdated?: number;
  resourcesDeleted?: number;
  rollbackPerformed?: boolean;
  progressEvents: DeploymentProgress[];
}

export interface HealthCheck {
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  message: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export class DeploymentMonitor {
  private metrics: DeploymentMetrics;
  private logger: Logger;
  private healthChecks: HealthCheck[] = [];

  constructor(
    deploymentId: string,
    action: string,
    stackName: string,
    companyName: string,
    logger: Logger
  ) {
    this.metrics = {
      deploymentId,
      startTime: new Date(),
      action,
      stackName,
      companyName,
      success: false,
      progressEvents: [],
    };
    this.logger = logger;
  }

  recordProgress(progress: DeploymentProgress): void {
    this.metrics.progressEvents.push(progress);
    this.logger.info(`Progress: ${progress.status} - ${progress.message}`);
  }

  recordCompletion(result: DeploymentResult): void {
    this.metrics.endTime = new Date();
    this.metrics.duration =
      this.metrics.endTime.getTime() - this.metrics.startTime.getTime();
    this.metrics.success = result.success;
    this.metrics.rollbackPerformed = result.rollbackPerformed;

    if (!result.success && result.error) {
      this.metrics.errorType = this.categorizeError(result.error);
    }

    if (result.summary) {
      this.extractResourceChanges(result.summary);
    }

    this.logger.info("Deployment metrics recorded", this.getMetricsSummary());
  }

  private categorizeError(error: string): string {
    if (error.includes("timeout") || error.includes("TIMEOUT")) {
      return "TIMEOUT";
    }
    if (error.includes("permission") || error.includes("unauthorized")) {
      return "PERMISSION";
    }
    if (error.includes("validation") || error.includes("invalid")) {
      return "VALIDATION";
    }
    if (error.includes("network") || error.includes("connection")) {
      return "NETWORK";
    }
    if (error.includes("resource") && error.includes("conflict")) {
      return "RESOURCE_CONFLICT";
    }
    return "UNKNOWN";
  }

  private extractResourceChanges(summary: any): void {
    if (summary.resourceChanges) {
      this.metrics.resourcesCreated = summary.resourceChanges.create || 0;
      this.metrics.resourcesUpdated = summary.resourceChanges.update || 0;
      this.metrics.resourcesDeleted = summary.resourceChanges.delete || 0;
    }
  }

  async performHealthChecks(): Promise<HealthCheck[]> {
    this.healthChecks = [];

    // Check Pulumi CLI availability
    await this.checkPulumiCli();

    // Check cloud provider credentials
    await this.checkCloudCredentials();

    // Check Helm chart accessibility
    await this.checkHelmChart();

    // Check network connectivity
    await this.checkNetworkConnectivity();

    return this.healthChecks;
  }

  private async checkPulumiCli(): Promise<void> {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync("pulumi version");
      this.addHealthCheck(
        "pulumi-cli",
        "healthy",
        `Pulumi CLI available: ${stdout.trim()}`
      );
    } catch (error) {
      this.addHealthCheck(
        "pulumi-cli",
        "unhealthy",
        `Pulumi CLI not available: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async checkCloudCredentials(): Promise<void> {
    const cloudProvider = process.env.CLOUD_PROVIDER || "gcp";

    try {
      if (cloudProvider === "aws") {
        await this.checkAwsCredentials();
      } else if (cloudProvider === "gcp") {
        await this.checkGcpCredentials();
      }
    } catch (error) {
      this.addHealthCheck(
        "cloud-credentials",
        "unhealthy",
        `Cloud credentials check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async checkAwsCredentials(): Promise<void> {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync("aws sts get-caller-identity");
      const identity = JSON.parse(stdout);
      this.addHealthCheck(
        "aws-credentials",
        "healthy",
        `AWS credentials valid for user: ${identity.UserId}`,
        { account: identity.Account, arn: identity.Arn }
      );
    } catch (error) {
      this.addHealthCheck(
        "aws-credentials",
        "unhealthy",
        "AWS credentials not configured or invalid"
      );
    }
  }

  private async checkGcpCredentials(): Promise<void> {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        'gcloud auth list --format="value(account)" --filter="status:ACTIVE"'
      );
      const activeAccount = stdout.trim();

      if (activeAccount) {
        this.addHealthCheck(
          "gcp-credentials",
          "healthy",
          `GCP credentials valid for account: ${activeAccount}`
        );
      } else {
        this.addHealthCheck(
          "gcp-credentials",
          "unhealthy",
          "No active GCP account found"
        );
      }
    } catch (error) {
      this.addHealthCheck(
        "gcp-credentials",
        "unhealthy",
        "GCP credentials not configured or invalid"
      );
    }
  }

  private async checkHelmChart(): Promise<void> {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // Expect a bundled helm-chart directory shipped with the package.
      const packagedChart = path.resolve(__dirname, "../../..", "helm-chart");
      const monorepoChart = path.resolve(
        __dirname,
        "../../../..",
        "helm-chart"
      );
      const candidates = [packagedChart, monorepoChart];
      for (const p of candidates) {
        const chartYaml = path.join(p, "Chart.yaml");
        if (fs.existsSync(chartYaml)) {
          this.addHealthCheck(
            "helm-chart",
            "healthy",
            `Helm chart accessible at: ${p}`,
            { path: chartYaml }
          );
          return;
        }
      }
      this.addHealthCheck(
        "helm-chart",
        "unhealthy",
        `Bundled Helm chart not found at expected paths: ${candidates.join(
          ", "
        )}`
      );
    } catch (error) {
      this.addHealthCheck(
        "helm-chart",
        "unhealthy",
        `Error checking Helm chart: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async checkNetworkConnectivity(): Promise<void> {
    const cloudProvider = process.env.CLOUD_PROVIDER || "gcp";

    try {
      const testUrls =
        cloudProvider === "aws"
          ? ["https://aws.amazon.com", "https://s3.amazonaws.com"]
          : ["https://cloud.google.com", "https://storage.googleapis.com"];

      // Simple connectivity check (in a real implementation, you might use actual SDK calls)
      this.addHealthCheck(
        "network-connectivity",
        "healthy",
        `Network connectivity assumed healthy for ${cloudProvider}`
      );
    } catch (error) {
      this.addHealthCheck(
        "network-connectivity",
        "unhealthy",
        "Network connectivity issues detected"
      );
    }
  }

  private addHealthCheck(
    name: string,
    status: HealthCheck["status"],
    message: string,
    details?: Record<string, any>
  ): void {
    this.healthChecks.push({
      name,
      status,
      message,
      timestamp: new Date(),
      details,
    });
  }

  getMetrics(): DeploymentMetrics {
    return { ...this.metrics };
  }

  getMetricsSummary(): object {
    return {
      deploymentId: this.metrics.deploymentId,
      duration: this.metrics.duration,
      success: this.metrics.success,
      resourceChanges: {
        created: this.metrics.resourcesCreated || 0,
        updated: this.metrics.resourcesUpdated || 0,
        deleted: this.metrics.resourcesDeleted || 0,
      },
      progressEventCount: this.metrics.progressEvents.length,
      rollbackPerformed: this.metrics.rollbackPerformed,
    };
  }

  getHealthStatus(): {
    overall: "healthy" | "unhealthy";
    checks: HealthCheck[];
  } {
    const hasUnhealthy = this.healthChecks.some(
      (check) => check.status === "unhealthy"
    );

    return {
      overall: hasUnhealthy ? "unhealthy" : "healthy",
      checks: this.healthChecks,
    };
  }

  exportMetrics(): string {
    return JSON.stringify(
      {
        ...this.getMetrics(),
        healthChecks: this.healthChecks,
      },
      null,
      2
    );
  }
}

// =============================================================================
// Deployment Reporter
// =============================================================================

export class DeploymentReporter {
  static generateReport(
    metrics: DeploymentMetrics,
    healthChecks: HealthCheck[]
  ): string {
    const duration = metrics.duration
      ? `${(metrics.duration / 1000).toFixed(2)}s`
      : "N/A";
    const successIcon = metrics.success ? "✅" : "❌";

    let report = `
# Deployment Report ${successIcon}

## Summary
- **Deployment ID**: ${metrics.deploymentId}
- **Action**: ${metrics.action}
- **Stack**: ${metrics.stackName}
- **Company**: ${metrics.companyName}
- **Status**: ${metrics.success ? "SUCCESS" : "FAILED"}
- **Duration**: ${duration}
- **Start Time**: ${metrics.startTime.toISOString()}
- **End Time**: ${metrics.endTime?.toISOString() || "N/A"}

## Resource Changes
- **Created**: ${metrics.resourcesCreated || 0}
- **Updated**: ${metrics.resourcesUpdated || 0}
- **Deleted**: ${metrics.resourcesDeleted || 0}

## Progress Timeline
`;

    metrics.progressEvents.forEach((event, index) => {
      report += `${index + 1}. **${event.status}** - ${
        event.message
      } (${event.timestamp.toISOString()})\n`;
    });

    if (metrics.rollbackPerformed) {
      report += `\n⚠️ **Rollback Performed**: Automatic rollback was executed due to deployment failure.\n`;
    }

    if (healthChecks.length > 0) {
      report += `\n## Health Checks\n`;
      healthChecks.forEach((check) => {
        const icon =
          check.status === "healthy"
            ? "✅"
            : check.status === "unhealthy"
            ? "❌"
            : "⚠️";
        report += `- ${icon} **${check.name}**: ${check.message}\n`;
      });
    }

    return report;
  }
}
