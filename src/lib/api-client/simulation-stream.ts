// Server-Sent Events (SSE) streaming client for real-time simulation metrics
// This handles real-time metric updates from the simulation engine

import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { TimeSeriesData, NodeMetrics } from "@/types/simulation";

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
        }
        this.reconnectAttempts = 0;
        this.options.onConnectionOpen();
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

      // Listen for backend event types: initial, update, deleted
      // Backend sends events with types: "initial", "update", "deleted"
      // Each event contains: { run: SimulationRun } or { event: "deleted", run_id: string }
      
      this.eventSource.addEventListener("initial", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.run) {
            const run = data.run;
            // Handle initial run state - if it has results, trigger metrics update
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
        try {
          const data = JSON.parse(e.data);
          
          if (data.run) {
            const run = data.run;
            
            // Backend sends full run object - check for results in metadata
            // For running simulations, results may be partially populated
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
            
            // Check for status changes
            if (run.status) {
              this.options.onStatusChange({
                type: "status_change",
                timestamp: new Date().toISOString(),
                data: {
                  status: run.status,
                },
              });
              
              // Stop streaming if simulation is no longer running
              if (run.status !== "running") {
                this.options.onComplete({
                  type: "complete",
                  timestamp: new Date().toISOString(),
                  data: {
                    run_id: run.run_id || run.id,
                    final_results: run.metadata?.results,
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
        try {
          const data = JSON.parse(e.data);
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
      this.eventSource.onmessage = (e: MessageEvent) => {
        // Backend uses named events (initial, update, deleted)
        // so this handler is mainly for compatibility
        // Named event handlers above will handle most events
      };

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
   * Close the SSE connection
   */
  close(): void {
    this.isManuallyClosed = true;
    
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

