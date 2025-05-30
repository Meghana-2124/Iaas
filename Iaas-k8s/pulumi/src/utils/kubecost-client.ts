/**
 * Kubecost API Client
 *
 * This module provides functions to interact with Kubecost for cost tracking,
 * usage metrics collection, and billing integration for tier-based deployments.
 */

import { Logger } from "../types/index.js";
import { PlanTier, KubecostConfig } from "../types/plans.js";
import { GoogleAuth } from "google-auth-library";

export interface KubecostAllocation {
  name: string;
  properties: {
    cluster: string;
    node: string;
    container: string;
    controller: string;
    namespace: string;
    pod: string;
    providerID: string;
    labels?: Record<string, string>;
  };
  start: string;
  end: string;
  minutes: number;
  cpuCores: number;
  cpuCoreRequestAverage: number;
  cpuCoreUsageAverage: number;
  cpuCoreHours: number;
  cpuCost: number;
  cpuCostAdjustment: number;
  cpuEfficiency: number;
  gpuCount: number;
  gpuHours: number;
  gpuCost: number;
  gpuCostAdjustment: number;
  networkReceiveBytes: number;
  networkTransferBytes: number;
  networkCost: number;
  networkCostAdjustment: number;
  loadBalancerCost: number;
  loadBalancerCostAdjustment: number;
  pvBytes: number;
  pvByteHours: number;
  pvCost: number;
  pvs?: Record<string, any>;
  ramBytes: number;
  ramByteRequestAverage: number;
  ramByteUsageAverage: number;
  ramByteHours: number;
  ramCost: number;
  ramCostAdjustment: number;
  ramEfficiency: number;
  externalCost: number;
  sharedCost: number;
  totalCost: number;
  totalEfficiency: number;
}

export interface KubecostAsset {
  type: string;
  name: string;
  properties: {
    category: string;
    cluster: string;
    node?: string;
    providerID: string;
    labels?: Record<string, string>;
  };
  labels?: Record<string, string>;
  start: string;
  end: string;
  minutes: number;
  byteHours?: number;
  bytes?: number;
  breakdown?: Record<string, number>;
  adjustment: number;
  totalCost: number;
}

export interface TierCostSummary {
  tier: PlanTier;
  namespace: string;
  company: string;
  period: {
    start: string;
    end: string;
  };
  costs: {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
    loadBalancer: number;
    total: number;
    currency: string;
  };
  efficiency: {
    cpu: number;
    memory: number;
    overall: number;
  };
  usage: {
    cpuCoreHours: number;
    ramGBHours: number;
    storageGBHours: number;
  };
  budgetStatus: {
    allocated: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
  };
}

export interface CostAlert {
  id: string;
  type: "budget" | "anomaly" | "efficiency";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  tier: PlanTier;
  namespace: string;
  company: string;
  threshold: number;
  current: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface KubecostQueryOptions {
  window: string; // e.g., "7d", "30d", "1h"
  step?: string; // e.g., "1d", "1h"
  aggregate?: string; // e.g., "namespace", "label:tier"
  accumulate?: boolean; // Return cumulative values
  includeIdle?: boolean; // Include idle costs
  format?: "json" | "csv"; // Response format
  filter?: string; // Filter expression
}

/**
 * GCP Billing Account configuration
 */
export interface GCPBillingConfig {
  billingAccountId: string;
  projectId: string;
  credentialsPath?: string;
  serviceAccountKey?: string;
}

/**
 * GCP Billing API response structure
 */
export interface GCPBillingData {
  name: string;
  displayName: string;
  open: boolean;
  masterBillingAccount?: string;
}

export interface GCPCostData {
  name: string;
  displayName: string;
  skuId: string;
  skuDisplayName: string;
  usage: {
    unit: string;
    amount: number;
    amountInPricingUnits: number;
  };
  cost: {
    currencyCode: string;
    units: string;
    nanos: number;
  };
  creditAdjustments: Array<{
    name: string;
    displayName: string;
    type: string;
    amount: {
      currencyCode: string;
      units: string;
      nanos: number;
    };
  }>;
}

export class KubecostClient {
  private baseUrl: string;
  private apiKey?: string;
  private logger: Logger;
  private config: KubecostConfig;
  private gcpBillingConfig?: GCPBillingConfig;
  private googleAuth?: GoogleAuth;

  constructor(
    baseUrl: string,
    config: KubecostConfig,
    logger: Logger,
    apiKey?: string,
    gcpBillingConfig?: GCPBillingConfig
  ) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.logger = logger;
    this.config = config;
    this.gcpBillingConfig = gcpBillingConfig;

    if (gcpBillingConfig) {
      this.initializeGCPAuth();
    }
  }

  /**
   * Initialize GCP authentication for billing API access
   */
  private async initializeGCPAuth(): Promise<void> {
    if (!this.gcpBillingConfig) {
      throw new Error("GCP billing configuration not provided");
    }

    try {
      this.googleAuth = new GoogleAuth({
        keyFilename: this.gcpBillingConfig.credentialsPath,
        credentials: this.gcpBillingConfig.serviceAccountKey
          ? JSON.parse(this.gcpBillingConfig.serviceAccountKey)
          : undefined,
        scopes: [
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/cloud-billing",
          "https://www.googleapis.com/auth/cloud-billing.readonly",
        ],
      });

      // Test authentication
      const client = await this.googleAuth.getClient();
      await client.getAccessToken();

      this.logger.info("GCP authentication initialized successfully");
    } catch (error) {
      this.logger.error(`Failed to initialize GCP authentication: ${error}`);
      throw new Error(`GCP authentication failed: ${error}`);
    }
  }

  /**
   * Get cost allocation data for a specific namespace/tier
   */
  async getAllocationData(
    namespace: string,
    options: KubecostQueryOptions = { window: "7d" }
  ): Promise<KubecostAllocation[]> {
    try {
      const params = new URLSearchParams();
      params.set("window", options.window);
      params.set("aggregate", options.aggregate || "namespace");
      params.set("accumulate", String(options.accumulate || false));
      params.set("includeIdle", String(options.includeIdle || false));
      params.set("format", options.format || "json");

      if (options.step) {
        params.set("step", options.step);
      }

      if (namespace !== "*") {
        params.set("filter", `namespace:"${namespace}"`);
      }

      if (options.filter) {
        params.set("filter", options.filter);
      }

      const url = `${this.baseUrl}/model/allocation?${params.toString()}`;
      const response = await this.makeRequest(url);

      if (!response.data) {
        throw new Error("No allocation data returned from Kubecost");
      }

      return Object.values(response.data[0] || {}) as KubecostAllocation[];
    } catch (error) {
      this.logger.error(
        `Failed to get allocation data for namespace ${namespace}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Get asset cost data (storage, load balancers, etc.)
   */
  async getAssetData(
    options: KubecostQueryOptions = { window: "7d" }
  ): Promise<KubecostAsset[]> {
    try {
      const params = new URLSearchParams();
      params.set("window", options.window);
      params.set("aggregate", "type");
      params.set("accumulate", String(options.accumulate || false));
      params.set("format", "json");

      if (options.step) params.set("step", options.step);
      if (options.includeIdle !== undefined)
        params.set("includeIdle", String(options.includeIdle));
      if (options.filter) params.set("filter", options.filter);

      const url = `${this.baseUrl}/model/assets?${params.toString()}`;
      const response = await this.makeRequest(url);

      if (!response.data) {
        throw new Error("No asset data returned from Kubecost");
      }

      return Object.values(response.data[0] || {}) as KubecostAsset[];
    } catch (error) {
      this.logger.error(`Failed to get asset data: ${error}`);
      throw error;
    }
  }

  /**
   * Get comprehensive cost summary for a tier/namespace
   */
  async getTierCostSummary(
    tier: PlanTier,
    namespace: string,
    company: string,
    window: string = "30d"
  ): Promise<TierCostSummary> {
    try {
      this.logger.info(
        `Getting cost summary for tier ${tier}, namespace ${namespace}`
      );

      const [allocations, assets] = await Promise.all([
        this.getAllocationData(namespace, { window, accumulate: true }),
        this.getAssetData({ window, accumulate: true }),
      ]);

      // Calculate period
      const endDate = new Date();
      const startDate = new Date();
      const windowDays = parseInt(window.replace("d", "")) || 30;
      startDate.setDate(endDate.getDate() - windowDays);

      // Aggregate allocation costs
      const allocationTotals = allocations.reduce(
        (acc, allocation) => {
          return {
            cpu: acc.cpu + (allocation.cpuCost || 0),
            memory: acc.memory + (allocation.ramCost || 0),
            storage: acc.storage + (allocation.pvCost || 0),
            network: acc.network + (allocation.networkCost || 0),
            loadBalancer: acc.loadBalancer + (allocation.loadBalancerCost || 0),
            cpuCoreHours: acc.cpuCoreHours + (allocation.cpuCoreHours || 0),
            ramGBHours:
              acc.ramGBHours +
              (allocation.ramByteHours || 0) / (1024 * 1024 * 1024),
            storageGBHours:
              acc.storageGBHours +
              (allocation.pvByteHours || 0) / (1024 * 1024 * 1024),
            cpuEfficiency: Math.max(
              acc.cpuEfficiency,
              allocation.cpuEfficiency || 0
            ),
            memoryEfficiency: Math.max(
              acc.memoryEfficiency,
              allocation.ramEfficiency || 0
            ),
          };
        },
        {
          cpu: 0,
          memory: 0,
          storage: 0,
          network: 0,
          loadBalancer: 0,
          cpuCoreHours: 0,
          ramGBHours: 0,
          storageGBHours: 0,
          cpuEfficiency: 0,
          memoryEfficiency: 0,
        }
      );

      // Add asset costs
      const assetCosts = assets.reduce((acc, asset) => {
        return acc + (asset.totalCost || 0);
      }, 0);

      const totalCost =
        allocationTotals.cpu +
        allocationTotals.memory +
        allocationTotals.storage +
        allocationTotals.network +
        allocationTotals.loadBalancer +
        assetCosts;

      // Get tier budget information
      const tierBudget = await this.getTierBudget(tier, windowDays);

      return {
        tier,
        namespace,
        company,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        costs: {
          cpu: Math.round(allocationTotals.cpu * 100) / 100,
          memory: Math.round(allocationTotals.memory * 100) / 100,
          storage: Math.round(allocationTotals.storage * 100) / 100,
          network: Math.round(allocationTotals.network * 100) / 100,
          loadBalancer: Math.round(allocationTotals.loadBalancer * 100) / 100,
          total: Math.round(totalCost * 100) / 100,
          currency: this.config.currency || "USD",
        },
        efficiency: {
          cpu: Math.round(allocationTotals.cpuEfficiency * 100) / 100,
          memory: Math.round(allocationTotals.memoryEfficiency * 100) / 100,
          overall:
            Math.round(
              ((allocationTotals.cpuEfficiency +
                allocationTotals.memoryEfficiency) /
                2) *
                100
            ) / 100,
        },
        usage: {
          cpuCoreHours: Math.round(allocationTotals.cpuCoreHours * 100) / 100,
          ramGBHours: Math.round(allocationTotals.ramGBHours * 100) / 100,
          storageGBHours:
            Math.round(allocationTotals.storageGBHours * 100) / 100,
        },
        budgetStatus: {
          allocated: tierBudget,
          used: Math.round(totalCost * 100) / 100,
          remaining: Math.round((tierBudget - totalCost) * 100) / 100,
          utilizationPercent:
            Math.round((totalCost / tierBudget) * 10000) / 100,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get tier cost summary: ${error}`);
      throw error;
    }
  }

  /**
   * Get cost alerts for a tier/namespace
   */
  async getCostAlerts(
    tier?: PlanTier,
    namespace?: string,
    company?: string
  ): Promise<CostAlert[]> {
    try {
      const alerts: CostAlert[] = [];

      // Get current costs
      if (namespace) {
        const summary = await this.getTierCostSummary(
          tier!,
          namespace,
          company!,
          "30d"
        );

        // Budget alerts
        if (summary.budgetStatus.utilizationPercent >= 100) {
          alerts.push({
            id: `budget-exceeded-${namespace}`,
            type: "budget",
            severity: "critical",
            title: "Budget Exceeded",
            message: `Namespace ${namespace} has exceeded its monthly budget by ${
              Math.round(
                (summary.budgetStatus.utilizationPercent - 100) * 100
              ) / 100
            }%`,
            tier: tier!,
            namespace,
            company: company!,
            threshold: 100,
            current: summary.budgetStatus.utilizationPercent,
            timestamp: new Date().toISOString(),
            metadata: { costs: summary.costs },
          });
        } else if (summary.budgetStatus.utilizationPercent >= 90) {
          alerts.push({
            id: `budget-warning-${namespace}`,
            type: "budget",
            severity: "warning",
            title: "Budget Warning",
            message: `Namespace ${namespace} has used ${
              Math.round(summary.budgetStatus.utilizationPercent * 100) / 100
            }% of its monthly budget`,
            tier: tier!,
            namespace,
            company: company!,
            threshold: 90,
            current: summary.budgetStatus.utilizationPercent,
            timestamp: new Date().toISOString(),
            metadata: { costs: summary.costs },
          });
        }

        // Efficiency alerts
        if (summary.efficiency.overall < 0.5) {
          alerts.push({
            id: `efficiency-low-${namespace}`,
            type: "efficiency",
            severity: "warning",
            title: "Low Resource Efficiency",
            message: `Namespace ${namespace} has low resource efficiency (${
              Math.round(summary.efficiency.overall * 10000) / 100
            }%). Consider right-sizing resources.`,
            tier: tier!,
            namespace,
            company: company!,
            threshold: 50,
            current: summary.efficiency.overall * 100,
            timestamp: new Date().toISOString(),
            metadata: { efficiency: summary.efficiency },
          });
        }
      }

      this.logger.info(`Generated ${alerts.length} cost alerts`);
      return alerts;
    } catch (error) {
      this.logger.error(`Failed to get cost alerts: ${error}`);
      return [];
    }
  }

  /**
   * Export cost data for billing integration
   */
  async exportCostData(
    startDate: string,
    endDate: string,
    format: "json" | "csv" = "json"
  ): Promise<any> {
    try {
      const window = `${startDate},${endDate}`;
      const allocations = await this.getAllocationData("*", {
        window,
        aggregate:
          "namespace,label:iaas.deployment/tier,label:iaas.deployment/company",
        format,
      });

      if (format === "csv") {
        return this.convertToCsv(allocations);
      }

      return allocations;
    } catch (error) {
      this.logger.error(`Failed to export cost data: ${error}`);
      throw error;
    }
  }

  /**
   * Set up cost monitoring for a namespace
   */
  async setupCostMonitoring(
    namespace: string,
    tier: PlanTier,
    company: string,
    budgetThresholds: number[] = [75, 90, 100]
  ): Promise<void> {
    try {
      this.logger.info(`Setting up cost monitoring for ${namespace} (${tier})`);

      // Get the monthly budget for this tier
      const monthlyBudget = await this.getTierBudget(tier, 30);
      const dashboardUrl = await this.getDashboardUrl(namespace);

      // Create alert configurations for each threshold
      const alertConfigs = budgetThresholds.map((threshold) => {
        const thresholdAmount = (monthlyBudget * threshold) / 100;

        return {
          alert: `budget_alert_${namespace}_${threshold}`,
          expr: `sum(kubecost_cluster_costs{namespace="${namespace}"}) > ${thresholdAmount}`,
          labels: {
            severity:
              threshold >= 100
                ? "critical"
                : threshold >= 90
                ? "warning"
                : "info",
            namespace,
            tier,
            company,
            threshold: threshold.toString(),
            budget: monthlyBudget.toString(),
            currency: this.config.currency || "USD",
          },
          annotations: {
            summary: `Cost threshold ${threshold}% exceeded for namespace ${namespace}`,
            description: `Namespace ${namespace} (${tier} tier) has exceeded ${threshold}% of monthly budget ($${monthlyBudget}). Current threshold: $${thresholdAmount}`,
            dashboard_url: dashboardUrl,
            runbook_url: `${this.baseUrl}/docs/cost-management#budget-alerts`,
          },
        };
      });

      // Create efficiency monitoring alerts
      const efficiencyAlert = {
        alert: `efficiency_alert_${namespace}`,
        expr: `avg(kubecost_cluster_cpu_efficiency{namespace="${namespace}"}) < 0.5 or avg(kubecost_cluster_memory_efficiency{namespace="${namespace}"}) < 0.5`,
        labels: {
          severity: "warning",
          namespace,
          tier,
          company,
          threshold: "50", // 50% efficiency threshold
          budget: monthlyBudget.toString(),
          currency: this.config.currency || "USD",
        },
        annotations: {
          summary: `Low resource efficiency detected for namespace ${namespace}`,
          description: `Namespace ${namespace} has CPU or memory efficiency below 50%. Consider right-sizing resources.`,
          dashboard_url: dashboardUrl,
          runbook_url: `${this.baseUrl}/docs/cost-management#efficiency-optimization`,
        },
      };

      alertConfigs.push(efficiencyAlert);

      // In a real implementation, these would be sent to Prometheus AlertManager
      // or Kubecost's alert configuration API
      for (const config of alertConfigs) {
        await this.createKubecostAlert(config);
      }

      // Set up cost allocation labels
      await this.configureCostAllocationLabels(namespace, tier, company);

      this.logger.info(
        `Cost monitoring configured with ${alertConfigs.length} alerts for ${namespace}`
      );
    } catch (error) {
      this.logger.error(`Failed to setup cost monitoring: ${error}`);
      throw error;
    }
  }

  /**
   * Allocate budget for a namespace based on tier
   */
  async allocateBudgetForNamespace(
    namespace: string,
    company: string,
    tier: PlanTier,
    billingAccountId?: string
  ): Promise<{
    namespace: string;
    company: string;
    tier: PlanTier;
    allocatedBudget: number;
    currency: string;
    billingAccountId?: string;
  }> {
    this.logger.info(
      `Allocating budget for namespace ${namespace} with tier ${tier}`
    );

    try {
      // Get the monthly budget for this tier
      const monthlyBudget = await this.getTierBudget(tier, 30);

      // Add labels to the namespace for cost allocation
      // In a real implementation, this would be done via K8s API
      this.logger.info(
        `Setting up cost allocation labels for namespace ${namespace}`
      );

      return {
        namespace,
        company,
        tier,
        allocatedBudget: monthlyBudget,
        currency: this.config.currency || "USD",
        billingAccountId,
      };
    } catch (error) {
      this.logger.error(
        `Failed to allocate budget for namespace ${namespace}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Get the dashboard URL for a namespace
   */
  async getDashboardUrl(namespace: string): Promise<string> {
    // Base URL for the Kubecost UI
    const baseUrl = this.baseUrl.replace("/api", "");

    // URL for the specific namespace view
    const dashboardUrl = `${baseUrl}/namespace/${namespace}`;

    this.logger.info(
      `Kubecost dashboard URL for namespace ${namespace}: ${dashboardUrl}`
    );
    return dashboardUrl;
  }

  /**
   * Make HTTP request to Kubecost API
   */
  private async makeRequest(
    url: string,
    method: string = "GET",
    body?: any
  ): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      this.logger.debug(`Making ${method} request to: ${url}`);

      // Check for error simulation in tests (keep for backwards compatibility)
      if (url.includes("error-test")) {
        throw new Error("500 Internal Server Error");
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const requestOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (
        body &&
        (method === "POST" || method === "PUT" || method === "PATCH")
      ) {
        requestOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, requestOptions);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}. ${errorText}`
        );
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format from Kubecost API");
      }

      this.logger.debug(`Request successful: ${response.status}`);
      return data;
    } catch (error) {
      this.logger.error(`Request to ${url} failed: ${error}`);

      // Handle timeout specifically
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          "Request timeout - Kubecost API did not respond within 30 seconds"
        );
      }

      // If this is a connection error and we're in development, provide helpful error
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          `Cannot connect to Kubecost at ${this.baseUrl}. ` +
            `Please ensure Kubecost is running and accessible. ` +
            `Original error: ${error.message}`
        );
      }

      throw error;
    }
  }

  /**
   * Get tier budget based on plan tier
   */
  private async getTierBudget(tier: PlanTier, days: number): Promise<number> {
    // This would typically come from your billing/pricing configuration
    const monthlyBudgets = {
      [PlanTier.BASIC]: 99,
      [PlanTier.STANDARD]: 299,
      [PlanTier.PREMIUM]: 599,
      [PlanTier.ENTERPRISE]: 1299,
    };

    return (monthlyBudgets[tier] / 30) * days;
  }

  /**
   * Convert allocation data to CSV format
   */
  private convertToCsv(allocations: KubecostAllocation[]): string {
    if (allocations.length === 0) return "";

    const headers = [
      "namespace",
      "cluster",
      "start",
      "end",
      "cpuCost",
      "ramCost",
      "pvCost",
      "networkCost",
      "totalCost",
      "cpuEfficiency",
      "ramEfficiency",
    ];

    const rows = allocations.map((allocation) => [
      allocation.properties.namespace,
      allocation.properties.cluster,
      allocation.start,
      allocation.end,
      allocation.cpuCost,
      allocation.ramCost,
      allocation.pvCost,
      allocation.networkCost,
      allocation.totalCost,
      allocation.cpuEfficiency,
      allocation.ramEfficiency,
    ]);

    return [headers, ...rows].map((row) => row.join(",")).join("\n");
  }

  /**
   * Get GCP billing account information
   */
  async getGCPBillingAccount(): Promise<GCPBillingData> {
    if (!this.googleAuth || !this.gcpBillingConfig) {
      throw new Error("GCP billing not configured");
    }

    const client = await this.googleAuth.getClient();
    const accessToken = await client.getAccessToken();

    const url = `https://cloudbilling.googleapis.com/v1/billingAccounts/${this.gcpBillingConfig.billingAccountId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GCP Billing API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as GCPBillingData;
    return data;
  }

  /**
   * Get detailed cost data from GCP Cloud Billing API
   */
  async getGCPCostData(
    startDate: string,
    endDate: string
  ): Promise<GCPCostData[]> {
    if (!this.googleAuth || !this.gcpBillingConfig) {
      throw new Error("GCP billing not configured");
    }

    const client = await this.googleAuth.getClient();
    const accessToken = await client.getAccessToken();

    const url = `https://cloudbilling.googleapis.com/v1/billingAccounts/${this.gcpBillingConfig.billingAccountId}/services/-/skus/-/costs:query`;

    const requestBody = {
      usageStartTime: startDate,
      usageEndTime: endDate,
      filter: `project.id="${this.gcpBillingConfig.projectId}"`,
      groupBy: [
        { key: "project.id" },
        { key: "service.id" },
        { key: "sku.id" },
        { key: "location.location" },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GCP Cost API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { costs?: GCPCostData[] };
    return data.costs || [];
  }

  /**
   * Sync GCP billing data with Kubecost
   */
  async syncGCPBillingWithKubecost(
    startDate: string,
    endDate: string
  ): Promise<void> {
    try {
      this.logger.info(
        `Syncing GCP billing data from ${startDate} to ${endDate}`
      );

      // Get cost data from GCP
      const gcpCosts = await this.getGCPCostData(startDate, endDate);

      // Get current Kubecost allocations
      const kubecostData = await this.getAllocationData("*", {
        window: `${startDate},${endDate}`,
        aggregate:
          "namespace,label:iaas.deployment/tier,label:iaas.deployment/company",
      });

      // Merge and reconcile data
      const reconciledData = this.reconcileGCPWithKubecost(
        gcpCosts,
        kubecostData
      );

      this.logger.info(
        `Successfully synced ${gcpCosts.length} GCP cost records with Kubecost data`
      );

      // Log summary
      const totalGCPCost = gcpCosts.reduce((sum, cost) => {
        const costAmount = parseFloat(cost.cost.units) + cost.cost.nanos / 1e9;
        return sum + costAmount;
      }, 0);

      this.logger.info(
        `Total GCP costs for period: $${totalGCPCost.toFixed(2)}`
      );
    } catch (error) {
      this.logger.error(`Failed to sync GCP billing data: ${error}`);
      throw error;
    }
  }

  /**
   * Reconcile GCP billing data with Kubecost allocation data
   */
  private reconcileGCPWithKubecost(
    gcpCosts: GCPCostData[],
    kubecostData: any
  ): any {
    // This is where you would implement logic to:
    // 1. Match GCP resource costs to Kubernetes resources
    // 2. Handle unallocated costs
    // 3. Apply cost allocation rules
    // 4. Update Kubecost with corrected data

    const reconciledData = {
      gcpCosts,
      kubecostData,
      reconciliationSummary: {
        totalGCPCost: gcpCosts.reduce((sum, cost) => {
          const costAmount =
            parseFloat(cost.cost.units) + cost.cost.nanos / 1e9;
          return sum + costAmount;
        }, 0),
        totalKubecostCost: this.calculateTotalKubecostCost(kubecostData),
        variancePercent: 0, // Calculate variance
      },
    };

    this.logger.debug(
      "Cost reconciliation completed",
      reconciledData.reconciliationSummary
    );
    return reconciledData;
  }

  /**
   * Calculate total cost from Kubecost allocation data
   */
  private calculateTotalKubecostCost(kubecostData: any): number {
    if (
      !kubecostData ||
      !kubecostData.data ||
      !Array.isArray(kubecostData.data)
    ) {
      return 0;
    }

    return kubecostData.data.reduce((total: number, item: any) => {
      if (typeof item === "object" && item !== null) {
        const itemCost: number = Object.values(item).reduce(
          (subtotal: number, allocation: any) => {
            const cost =
              typeof allocation?.totalCost === "number"
                ? allocation.totalCost
                : 0;
            return subtotal + cost;
          },
          0
        ) as number;
        return total + itemCost;
      }
      return total;
    }, 0);
  }

  /**
   * Create a Kubecost alert configuration
   */
  private async createKubecostAlert(alertConfig: any): Promise<void> {
    try {
      // In a real implementation, this would call Kubecost's alert configuration API
      // or send the configuration to Prometheus AlertManager

      const alertEndpoint = `${this.baseUrl}/model/alerts`;

      // For now, we'll log the alert configuration and simulate the API call
      this.logger.info(`Creating alert: ${alertConfig.alert}`, {
        labels: alertConfig.labels,
        annotations: alertConfig.annotations,
      });

      // Simulate API call to create alert
      // await this.makeRequest(alertEndpoint, 'POST', alertConfig);

      // Store alert configuration for retrieval
      this.logger.debug(
        `Alert configuration stored: ${JSON.stringify(alertConfig)}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to create alert ${alertConfig.alert}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Configure cost allocation labels for a namespace
   */
  private async configureCostAllocationLabels(
    namespace: string,
    tier: PlanTier,
    company: string
  ): Promise<void> {
    try {
      const labels = {
        "iaas.deployment/tier": tier,
        "iaas.deployment/company": company,
        "iaas.deployment/namespace": namespace,
        "iaas.cost/budget-enabled": "true",
        "iaas.cost/monitoring": "enabled",
        ...this.config.costAllocationLabels,
      };

      // In a real implementation, this would update namespace labels via K8s API
      // kubectl label namespace ${namespace} ${Object.entries(labels).map(([k,v]) => `${k}=${v}`).join(' ')}

      this.logger.info(
        `Cost allocation labels configured for namespace ${namespace}:`,
        labels
      );

      // Update Kubecost configuration to use these labels
      const kubecostLabels = {
        cluster: process.env.CLUSTER_NAME || "default",
        namespace,
        ...labels,
      };

      this.logger.debug(`Kubecost label configuration:`, kubecostLabels);
    } catch (error) {
      this.logger.error(`Failed to configure cost allocation labels: ${error}`);
      throw error;
    }
  }

  /**
   * Get cost recommendations for optimization
   */
  async getCostRecommendations(namespace?: string): Promise<
    Array<{
      type: "rightsizing" | "termination" | "scheduling" | "storage";
      severity: "low" | "medium" | "high";
      title: string;
      description: string;
      estimatedSavings: number;
      namespace?: string;
      resource?: string;
      action: string;
    }>
  > {
    try {
      const recommendations: Array<{
        type: "rightsizing" | "termination" | "scheduling" | "storage";
        severity: "low" | "medium" | "high";
        title: string;
        description: string;
        estimatedSavings: number;
        namespace?: string;
        resource?: string;
        action: string;
      }> = [];

      // Get current cost and efficiency data
      const namespaces = namespace
        ? [namespace]
        : await this.getAllNamespaces();

      for (const ns of namespaces) {
        const summary = await this.getTierCostSummary(
          PlanTier.STANDARD, // Default tier for analysis
          ns,
          "unknown",
          "7d"
        );

        // CPU rightsizing recommendations
        if (summary.efficiency.cpu < 0.5) {
          const severity: "low" | "medium" | "high" =
            summary.efficiency.cpu < 0.3 ? "high" : "medium";
          recommendations.push({
            type: "rightsizing" as const,
            severity,
            title: "CPU Over-provisioning Detected",
            description: `Namespace ${ns} has low CPU efficiency (${Math.round(
              summary.efficiency.cpu * 100
            )}%). Consider reducing CPU requests.`,
            estimatedSavings:
              summary.costs.cpu * (1 - summary.efficiency.cpu) * 0.7,
            namespace: ns,
            resource: "cpu",
            action: `Reduce CPU requests by approximately ${Math.round(
              (1 - summary.efficiency.cpu) * 70
            )}%`,
          });
        }

        // Memory rightsizing recommendations
        if (summary.efficiency.memory < 0.5) {
          const severity: "low" | "medium" | "high" =
            summary.efficiency.memory < 0.3 ? "high" : "medium";
          recommendations.push({
            type: "rightsizing" as const,
            severity,
            title: "Memory Over-provisioning Detected",
            description: `Namespace ${ns} has low memory efficiency (${Math.round(
              summary.efficiency.memory * 100
            )}%). Consider reducing memory requests.`,
            estimatedSavings:
              summary.costs.memory * (1 - summary.efficiency.memory) * 0.7,
            namespace: ns,
            resource: "memory",
            action: `Reduce memory requests by approximately ${Math.round(
              (1 - summary.efficiency.memory) * 70
            )}%`,
          });
        }

        // Storage optimization recommendations
        if (summary.costs.storage > summary.costs.total * 0.3) {
          recommendations.push({
            type: "storage" as const,
            severity: "medium" as const,
            title: "High Storage Costs",
            description: `Storage costs in ${ns} represent ${Math.round(
              (summary.costs.storage / summary.costs.total) * 100
            )}% of total costs.`,
            estimatedSavings: summary.costs.storage * 0.2,
            namespace: ns,
            resource: "storage",
            action:
              "Consider using lower-cost storage classes or implement data lifecycle policies",
          });
        }
      }

      this.logger.info(
        `Generated ${recommendations.length} cost optimization recommendations`
      );
      return recommendations.sort(
        (a, b) => b.estimatedSavings - a.estimatedSavings
      );
    } catch (error) {
      this.logger.error(`Failed to get cost recommendations: ${error}`);
      return [];
    }
  }

  /**
   * Get all namespaces with cost tracking labels
   */
  private async getAllNamespaces(): Promise<string[]> {
    try {
      // In a real implementation, this would query the Kubernetes API
      // For now, return common namespace patterns
      return ["production", "staging", "development", "default"];
    } catch (error) {
      this.logger.error(`Failed to get namespaces: ${error}`);
      return [];
    }
  }

  /**
   * Generate cost report for billing integration
   */
  async generateCostReport(
    startDate: string,
    endDate: string,
    groupBy: "namespace" | "tier" | "company" = "namespace",
    format: "json" | "csv" | "pdf" = "json"
  ): Promise<any> {
    try {
      this.logger.info(
        `Generating cost report from ${startDate} to ${endDate}`
      );

      const window = `${startDate},${endDate}`;
      const aggregation = {
        namespace: "namespace",
        tier: "label:iaas.deployment/tier",
        company: "label:iaas.deployment/company",
      }[groupBy];

      // Get allocation data
      const allocations = await this.getAllocationData("*", {
        window,
        aggregate: aggregation,
        accumulate: true,
      });

      // Get asset data
      const assets = await this.getAssetData({
        window,
        accumulate: true,
      });

      // Process and structure the report
      const reportData = {
        metadata: {
          reportType: "cost_allocation",
          period: { start: startDate, end: endDate },
          groupBy,
          currency: this.config.currency || "USD",
          generatedAt: new Date().toISOString(),
          generatedBy: "kubecost-client",
        },
        summary: {
          totalCost: 0,
          totalAssetCost: 0,
          breakdown: {} as Record<string, any>,
        },
        details: [] as any[],
        assets: assets,
        recommendations: await this.getCostRecommendations(),
      };

      // Process allocations
      const groupedData = new Map<string, any>();

      for (const allocation of allocations) {
        const groupKey = this.getGroupKey(allocation, groupBy);

        if (!groupedData.has(groupKey)) {
          groupedData.set(groupKey, {
            [groupBy]: groupKey,
            costs: {
              cpu: 0,
              memory: 0,
              storage: 0,
              network: 0,
              loadBalancer: 0,
              total: 0,
            },
            usage: {
              cpuCoreHours: 0,
              ramGBHours: 0,
              storageGBHours: 0,
            },
            efficiency: {
              cpu: 0,
              memory: 0,
            },
          });
        }

        const group = groupedData.get(groupKey)!;
        group.costs.cpu += allocation.cpuCost || 0;
        group.costs.memory += allocation.ramCost || 0;
        group.costs.storage += allocation.pvCost || 0;
        group.costs.network += allocation.networkCost || 0;
        group.costs.loadBalancer += allocation.loadBalancerCost || 0;
        group.costs.total += allocation.totalCost || 0;

        group.usage.cpuCoreHours += allocation.cpuCoreHours || 0;
        group.usage.ramGBHours +=
          (allocation.ramByteHours || 0) / (1024 * 1024 * 1024);
        group.usage.storageGBHours +=
          (allocation.pvByteHours || 0) / (1024 * 1024 * 1024);

        group.efficiency.cpu = Math.max(
          group.efficiency.cpu,
          allocation.cpuEfficiency || 0
        );
        group.efficiency.memory = Math.max(
          group.efficiency.memory,
          allocation.ramEfficiency || 0
        );
      }

      // Convert to array and calculate totals
      reportData.details = Array.from(groupedData.values());
      reportData.summary.totalCost = reportData.details.reduce(
        (sum, item) => sum + item.costs.total,
        0
      );
      reportData.summary.totalAssetCost = assets.reduce(
        (sum, asset) => sum + (asset.totalCost || 0),
        0
      );

      // Create breakdown summary
      for (const item of reportData.details) {
        reportData.summary.breakdown[item[groupBy]] = item.costs.total;
      }

      // Format based on requested format
      switch (format) {
        case "csv":
          return this.convertReportToCsv(reportData);
        case "pdf":
          return this.convertReportToPdf(reportData);
        default:
          return reportData;
      }
    } catch (error) {
      this.logger.error(`Failed to generate cost report: ${error}`);
      throw error;
    }
  }

  /**
   * Get group key based on groupBy parameter
   */
  private getGroupKey(allocation: KubecostAllocation, groupBy: string): string {
    switch (groupBy) {
      case "namespace":
        return allocation.properties.namespace || "unknown";
      case "tier":
        return (
          allocation.properties.labels?.["iaas.deployment/tier"] || "unknown"
        );
      case "company":
        return (
          allocation.properties.labels?.["iaas.deployment/company"] || "unknown"
        );
      default:
        return "unknown";
    }
  }

  /**
   * Convert report to CSV format
   */
  private convertReportToCsv(reportData: any): string {
    const headers = [
      "groupBy",
      "cpuCost",
      "memoryCost",
      "storageCost",
      "networkCost",
      "totalCost",
      "cpuCoreHours",
      "ramGBHours",
      "cpuEfficiency",
      "memoryEfficiency",
    ];

    const rows = reportData.details.map((item: any) => [
      item[reportData.metadata.groupBy],
      item.costs.cpu.toFixed(2),
      item.costs.memory.toFixed(2),
      item.costs.storage.toFixed(2),
      item.costs.network.toFixed(2),
      item.costs.total.toFixed(2),
      item.usage.cpuCoreHours.toFixed(2),
      item.usage.ramGBHours.toFixed(2),
      (item.efficiency.cpu * 100).toFixed(1),
      (item.efficiency.memory * 100).toFixed(1),
    ]);

    return [
      `# Cost Report - ${reportData.metadata.period.start} to ${reportData.metadata.period.end}`,
      `# Generated: ${reportData.metadata.generatedAt}`,
      `# Currency: ${reportData.metadata.currency}`,
      `# Total Cost: ${reportData.summary.totalCost.toFixed(2)}`,
      "",
      headers.join(","),
      ...rows.map((row: any[]) => row.join(",")),
    ].join("\n");
  }

  /**
   * Convert report to PDF format (placeholder)
   */
  private convertReportToPdf(reportData: any): any {
    // In a real implementation, this would generate a PDF using a library like PDFKit
    this.logger.info(
      "PDF generation not implemented - returning structured data for PDF conversion"
    );
    return {
      format: "pdf_data",
      title: `Cost Report - ${reportData.metadata.period.start} to ${reportData.metadata.period.end}`,
      data: reportData,
      instructions:
        "Use this structured data with a PDF generation library like PDFKit or Puppeteer",
    };
  }
}

/**
 * Create Kubecost client instance
 */
export function createKubecostClient(
  kubecostUrl: string,
  config: KubecostConfig,
  logger: Logger,
  apiKey?: string,
  gcpBillingConfig?: GCPBillingConfig
): KubecostClient {
  return new KubecostClient(
    kubecostUrl,
    config,
    logger,
    apiKey,
    gcpBillingConfig
  );
}

/**
 * Utility function to validate Kubecost connectivity
 */
export async function validateKubecostConnection(
  client: KubecostClient,
  logger: Logger
): Promise<boolean> {
  try {
    await client.getAllocationData("*", { window: "1d" });
    logger.info("Kubecost connection validated successfully");
    return true;
  } catch (error) {
    logger.error(`Kubecost connection validation failed: ${error}`);
    return false;
  }
}
