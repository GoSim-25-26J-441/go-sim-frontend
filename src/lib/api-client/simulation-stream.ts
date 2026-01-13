// Server-Sent Events (SSE) streaming client for real-time simulation metrics
// This handles real-time metric updates from the simulation engine

import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { TimeSeriesData, NodeMetrics } from "@/types/simulation";
import { transformBackendRunToSimulationRun } from "./simulation";

export type StreamEventType = 
  | "metrics_update"
  | "status_change"
  | "error"
  | "complete";

export interface StreamEvent {
  type: StreamEventType;
  timestamp: string;
  data: any;
}

export interface MetricsUpdateEvent {
  type: "metrics_update";
  timestamp: string;
  data: {
    time_series?: TimeSeriesData;
    node_metrics?: NodeMetrics[];
    summary?: {
      total_requests?: number;
      successful_requests?: number;
      failed_requests?: number;
      avg_latency_ms?: number;
      p95_latency_ms?: number;
      p99_latency_ms?: number;
      avg_rps?: number;
      peak_rps?: number;
    };
  };
}

export interface StatusChangeEvent {
  type: "status_change";
  timestamp: string;
  data: {
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    message?: string;
  };
}

export interface ErrorEvent {
  type: "error";
  timestamp: string;
  data: {
    error: string;
    code?: string;
  };
}

export interface CompleteEvent {
  type: "complete";
  timestamp: string;
  data: {
    run_id: string;
    final_results?: any;
  };
}

export type SimulationStreamEvent = 
  | MetricsUpdateEvent 
  | StatusChangeEvent 
  | ErrorEvent 
  | CompleteEvent;

export interface SimulationStreamOptions {
  runId: string;
  onMetricsUpdate?: (event: MetricsUpdateEvent) => void;
  onStatusChange?: (event: StatusChangeEvent) => void;
  onError?: (event: ErrorEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
  onConnectionOpen?: () => void;
  onConnectionClose?: () => void;
  onConnectionError?: (error: Error) => void;
  onRawEvent?: (eventType: string, rawData: string, parsedData?: any) => void; // Debug callback for raw events
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * Create an SSE connection to stream simulation metrics in real-time
 * 
 * Expected backend endpoint: GET /api/v1/simulation/runs/{runId}/stream
 * Headers: Authorization: Bearer {token}
 * Content-Type: text/event-stream
 */
export class SimulationStream {
  private eventSource: EventSource | null = null;
  private options: Required<SimulationStreamOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isManuallyClosed = false;
  private metricBuffer: Map<string, any> = new Map();
  private metricsEmitInterval: NodeJS.Timeout | null = null;
  private lastMetricsEmit = 0;

  constructor(options: SimulationStreamOptions) {
    this.options = {
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      ...options,
      onMetricsUpdate: options.onMetricsUpdate ?? (() => {}),
      onStatusChange: options.onStatusChange ?? (() => {}),
      onError: options.onError ?? (() => {}),
      onComplete: options.onComplete ?? (() => {}),
      onConnectionOpen: options.onConnectionOpen ?? (() => {}),
      onConnectionClose: options.onConnectionClose ?? (() => {}),
      onConnectionError: options.onConnectionError ?? (() => {}),
    };
  }

  /**
   * Start the SSE connection
   * Note: EventSource doesn't support custom headers in browsers,
   * so we'll need to use a token query parameter or establish the connection
   * through a Next.js API route that adds the Authorization header
   */
  async connect(): Promise<void> {
    if (this.eventSource) {
      console.warn("Stream already connected");
      return;
    }

    this.isManuallyClosed = false;
    this.reconnectAttempts = 0;

    try {
      // Get Firebase ID token
      const token = await getFirebaseIdToken();
      
      if (!token) {
        throw new Error("No authentication token available");
      }

      // Build the SSE endpoint URL
      // EventSource doesn't support custom headers, so we route through a Next.js API route
      // that proxies the connection and adds the Authorization header server-side
      // Backend endpoint: GET /api/v1/simulation/runs/{id}/events
      const streamUrl = `/api/simulation/${this.options.runId}/events?token=${encodeURIComponent(token)}`;

      // Create EventSource connection
      this.eventSource = new EventSource(streamUrl);

      // Handle connection open
      this.eventSource.onopen = () => {
        if (process.env.NODE_ENV === "development") {
          console.log(`[SimulationStream] Connected to stream for run ${this.options.runId}`);
          console.log(`[SimulationStream] EventSource readyState: ${this.eventSource?.readyState} (OPEN=${EventSource.OPEN})`);
        }
        this.reconnectAttempts = 0;
        this.options.onConnectionOpen();
      };
      
      // Add a listener for ALL event types to debug what's actually being received
      // This will help us see if events are coming through but with different names
      const originalAddEventListener = this.eventSource.addEventListener.bind(this.eventSource);
      const eventTypesReceived = new Set<string>();
      
      // Wrap addEventListener to log all event registrations
      (this.eventSource as any).addEventListener = (type: string, listener: any) => {
        if (process.env.NODE_ENV === "development") {
          console.log(`[SimulationStream] Registering listener for event type: "${type}"`);
        }
        eventTypesReceived.add(type);
        return originalAddEventListener(type, (e: MessageEvent) => {
          if (process.env.NODE_ENV === "development") {
            console.log(`[SimulationStream] Received event type: "${type}"`, e.data?.substring(0, 200));
          }
          listener(e);
        });
      };

      // Handle connection errors
      this.eventSource.onerror = (error) => {
        // Only log errors in development, and only if connection is actually closed
        // EventSource fires onerror even during normal connection attempts
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          // Connection failed - endpoint might not exist (404) or connection lost
          // Log only in development mode
          if (process.env.NODE_ENV === "development") {
            console.warn("[SimulationStream] Stream connection failed. Falling back to polling.");
          }
          
          this.options.onConnectionError(new Error("Stream connection unavailable"));
          
          // Don't attempt reconnect if endpoint doesn't exist (would just keep failing)
          // Only reconnect if we were previously connected
          if (this.reconnectAttempts === 0 && this.options.reconnect && !this.isManuallyClosed) {
            // Give up after first attempt - endpoint likely doesn't exist
            this.options.onConnectionClose();
          } else if (this.options.reconnect && !this.isManuallyClosed) {
            this.scheduleReconnect();
          } else {
            this.options.onConnectionClose();
          }
        }
        // If readyState is CONNECTING, just wait - don't log errors yet
      };

      // Backend sends events with types: "status_change", "metric_update"
      // status_change: { status: "RUN_STATUS_PENDING" | "RUN_STATUS_RUNNING" | ... }
      // metric_update: { labels: {...}, metric: string, timestamp: string, value: number }

      // Reset metric accumulation
      this.metricBuffer.clear();
      this.lastMetricsEmit = Date.now();
      const METRICS_EMIT_INTERVAL = 1000; // Emit aggregated metrics every 1 second

      // Start periodic metrics emission
      if (this.metricsEmitInterval) {
        clearInterval(this.metricsEmitInterval);
      }
      this.metricsEmitInterval = setInterval(() => {
        this.emitAggregatedMetrics();
      }, METRICS_EMIT_INTERVAL);

      // Handle status_change events
      this.eventSource.addEventListener("status_change", (e: MessageEvent) => {
        // Capture raw event for debugging
        if (this.options.onRawEvent) {
          try {
            const parsed = JSON.parse(e.data);
            this.options.onRawEvent("status_change", e.data, parsed);
          } catch (err) {
            this.options.onRawEvent("status_change", e.data);
          }
        }
        
        try {
          const data = JSON.parse(e.data);
          const backendStatus = data.status;
          
          // Transform backend status format to frontend format
          // RUN_STATUS_PENDING -> pending
          // RUN_STATUS_RUNNING -> running
          // RUN_STATUS_COMPLETED -> completed
          // RUN_STATUS_FAILED -> failed
          // RUN_STATUS_CANCELLED -> cancelled
          let frontendStatus: "pending" | "running" | "completed" | "failed" | "cancelled" = "pending";
          if (backendStatus === "RUN_STATUS_PENDING") {
            frontendStatus = "pending";
          } else if (backendStatus === "RUN_STATUS_RUNNING") {
            frontendStatus = "running";
          } else if (backendStatus === "RUN_STATUS_COMPLETED") {
            frontendStatus = "completed";
          } else if (backendStatus === "RUN_STATUS_FAILED") {
            frontendStatus = "failed";
          } else if (backendStatus === "RUN_STATUS_CANCELLED") {
            frontendStatus = "cancelled";
          } else if (typeof backendStatus === "string" && backendStatus.toLowerCase().includes("running")) {
            frontendStatus = "running";
          } else if (typeof backendStatus === "string" && backendStatus.toLowerCase().includes("completed")) {
            frontendStatus = "completed";
          } else if (typeof backendStatus === "string" && backendStatus.toLowerCase().includes("failed")) {
            frontendStatus = "failed";
          } else if (typeof backendStatus === "string" && backendStatus.toLowerCase().includes("cancelled")) {
            frontendStatus = "cancelled";
          } else {
            // Try direct mapping if already in frontend format
            frontendStatus = backendStatus as any;
          }

          this.options.onStatusChange({
            type: "status_change",
            timestamp: new Date().toISOString(),
            data: {
              status: frontendStatus,
            },
          });
          
          // Stop streaming if simulation is no longer running
          if (frontendStatus !== "running" && frontendStatus !== "pending") {
            // Emit any remaining metrics before closing
            this.emitAggregatedMetrics();
            
            this.options.onComplete({
              type: "complete",
              timestamp: new Date().toISOString(),
              data: {
                run_id: this.options.runId,
              },
            });
            this.close();
          }
        } catch (err) {
          console.error("[SimulationStream] Error parsing status_change event:", err);
        }
      });

      // Handle metric_update events
      this.eventSource.addEventListener("metric_update", (e: MessageEvent) => {
        // Capture raw event for debugging
        if (this.options.onRawEvent) {
          try {
            const parsed = JSON.parse(e.data);
            this.options.onRawEvent("metric_update", e.data, parsed);
          } catch (err) {
            this.options.onRawEvent("metric_update", e.data);
          }
        }
        
        try {
          const eventData = JSON.parse(e.data);
          
          // The backend sends: { "data": { "labels": {...}, "metric": "...", "value": ... }, "event": "metric_update", "run_id": "..." }
          // So we need to extract the nested data field
          const metricData = eventData.data || eventData;
          
          // Accumulate metrics
          const labels = metricData.labels || {};
          const service = labels.service || "unknown";
          const instance = labels.instance || "";
          const endpoint = labels.endpoint || "";
          const metricType = metricData.metric || "unknown";
          const metricValue = metricData.value;
          
          // Validate the value
          if (typeof metricValue !== 'number' || !isFinite(metricValue)) {
            return;
          }
          
          // Create a unique key for this metric
          const key = `${metricType}:${service}:${instance || endpoint}`;
          
          // Store the metric (for numeric metrics, we can accumulate or take latest)
          if (metricType === "request_count") {
            // Accumulate request counts
            const existing = this.metricBuffer.get(key);
            if (existing) {
              existing.value = (existing.value || 0) + metricValue;
            } else {
              this.metricBuffer.set(key, {
                labels,
                metric: metricType,
                value: metricValue,
                timestamp: metricData.timestamp,
              });
            }
          } else {
            // For other metrics, keep the latest value
            this.metricBuffer.set(key, {
              labels,
              metric: metricType,
              value: metricValue,
              timestamp: metricData.timestamp,
            });
          }
          
        } catch (err) {
          console.error("[SimulationStream] Error parsing metric_update event:", err, e.data);
        }
      });

      // Legacy event handlers for compatibility (initial, update, deleted)
      this.eventSource.addEventListener("initial", (e: MessageEvent) => {
        if (this.options.onRawEvent) {
          try {
            const parsed = JSON.parse(e.data);
            this.options.onRawEvent("initial", e.data, parsed);
          } catch (err) {
            this.options.onRawEvent("initial", e.data);
          }
        }
        
        try {
          const data = JSON.parse(e.data);
          if (data.run) {
            const run = data.run;
            if (run.metadata?.results) {
              this.options.onMetricsUpdate({
                type: "metrics_update",
                timestamp: new Date().toISOString(),
                data: {
                  summary: run.metadata.results.summary,
                  node_metrics: run.metadata.results.node_metrics,
                  time_series: run.metadata.results.time_series?.[run.metadata.results.time_series.length - 1],
                },
              });
            }
          }
        } catch (err) {
          console.error("[SimulationStream] Error parsing initial event:", err);
        }
      });

      this.eventSource.addEventListener("update", (e: MessageEvent) => {
        if (this.options.onRawEvent) {
          try {
            const parsed = JSON.parse(e.data);
            this.options.onRawEvent("update", e.data, parsed);
          } catch (err) {
            this.options.onRawEvent("update", e.data);
          }
        }
        
        try {
          const data = JSON.parse(e.data);
          if (data.run) {
            const run = data.run;
            
            // Transform the backend run to frontend format (this handles metadata.metrics -> results)
            // Pass the config to help with node metrics transformation
            const transformedRun = transformBackendRunToSimulationRun(run);
            
            // If we have results, trigger metrics update
            if (transformedRun.results) {
              // Include all time_series entries (not just the last one) for graph updates
              const latestTimeSeries = transformedRun.results.time_series && transformedRun.results.time_series.length > 0
                ? transformedRun.results.time_series[transformedRun.results.time_series.length - 1]
                : undefined;
              
              this.options.onMetricsUpdate({
                type: "metrics_update",
                timestamp: new Date().toISOString(),
                data: {
                  summary: transformedRun.results.summary,
                  node_metrics: transformedRun.results.node_metrics,
                  time_series: latestTimeSeries,
                  // Include full time_series array so graphs can update with all data points
                  all_time_series: transformedRun.results.time_series,
                },
              });
            }
            
            // Handle status changes
            if (transformedRun.status) {
              this.options.onStatusChange({
                type: "status_change",
                timestamp: new Date().toISOString(),
                data: { status: transformedRun.status },
              });
              
              // Stop streaming if simulation is no longer running
              if (transformedRun.status !== "running" && transformedRun.status !== "pending") {
                this.options.onComplete({
                  type: "complete",
                  timestamp: new Date().toISOString(),
                  data: {
                    run_id: run.run_id || run.id,
                    final_results: transformedRun.results,
                  },
                });
                this.close();
              }
            }
          }
        } catch (err) {
          console.error("[SimulationStream] Error parsing update event:", err);
        }
      });

      this.eventSource.addEventListener("deleted", (e: MessageEvent) => {
        if (this.options.onRawEvent) {
          try {
            const parsed = JSON.parse(e.data);
            this.options.onRawEvent("deleted", e.data, parsed);
          } catch (err) {
            this.options.onRawEvent("deleted", e.data);
          }
        }
        
        try {
          this.options.onError({
            type: "error",
            timestamp: new Date().toISOString(),
            data: {
              error: "Simulation run was deleted",
            },
          });
          this.close();
        } catch (err) {
          console.error("[SimulationStream] Error parsing deleted event:", err);
        }
      });

      // Generic message handler for events without explicit event type
      // This will catch events that don't have a specific event type or if the event type doesn't match
      this.eventSource.onmessage = (e: MessageEvent) => {
        // Capture raw event for debugging
        if (this.options.onRawEvent) {
          try {
            const parsed = JSON.parse(e.data);
            this.options.onRawEvent("message", e.data, parsed);
          } catch (err) {
            this.options.onRawEvent("message", e.data);
          }
        }
        
        // Try to parse and handle generic messages
        try {
          const data = JSON.parse(e.data);
          // If it's a status change in generic message format
          if (data.status && typeof data.status === "string") {
            let frontendStatus: "pending" | "running" | "completed" | "failed" | "cancelled" = "pending";
            const backendStatus = data.status;
            if (backendStatus === "RUN_STATUS_PENDING") {
              frontendStatus = "pending";
            } else if (backendStatus === "RUN_STATUS_RUNNING") {
              frontendStatus = "running";
            } else if (backendStatus === "RUN_STATUS_COMPLETED") {
              frontendStatus = "completed";
            } else if (backendStatus === "RUN_STATUS_FAILED") {
              frontendStatus = "failed";
            } else if (backendStatus === "RUN_STATUS_CANCELLED") {
              frontendStatus = "cancelled";
            } else {
              frontendStatus = backendStatus.toLowerCase() as any;
            }
            
            this.options.onStatusChange({
              type: "status_change",
              timestamp: new Date().toISOString(),
              data: { status: frontendStatus },
            });
          }
        } catch (err) {
          // Not JSON, ignore
        }
      };
      
      // Also listen for errors on the EventSource to catch parsing issues
      this.eventSource.addEventListener("error", (e) => {
        if (this.options.onRawEvent) {
          this.options.onRawEvent("event_source_error", JSON.stringify(e), undefined);
        }
      });

    } catch (error) {
      console.error("[SimulationStream] Failed to create connection:", error);
      this.options.onConnectionError(
        error instanceof Error ? error : new Error("Failed to create stream connection")
      );
      
      if (this.options.reconnect && !this.isManuallyClosed) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error("[SimulationStream] Max reconnect attempts reached");
      this.options.onConnectionError(new Error("Max reconnect attempts reached"));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * this.reconnectAttempts; // Exponential backoff

    console.log(
      `[SimulationStream] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.close(); // Close existing connection
      this.connect(); // Attempt to reconnect
    }, delay);
  }

  /**
   * Emit aggregated metrics from the buffer
   */
  private emitAggregatedMetrics(): void {
    if (this.metricBuffer.size === 0) {
      return;
    }
    
    // Count how many valid metrics we have
    let validMetricCount = 0;
    for (const metric of this.metricBuffer.values()) {
      if (metric && typeof metric.value === 'number' && isFinite(metric.value)) {
        validMetricCount++;
      }
    }
    
    // Don't emit if we don't have any valid metrics
    if (validMetricCount === 0) {
      this.metricBuffer.clear(); // Clear invalid data
      return;
    }

    // Store metrics by instance to aggregate
    const instanceMetrics = new Map<string, {
      service: string;
      instance: string;
      cpu_utilizations: number[];
      memory_utilizations: number[];
      queue_lengths: number[];
    }>();
    
    const requestCounts = new Map<string, number>();
    const requestLatencies = new Map<string, number[]>();

    // Process accumulated metrics
    for (const [key, metric] of this.metricBuffer.entries()) {
      if (!metric || typeof metric !== 'object') {
        continue;
      }
      
      const labels = metric.labels || {};
      const service = labels.service || "unknown";
      const instance = labels.instance;
      const endpoint = labels.endpoint;
      
      switch (metric.metric) {
        case "cpu_utilization":
          if (instance) {
            const instanceKey = `${service}:${instance}`;
            if (!instanceMetrics.has(instanceKey)) {
              instanceMetrics.set(instanceKey, {
                service,
                instance,
                cpu_utilizations: [],
                memory_utilizations: [],
                queue_lengths: [],
              });
            }
            // Convert to percentage if needed (values come as 0.0-1.0)
            const cpuValue = metric.value > 1 ? metric.value : metric.value * 100;
            instanceMetrics.get(instanceKey)!.cpu_utilizations.push(cpuValue);
          }
          break;
        case "memory_utilization":
          if (instance) {
            const instanceKey = `${service}:${instance}`;
            if (!instanceMetrics.has(instanceKey)) {
              instanceMetrics.set(instanceKey, {
                service,
                instance,
                cpu_utilizations: [],
                memory_utilizations: [],
                queue_lengths: [],
              });
            }
            // Convert to percentage if needed
            const memValue = metric.value > 1 ? metric.value : metric.value * 100;
            instanceMetrics.get(instanceKey)!.memory_utilizations.push(memValue);
          }
          break;
        case "queue_length":
          if (instance) {
            const instanceKey = `${service}:${instance}`;
            if (!instanceMetrics.has(instanceKey)) {
              instanceMetrics.set(instanceKey, {
                service,
                instance,
                cpu_utilizations: [],
                memory_utilizations: [],
                queue_lengths: [],
              });
            }
            instanceMetrics.get(instanceKey)!.queue_lengths.push(metric.value);
          }
          break;
        case "request_count":
          if (endpoint) {
            const key = `${service}:${endpoint}`;
            requestCounts.set(key, (requestCounts.get(key) || 0) + metric.value);
          }
          break;
        case "request_latency_ms":
          if (endpoint) {
            const key = `${service}:${endpoint}`;
            if (!requestLatencies.has(key)) {
              requestLatencies.set(key, []);
            }
            requestLatencies.get(key)!.push(metric.value);
          }
          break;
      }
    }

    // Convert instance metrics to NodeMetrics format
    const nodeMetrics: NodeMetrics[] = Array.from(instanceMetrics.entries()).map(([key, metrics]) => {
      const avgCpu = metrics.cpu_utilizations.length > 0
        ? metrics.cpu_utilizations.reduce((a, b) => a + b, 0) / metrics.cpu_utilizations.length
        : 0;
      const peakCpu = metrics.cpu_utilizations.length > 0
        ? Math.max(...metrics.cpu_utilizations)
        : 0;
      const avgMem = metrics.memory_utilizations.length > 0
        ? metrics.memory_utilizations.reduce((a, b) => a + b, 0) / metrics.memory_utilizations.length
        : 0;
      const peakMem = metrics.memory_utilizations.length > 0
        ? Math.max(...metrics.memory_utilizations)
        : 0;
      const avgQueueLength = metrics.queue_lengths.length > 0
        ? metrics.queue_lengths.reduce((a, b) => a + b, 0) / metrics.queue_lengths.length
        : 0;

      const nodeMetric = {
        node_id: metrics.instance,
        spec: {
          label: `${metrics.service}-${metrics.instance}`,
          vcpu: 2, // Default, should come from config
          memory_gb: 4, // Default, should come from config
        },
        avg_cpu_util_pct: Math.max(0, Math.min(100, avgCpu)),
        avg_mem_util_pct: Math.max(0, Math.min(100, avgMem)),
        peak_cpu_util_pct: Math.max(0, Math.min(100, peakCpu)),
        peak_mem_util_pct: Math.max(0, Math.min(100, peakMem)),
        network_io_mbps: 0, // Not provided by individual metric updates
      };
      
      return nodeMetric;
    });
    

    // Calculate summary statistics from request metrics
    const totalRequests = Array.from(requestCounts.values()).reduce((a, b) => a + b, 0);
    const allLatencies = Array.from(requestLatencies.values()).flat();
    const avgLatency = allLatencies.length > 0 
      ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length 
      : 0;
    const sortedLatencies = [...allLatencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    const p95Latency = sortedLatencies[p95Index] || 0;
    const p99Latency = sortedLatencies[p99Index] || 0;

    // Calculate average CPU and memory across all nodes for time series
    // First try from nodeMetrics, but if empty, calculate directly from buffer
    let avgCpuAcrossNodes = 0;
    let avgMemAcrossNodes = 0;
    
    if (nodeMetrics.length > 0) {
      // Ensure we only include valid numbers
      const validNodeMetrics = nodeMetrics.filter(nm => 
        typeof nm.avg_cpu_util_pct === 'number' && isFinite(nm.avg_cpu_util_pct) &&
        typeof nm.avg_mem_util_pct === 'number' && isFinite(nm.avg_mem_util_pct)
      );
      
      if (validNodeMetrics.length > 0) {
        avgCpuAcrossNodes = validNodeMetrics.reduce((sum, nm) => sum + (nm.avg_cpu_util_pct || 0), 0) / validNodeMetrics.length;
        avgMemAcrossNodes = validNodeMetrics.reduce((sum, nm) => sum + (nm.avg_mem_util_pct || 0), 0) / validNodeMetrics.length;
      }
    }
    
    // Fallback: Calculate directly from buffer if nodeMetrics is empty but we have metrics in buffer
    if (nodeMetrics.length === 0 && instanceMetrics.size === 0) {
      const cpuValues: number[] = [];
      const memValues: number[] = [];
      
      for (const metric of this.metricBuffer.values()) {
        if (metric && typeof metric.value === 'number' && isFinite(metric.value)) {
          const metricType = metric.metric;
          if (metricType === 'cpu_utilization') {
            const value = metric.value > 1 ? metric.value : metric.value * 100;
            cpuValues.push(value);
          } else if (metricType === 'memory_utilization') {
            const value = metric.value > 1 ? metric.value : metric.value * 100;
            memValues.push(value);
          }
        }
      }
      
      if (cpuValues.length > 0) {
        avgCpuAcrossNodes = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
      }
      if (memValues.length > 0) {
        avgMemAcrossNodes = memValues.reduce((a, b) => a + b, 0) / memValues.length;
      }
      
    }
    
    // Ensure values are valid numbers and within 0-100 range
    const safeAvgCpu = isFinite(avgCpuAcrossNodes) ? Math.max(0, Math.min(100, avgCpuAcrossNodes)) : 0;
    const safeAvgMem = isFinite(avgMemAcrossNodes) ? Math.max(0, Math.min(100, avgMemAcrossNodes)) : 0;

    if (process.env.NODE_ENV === "development") {
      console.log("[SimulationStream] Emitting aggregated metrics:", {
        nodeMetricsCount: nodeMetrics.length,
        validNodeMetricsCount: validNodeMetrics.length,
        avgCpuAcrossNodes,
        avgMemAcrossNodes,
        safeAvgCpu,
        safeAvgMem,
        totalRequests,
        avgLatency,
        time_series: {
          cpu_util_pct: safeAvgCpu,
          mem_util_pct: safeAvgMem,
          rps: totalRequests,
          latency_ms: avgLatency,
        },
      });
    }

    // Emit aggregated metrics update
    this.options.onMetricsUpdate({
      type: "metrics_update",
      timestamp: new Date().toISOString(),
      data: {
        summary: {
          total_requests: totalRequests,
          successful_requests: totalRequests, // Assume all successful for now
          failed_requests: 0,
          avg_latency_ms: avgLatency,
          p95_latency_ms: p95Latency,
          p99_latency_ms: p99Latency,
          avg_rps: totalRequests, // Simplified - would need time window calculation
          peak_rps: totalRequests,
        },
        node_metrics: nodeMetrics,
        time_series: {
          timestamp: new Date().toISOString(),
          cpu_util_pct: safeAvgCpu,
          mem_util_pct: safeAvgMem,
          rps: isFinite(totalRequests) ? Math.max(0, totalRequests) : 0,
          latency_ms: isFinite(avgLatency) ? Math.max(0, avgLatency) : 0,
          concurrent_users: 0,
          error_rate: 0,
        },
      },
    });

    // Clear buffer
    this.metricBuffer.clear();
    this.lastMetricsEmit = Date.now();
  }

  /**
   * Close the SSE connection
   */
  close(): void {
    this.isManuallyClosed = true;
    
    // Clear metrics emission interval
    if (this.metricsEmitInterval) {
      clearInterval(this.metricsEmitInterval);
      this.metricsEmitInterval = null;
    }
    
    // Emit any remaining metrics before closing
    this.emitAggregatedMetrics();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.options.onConnectionClose();
    }
  }

  /**
   * Check if the stream is currently connected
   */
  get isConnected(): boolean {
    return (
      this.eventSource !== null &&
      this.eventSource.readyState === EventSource.OPEN
    );
  }

  /**
   * Get the current connection state
   */
  get readyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED;
  }
}

/**
 * Helper function to create and manage a simulation stream
 */
export function createSimulationStream(
  options: SimulationStreamOptions
): SimulationStream {
  return new SimulationStream(options);
}

