"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ScenarioValidationIssue, ScenarioValidationResult } from "@/lib/api-client/simulation";
import { type ScenarioPolicies, type ScenarioState } from "@/lib/simulation/scenario-yaml-parse";
import {
  addEndpointToService,
  deleteEndpointIfUnreferenced,
  formatEndpointReferenceSummary,
  getEndpointOptions,
  patchAutoscalingServiceRows,
} from "@/lib/simulation/scenario-behavior-helpers";
import { ReadonlyTopologySummary } from "./ReadonlyTopologySummary";
import { ServiceEndpointList } from "./ServiceEndpointList";
import { EndpointBehaviorEditor } from "./EndpointBehaviorEditor";
import { WorkloadPatternList } from "./WorkloadPatternList";
import { WorkloadPatternEditor } from "./WorkloadPatternEditor";

function summarizeValidationIssue(issue: ScenarioValidationIssue): string {
  const parts: string[] = [];
  if (issue.code) parts.push(issue.code);
  if (issue.service_id) parts.push(issue.service_id);
  const prefix = parts.length > 0 ? `${parts.join(": ")}: ` : "";
  return `${prefix}${issue.message}`;
}

export function ScenarioBehaviorEditor({
  scenario,
  setScenario,
  endpointPathErrors,
  isSampleScenario,
  scenarioYaml,
  scenarioYamlError,
  scenarioValidationBusy,
  scenarioValidationStale,
  scenarioValidationError,
  scenarioValidationResult,
  onValidateScenario,
}: {
  scenario: ScenarioState;
  setScenario: Dispatch<SetStateAction<ScenarioState>>;
  endpointPathErrors: Record<string, string>;
  isSampleScenario: boolean;
  scenarioYaml: string;
  scenarioYamlError: string | null;
  scenarioValidationBusy: boolean;
  scenarioValidationStale: boolean;
  scenarioValidationError: string | null;
  scenarioValidationResult: ScenarioValidationResult | null;
  onValidateScenario: () => void;
}) {
  const [svcIndex, setSvcIndex] = useState(0);
  const [epIndex, setEpIndex] = useState(0);
  const [wlIndex, setWlIndex] = useState(0);
  const [endpointActionError, setEndpointActionError] = useState<string | null>(null);

  useEffect(() => {
    if (svcIndex >= scenario.services.length) {
      setSvcIndex(Math.max(0, scenario.services.length - 1));
    }
  }, [scenario.services.length, svcIndex]);

  useEffect(() => {
    const n = scenario.services[svcIndex]?.endpoints.length ?? 0;
    if (epIndex >= n) setEpIndex(Math.max(0, n - 1));
  }, [scenario.services, svcIndex, epIndex]);

  useEffect(() => {
    setEndpointActionError(null);
  }, [svcIndex, epIndex]);

  useEffect(() => {
    if (wlIndex >= scenario.workload.length) {
      setWlIndex(Math.max(0, scenario.workload.length - 1));
    }
  }, [scenario.workload.length, wlIndex]);

  const svc = scenario.services[svcIndex];
  const eps = svc?.endpoints ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Scenario behavior</h1>
        <p className="text-xs text-white/60 mt-1 max-w-3xl">
          Tune endpoint CPU, memory, latency, and downstream call parameters, plus workload arrival patterns.
          Topology is initialized from the upstream pipeline, and this editor allows endpoint/downstream
          adjustments with validation and dependency checks.
        </p>
      </div>

      <ReadonlyTopologySummary scenario={scenario} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Endpoints</h2>
        <p className="text-xs text-white/55 max-w-3xl">
          Pick a service, then an endpoint. Service topology is initialized upstream, and this form lets you
          add/remove endpoints and downstream calls while enforcing dependency checks on referenced targets.
        </p>
        <div className="flex flex-col lg:flex-row gap-4 min-h-0">
          <div className="lg:w-72 shrink-0 min-w-0">
            <ServiceEndpointList
              services={scenario.services}
              selectedIndex={svcIndex}
              onSelect={(i) => {
                setSvcIndex(i);
                setEpIndex(0);
              }}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            {svc && eps.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-white/60">Endpoint path</label>
                <select
                  value={epIndex}
                  onChange={(e) => setEpIndex(Number(e.target.value) || 0)}
                  className="px-2 py-1.5 text-xs bg-black/40 border border-white/20 rounded text-white"
                >
                  {eps.map((ep, i) => (
                    <option key={`${svc.id}-${i}`} value={i}>
                      {ep.path}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {endpointActionError && (
              <div className="rounded border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {endpointActionError}
              </div>
            )}
            {svc && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEndpointActionError(null);
                    setScenario((prev) => {
                      const next = addEndpointToService(prev, svcIndex);
                      setEpIndex(next.endpointIndex);
                      return next.scenario;
                    });
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
                >
                  Add endpoint
                </button>
                {eps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setScenario((prev) => {
                        const result = deleteEndpointIfUnreferenced(prev, svcIndex, epIndex);
                        if (!result.deleted) {
                          const service = prev.services[svcIndex];
                          const endpoint = service?.endpoints[epIndex];
                          const endpointLabel = service && endpoint ? `${service.id}:${endpoint.path}` : "endpoint";
                          setEndpointActionError(
                            `Cannot delete ${endpointLabel}. Still referenced by: ${formatEndpointReferenceSummary(
                              result.references
                            )}.`
                          );
                          return prev;
                        }
                        const nextEndpoints = result.scenario.services[svcIndex]?.endpoints ?? [];
                        const nextIndex = nextEndpoints.length === 0 ? 0 : Math.max(0, epIndex - 1);
                        setEpIndex(nextIndex);
                        setEndpointActionError(null);
                        return result.scenario;
                      });
                    }}
                    className="px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                  >
                    Delete endpoint
                  </button>
                )}
              </div>
            )}
            {svc && eps.length > 0 ? (
              <EndpointBehaviorEditor
                scenario={scenario}
                setScenario={setScenario}
                svcIndex={svcIndex}
                epIndex={epIndex}
                endpointPathErrors={endpointPathErrors}
              />
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/25 p-4 text-xs text-white/50">
                {svc ? "This service has no endpoints in the scenario." : "No services in this scenario."}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Workload patterns</h2>
        <p className="text-xs text-white/55 max-w-3xl">
          Add or remove patterns and aim each at an existing endpoint. ScenarioV2 fields such as{" "}
          <span className="font-mono text-[11px]">source_kind</span>,{" "}
          <span className="font-mono text-[11px]">traffic_class</span>, and{" "}
          <span className="font-mono text-[11px]">metadata.client_zone</span> are edited when present on the
          pattern.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={getEndpointOptions(scenario).length === 0}
            onClick={() =>
              setScenario((prev) => {
                const opts = getEndpointOptions(prev);
                const defaultTo = opts[0]?.value ?? "";
                if (!defaultTo) return prev;
                return {
                  ...prev,
                  workload: [
                    ...prev.workload,
                    {
                      from: "client",
                      to: defaultTo,
                      arrival: { type: "poisson", rate_rps: 10 },
                    },
                  ],
                };
              })
            }
            className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add workload pattern
          </button>
          <button
            type="button"
            disabled={scenario.workload.length <= 1}
            onClick={() =>
              setScenario((prev) => ({
                ...prev,
                workload: prev.workload.filter((_, i) => i !== wlIndex),
              }))
            }
            className="px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Remove selected pattern
          </button>
        </div>
        <div className="flex flex-col lg:flex-row gap-4 min-h-0">
          <div className="lg:w-72 shrink-0 min-w-0">
            <WorkloadPatternList
              workload={scenario.workload}
              selectedIndex={wlIndex}
              onSelect={setWlIndex}
            />
          </div>
          <div className="flex-1 min-w-0">
            <WorkloadPatternEditor scenario={scenario} setScenario={setScenario} index={wlIndex} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">Policies (Autoscaling)</h2>
        <p className="text-xs text-white/60 mb-3">
          Configure autoscaling policies per service. These are emitted under{" "}
          <span className="font-mono text-[11px]">policies.autoscaling.services</span> in the generated YAML.
        </p>
        <div className="space-y-3">
          {(((scenario.policies as ScenarioPolicies | undefined)?.autoscaling?.services) || []).map(
            (pol, polIndex) => (
              <div
                key={`pol-${pol.service_id || polIndex}`}
                className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-wrap items-end gap-3"
              >
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Service</label>
                  <select
                    value={pol.service_id}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = { ...next[polIndex], service_id: e.target.value };
                          return next;
                        }),
                      }))
                    }
                    className="px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  >
                    {scenario.services.length === 0 && (
                      <option value={pol.service_id || ""}>
                        {pol.service_id || "No services defined"}
                      </option>
                    )}
                    {scenario.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Min replicas</label>
                  <input
                    type="number"
                    min={1}
                    value={pol.min_replicas}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = { ...next[polIndex], min_replicas: Number(e.target.value) || 1 };
                          return next;
                        }),
                      }))
                    }
                    className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Max replicas</label>
                  <input
                    type="number"
                    min={1}
                    value={pol.max_replicas}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = { ...next[polIndex], max_replicas: Number(e.target.value) || 1 };
                          return next;
                        }),
                      }))
                    }
                    className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">
                    Target p95 latency (ms)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pol.target_p95_latency_ms}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = {
                            ...next[polIndex],
                            target_p95_latency_ms: Number(e.target.value) || 0,
                          };
                          return next;
                        }),
                      }))
                    }
                    className="w-28 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Target CPU util</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={pol.target_cpu_utilization}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = {
                            ...next[polIndex],
                            target_cpu_utilization: Number(e.target.value) || 0,
                          };
                          return next;
                        }),
                      }))
                    }
                    className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Scale up step</label>
                  <input
                    type="number"
                    min={1}
                    value={pol.scale_up_step}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = { ...next[polIndex], scale_up_step: Number(e.target.value) || 1 };
                          return next;
                        }),
                      }))
                    }
                    className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Scale down step</label>
                  <input
                    type="number"
                    min={1}
                    value={pol.scale_down_step}
                    onChange={(e) =>
                      setScenario((prev) => ({
                        ...prev,
                        policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => {
                          const next = [...rows];
                          next[polIndex] = { ...next[polIndex], scale_down_step: Number(e.target.value) || 1 };
                          return next;
                        }),
                      }))
                    }
                    className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setScenario((prev) => ({
                      ...prev,
                      policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) =>
                        rows.filter((_p, i) => i !== polIndex)
                      ),
                    }))
                  }
                  className="ml-auto px-3 py-1.5 text-[11px] rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                >
                  Remove policy
                </button>
              </div>
            ))}

          <button
            type="button"
            onClick={() =>
              setScenario((prev) => ({
                ...prev,
                policies: patchAutoscalingServiceRows(prev.policies as ScenarioPolicies | undefined, (rows) => [
                  ...rows,
                  {
                    service_id: scenario.services[0]?.id ?? "",
                    min_replicas: 1,
                    max_replicas: 1,
                    target_p95_latency_ms: 0,
                    target_cpu_utilization: 0,
                    scale_up_step: 1,
                    scale_down_step: 1,
                  },
                ]),
              }))
            }
            className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
          >
            Add autoscaling policy
          </button>
        </div>
      </section>

      <details className="rounded-lg border border-white/10 bg-black/30 p-3 group">
        <summary className="cursor-pointer text-sm font-medium text-white/80 list-none flex items-center gap-2">
          <span className="text-white/40 group-open:rotate-90 transition-transform">▸</span>
          Debug: scenario YAML & validation
        </summary>
        <div className="mt-3 space-y-3 pt-2 border-t border-white/10">
          <p className="text-xs text-white/55">
            {isSampleScenario
              ? "YAML generated from the editor for the sample flow (matches the predefined sample scenario file)."
              : "YAML generated from the editor. For diagram versions, load/save via the simulation service."}
          </p>
          {scenarioYamlError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
              {scenarioYamlError}
            </div>
          )}
          <textarea
            readOnly
            value={scenarioYaml}
            className="w-full h-48 bg-black/60 border border-white/10 rounded-lg text-xs font-mono text-white p-3 resize-y"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={scenarioValidationBusy || !!scenarioYamlError}
              onClick={() => void onValidateScenario()}
              className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {scenarioValidationBusy ? "Validating…" : "Validate Scenario"}
            </button>
            {scenarioValidationStale && (
              <span className="text-xs text-amber-200/90">Scenario changed since last validation.</span>
            )}
          </div>
          {scenarioValidationError && (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {scenarioValidationError}
            </div>
          )}
          {scenarioValidationResult?.valid && (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 space-y-1">
              <p className="font-medium">Scenario is valid</p>
              {scenarioValidationResult.summary && (
                <p className="text-emerald-100/80">
                  {(scenarioValidationResult.summary.hosts ?? 0).toLocaleString()} hosts,{" "}
                  {(scenarioValidationResult.summary.services ?? 0).toLocaleString()} services,{" "}
                  {(scenarioValidationResult.summary.workloads ?? 0).toLocaleString()} workloads
                </p>
              )}
            </div>
          )}
          {!!scenarioValidationResult?.warnings?.length && (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="font-medium mb-1">Warnings</p>
              <ul className="space-y-1">
                {scenarioValidationResult.warnings.map((warning, idx) => (
                  <li key={`${warning.code ?? "warning"}-${idx}`}>{summarizeValidationIssue(warning)}</li>
                ))}
              </ul>
            </div>
          )}
          {!!scenarioValidationResult?.errors?.length && (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <p className="font-medium mb-1">Validation errors</p>
              <ul className="space-y-2">
                {scenarioValidationResult.errors.map((issue, idx) => (
                  <li key={`${issue.code ?? "error"}-${idx}`} className="space-y-1">
                    <p>{summarizeValidationIssue(issue)}</p>
                    {issue.message.length > 120 && (
                      <details className="text-red-100/80">
                        <summary className="cursor-pointer">Details</summary>
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{issue.message}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
