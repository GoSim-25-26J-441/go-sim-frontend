/**
 * Optimizer replay labels aligned with backend `batch_scaling_actions` ordinals 1–12.
 */

export const BATCH_SCALING_ORDINAL_DISPLAY: Record<number, string> = {
  1: "SERVICE_REPLICA_SCALE_UP",
  2: "SERVICE_REPLICA_SCALE_DOWN",
  3: "SERVICE_CPU_INCREASE",
  4: "SERVICE_CPU_DECREASE",
  5: "SERVICE_MEMORY_INCREASE",
  6: "SERVICE_MEMORY_DECREASE",
  7: "HOST_SCALE_OUT",
  8: "HOST_SCALE_IN",
  9: "HOST_CPU_INCREASE",
  10: "HOST_CPU_DECREASE",
  11: "HOST_MEMORY_INCREASE",
  12: "HOST_MEMORY_DECREASE",
};

const PROTO_STRING_ALIASES: { pattern: RegExp; display: string }[] = [
  { pattern: /SERVICE_REPLICA_SCALE_UP|REPLICA_SCALE_UP/i, display: "SERVICE_REPLICA_SCALE_UP" },
  { pattern: /SERVICE_REPLICA_SCALE_DOWN|REPLICA_SCALE_DOWN/i, display: "SERVICE_REPLICA_SCALE_DOWN" },
  { pattern: /SERVICE_CPU_INCREASE|SCALE_UP_CPU|CPU_INCREASE/i, display: "SERVICE_CPU_INCREASE" },
  { pattern: /SERVICE_CPU_DECREASE|SCALE_DOWN_CPU|CPU_DECREASE/i, display: "SERVICE_CPU_DECREASE" },
  { pattern: /SERVICE_MEMORY_INCREASE|MEMORY_INCREASE/i, display: "SERVICE_MEMORY_INCREASE" },
  { pattern: /SERVICE_MEMORY_DECREASE|MEMORY_DECREASE/i, display: "SERVICE_MEMORY_DECREASE" },
  { pattern: /HOST_SCALE_OUT/i, display: "HOST_SCALE_OUT" },
  { pattern: /HOST_SCALE_IN/i, display: "HOST_SCALE_IN" },
  { pattern: /HOST_CPU_INCREASE/i, display: "HOST_CPU_INCREASE" },
  { pattern: /HOST_CPU_DECREASE/i, display: "HOST_CPU_DECREASE" },
  { pattern: /HOST_MEMORY_INCREASE/i, display: "HOST_MEMORY_INCREASE" },
  { pattern: /HOST_MEMORY_DECREASE/i, display: "HOST_MEMORY_DECREASE" },
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

function displayForOrdinal(n: number): string {
  return BATCH_SCALING_ORDINAL_DISPLAY[n] ?? `ACTION_${n}`;
}

export function describeOptimizerActionForReplay(reasonDetails: Record<string, unknown> | undefined): {
  primary: string;
  diagnostic?: string;
} {
  if (!reasonDetails) return { primary: "—" };

  const rawAction = reasonDetails.action ?? reasonDetails.batch_action ?? reasonDetails.scaling_action;

  if (typeof rawAction === "number" && Number.isFinite(rawAction)) {
    const n = Math.trunc(rawAction);
    if (n >= 1) {
      return {
        primary: displayForOrdinal(n),
        diagnostic: `ordinal ${n}`,
      };
    }
  }

  if (typeof rawAction === "string" && rawAction.length > 0) {
    const display = normalizeStringActionToDisplay(rawAction);
    const diagnostic =
      display !== rawAction && !/^(SERVICE_|HOST_)/.test(rawAction) ? rawAction : undefined;
    return { primary: display, diagnostic };
  }

  const asNum = Number(rawAction);
  if (Number.isInteger(asNum) && asNum >= 1) {
    return {
      primary: displayForOrdinal(asNum),
      diagnostic: `ordinal ${asNum}`,
    };
  }

  const t = toStr(reasonDetails.type) ?? toStr(rawAction);
  if (t) return { primary: normalizeStringActionToDisplay(t) };

  return { primary: "—" };
}
