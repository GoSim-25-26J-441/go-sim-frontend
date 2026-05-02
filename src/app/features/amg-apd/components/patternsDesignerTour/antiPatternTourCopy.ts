/** Shared explanations for legend tour steps and New Designer anti-pattern preset drops. */
export const ANTI_PATTERN_TOUR_HELP: Record<string, string> = {
  cycles:
    "Services call each other in a loop (A → B → C → A). Failures and retries can cascade with no clean exit.",
  god_service:
    "One service owns too many dependencies and becomes a bottleneck for releases, scaling, and testing.",
  tight_coupling:
    "Two services depend on each other’s internals or APIs so tightly that almost every change requires coordinated deploys.",
  reverse_dependency:
    "A lower-level or domain service calls “up” into UI or orchestration layers, inverting the usual dependency direction.",
  shared_database:
    "Multiple services read and write the same logical database, so schema changes and outages hit everyone at once.",
  sync_call_chain:
    "A long chain of synchronous HTTP/RPC calls. Latency adds up and availability drops multiplicatively.",
  ui_orchestrator:
    "The browser or mobile app sequences many backend calls directly instead of a BFF or workflow service.",
  ping_pong_dependency:
    "Two services repeatedly call each other in a chatty pattern, multiplying latency and failure modes.",
};
