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
      // 
      // TODO: This should use engine_run_id from the backend run to call simulation-core directly
      // For now, we'll use the backend run ID and the proxy route should handle the mapping
      const streamUrl = `/api/simulation/${this.options.runId}/stream?token=${encodeURIComponent(token)}`;

      // Create EventSource connection
      this.eventSource = new EventSource(streamUrl);

      // Handle connection open
      this.eventSource.onopen = () => {
        console.log(`[SimulationStream] Connected to stream for run ${this.options.runId}`);
        this.reconnectAttempts = 0;
        this.options.onConnectionOpen();
      };

      // Handle connection errors
      this.eventSource.onerror = (error) => {
        console.error("[SimulationStream] Connection error:", error);
        
        // Check if connection is closed
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.options.onConnectionError(new Error("Stream connection closed"));
          
          // Attempt reconnect if enabled and not manually closed
          if (this.options.reconnect && !this.isManuallyClosed) {
            this.scheduleReconnect();
          } else {
            this.options.onConnectionClose();
          }
        }
      };

      // Listen for different event types
      this.eventSource.addEventListener("metrics_update", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.options.onMetricsUpdate({
            type: "metrics_update",
            timestamp: new Date().toISOString(),
            data,
          });
        } catch (err) {
          console.error("[SimulationStream] Error parsing metrics_update:", err);
        }
      });

      this.eventSource.addEventListener("status_change", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.options.onStatusChange({
            type: "status_change",
            timestamp: new Date().toISOString(),
            data,
          });
        } catch (err) {
          console.error("[SimulationStream] Error parsing status_change:", err);
        }
      });

      this.eventSource.addEventListener("error", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.options.onError({
            type: "error",
            timestamp: new Date().toISOString(),
            data,
          });
        } catch (err) {
          console.error("[SimulationStream] Error parsing error event:", err);
        }
      });

      this.eventSource.addEventListener("complete", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.options.onComplete({
            type: "complete",
            timestamp: new Date().toISOString(),
            data,
          });
          // Close connection when simulation completes
          this.close();
        } catch (err) {
          console.error("[SimulationStream] Error parsing complete event:", err);
        }
      });

      // Generic message handler for backward compatibility
      this.eventSource.onmessage = (e: MessageEvent) => {
        try {
          const event: StreamEvent = JSON.parse(e.data);
          
          switch (event.type) {
            case "metrics_update":
              this.options.onMetricsUpdate(event as MetricsUpdateEvent);
              break;
            case "status_change":
              this.options.onStatusChange(event as StatusChangeEvent);
              break;
            case "error":
              this.options.onError(event as ErrorEvent);
              break;
            case "complete":
              this.options.onComplete(event as CompleteEvent);
              this.close();
              break;
          }
        } catch (err) {
          console.error("[SimulationStream] Error parsing message:", err);
        }
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

