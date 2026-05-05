/**
 * Resolves simulation node counts from candidates API metadata and/or stored analysis requests.
 *
 * Contract (frontend):
 * - Requested / form-entered: analysis `simulation.nodes` (optional `simulation.requested_nodes` when present)
 * - Candidate / evaluated topology: candidates `simulation.nodes` or analysis `simulation.candidate_nodes`
 * - Effective cost cluster size: candidate when available, else requested
 */

export type SimulationNodeFields = {
  nodes?: number;
  candidate_nodes?: number;
  requested_nodes?: number;
};

export type CandidatesSimulationMeta = {
  nodes?: number;
  requested_nodes?: number;
};

function normalizePositiveInt(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

/**
 * User-entered requirement. Prefer additive `requested_nodes` on the candidates payload when present.
 */
export function resolveRequestedNodes(
  candidatesResponse: { simulation?: CandidatesSimulationMeta } | null | undefined,
  analysisRequest: { simulation?: SimulationNodeFields } | null | undefined,
): number | undefined {
  return (
    normalizePositiveInt(candidatesResponse?.simulation?.requested_nodes) ??
    normalizePositiveInt(analysisRequest?.simulation?.requested_nodes) ??
    normalizePositiveInt(analysisRequest?.simulation?.nodes)
  );
}

/**
 * Evaluated candidate / final scenario cluster size (not the user's original requirement).
 */
export function resolveCandidateNodes(
  candidatesResponse: {
    simulation?: CandidatesSimulationMeta;
    candidates?: Array<{ spec?: { hosts?: unknown[] } }>;
  } | null | undefined,
  analysisRequest: { simulation?: SimulationNodeFields } | null | undefined,
): number | undefined {
  const fromMeta = normalizePositiveInt(candidatesResponse?.simulation?.nodes);
  if (fromMeta != null) return fromMeta;
  const fromAnalysis = normalizePositiveInt(analysisRequest?.simulation?.candidate_nodes);
  if (fromAnalysis != null) return fromAnalysis;
  for (const c of candidatesResponse?.candidates ?? []) {
    const hosts = c.spec?.hosts;
    if (Array.isArray(hosts) && hosts.length > 0) return hosts.length;
  }
  return undefined;
}

/**
 * Cluster size for cost math / suggest payload: candidate topology when known, otherwise requested.
 */
export function resolveEffectiveCostNodes(
  candidatesResponse: {
    simulation?: CandidatesSimulationMeta;
    candidates?: Array<{ spec?: { hosts?: unknown[] } }>;
  } | null | undefined,
  analysisRequest: { simulation?: SimulationNodeFields } | null | undefined,
): number | undefined {
  return (
    resolveCandidateNodes(candidatesResponse, analysisRequest) ??
    resolveRequestedNodes(candidatesResponse, analysisRequest)
  );
}
