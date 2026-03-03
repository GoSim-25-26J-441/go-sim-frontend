import type { DetectionKind } from "@/app/features/amg-apd/types";
import { DETECTION_KIND_COLOR } from "@/app/features/amg-apd/utils/colors";

const ALIASES: Record<string, DetectionKind> = {
  chatty_call: "chatty_calls",
  chatty_calls: "chatty_calls",
  chattycall: "chatty_calls",
  chattycalls: "chatty_calls",

  cross_db_reads: "cross_db_read",
  cross_db_read: "cross_db_read",
  crossdbread: "cross_db_read",

  shared_db_write: "shared_db_writes",
  shared_db_writes: "shared_db_writes",
  shareddbwrites: "shared_db_writes",

  godservice: "god_service",
  god_service: "god_service",
  "god-service": "god_service",

  tightcoupling: "tight_coupling",
  tight_coupling: "tight_coupling",
  "tight-coupling": "tight_coupling",

  cycles: "cycles",
};

function isKnownKind(k: string): k is DetectionKind {
  return Object.prototype.hasOwnProperty.call(DETECTION_KIND_COLOR, k);
}

export function normalizeDetectionKind(raw: unknown): DetectionKind | null {
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_")
    .replace(/__+/g, "_");

  const mapped = ALIASES[cleaned] ?? cleaned;

  if (isKnownKind(mapped)) return mapped;
  return null;
}
