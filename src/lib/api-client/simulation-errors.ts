/** Structured error from go-sim-backend simulation routes (create run, lease, etc.) */

export interface SimulationErrorBody {
  error?: string;
  details?: unknown;
  [key: string]: unknown;
}

export class SimulationApiError extends Error {
  readonly status: number;
  readonly body: SimulationErrorBody;

  constructor(message: string, status: number, body: SimulationErrorBody = {}) {
    super(message);
    this.name = "SimulationApiError";
    this.status = status;
    this.body = body;
  }

  /** Human-readable secondary text (engine message, validation detail, etc.) */
  get detailsSummary(): string | undefined {
    const d = this.body.details;
    if (d == null) return undefined;
    if (typeof d === "string") return d;
    try {
      return JSON.stringify(d);
    } catch {
      return String(d);
    }
  }
}

export function isSimulationApiError(e: unknown): e is SimulationApiError {
  return e instanceof SimulationApiError;
}
