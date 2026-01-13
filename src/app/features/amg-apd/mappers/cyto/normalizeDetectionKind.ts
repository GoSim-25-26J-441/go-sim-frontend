export function normalizeDetectionKind(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_")
    .replace(/__+/g, "_");

  const ALIASES: Record<string, string> = {
    cycles: "cycles",

    godservice: "god_service",
    god_service: "god_service",
    "god-service": "god_service",

    tightcoupling: "tight_coupling",
    tight_coupling: "tight_coupling",
    "tight-coupling": "tight_coupling",
    tight_coupled: "tight_coupling",

    reverse_dependency: "reverse_dependency",
    "reverse-dependency": "reverse_dependency",
    reversedependency: "reverse_dependency",

    shared_database: "shared_database",
    "shared-database": "shared_database",
    shareddatabase: "shared_database",
    shared_db: "shared_database",

    sync_call_chain: "sync_call_chain",
    "sync-call-chain": "sync_call_chain",
    synccallchain: "sync_call_chain",
    synchronous_call_chain: "sync_call_chain",

    ui_orchestrator: "ui_orchestrator",
    "ui-orchestrator": "ui_orchestrator",
    uiorchestrator: "ui_orchestrator",
    orchestrator: "ui_orchestrator",
    frontend_orchestrator: "ui_orchestrator",

    ping_pong_dependency: "ping_pong_dependency",
    "ping-pong-dependency": "ping_pong_dependency",
    ping_pong: "ping_pong_dependency",
    "ping-pong": "ping_pong_dependency",
    pingpongdependency: "ping_pong_dependency",
  };

  return ALIASES[cleaned] ?? cleaned;
}
