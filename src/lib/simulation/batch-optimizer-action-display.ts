/**
 * Human-readable labels for batch optimizer / scaling actions in run replay.
 * Coarse ordinals 1–6 match `batch-scaling-actions.ts` serialization; strings may be proto names or engine-specific.
 */

export const BATCH_SCALING_ORDINAL_DISPLAY: Record<number, string> = {
  1: "SERVICE_REPLICA_SCALE",
  2: "HOST_FLEET_SCALE",
  3: "SERVICE_CPU_SCALE",
  4: "SERVICE_MEMORY_SCALE",
  5: "HOST_CPU_SCALE",
  6: "HOST_MEMORY_SCALE",
};

const PROTO_STRING_ALIASES: { pattern: RegExp; display: string }[] = [
  { pattern: /SCALE_REPLICAS|replica/i, display: "SERVICE_REPLICA_SCALE" },
  { pattern: /SCALE_HOSTS|host_fleet|host count/i, display: "HOST_FLEET_SCALE" },
  { pattern: /service.*cpu|SCALE_SERVICE_CPU|cpu.*service/i, display: "SERVICE_CPU_SCALE" },
  { pattern: /service.*mem|SCALE_SERVICE_MEM|memory.*service/i, display: "SERVICE_MEMORY_SCALE" },
  { pattern: /host.*cpu|SCALE_HOST_CPU/i, display: "HOST_CPU_SCALE" },
  { pattern: /host.*mem|SCALE_HOST_MEM/i, display: "HOST_MEMORY_SCALE" },
  { pattern: /SCALE_OUT|scale_out/i, display: "SERVICE_SCALE_OUT" },
  { pattern: /SCALE_IN|scale_in/i, display: "SERVICE_SCALE_IN" },
  { pattern: /BATCH_SCALING_ACTION_UNSPECIFIED/i, display: "UNSPECIFIED" },
];

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normalizeStringActionToDisplay(s: string): string {
  const u = s.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(u)) return u;
  for (const { pattern, display } of PROTO_STRING_ALIASES) {
    if (pattern.test(u)) return display;
  }
  if (/^BATCH_SCALING_ACTION_/.test(u)) {
    return u.replace(/^BATCH_SCALING_ACTION_/, "").replace(/_/g, " ");
  }
  return u;
}

export function describeOptimizerActionForReplay(reasonDetails: Record<string, unknown> | undefined): {
  primary: string;
  /** Ordinal or raw engine value for developers */
  diagnostic?: string;
} {
  if (!reasonDetails) return { primary: "—" };

  const rawAction = reasonDetails.action ?? reasonDetails.batch_action ?? reasonDetails.scaling_action;

  if (typeof rawAction === "number" && Number.isFinite(rawAction)) {
    const n = Math.trunc(rawAction);
    if (n >= 1 && n <= 6) {
      return {
        primary: BATCH_SCALING_ORDINAL_DISPLAY[n] ?? `ACTION_${n}`,
        diagnostic: `ordinal ${n}`,
      };
    }
  }

  if (typeof rawAction === "string" && rawAction.length > 0) {
    const display = normalizeStringActionToDisplay(rawAction);
    const diagnostic =
      display !== rawAction && !/^SERVICE_|^HOST_/.test(rawAction) ? rawAction : undefined;
    return { primary: display, diagnostic };
  }

  const asNum = Number(rawAction);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 6) {
    return {
      primary: BATCH_SCALING_ORDINAL_DISPLAY[asNum] ?? `ACTION_${asNum}`,
      diagnostic: `ordinal ${asNum}`,
    };
  }

  const t = toStr(reasonDetails.type) ?? toStr(rawAction);
  if (t) return { primary: normalizeStringActionToDisplay(t) };

  return { primary: "—" };
}
