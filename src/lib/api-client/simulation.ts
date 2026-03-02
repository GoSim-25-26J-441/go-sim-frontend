// Simulation API client for go-sim-backend (/api/v1/simulation)

import { env } from "@/lib/env";
import { authenticatedFetch } from "./http";
import type {
  SimulationRun,
  SimulationConfig,
  BackendSimulationRun,
  CreateSimulationRunRequest,
} from "@/types/simulation";

const BASE_URL = `${env.BACKEND_BASE}/api/v1/simulation`;

function mapBackendRunToFrontend(b: BackendSimulationRun): SimulationRun {
  const meta = b.metadata ?? {};
  const config = (meta.config as SimulationConfig | undefined) ?? defaultConfig();
  return {
    id: b.run_id,
    name: (meta.name as string | undefined) ?? b.run_id,
    status: b.status,
    created_at: typeof b.created_at === "string" ? b.created_at : new Date(b.created_at).toISOString(),
    started_at: b.updated_at && b.status !== "pending" ? (typeof b.updated_at === "string" ? b.updated_at : new Date(b.updated_at).toISOString()) : undefined,
    completed_at: b.completed_at ? (typeof b.completed_at === "string" ? b.completed_at : new Date(b.completed_at).toISOString()) : undefined,
    duration_seconds: undefined,
    config,
    results: meta.results as SimulationRun["results"] | undefined,
    error: (meta.error as string | undefined) ?? undefined,
  };
}

function defaultConfig(): SimulationConfig {
  return {
    nodes: 1,
    workload: { concurrent_users: 0, duration_seconds: 0 },
    resources: { vcpu_per_node: 1, memory_gb_per_node: 1 },
  };
}

/**
 * Build a minimal scenario YAML for simulation-core from form-like config.
 * Used when backend expects scenario_yaml and we only have high-level form fields.
 */
export function buildMinimalScenarioYaml(config: {
  nodes?: number;
  workload?: { concurrent_users?: number; rps_target?: number };
  resources?: { vcpu_per_node?: number; memory_gb_per_node?: number };
}): string {
  const nodes = Math.max(1, config.nodes ?? 1);
  const vcpu = Math.max(1, config.resources?.vcpu_per_node ?? 1);
  const mem = Math.max(1, config.resources?.memory_gb_per_node ?? 1);
  const rate = Math.max(1, config.workload?.rps_target ?? config.workload?.concurrent_users ?? 10);
  const hosts = Array.from({ length: nodes }, (_, i) => `  - id: host-${i + 1}\n    cores: ${vcpu}`);
  return `hosts:
${hosts.join("\n")}
services:
  - id: svc1
    replicas: ${nodes}
    model: cpu
    endpoints:
      - path: /test
        mean_cpu_ms: 10
        downstream: []
workload:
  - from: client
    to: svc1:/test
    arrival:
      type: poisson
      rate_rps: ${rate}
`;
}

/**
 * Get all simulation runs (GET /api/v1/simulation/runs)
 */
export async function getSimulationRuns(): Promise<SimulationRun[]> {
  const response = await authenticatedFetch(`${BASE_URL}/runs`, { method: "GET" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch simulation runs");
  }
  const data = (await response.json()) as { runs?: BackendSimulationRun[] };
  const runs = data.runs ?? [];
  return runs.map(mapBackendRunToFrontend);
}

/**
 * Get a single simulation run by ID (GET /api/v1/simulation/runs/:id)
 */
export async function getSimulationRun(id: string): Promise<SimulationRun | null> {
  const response = await authenticatedFetch(`${BASE_URL}/runs/${encodeURIComponent(id)}`, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch simulation run");
  }
  const data = (await response.json()) as { run?: BackendSimulationRun };
  if (!data.run) return null;
  return mapBackendRunToFrontend(data.run);
}

/**
 * Create a new simulation run (POST /api/v1/simulation/runs).
 * Accepts either backend-shaped request or legacy frontend config; builds scenario_yaml and metadata.
 */
export async function createSimulationRun(
  input:
    | CreateSimulationRunRequest
    | (Omit<SimulationRun, "id" | "status" | "created_at" | "started_at" | "completed_at" | "duration_seconds" | "results" | "error">)
): Promise<SimulationRun> {
  let body: CreateSimulationRunRequest;
  if ("scenario_yaml" in input || "duration_ms" in input || ("metadata" in input && !("config" in input && "nodes" in input))) {
    body = input as CreateSimulationRunRequest;
  } else {
    const config = (input as { name?: string; config: SimulationConfig; [k: string]: unknown }).config;
    const durationSeconds = config.workload?.duration_seconds ?? 300;
    body = {
      scenario_yaml: buildMinimalScenarioYaml(config),
      duration_ms: durationSeconds * 1000,
      real_time_mode: true,
      metadata: {
        name: (input as { name?: string }).name,
        description: config.description,
        config,
      },
    };
  }
  const response = await authenticatedFetch(`${BASE_URL}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to create simulation");
  }
  const data = (await response.json()) as { run?: BackendSimulationRun };
  if (!data.run) throw new Error("Create simulation returned no run");
  return mapBackendRunToFrontend(data.run);
}

/**
 * Start a simulation run (PUT /api/v1/simulation/runs/:id with status running)
 */
export async function startSimulationRun(id: string): Promise<SimulationRun> {
  const response = await authenticatedFetch(`${BASE_URL}/runs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "running" }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to start simulation");
  }
  const data = (await response.json()) as { run?: BackendSimulationRun };
  if (!data.run) throw new Error("Start simulation returned no run");
  return mapBackendRunToFrontend(data.run);
}

/**
 * Stop a running simulation (PUT /api/v1/simulation/runs/:id with status cancelled)
 */
export async function stopSimulationRun(id: string): Promise<SimulationRun> {
  const response = await authenticatedFetch(`${BASE_URL}/runs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to stop simulation");
  }
  const data = (await response.json()) as { run?: BackendSimulationRun };
  if (!data.run) throw new Error("Stop simulation returned no run");
  return mapBackendRunToFrontend(data.run);
}

/**
 * Update workload rate for a running simulation (PATCH /api/v1/simulation/runs/:id/workload)
 */
export async function updateWorkloadRate(
  runId: string,
  patternKey: string,
  rateRps: number
): Promise<{ message: string; run_id: string; pattern_key: string }> {
  const response = await authenticatedFetch(`${BASE_URL}/runs/${encodeURIComponent(runId)}/workload`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pattern_key: patternKey, rate_rps: rateRps }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to update workload rate");
  }
  const data = (await response.json()) as { message?: string; run_id?: string; pattern_key?: string };
  return {
    message: data.message ?? "workload updated successfully",
    run_id: data.run_id ?? runId,
    pattern_key: data.pattern_key ?? patternKey,
  };
}

/**
 * Get real-time metrics for a run (from run.results when available; otherwise use events stream)
 */
export async function getSimulationMetrics(id: string): Promise<SimulationRun["results"] | null> {
  const run = await getSimulationRun(id);
  return run?.results ?? null;
}

/**
 * Delete a simulation run (DELETE /api/v1/simulation/runs/:id)
 */
export async function deleteSimulationRun(id: string): Promise<void> {
  const response = await authenticatedFetch(`${BASE_URL}/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to delete simulation run");
  }
}

/** SSE event types from GET /api/v1/simulation/runs/:id/events (backend proxies simulation-core events) */
export type SimulationRunEventType =
  | "update"
  | "metric_update"
  | "status_change"
  | "metrics_snapshot"
  | "complete";

export interface SimulationRunEvent {
  type: SimulationRunEventType;
  data?: unknown;
  timestamp?: string;
}

/**
 * Subscribe to real-time run events via SSE (GET /api/v1/simulation/runs/:id/events).
 * Uses fetch so we can send Authorization header. Calls onEvent for each event and onClose when stream ends.
 * Returns an abort function to close the stream.
 */
export function streamSimulationRunEvents(
  runId: string,
  callbacks: {
    onEvent: (event: SimulationRunEvent) => void;
    onError?: (err: Error) => void;
    onClose?: () => void;
  }
): () => void {
  const ac = new AbortController();
  const url = `${BASE_URL}/runs/${encodeURIComponent(runId)}/events`;
  authenticatedFetch(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal: ac.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        callbacks.onError?.(new Error(`Events stream failed: ${response.status}`));
        callbacks.onClose?.();
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onClose?.();
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let currentType = "message";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const raw = line.slice(6);
              try {
                const data = raw ? JSON.parse(raw) : undefined;
                callbacks.onEvent({
                  type: currentType as SimulationRunEventType,
                  data,
                  timestamp: new Date().toISOString(),
                });
              } catch {
                callbacks.onEvent({ type: currentType as SimulationRunEventType, data: raw, timestamp: new Date().toISOString() });
              }
              currentType = "message";
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") callbacks.onError?.(e as Error);
      } finally {
        callbacks.onClose?.();
      }
    })
    .catch((err) => {
      callbacks.onError?.(err);
      callbacks.onClose?.();
    });
  return () => ac.abort();
}

