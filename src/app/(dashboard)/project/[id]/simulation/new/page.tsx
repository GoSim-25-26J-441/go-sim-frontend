"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileCode2, Play } from "lucide-react";
import { InputField, TextAreaField } from "@/components/common/inputFeild/page";
import {
  createProjectSimulationRun,
  CreateProjectRunRequest,
  getDiagramScenarioDraft,
  isSimulationApiError,
  putDiagramScenarioDraft,
  regenerateDiagramScenario,
} from "@/lib/api-client/simulation";
import {
  parseSimulationScenarioYaml,
  scenarioStateToYaml,
  type ArrivalType,
  type ScenarioAutoscalingPolicies,
  type ScenarioPolicies,
  type ScenarioState,
} from "@/lib/simulation/scenario-yaml-parse";
import { useAuth } from "@/providers/auth-context";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import {
  amgApdTemplateToScenarioState,
  parseAmgApdTemplate,
} from "./amgApdTemplateToScenario";
import {
  BatchRecommendationFields,
  defaultBatchRecommendation,
  type BatchRecommendationFormState,
} from "./BatchRecommendationFields";
import { allowedActionsFromFlags } from "@/lib/simulation/batch-scaling-actions";
import {
  getSampleScenarioYaml,
  isSampleScenarioId,
  normalizeSampleVersionFromUrlParam,
  SAMPLE_IDS,
  SAMPLE_SCENARIO_DROPDOWN_OPTIONS,
} from "@/lib/simulation/sample-scenarios";
import { env } from "@/lib/env";

function draftStatusFromResponse(data: Record<string, unknown>): string | null {
  const s = data.status ?? data.draft_status ?? data.source;
  if (typeof s === "string" && s.trim()) return s.trim();
  return null;
}

function scenarioDraftHttpMessage(e: unknown, fallback: string): string {
  if (isSimulationApiError(e)) {
    const base = e.message || fallback;
    const d = e.detailsSummary;
    return d ? `${base}\n${d}` : base;
  }
  return e instanceof Error ? e.message : fallback;
}

/** Option for the scenario version dropdown (sample or from AMG-APD versions API) */
interface DiagramVersion {
  id: string;
  label: string;
  description?: string;
  yaml?: string;
}

interface SimulationFormData {
  name: string;
  description: string;
  nodes: number;
  vcpu_per_node: number;
  memory_gb_per_node: number;
  concurrent_users: number;
  rps_target: number;
  duration_seconds: number;
  ramp_up_seconds: number;
  scenario: string;
  real_time_mode: boolean;
}

type RunMode = "standard" | "batch_recommendation" | "batch_legacy" | "online_optimization";

function buildBatchRecommendationOptimizationPayload(br: BatchRecommendationFormState): Record<string, unknown> {
  const objective =
    env.NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE === "recommended_config"
      ? "recommended_config"
      : "cpu_utilization";
  const maxP99Ms =
    br.ui_mode === "quick" ? Math.max(1000, Math.round(br.max_p95_latency_ms * 2)) : br.max_p99_latency_ms;
  return {
    objective,
    online: false,
    evaluation_duration_ms: br.evaluation_duration_ms,
    max_evaluations: br.max_evaluations,
    batch: {
      max_p95_latency_ms: br.max_p95_latency_ms,
      max_p99_latency_ms: maxP99Ms,
      max_error_rate: br.max_error_rate,
      min_throughput_rps: br.min_throughput_rps,
      service_cpu_utilization_band: { low: br.service_cpu_low, high: br.service_cpu_high },
      service_memory_utilization_band: { low: br.service_mem_low, high: br.service_mem_high },
      host_cpu_utilization_band: { low: br.host_cpu_low, high: br.host_cpu_high },
      host_memory_utilization_band: { low: br.host_mem_low, high: br.host_mem_high },
      min_hosts: br.min_hosts,
      max_hosts: br.max_hosts,
      min_replicas_per_service: br.min_replicas_per_service,
      max_replicas_per_service: br.max_replicas_per_service,
      min_cpu_cores_per_instance: br.min_cpu_cores_per_instance,
      max_cpu_cores_per_instance: br.max_cpu_cores_per_instance,
      min_memory_mb_per_instance: br.min_memory_mb_per_instance,
      max_memory_mb_per_instance: br.max_memory_mb_per_instance,
      min_host_cpu_cores: br.min_host_cpu_cores,
      max_host_cpu_cores: br.max_host_cpu_cores,
      min_host_memory_gb: br.min_host_memory_gb,
      max_host_memory_gb: br.max_host_memory_gb,
      beam_width: br.beam_width,
      max_search_depth: br.max_search_depth,
      max_neighbors_per_state: br.max_neighbors_per_state,
      reevaluations_per_candidate: br.reevaluations_per_candidate,
      infeasible_beam_width: br.infeasible_beam_width,
      freeze_workload: br.freeze_workload,
      freeze_policies: br.freeze_policies,
      allowed_actions: allowedActionsFromFlags(br),
    },
  };
}

const SAMPLE_DROPDOWN_AS_DIAGRAM_VERSIONS: DiagramVersion[] = SAMPLE_SCENARIO_DROPDOWN_OPTIONS.map((o) => ({
  id: o.id,
  label: o.label,
  description: o.description,
}));

/** Fresh editor baseline when switching diagram versions or before a new draft load (avoids submitting a previous version's scenario). */
function createInitialScenarioEditorState(): ScenarioState {
  return {
    hosts: [{ id: "host-1", cores: 4, memory_gb: 16 }],
    services: [
      {
        id: "svc1",
        replicas: 1,
        model: "cpu",
        cpu_cores: 1,
        memory_mb: 512,
        endpoints: [
          {
            path: "/test",
            mean_cpu_ms: 10,
            cpu_sigma_ms: 2,
            default_memory_mb: 16,
            downstream: [],
            net_latency_ms: { mean: 5, sigma: 1 },
          },
        ],
      },
    ],
    workload: [
      {
        from: "client",
        to: "svc1:/test",
        arrival: {
          type: "poisson",
          rate_rps: 10,
        },
      },
    ],
    policies: undefined,
  };
}

export default function ProjectNewSimulationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const searchParams = useSearchParams();
  const version = searchParams.get("version");

  // Version/diagram selector phase (shown before the multi-step form)
  const { userId } = useAuth();
  const [versionPhase, setVersionPhase] = useState(true);
  const [availableVersions, setAvailableVersions] = useState<DiagramVersion[]>(SAMPLE_DROPDOWN_AS_DIAGRAM_VERSIONS);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(SAMPLE_IDS.basic);
  const [versionDetailResponse, setVersionDetailResponse] = useState<unknown>(null);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [debugView, setDebugView] = useState<"hide" | "show" | "yaml">("hide");
  const isSampleScenario = isSampleScenarioId(selectedVersionId);

  /** Backend diagram scenario draft (GET/PUT); not used for sample mode */
  const [scenarioDraftLoading, setScenarioDraftLoading] = useState(false);
  const draftBlocking = !isSampleScenario && scenarioDraftLoading;
  const [scenarioDraftError, setScenarioDraftError] = useState<string | null>(null);
  const [scenarioDraftStatusLabel, setScenarioDraftStatusLabel] = useState<string | null>(null);
  /** Last YAML persisted on the server for this diagram version (dirty detection). Null = sample or fallback/local-only. */
  const [savedScenarioYaml, setSavedScenarioYaml] = useState<string | null>(null);
  const [usedLocalScenarioFallback, setUsedLocalScenarioFallback] = useState(false);
  const [saveScenarioBusy, setSaveScenarioBusy] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  /** Sample YAML applied to editor after sync parse (blocks submit until true). */
  const [sampleScenarioReady, setSampleScenarioReady] = useState(false);
  /** No server baseline and no intentional AMG/APD local fallback — running would use wrong or default YAML. */
  const draftUnavailableBlocking =
    !isSampleScenario &&
    !scenarioDraftLoading &&
    scenarioDraftError != null &&
    savedScenarioYaml == null &&
    !usedLocalScenarioFallback;
  const sampleScenarioBlocked = isSampleScenario && !sampleScenarioReady;
  const diagramScenarioDraftBlocked =
    draftBlocking || draftUnavailableBlocking || sampleScenarioBlocked;

  /** YAML template from version API response (yaml_content field), when a saved version is loaded */
  const versionYamlTemplate =
    versionDetailResponse &&
    typeof versionDetailResponse === "object" &&
    "yaml_content" in versionDetailResponse &&
    typeof (versionDetailResponse as { yaml_content?: string }).yaml_content === "string"
      ? (versionDetailResponse as { yaml_content: string }).yaml_content
      : null;

  useEffect(() => {
    // Fetch diagram versions from AMG-APD API (project-scoped when projectId is used as chat id).
    const controller = new AbortController();
    setVersionsLoading(true);
    const headers = getAmgApdHeaders({
      userId: userId ?? undefined,
      chatId: projectId,
    });
    fetch("/api/amg-apd/versions", {
      signal: controller.signal,
      headers,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          versions?: Array<{ id: string; version_number?: number; title?: string; created_at?: string }>;
        };
        const list = data.versions ?? [];
        if (list.length > 0) {
          const mapped: DiagramVersion[] = list.map((v) => ({
            id: v.id,
            label:
              v.version_number != null && v.title?.trim()
                ? `v${v.version_number} · ${v.title}`
                : (v.title?.trim() || v.id),
            description: v.created_at
              ? `Created ${new Date(v.created_at).toLocaleDateString()}`
              : undefined,
          }));
          setAvailableVersions([...SAMPLE_DROPDOWN_AS_DIAGRAM_VERSIONS, ...mapped]);
        } else {
          setAvailableVersions(SAMPLE_DROPDOWN_AS_DIAGRAM_VERSIONS);
        }
      })
      .catch(() => {
        setAvailableVersions(SAMPLE_DROPDOWN_AS_DIAGRAM_VERSIONS);
      })
      .finally(() => setVersionsLoading(false));
    return () => controller.abort();
  }, [projectId, userId]);

  // When URL has ?version=..., show the form with that version (e.g. after refresh or shared link)
  useEffect(() => {
    if (!version) return;
    setSelectedVersionId(normalizeSampleVersionFromUrlParam(version) ?? version);
    setVersionPhase(false);
  }, [version]);

  // Fetch version detail (GET /api/amg-apd/versions/:id) when a non-sample version is selected
  useEffect(() => {
    if (!selectedVersionId || isSampleScenarioId(selectedVersionId)) {
      setVersionDetailResponse(null);
      return;
    }
    const controller = new AbortController();
    setVersionDetailLoading(true);
    setVersionDetailResponse(null);
    const headers = getAmgApdHeaders({
      userId: userId ?? undefined,
      chatId: projectId,
    });
    fetch(`/api/amg-apd/versions/${encodeURIComponent(selectedVersionId)}`, {
      signal: controller.signal,
      headers,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setVersionDetailResponse({ error: res.status, body: data });
          return;
        }
        setVersionDetailResponse(data);
      })
      .catch((err) => setVersionDetailResponse({ fetchError: String(err) }))
      .finally(() => setVersionDetailLoading(false));
    return () => controller.abort();
  }, [selectedVersionId, projectId, userId]);

  // Sample mode: editor baseline from bundled registry (sample-scenarios.ts), not backend drafts.
  useEffect(() => {
    if (!isSampleScenarioId(selectedVersionId)) {
      setSampleScenarioReady(false);
      return;
    }
    setScenarioDraftLoading(false);
    setScenarioDraftError(null);
    setScenarioDraftStatusLabel(null);
    setSavedScenarioYaml(null);
    setUsedLocalScenarioFallback(false);
    setSampleScenarioReady(false);
    setScenario(createInitialScenarioEditorState());
    const yaml = getSampleScenarioYaml(selectedVersionId);
    if (!yaml) {
      setScenarioDraftError("Unknown sample scenario.");
      return;
    }
    const parsed = parseSimulationScenarioYaml(yaml);
    if (!parsed.ok) {
      setScenarioDraftError(`Could not parse sample scenario YAML: ${parsed.error}`);
      return;
    }
    setScenario(parsed.state as ScenarioState);
    setScenarioError(null);
    setSampleScenarioReady(true);
  }, [selectedVersionId]);

  // Diagram version: load simulation scenario from backend; optional local AMG/APD transform only if backend is unavailable.
  useEffect(() => {
    if (isSampleScenarioId(selectedVersionId)) return;

    let cancelled = false;

    const tryLocalAmgFallback = async (): Promise<boolean> => {
      const headers = getAmgApdHeaders({
        userId: userId ?? undefined,
        chatId: projectId,
      });
      try {
        const res = await fetch(`/api/amg-apd/versions/${encodeURIComponent(selectedVersionId)}`, {
          headers,
        });
        const data = (await res.json().catch(() => ({}))) as { yaml_content?: string };
        const yamlContent = typeof data.yaml_content === "string" ? data.yaml_content : null;
        if (!yamlContent || cancelled) return false;
        const amg = parseAmgApdTemplate(yamlContent);
        if (!amg) return false;
        setScenario(amgApdTemplateToScenarioState(amg));
        setScenarioError(null);
        setSavedScenarioYaml(null);
        setScenarioDraftStatusLabel(null);
        setUsedLocalScenarioFallback(true);
        setScenarioDraftError(
          "Could not load the scenario from the simulation service. Showing a temporary preview derived from the diagram YAML until the service is available."
        );
        return true;
      } catch {
        return false;
      }
    };

    (async () => {
      setScenarioDraftLoading(true);
      setScenarioDraftError(null);
      setUsedLocalScenarioFallback(false);
      setSavedScenarioYaml(null);
      setScenarioDraftStatusLabel(null);
      setScenario(createInitialScenarioEditorState());
      setScenarioError(null);
      try {
        const data = await getDiagramScenarioDraft(projectId, selectedVersionId);
        if (cancelled) return;
        const yaml = typeof data.scenario_yaml === "string" ? data.scenario_yaml : "";
        if (!yaml.trim()) {
          setScenarioDraftError("The simulation service returned an empty scenario for this diagram version.");
          return;
        }
        const parsed = parseSimulationScenarioYaml(yaml);
        if (!parsed.ok) {
          setScenarioDraftError(`Could not parse scenario YAML: ${parsed.error}`);
          return;
        }
        setScenario(parsed.state as ScenarioState);
        setScenarioError(null);
        setSavedScenarioYaml(yaml.trim());
        setScenarioDraftStatusLabel(draftStatusFromResponse(data as Record<string, unknown>));
      } catch (e) {
        if (cancelled) return;
        const canTryFallback =
          !isSimulationApiError(e) ||
          (isSimulationApiError(e) && (e.status >= 500 || e.status === 502 || e.status === 503));
        const isClientError =
          isSimulationApiError(e) && (e.status === 400 || e.status === 404 || e.status === 409);
        if (isClientError) {
          setScenarioDraftError(scenarioDraftHttpMessage(e, "Failed to load scenario draft"));
          setSavedScenarioYaml(null);
          return;
        }
        if (canTryFallback && (await tryLocalAmgFallback())) return;
        setScenarioDraftError(
          scenarioDraftHttpMessage(e, "Failed to load scenario draft") +
            (canTryFallback ? " No local diagram fallback was available." : "")
        );
        setSavedScenarioYaml(null);
      } finally {
        if (!cancelled) setScenarioDraftLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVersionId, projectId, userId]);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<SimulationFormData>({
    name: "",
    description: "",
    nodes: 3,
    vcpu_per_node: 4,
    memory_gb_per_node: 8,
    concurrent_users: 1000,
    rps_target: 800,
    duration_seconds: 600,
    ramp_up_seconds: 60,
    scenario: "baseline",
    real_time_mode: false,
  });
  const [runMode, setRunMode] = useState<RunMode>("standard");
  const [batchRecommendation, setBatchRecommendation] = useState<BatchRecommendationFormState>(() =>
    defaultBatchRecommendation(10)
  );
  const minThroughputTouchedRef = useRef(false);
  const prevRunModeRef = useRef<RunMode | null>(null);
  const [configYaml, setConfigYaml] = useState("");
  const [seed, setSeed] = useState(0);
  const [optimization, setOptimization] = useState<{
    objective: "p95_latency_ms" | "p99_latency_ms" | "mean_latency_ms" | "throughput_rps" | "error_rate" | "cost" | "cpu_utilization" | "memory_utilization";
    max_iterations: number;
    max_evaluations: number | null;
    batch_target_util_low: number | null;
    batch_target_util_high: number | null;
    step_size: number;
    evaluation_duration_ms: number;
    target_p95_latency_ms: number;
    control_interval_ms: number;
    min_hosts: number;
    max_hosts: number;
    optimization_target_primary: "p95_latency" | "cpu_utilization" | "memory_utilization";
    target_util_high: number;
    target_util_low: number;
    scale_down_cpu_util_max: number;
    scale_down_mem_util_max: number;
    scale_down_host_cpu_util_max: number;
  }>({
    objective: "p95_latency_ms",
    max_iterations: 10,
    max_evaluations: null,
    /** Batch only: optional utilization band (0–1). When both set and low < high, sent for cpu_utilization/memory_utilization; else omit = minimize utilization. */
    batch_target_util_low: null as number | null,
    batch_target_util_high: null as number | null,
    step_size: 1.0,
    evaluation_duration_ms: 5000,
    target_p95_latency_ms: 200.0,
    control_interval_ms: 1000,
    min_hosts: 1,
    max_hosts: 3,
    optimization_target_primary: "p95_latency",
    target_util_high: 0.7,
    target_util_low: 0.4,
    scale_down_cpu_util_max: 0,
    scale_down_mem_util_max: 0,
    scale_down_host_cpu_util_max: 0,
  });
  /** Optional online-controller knobs — empty string means omit (server defaults). */
  const [onlineTuning, setOnlineTuning] = useState({
    lease_ttl_ms: "",
    max_controller_steps: "",
    max_online_duration_ms: "",
    max_noop_intervals: "",
    scale_down_cooldown_ms: "",
    host_drain_timeout_ms: "",
    memory_headroom_mb: "",
    allow_unbounded_online: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioState>(() => createInitialScenarioEditorState());

  const arrivalTypes: ArrivalType[] = ["poisson", "uniform", "normal", "bursty", "constant"];

  const { yaml: scenarioYaml, error: scenarioYamlError } = useMemo(() => {
    try {
      return { yaml: scenarioStateToYaml(scenario), error: null as string | null };
    } catch (err) {
      return {
        yaml: "",
        error: err instanceof Error ? err.message : "Invalid scenario (YAML generation failed).",
      };
    }
  }, [scenario]);

  /** Canonical form of the last loaded draft (parse → serialize) so formatting-only drift does not mark the editor dirty. */
  const canonicalSavedScenarioYaml = useMemo(() => {
    if (savedScenarioYaml == null) return null;
    const parsed = parseSimulationScenarioYaml(savedScenarioYaml);
    if (!parsed.ok) return null;
    try {
      return scenarioStateToYaml(parsed.state).trim();
    } catch {
      return null;
    }
  }, [savedScenarioYaml]);

  /** Editor matches last known backend draft for this diagram version (or sample flow). */
  const isDiagramScenarioSynced = useMemo(() => {
    if (isSampleScenario) return true;
    if (canonicalSavedScenarioYaml == null) return false;
    return scenarioYaml.trim() === canonicalSavedScenarioYaml;
  }, [isSampleScenario, canonicalSavedScenarioYaml, scenarioYaml]);

  const applyDraftResponseToEditor = (data: { scenario_yaml?: string } & Record<string, unknown>) => {
    const yaml = typeof data.scenario_yaml === "string" ? data.scenario_yaml : "";
    if (!yaml.trim()) return;
    const parsed = parseSimulationScenarioYaml(yaml);
    if (!parsed.ok) {
      setScenarioDraftError(`Could not parse scenario YAML: ${parsed.error}`);
      return;
    }
    setScenario(parsed.state as ScenarioState);
    setScenarioError(null);
    setSavedScenarioYaml(yaml.trim());
    const label = draftStatusFromResponse(data);
    if (label) setScenarioDraftStatusLabel(label);
  };

  const handleSaveDiagramScenario = async () => {
    if (isSampleScenario || diagramScenarioDraftBlocked) return;
    setSaveScenarioBusy(true);
    setScenarioDraftError(null);
    try {
      const res = await putDiagramScenarioDraft(projectId, selectedVersionId, {
        scenario_yaml: scenarioYaml,
        overwrite: false,
      });
      const y = scenarioYaml.trim();
      setSavedScenarioYaml(y);
      if (res && typeof res === "object" && "scenario_yaml" in res && res.scenario_yaml) {
        applyDraftResponseToEditor(res as Record<string, unknown>);
      } else {
        setScenarioDraftStatusLabel("edited");
      }
    } catch (e) {
      if (isSimulationApiError(e) && e.status === 409) {
        const ok =
          typeof window !== "undefined" &&
          window.confirm(
            "Conflict: the server already has a newer scenario draft. Overwrite it with your current editor content?"
          );
        if (ok) {
          try {
            const res = await putDiagramScenarioDraft(projectId, selectedVersionId, {
              scenario_yaml: scenarioYaml,
              overwrite: true,
            });
            const y = scenarioYaml.trim();
            setSavedScenarioYaml(y);
            if (res && typeof res === "object" && "scenario_yaml" in res && res.scenario_yaml) {
              applyDraftResponseToEditor(res as Record<string, unknown>);
            } else {
              setScenarioDraftStatusLabel("edited");
            }
          } catch (e2) {
            setScenarioDraftError(scenarioDraftHttpMessage(e2, "Save scenario failed"));
          }
        }
      } else {
        setScenarioDraftError(scenarioDraftHttpMessage(e, "Save scenario failed"));
      }
    } finally {
      setSaveScenarioBusy(false);
    }
  };

  const handleRegenerateDiagramScenario = async () => {
    if (isSampleScenario || scenarioDraftLoading) return;
    setRegenerateBusy(true);
    setScenarioDraftError(null);
    try {
      const res = await regenerateDiagramScenario(projectId, selectedVersionId, { overwrite: false });
      if (res && typeof res === "object" && "scenario_yaml" in res && (res as { scenario_yaml?: string }).scenario_yaml) {
        applyDraftResponseToEditor(res as Record<string, unknown>);
      } else {
        const data = await getDiagramScenarioDraft(projectId, selectedVersionId);
        applyDraftResponseToEditor(data as Record<string, unknown>);
      }
      setUsedLocalScenarioFallback(false);
    } catch (e) {
      if (isSimulationApiError(e) && e.status === 409) {
        const ok =
          typeof window !== "undefined" &&
          window.confirm(
            "An edited scenario already exists for this diagram. Regenerate from the diagram and overwrite it?"
          );
        if (ok) {
          try {
            const res = await regenerateDiagramScenario(projectId, selectedVersionId, { overwrite: true });
            if (res && typeof res === "object" && "scenario_yaml" in res && (res as { scenario_yaml?: string }).scenario_yaml) {
              applyDraftResponseToEditor(res as Record<string, unknown>);
            } else {
              const data = await getDiagramScenarioDraft(projectId, selectedVersionId);
              applyDraftResponseToEditor(data as Record<string, unknown>);
            }
            setUsedLocalScenarioFallback(false);
          } catch (e2) {
            setScenarioDraftError(scenarioDraftHttpMessage(e2, "Regenerate scenario failed"));
          }
        }
      } else {
        setScenarioDraftError(scenarioDraftHttpMessage(e, "Regenerate scenario failed"));
      }
    } finally {
      setRegenerateBusy(false);
    }
  };

  const endpointPathErrors = useMemo(() => {
    const out: Record<string, string> = {};
    scenario.services.forEach((svc, svcIndex) => {
      const pathCounts: Record<string, number> = {};
      svc.endpoints.forEach((ep) => {
        const p = (ep.path || "").trim();
        pathCounts[p] = (pathCounts[p] ?? 0) + 1;
      });
      svc.endpoints.forEach((ep, epIndex) => {
        const p = (ep.path || "").trim();
        if (pathCounts[p] > 1) {
          out[`${svcIndex}-${epIndex}`] = "Duplicate path in this service. Each endpoint path must be unique.";
        }
      });
    });
    return out;
  }, [scenario]);

  const expectedWorkloadRps = useMemo(() => {
    return scenario.workload.reduce((sum, w) => {
      const r = w.arrival?.rate_rps;
      return sum + (typeof r === "number" && Number.isFinite(r) && r >= 0 ? r : 0);
    }, 0);
  }, [scenario.workload]);

  useEffect(() => {
    if (minThroughputTouchedRef.current) return;
    const minTp = Math.round(expectedWorkloadRps * 0.95 * 1000) / 1000;
    setBatchRecommendation((prev) => ({
      ...prev,
      min_throughput_rps: minTp > 0 ? minTp : prev.min_throughput_rps,
    }));
  }, [expectedWorkloadRps]);

  useEffect(() => {
    if (runMode === "batch_recommendation" && prevRunModeRef.current !== "batch_recommendation") {
      setBatchRecommendation(defaultBatchRecommendation(expectedWorkloadRps));
      minThroughputTouchedRef.current = false;
    }
    prevRunModeRef.current = runMode;
  }, [runMode, expectedWorkloadRps]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "scenario"
          ? value
          : name === "name" || name === "description"
          ? value
          : Number(value) || 0,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateScenarioStep = (): boolean => {
    let scenarioIssue: string | null = null;

    if (draftBlocking) {
      scenarioIssue = "Wait for the scenario draft to finish loading.";
    } else if (draftUnavailableBlocking) {
      scenarioIssue =
        "The diagram scenario draft could not be loaded. Retry or regenerate from the diagram before continuing.";
    } else if (sampleScenarioBlocked) {
      scenarioIssue =
        "The bundled sample scenario could not be loaded (parse error). Fix the YAML or choose another version.";
    } else if (scenario.hosts.length === 0) {
      scenarioIssue = "At least one host is required.";
    } else if (
      scenario.hosts.some(
        (h) => !h.id.trim() || !Number.isFinite(h.cores) || h.cores < 1
      )
    ) {
      scenarioIssue = "Each host must have an ID and CPU cores of at least 1.";
    } else if (scenario.services.length === 0) {
      scenarioIssue = "At least one service is required.";
    } else if (
      scenario.services.some(
        (s) =>
          !s.id.trim() ||
          !Number.isFinite(s.replicas) ||
          s.replicas < 1 ||
          !s.model.trim()
      )
    ) {
      scenarioIssue =
        "Each service must have an ID, model, and replicas of at least 1.";
    } else if (scenario.workload.length === 0) {
      scenarioIssue = "At least one workload pattern is required.";
    } else if (
      scenario.workload.some(
        (w) =>
          !w.from.trim() ||
          !w.to.trim() ||
          !Number.isFinite(w.arrival.rate_rps) ||
          w.arrival.rate_rps < 0
      )
    ) {
      scenarioIssue =
        "Each workload pattern must have from/to and a non-negative base rate.";
    } else if (
      scenario.services.some((svc) => {
        const paths = svc.endpoints.map((e) => (e.path || "").trim());
        const seen = new Set<string>();
        return paths.some((p) => {
          if (seen.has(p)) return true;
          seen.add(p);
          return false;
        });
      })
    ) {
      scenarioIssue =
        "Duplicate endpoint path in a service. Each path must be unique per service.";
    }

    if (scenarioYamlError) {
      scenarioIssue = scenarioYamlError;
    }

    setScenarioError(scenarioIssue);
    return !scenarioIssue;
  };

  const validateConfigStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Simulation name is required";
    }

    const durationOkForMode =
      runMode === "online_optimization" ||
      (runMode === "batch_recommendation" && formData.duration_seconds >= 0) ||
      formData.duration_seconds > 0;

    if (!durationOkForMode) {
      newErrors.duration_seconds =
        "Duration must be greater than 0 (or 0 for batch recommendation when the parent run duration is driven by the optimizer)";
    }

    if (runMode === "batch_recommendation") {
      const br = batchRecommendation;
      if (br.max_evaluations < 1) {
        newErrors.config = "Max evaluations must be greater than 0";
      } else if (br.evaluation_duration_ms < 10_000 || br.evaluation_duration_ms > 120_000) {
        newErrors.config = "Evaluation duration must be between 10,000 ms and 120,000 ms";
      } else if (br.max_error_rate < 0 || br.max_error_rate > 1) {
        newErrors.config = "Max error rate must be between 0 and 1";
      } else if (!(br.min_throughput_rps > 0)) {
        newErrors.config = "Minimum throughput (RPS) must be greater than 0";
      } else {
        const bands: [number, number, string][] = [
          [br.service_cpu_low, br.service_cpu_high, "Service CPU utilization"],
          [br.service_mem_low, br.service_mem_high, "Service memory utilization"],
          [br.host_cpu_low, br.host_cpu_high, "Host CPU utilization"],
          [br.host_mem_low, br.host_mem_high, "Host memory utilization"],
        ];
        for (const [lo, hi, label] of bands) {
          if (lo < 0 || hi > 1 || !(lo < hi)) {
            newErrors.config = `${label}: band must be within 0–1 with low strictly less than high`;
            break;
          }
        }
        if (!newErrors.config && allowedActionsFromFlags(br).length === 0) {
          newErrors.config =
            "Select at least one scaling option (Batch recommendation → Advanced search settings → Allowed scaling dimensions).";
        }
        if (!newErrors.config) {
          if (br.min_hosts > br.max_hosts) {
            newErrors.config = "Scale bounds: min hosts must be ≤ max hosts";
          } else if (br.min_replicas_per_service > br.max_replicas_per_service) {
            newErrors.config = "Scale bounds: min replicas must be ≤ max replicas";
          } else if (br.min_cpu_cores_per_instance >= br.max_cpu_cores_per_instance) {
            newErrors.config = "Scale bounds: min CPU per instance must be less than max";
          } else if (br.min_memory_mb_per_instance >= br.max_memory_mb_per_instance) {
            newErrors.config = "Scale bounds: min memory per instance must be less than max";
          } else if (br.min_host_cpu_cores > br.max_host_cpu_cores) {
            newErrors.config = "Scale bounds: min host CPU cores must be ≤ max";
          } else if (br.min_host_memory_gb > br.max_host_memory_gb) {
            newErrors.config = "Scale bounds: min host memory must be ≤ max";
          }
        }
      }
    }

    if (runMode === "batch_legacy") {
      if (optimization.max_iterations < 1) {
        newErrors.config = "Max iterations must be at least 1";
      } else if (optimization.evaluation_duration_ms <= 0) {
        newErrors.config = "Evaluation duration must be greater than 0";
      } else if (
        (optimization.objective === "cpu_utilization" || optimization.objective === "memory_utilization") &&
        (optimization.batch_target_util_low != null || optimization.batch_target_util_high != null)
      ) {
        const low = optimization.batch_target_util_low ?? 0;
        const high = optimization.batch_target_util_high ?? 0;
        if (optimization.batch_target_util_low == null || optimization.batch_target_util_high == null) {
          newErrors.config = "Set both target utilization low and high, or clear both for minimize behavior";
        } else if (low < 0 || high > 1) {
          newErrors.config = "Target utilization band must be between 0 and 1";
        } else if (low >= high) {
          newErrors.config = "Target utilization low must be less than high";
        }
      }
    }

    if (runMode === "online_optimization") {
      const primary = optimization.optimization_target_primary;
      if (primary === "p95_latency") {
        if (optimization.target_p95_latency_ms <= 0) {
          newErrors.config = "Online P95-primary runs require target P95 latency greater than 0 ms";
        }
      } else if (primary === "cpu_utilization" || primary === "memory_utilization") {
        if (optimization.target_p95_latency_ms < 0) {
          newErrors.config = "Target P95 guardrail cannot be negative";
        }
      }
      if (!newErrors.config) {
        if (optimization.control_interval_ms <= 0) {
          newErrors.config = "Control interval must be greater than 0";
        } else if (optimization.min_hosts < 1) {
          newErrors.config = "Min hosts must be at least 1";
        } else if (optimization.max_hosts < optimization.min_hosts) {
          newErrors.config = "Max hosts must be >= min hosts";
        } else if (
          (optimization.optimization_target_primary === "cpu_utilization" ||
            optimization.optimization_target_primary === "memory_utilization") &&
          optimization.target_util_low >= optimization.target_util_high
        ) {
          newErrors.config = "Scale-down utilization must be less than scale-up utilization";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const executeCreateRun = async (
    mode: "sample" | "diagram_saved" | "diagram_transient" | "diagram_save_and_run"
  ) => {
    if (draftBlocking) {
      setErrors({ general: "Wait for the scenario draft to finish loading." });
      return;
    }
    if (draftUnavailableBlocking) {
      setErrors({
        general:
          "The diagram scenario draft could not be loaded. Retry or regenerate from the diagram before running.",
      });
      return;
    }
    if (sampleScenarioBlocked) {
      setErrors({
        general:
          "The sample scenario is not ready (parse error). Choose another version or fix the bundled sample YAML.",
      });
      return;
    }
    if (!validateScenarioStep() || !validateConfigStep()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const finalScenarioYaml = scenarioYaml;
      const durationMs =
        runMode === "online_optimization"
          ? 0
          : Math.max(0, Math.round(formData.duration_seconds * 1000));

      const parseOptionalInt = (s: string): number | undefined => {
        const t = s.trim();
        if (t === "") return undefined;
        const n = Number(t);
        return Number.isFinite(n) ? Math.trunc(n) : undefined;
      };

      let optimizationPayload: Record<string, unknown> | undefined;
      if (runMode === "batch_recommendation") {
        optimizationPayload = buildBatchRecommendationOptimizationPayload(batchRecommendation);
      } else if (runMode === "batch_legacy") {
        const isUtilObjective =
          optimization.objective === "cpu_utilization" || optimization.objective === "memory_utilization";
        const low = optimization.batch_target_util_low;
        const high = optimization.batch_target_util_high;
        const validBand =
          isUtilObjective &&
          low != null &&
          high != null &&
          low >= 0 &&
          high <= 1 &&
          low < high;
        optimizationPayload = {
          objective: optimization.objective,
          max_iterations: optimization.max_iterations,
          ...(optimization.max_evaluations != null && optimization.max_evaluations > 0
            ? { max_evaluations: optimization.max_evaluations }
            : {}),
          ...(validBand ? { target_util_low: low, target_util_high: high } : {}),
          step_size: optimization.step_size,
          evaluation_duration_ms: optimization.evaluation_duration_ms,
          online: false,
        };
      } else if (runMode === "online_optimization") {
        const extra: Record<string, unknown> = {
          objective: optimization.objective,
          online: true,
          optimization_target_primary: optimization.optimization_target_primary || "p95_latency",
          target_p95_latency_ms: optimization.target_p95_latency_ms,
          control_interval_ms: optimization.control_interval_ms,
          min_hosts: optimization.min_hosts,
          max_hosts: optimization.max_hosts,
          target_util_high: optimization.target_util_high,
          target_util_low: optimization.target_util_low,
          scale_down_cpu_util_max: optimization.scale_down_cpu_util_max,
          scale_down_mem_util_max: optimization.scale_down_mem_util_max,
          scale_down_host_cpu_util_max: optimization.scale_down_host_cpu_util_max,
        };
        const lt = parseOptionalInt(onlineTuning.lease_ttl_ms);
        if (lt != null && lt > 0) extra.lease_ttl_ms = lt;
        const mcs = parseOptionalInt(onlineTuning.max_controller_steps);
        if (mcs != null && mcs >= 0) extra.max_controller_steps = mcs;
        const mod = parseOptionalInt(onlineTuning.max_online_duration_ms);
        if (mod != null && mod > 0) extra.max_online_duration_ms = mod;
        const mni = parseOptionalInt(onlineTuning.max_noop_intervals);
        if (mni != null && mni >= 0) extra.max_noop_intervals = mni;
        const sdc = parseOptionalInt(onlineTuning.scale_down_cooldown_ms);
        if (sdc != null && sdc >= 0) extra.scale_down_cooldown_ms = sdc;
        const hdt = parseOptionalInt(onlineTuning.host_drain_timeout_ms);
        if (hdt != null && hdt >= 0) extra.host_drain_timeout_ms = hdt;
        const mh = parseOptionalInt(onlineTuning.memory_headroom_mb);
        if (mh != null && mh >= 0) extra.memory_headroom_mb = mh;
        if (onlineTuning.allow_unbounded_online) extra.allow_unbounded_online = true;
        optimizationPayload = extra;
      }

      const body: CreateProjectRunRequest = {
        duration_ms: durationMs,
        real_time_mode: formData.real_time_mode,
        metadata: {
          name: formData.name,
          description: formData.description || undefined,
          project_id: projectId,
          source: "frontend-scenario-editor",
          ...(runMode === "batch_recommendation"
            ? { mode: "batch_recommendation" as const }
            : runMode === "batch_legacy"
              ? { mode: "batch" as const }
              : runMode === "online_optimization"
                ? { mode: "online_optimization" as const }
                : {}),
        },
        ...(configYaml.trim() ? { config_yaml: configYaml.trim() } : {}),
        ...(seed > 0 ? { seed } : {}),
        ...(optimizationPayload ? { optimization: optimizationPayload } : {}),
      };

      if (mode === "sample") {
        body.scenario_yaml = finalScenarioYaml;
      } else if (mode === "diagram_saved") {
        body.diagram_version_id = selectedVersionId;
      } else if (mode === "diagram_transient") {
        body.diagram_version_id = selectedVersionId;
        body.scenario_yaml = finalScenarioYaml;
        body.save_scenario = false;
      } else {
        body.diagram_version_id = selectedVersionId;
        body.scenario_yaml = finalScenarioYaml;
        body.save_scenario = true;
        body.overwrite_scenario_cache = false;
      }

      const isSaveAndRun = mode === "diagram_save_and_run";
      let runResponse;
      try {
        runResponse = await createProjectSimulationRun(projectId, body);
      } catch (err) {
        if (
          isSaveAndRun &&
          isSimulationApiError(err) &&
          err.status === 409
        ) {
          const ok =
            typeof window !== "undefined" &&
            window.confirm(
              "Conflict saving the scenario. Retry and overwrite the cached scenario on the server?"
            );
          if (!ok) throw err;
          runResponse = await createProjectSimulationRun(projectId, {
            ...body,
            overwrite_scenario_cache: true,
          });
        } else {
          throw err;
        }
      }

      router.push(`/project/${projectId}/simulation/${runResponse.run.run_id}`);
    } catch (error) {
      console.error("Error creating simulation:", error);
      let message = "Failed to create simulation. Please try again.";
      if (isSimulationApiError(error)) {
        const d = error.detailsSummary;
        const suffix = d ? `\n${d}` : "";
        if (error.status === 400) {
          message = `Invalid scenario YAML or request: ${error.message}${suffix}`;
        } else if (error.status === 404) {
          message = `Not found (diagram version or scenario missing): ${error.message}${suffix}`;
        } else if (error.status === 409) {
          message = `Conflict: ${error.message}${suffix}`;
        } else if (error.status === 500) {
          message = `Simulation service error: ${error.message}${suffix}`;
        } else if (error.status === 502) {
          message = `${error.message} (bad gateway — engine or proxy unavailable)${suffix}`;
        } else {
          message = `${error.message}${suffix}`;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep !== 3) return;
    if (isSampleScenario) {
      void executeCreateRun("sample");
      return;
    }
    if (isDiagramScenarioSynced) {
      void executeCreateRun("diagram_saved");
      return;
    }
    setErrors({
      general:
        'Choose "Run without saving" or "Save and run" — or save the scenario on step 1 first.',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/project/${projectId}/simulation`}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Simulation</h1>
          <p className="text-sm text-white/60 mt-1">
            {versionPhase
              ? "Select a scenario version to start with"
              : isSampleScenario
              ? "Sample scenario — configure and start a test simulation run"
              : "Configure and start a new simulation run for this project"}
          </p>
        </div>
      </div>

      {/* Version selector phase */}
      {versionPhase && (
        <div className="bg-card rounded-lg p-8 border border-border max-w-lg space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/10">
              <FileCode2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Choose a scenario version</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Select a saved diagram version or use the sample to get started.
              </p>
            </div>
          </div>

          {versionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              Loading versions…
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-white/70">
                Scenario version
              </label>
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                {availableVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              {availableVersions.find((v) => v.id === selectedVersionId)?.description && (
                <p className="text-xs text-white/50 pt-1">
                  {availableVersions.find((v) => v.id === selectedVersionId)!.description}
                </p>
              )}
              {availableVersions.filter((v) => !isSampleScenarioId(v.id)).length === 0 && (
                <p className="text-xs text-amber-400/80 pt-1">
                  No saved diagram versions for this project. Use a bundled sample or create versions in
                  Pattern Detection first.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Link
              href={`/project/${projectId}/simulation`}
              className="px-4 py-2 text-sm rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={versionsLoading}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("version", selectedVersionId);
                router.replace(`/project/${projectId}/simulation/new?${params.toString()}`, { scroll: false });
                setVersionPhase(false);
              }}
              className="px-5 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Load &amp; Configure →
            </button>
          </div>
        </div>
      )}

      {/* Multi-step form — shown only after a version is selected */}
      {!versionPhase && (
        <>
      {/* Stepper */}
      <div className="mt-4 flex items-center gap-4">
        {[{ step: 1, label: "Scenario setup" }, { step: 2, label: "Configuration" }, { step: 3, label: "Review" }].map(
          ({ step, label }, idx) => {
            const isActive = currentStep === step;
            const isCompleted = currentStep > step;
            return (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isActive
                      ? "bg-white text-black"
                      : isCompleted
                      ? "bg-emerald-400 text-black"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {step}
                </div>
                <span className={`text-xs ${isActive ? "text-white" : "text-white/60"}`}>{label}</span>
                {idx < 2 && <div className="w-10 h-px bg-white/15 ml-2" />}
              </div>
            );
          }
        )}
      </div>

      {/* Debug: Version API response (GET /api/amg-apd/versions/:id) + YAML template */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-white/5">
          <span className="text-xs font-medium text-white/70">Debug: Version API response</span>
          <select
            value={debugView}
            onChange={(e) => setDebugView(e.target.value as "hide" | "show" | "yaml")}
            className="text-xs px-2 py-1 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            <option value="hide">Hide</option>
            <option value="show">Show version response</option>
            <option value="yaml">Show YAML template</option>
          </select>
        </div>
        {debugView === "show" && (
          <div className="p-3 border-t border-white/10 bg-black/20 max-h-64 overflow-auto">
            {versionDetailLoading ? (
              <p className="text-xs text-white/50">Loading…</p>
            ) : isSampleScenario ? (
              <p className="text-xs text-white/50">Select a saved diagram version (not a bundled sample) to load response.</p>
            ) : versionDetailResponse === null ? (
              <p className="text-xs text-white/50">No response yet.</p>
            ) : (
              <pre className="text-[11px] font-mono text-white/80 whitespace-pre-wrap break-all">
                {JSON.stringify(versionDetailResponse, null, 2)}
              </pre>
            )}
          </div>
        )}
        {debugView === "yaml" && (
          <div className="p-3 border-t border-white/10 bg-black/20 max-h-64 overflow-auto">
            {versionDetailLoading ? (
              <p className="text-xs text-white/50">Loading…</p>
            ) : versionYamlTemplate ? (
              <pre className="text-[11px] font-mono text-white/80 whitespace-pre-wrap break-all">
                {versionYamlTemplate}
              </pre>
            ) : isSampleScenario ? (
              <p className="text-xs text-white/50">Select a saved diagram version (not a bundled sample) to load YAML template.</p>
            ) : (
              <p className="text-xs text-white/50">No YAML template in response yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleFormSubmit} className="space-y-6">
        <div className="bg-card rounded-lg p-6 border border-border space-y-6">
          {/* Step 2: Configuration */}
          {currentStep === 2 && (
            <>
              {/* Basic Info */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>
                <div className="space-y-4">
                  <InputField
                    name="name"
                    type="text"
                    label="Simulation Name"
                    placeholder="e.g., High Load Test - 2000 Users"
                    value={formData.name}
                    onChange={handleChange}
                    error={errors.name}
                    required
                  />
                  <TextAreaField
                    name="description"
                    label="Description (optional)"
                    placeholder="Describe the purpose of this simulation..."
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    required={false}
                  />
                </div>
              </div>

              {/* Run mode selector */}
              <div className="mt-4">
                <h2 className="text-lg font-semibold text-white mb-3">Run mode</h2>
                <p className="text-xs text-white/55 mb-3 leading-relaxed max-w-3xl">
                  <strong className="text-white/70">Standard</strong> — single simulation run.{" "}
                  <strong className="text-white/70">Batch recommendation</strong> — search for a cheaper layout that
                  still meets your latency, errors, throughput, and utilization targets.{" "}
                  <strong className="text-white/70">Legacy batch</strong> — hill-climb on one scalar objective.{" "}
                  <strong className="text-white/70">Online</strong> — live controller with P95 and scaling targets.
                </p>
                <div className="inline-flex flex-wrap gap-1 rounded-lg border border-white/15 bg-white/5 p-1 text-[11px] text-white/80">
                  {(
                    [
                      { id: "standard" as const, label: "Standard" },
                      { id: "batch_recommendation" as const, label: "Batch recommendation" },
                      { id: "batch_legacy" as const, label: "Legacy batch objective" },
                      { id: "online_optimization" as const, label: "Online optimization" },
                    ] as const
                  ).map((mode) => {
                    const active = runMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setRunMode(mode.id)}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          active
                            ? "bg-white text-black font-medium shadow-sm"
                            : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
                {runMode === "batch_recommendation" && (
                  <p className="text-xs text-emerald-200/90 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 leading-relaxed">
                    <span className="font-semibold text-emerald-100">Batch recommendation: </span>
                    Use Quick for essential targets, Balanced to separate service vs host utilization, or Advanced for
                    scaling limits and search tuning.
                  </p>
                )}
                {runMode === "batch_legacy" && (
                  <p className="text-xs text-amber-200/85 mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 leading-relaxed">
                    <span className="font-semibold text-amber-100">Legacy hill-climb only. </span>
                    For guardrails (P95/P99, error rate, min RPS), utilization bands, and beam parameters, switch to{" "}
                    <strong>Batch recommendation</strong>.
                  </p>
                )}
              </div>

              {/* Duration — not shown for online optimization */}
              {runMode !== "online_optimization" ? (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-3">Duration</h2>
                  <div className="flex items-end gap-4">
                    <div className="w-40">
                      <InputField
                        name="duration_seconds"
                        type="number"
                        min={runMode === "batch_recommendation" ? 0 : 1}
                        label="Duration (seconds)"
                        value={formData.duration_seconds.toString()}
                        onChange={handleChange}
                        error={errors.duration_seconds}
                        required
                      />
                    </div>
                    <p className="text-xs text-white/50 pb-2">
                      {runMode === "batch_recommendation"
                        ? "Use 0 if the parent run duration is driven by the batch optimizer; otherwise set wall-clock duration."
                        : "How long the simulation will run. Converted to milliseconds when submitted."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
                  <span className="font-semibold">Online mode:</span> Duration is not required — this
                  run stays active until you stop it manually via the simulation detail page.
                </div>
              )}

              {/* Real-time mode */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">Options</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      id="real_time_mode"
                      type="checkbox"
                      checked={formData.real_time_mode}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, real_time_mode: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border border-white/40 bg-black/40 text-white focus:ring-2 focus:ring-white/40"
                    />
                    <label
                      htmlFor="real_time_mode"
                      className="text-sm font-medium text-white/80 cursor-pointer select-none"
                    >
                      Run in real-time mode{" "}
                      <span className="text-white/40 font-normal">(recommended for live dashboards)</span>
                    </label>
                  </div>

                  {/* Seed */}
                  <div className="flex items-end gap-4">
                    <div className="w-40">
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        Seed <span className="text-white/40 font-normal">(0 = auto)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <p className="text-xs text-white/50 pb-2">
                      Set a fixed seed for reproducible results. Leave at 0 for a server-generated seed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Config YAML (optional) */}
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Config YAML{" "}
                  <span className="text-white/40 font-normal">(optional override)</span>
                </label>
                <textarea
                  value={configYaml}
                  onChange={(e) => setConfigYaml(e.target.value)}
                  rows={4}
                  placeholder="# Optional simulator config overrides..."
                  className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-white/30 resize-y"
                />
              </div>

              {/* Batch recommendation — bounded search */}
              {runMode === "batch_recommendation" && (
                <BatchRecommendationFields
                  value={batchRecommendation}
                  setValue={setBatchRecommendation}
                  expectedWorkloadRps={expectedWorkloadRps}
                  markMinThroughputTouched={() => {
                    minThroughputTouchedRef.current = true;
                  }}
                />
              )}

              {/* Legacy batch (single-objective hill climb) */}
              {runMode === "batch_legacy" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-2">
                    Legacy batch objective
                  </h3>
                  <p className="text-xs text-white/50">
                    Hill-climbing search over a scalar objective. Sends legacy top-level fields (no structured batch
                    recommendation constraints).
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Objective</label>
                      <select
                        value={optimization.objective}
                        onChange={(e) =>
                          setOptimization((prev) => ({
                            ...prev,
                            objective: e.target.value as typeof optimization.objective,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      >
                        <option value="p95_latency_ms">p95 latency (ms)</option>
                        <option value="p99_latency_ms">p99 latency (ms)</option>
                        <option value="mean_latency_ms">Mean latency (ms)</option>
                        <option value="throughput_rps">Throughput (rps)</option>
                        <option value="error_rate">Error rate</option>
                        <option value="cost">Cost</option>
                        <option value="cpu_utilization">CPU utilization</option>
                        <option value="memory_utilization">Memory utilization</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Max iterations</label>
                      <input
                        type="number"
                        min={1}
                        value={optimization.max_iterations}
                        onChange={(e) =>
                          setOptimization((prev) => ({
                            ...prev,
                            max_iterations: Number(e.target.value) || 1,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Max evaluations</label>
                      <input
                        type="number"
                        min={1}
                        placeholder="Optional"
                        value={optimization.max_evaluations ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setOptimization((prev) => ({
                            ...prev,
                            max_evaluations: v === "" ? null : Math.max(1, Number(v) || 1),
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 placeholder:text-white/30"
                      />
                      <p className="text-xs text-white/40 mt-0.5">
                        Cap total runs to avoid too many evaluations (e.g. 25). Leave empty for no cap.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Step size</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={optimization.step_size}
                        onChange={(e) =>
                          setOptimization((prev) => ({
                            ...prev,
                            step_size: Number(e.target.value) || 0.1,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        Eval duration (ms)
                      </label>
                      <input
                        type="number"
                        min={100}
                        step={100}
                        value={optimization.evaluation_duration_ms}
                        onChange={(e) =>
                          setOptimization((prev) => ({
                            ...prev,
                            evaluation_duration_ms: Number(e.target.value) || 1000,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    {(optimization.objective === "cpu_utilization" || optimization.objective === "memory_utilization") && (
                      <>
                        <div className="col-span-full text-xs text-white/50 mt-1">
                          Target utilization band (optional): aim for utilization within this range instead of minimizing. Leave empty for minimize behavior.
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Band low (0–1)</label>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            placeholder="e.g. 0.4"
                            value={optimization.batch_target_util_low ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              setOptimization((prev) => ({
                                ...prev,
                                batch_target_util_low: v === "" ? null : Math.min(1, Math.max(0, Number(v) || 0)),
                              }));
                            }}
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 placeholder:text-white/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Band high (0–1)</label>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            placeholder="e.g. 0.7"
                            value={optimization.batch_target_util_high ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              setOptimization((prev) => ({
                                ...prev,
                                batch_target_util_high: v === "" ? null : Math.min(1, Math.max(0, Number(v) || 0)),
                              }));
                            }}
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 placeholder:text-white/30"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/* Online optimization settings */}
              {runMode === "online_optimization" && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-sky-300 mb-2">
                    Online Optimization Settings
                  </h3>
                  <p className="text-xs text-white/50">
                    A controller loop reads live metrics and continuously adjusts the deployment. The
                    run stays active until manually stopped.
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">
                      Primary optimization target
                    </label>
                    <select
                      value={optimization.optimization_target_primary}
                      onChange={(e) =>
                        setOptimization((prev) => ({
                          ...prev,
                          optimization_target_primary: e.target
                            .value as typeof optimization.optimization_target_primary,
                        }))
                      }
                      className="w-full max-w-xs px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    >
                      <option value="p95_latency">P95 latency</option>
                      <option value="cpu_utilization">CPU utilization</option>
                      <option value="memory_utilization">Memory utilization</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {optimization.optimization_target_primary === "p95_latency" ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Target p95 latency (ms)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={optimization.target_p95_latency_ms}
                            onChange={(e) =>
                              setOptimization((prev) => ({
                                ...prev,
                                target_p95_latency_ms: Number(e.target.value) || 1,
                              }))
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Control interval (ms)
                          </label>
                          <input
                            type="number"
                            min={100}
                            step={100}
                            value={optimization.control_interval_ms}
                            onChange={(e) =>
                              setOptimization((prev) => ({
                                ...prev,
                                control_interval_ms: Number(e.target.value) || 100,
                              }))
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Scale-up when utilization above (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(optimization.target_util_high * 100)}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setOptimization((prev) => ({
                                ...prev,
                                target_util_high: Math.min(1, Math.max(0, Number.isFinite(v) ? v / 100 : 0.7)),
                              }));
                            }}
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            title="Scale up when CPU/memory utilization exceeds this."
                          />
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Scale up when utilization exceeds this.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Scale-down when utilization below (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(optimization.target_util_low * 100)}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setOptimization((prev) => ({
                                ...prev,
                                target_util_low: Math.min(1, Math.max(0, Number.isFinite(v) ? v / 100 : 0.4)),
                              }));
                            }}
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            title="Scale down when utilization is below this (and P95 still within target)."
                          />
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Scale down when below this; P95 guardrail still applies.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            P95 guardrail (ms)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={optimization.target_p95_latency_ms}
                            onChange={(e) => {
                              const v = e.target.value;
                              const n = v === "" ? 0 : Number(v);
                              setOptimization((prev) => ({
                                ...prev,
                                target_p95_latency_ms: Number.isFinite(n) ? Math.max(0, n) : 0,
                              }));
                            }}
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Use 0 for no P95 guardrail; scale-down is blocked if P95 would exceed a positive value.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Control interval (ms)
                          </label>
                          <input
                            type="number"
                            min={100}
                            step={100}
                            value={optimization.control_interval_ms}
                            onChange={(e) =>
                              setOptimization((prev) => ({
                                ...prev,
                                control_interval_ms: Number(e.target.value) || 100,
                              }))
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Min hosts</label>
                      <input
                        type="number"
                        min={1}
                        value={optimization.min_hosts}
                        onChange={(e) =>
                          setOptimization((prev) => ({
                            ...prev,
                            min_hosts: Number(e.target.value) || 1,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Max hosts</label>
                      <input
                        type="number"
                        min={1}
                        value={optimization.max_hosts}
                        onChange={(e) =>
                          setOptimization((prev) => ({
                            ...prev,
                            max_hosts: Number(e.target.value) || 1,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                  </div>

                  {/* Scale-down rules (optional) */}
                  <div className="border-t border-sky-500/20 pt-4">
                    <h4 className="text-xs font-medium text-sky-200/90 mb-3">Scale-down rules</h4>
                    <p className="text-[10px] text-white/40 mb-3">
                      Optional. 0 = off. Allow scale-down or host scale-in only when utilization is below the given %.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Allow scale-down only when service CPU below (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(optimization.scale_down_cpu_util_max * 100)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setOptimization((prev) => ({
                              ...prev,
                              scale_down_cpu_util_max: Math.min(1, Math.max(0, Number.isFinite(v) ? v / 100 : 0)),
                            }));
                          }}
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Allow scale-down only when service memory below (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(optimization.scale_down_mem_util_max * 100)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setOptimization((prev) => ({
                              ...prev,
                              scale_down_mem_util_max: Math.min(1, Math.max(0, Number.isFinite(v) ? v / 100 : 0)),
                            }));
                          }}
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Allow host scale-in only when host CPU below (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(optimization.scale_down_host_cpu_util_max * 100)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setOptimization((prev) => ({
                              ...prev,
                              scale_down_host_cpu_util_max: Math.min(1, Math.max(0, Number.isFinite(v) ? v / 100 : 0)),
                            }));
                          }}
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                    </div>
                  </div>

                  <details className="border-t border-sky-500/20 pt-4">
                    <summary className="text-xs font-medium text-sky-200/90 cursor-pointer select-none">
                      Advanced: lease, controller limits, drain timing
                    </summary>
                    <p className="text-[11px] text-white/40 mt-2 mb-3">
                      Optional fields forwarded to the engine. Leave empty for defaults. For long online runs, set{" "}
                      <span className="text-white/50">lease_ttl_ms</span> — the run detail page renews the lease on a
                      timer.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {(
                        [
                          ["lease_ttl_ms", "Lease TTL (ms)"],
                          ["max_controller_steps", "Max controller steps"],
                          ["max_online_duration_ms", "Max online duration (ms)"],
                          ["max_noop_intervals", "Max noop intervals"],
                          ["scale_down_cooldown_ms", "Scale-down cooldown (ms)"],
                          ["host_drain_timeout_ms", "Host drain timeout (ms)"],
                          ["memory_headroom_mb", "Memory headroom (MB)"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <label className="block text-[10px] font-medium text-white/60 mb-0.5">{label}</label>
                          <input
                            type="number"
                            min={0}
                            value={onlineTuning[key as keyof typeof onlineTuning] as string}
                            onChange={(e) =>
                              setOnlineTuning((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="w-full px-2 py-1 bg-black/40 border border-white/15 rounded text-white font-mono"
                          />
                        </div>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 mt-3 text-[11px] text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlineTuning.allow_unbounded_online}
                        onChange={(e) =>
                          setOnlineTuning((prev) => ({ ...prev, allow_unbounded_online: e.target.checked }))
                        }
                        className="rounded border-white/30"
                      />
                      Allow unbounded online (only sent when checked)
                    </label>
                  </details>
                </div>
              )}

              {/* Config step errors */}
              {errors.config && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                  {errors.config}
                </div>
              )}

              {/* Step 2 navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-sm rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={diagramScenarioDraftBlocked}
                  onClick={() => {
                    if (validateScenarioStep() && validateConfigStep()) setCurrentStep(3);
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Review
                </button>
              </div>
            </>
          )}

          {/* Step 1: Scenario setup */}
          {currentStep === 1 && (
            <>
              {/* Scenario validation message */}
              {scenarioError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                  {scenarioError}
                </div>
              )}

              {scenarioDraftError && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200">
                  {scenarioDraftError}
                </div>
              )}

              {draftUnavailableBlocking && (
                <div className="bg-red-500/10 border border-red-500/35 rounded-lg px-3 py-2 text-xs text-red-200">
                  The scenario draft for this diagram version could not be loaded from the simulation service. You
                  cannot save or run until it loads successfully — use{" "}
                  <span className="font-semibold text-white/90">Regenerate from diagram</span> or
                  switch version, or fix the service error and reload.
                </div>
              )}

              {usedLocalScenarioFallback && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 text-xs text-amber-100/90">
                  Preview uses a temporary client-side mapping from the diagram YAML. Save or regenerate once the
                  simulation service is available so the server owns the scenario draft.
                </div>
              )}

              {!isSampleScenario && (
                <div className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
                    {scenarioDraftLoading ? (
                      <span className="flex items-center gap-2 text-white/60">
                        <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                        Loading scenario from simulation service…
                      </span>
                    ) : (
                      <>
                        {scenarioDraftStatusLabel && (
                          <span className="rounded bg-white/10 px-2 py-0.5 font-medium text-white/90 capitalize">
                            {scenarioDraftStatusLabel}
                          </span>
                        )}
                        {!scenarioDraftLoading && !isDiagramScenarioSynced && (
                            <span className="text-amber-200/90">Unsaved changes</span>
                          )}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={diagramScenarioDraftBlocked || saveScenarioBusy || isSampleScenario}
                      onClick={() => void handleSaveDiagramScenario()}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saveScenarioBusy ? "Saving…" : "Save scenario"}
                    </button>
                    <button
                      type="button"
                      disabled={scenarioDraftLoading || regenerateBusy || isSampleScenario}
                      onClick={() => void handleRegenerateDiagramScenario()}
                      className="px-3 py-1.5 text-xs rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {regenerateBusy ? "Regenerating…" : "Regenerate from diagram"}
                    </button>
                  </div>
                </div>
              )}

              {/* Hosts (from scenario YAML) */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Hosts</h2>
                <div className="space-y-3">
                  {scenario.hosts.map((host, index) => (
                    <div
                      key={host.id || index}
                      className="flex flex-col md:flex-row md:items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3"
                    >
                      <div className="flex-1 flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Host ID
                          </label>
                          <input
                            type="text"
                            value={host.id}
                            onChange={(e) =>
                              setScenario((prev) => {
                                const next = { ...prev, hosts: [...prev.hosts] };
                                next.hosts[index] = { ...next.hosts[index], id: e.target.value };
                                return next;
                              })
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            CPU cores
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={host.cores}
                            onChange={(e) =>
                              setScenario((prev) => {
                                const cores = Number(e.target.value) || 1;
                                const next = { ...prev, hosts: [...prev.hosts] };
                                next.hosts[index] = { ...next.hosts[index], cores };
                                return next;
                              })
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Memory (GB)
                          </label>
                          <input
                            type="number"
                            min={0}
                            placeholder="16 (default)"
                            value={host.memory_gb ?? ""}
                            onChange={(e) =>
                              setScenario((prev) => {
                                const raw = e.target.value.trim();
                                const memory_gb = raw === "" ? undefined : Number(raw) || 0;
                                const next = { ...prev, hosts: [...prev.hosts] };
                                next.hosts[index] = { ...next.hosts[index], memory_gb };
                                return next;
                              })
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30 placeholder:text-white/40"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={scenario.hosts.length === 1}
                        onClick={() =>
                          setScenario((prev) => ({
                            ...prev,
                            hosts: prev.hosts.filter((_, i) => i !== index),
                          }))
                        }
                        className="self-start px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setScenario((prev) => ({
                        ...prev,
                        hosts: [
                          ...prev.hosts,
                          { id: `host-${prev.hosts.length + 1}`, cores: 4, memory_gb: 16 },
                        ],
                      }))
                    }
                    className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
                  >
                    Add host
                  </button>
                </div>
              </div>

              {/* Services (from scenario YAML) */}
              <div>
            <h2 className="text-lg font-semibold text-white mb-4">Services & Endpoints</h2>
            <div className="space-y-4">
              {scenario.services.map((svc, svcIndex) => (
                <div
                  key={svc.id || svcIndex}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Service ID
                        </label>
                        <input
                          type="text"
                          value={svc.id}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = { ...services[svcIndex], id: e.target.value };
                              return { ...prev, services };
                            })
                          }
                          className="px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Replicas
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={svc.replicas}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = {
                                ...services[svcIndex],
                                replicas: Number(e.target.value) || 1,
                              };
                              return { ...prev, services };
                            })
                          }
                          className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Model
                        </label>
                        <select
                          value={svc.model}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = { ...services[svcIndex], model: e.target.value };
                              return { ...prev, services };
                            })
                          }
                          className="px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                          <option value="cpu">cpu</option>
                          <option value="mixed">mixed</option>
                          <option value="db_latency">db_latency</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          CPU cores
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={svc.cpu_cores ?? 1}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = {
                                ...services[svcIndex],
                                cpu_cores: Number(e.target.value) || 0,
                              };
                              return { ...prev, services };
                            })
                          }
                          className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Memory (MB)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={svc.memory_mb ?? 512}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = {
                                ...services[svcIndex],
                                memory_mb: Number(e.target.value) || 0,
                              };
                              return { ...prev, services };
                            })
                          }
                          className="w-28 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={scenario.services.length === 1}
                      onClick={() =>
                        setScenario((prev) => ({
                          ...prev,
                          services: prev.services.filter((_, i) => i !== svcIndex),
                        }))
                      }
                      className="self-start px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Remove service
                    </button>
                  </div>

                  {/* Endpoints (editable basics, with downstream topology) */}
                  <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                    <p className="text-xs font-medium text-white/70">Endpoints</p>
                    {svc.endpoints.map((ep, epIndex) => (
                      <div
                        key={`${svc.id}-endpoint-${epIndex}`}
                        className="flex flex-col gap-2 bg-black/40 border border-white/10 rounded px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-[11px] font-medium text-white/70 mb-1">
                              Path
                            </label>
                            <input
                              type="text"
                              value={ep.path}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const services = [...prev.services];
                                  const endpoints = [...services[svcIndex].endpoints];
                                  endpoints[epIndex] = {
                                    ...endpoints[epIndex],
                                    path: e.target.value,
                                  };
                                  services[svcIndex] = { ...services[svcIndex], endpoints };
                                  return { ...prev, services };
                                })
                              }
                              className={`w-full px-3 py-1.5 bg-black/40 rounded text-sm text-white font-mono focus:outline-none focus:ring-2 ${
                                endpointPathErrors[`${svcIndex}-${epIndex}`]
                                  ? "border border-red-500 ring-2 ring-red-500/50 focus:ring-red-500/50"
                                  : "border border-white/20 focus:ring-white/30"
                              }`}
                            />
                            {endpointPathErrors[`${svcIndex}-${epIndex}`] && (
                              <p className="text-xs text-red-400 mt-1">
                                {endpointPathErrors[`${svcIndex}-${epIndex}`]}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-white/70">
                            <div>
                              <label className="block text-[11px] font-medium text-white/70 mb-1">
                                Mean CPU (ms)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={ep.mean_cpu_ms}
                                onChange={(e) =>
                                  setScenario((prev) => {
                                    const services = [...prev.services];
                                    const endpoints = [...services[svcIndex].endpoints];
                                    endpoints[epIndex] = {
                                      ...endpoints[epIndex],
                                      mean_cpu_ms: Number(e.target.value) || 0,
                                    };
                                    services[svcIndex] = { ...services[svcIndex], endpoints };
                                    return { ...prev, services };
                                  })
                                }
                                className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-white/70 mb-1">
                                CPU σ (ms)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={ep.cpu_sigma_ms}
                                onChange={(e) =>
                                  setScenario((prev) => {
                                    const services = [...prev.services];
                                    const endpoints = [...services[svcIndex].endpoints];
                                    endpoints[epIndex] = {
                                      ...endpoints[epIndex],
                                      cpu_sigma_ms: Number(e.target.value) || 0,
                                    };
                                    services[svcIndex] = { ...services[svcIndex], endpoints };
                                    return { ...prev, services };
                                  })
                                }
                                className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-white/70 mb-1">
                                Default memory (MB)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={ep.default_memory_mb ?? 10}
                                onChange={(e) =>
                                  setScenario((prev) => {
                                    const services = [...prev.services];
                                    const endpoints = [...services[svcIndex].endpoints];
                                    endpoints[epIndex] = {
                                      ...endpoints[epIndex],
                                      default_memory_mb: Number(e.target.value) || 0,
                                    };
                                    services[svcIndex] = { ...services[svcIndex], endpoints };
                                    return { ...prev, services };
                                  })
                                }
                                className="w-28 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={svc.endpoints.length === 1}
                            onClick={() =>
                              setScenario((prev) => {
                                const services = [...prev.services];
                                const endpoints = services[svcIndex].endpoints.filter(
                                  (_e, i) => i !== epIndex
                                );
                                services[svcIndex] = { ...services[svcIndex], endpoints };
                                return { ...prev, services };
                              })
                            }
                            className="ml-auto px-2 py-1 text-[11px] rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="border-t border-white/10 pt-2 mt-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-white/60 mb-1">Downstream calls</p>
                            <button
                              type="button"
                              onClick={() =>
                                setScenario((prev) => {
                                  const services = [...prev.services];
                                  const endpoints = [...services[svcIndex].endpoints];
                                  const currentDownstream = endpoints[epIndex].downstream || [];
                                  endpoints[epIndex] = {
                                    ...endpoints[epIndex],
                                    downstream: [
                                      ...currentDownstream,
                                      {
                                        to:
                                          scenario.services[0]?.endpoints[0]
                                            ? `${scenario.services[0].id}:${scenario.services[0].endpoints[0].path}`
                                            : "svc1:/test",
                                        call_count_mean: 1,
                                        call_latency_ms: { mean: 10, sigma: 5 },
                                        downstream_fraction_cpu: 0.5,
                                      },
                                    ],
                                  };
                                  services[svcIndex] = { ...services[svcIndex], endpoints };
                                  return { ...prev, services };
                                })
                              }
                              className="px-2 py-1 text-[11px] rounded bg-white/10 text-white hover:bg-white/20"
                            >
                              Add downstream call
                            </button>
                          </div>
                          {ep.downstream && ep.downstream.length > 0 ? (
                            <div className="space-y-2">
                              {ep.downstream.map((d, dIndex) => {
                                const downstreamTargets =
                                  scenario.services.flatMap((svcOpt) =>
                                    svcOpt.endpoints.map((epOpt) => ({
                                      value: `${svcOpt.id}:${epOpt.path}`,
                                      label: `${svcOpt.id}${epOpt.path}`,
                                    }))
                                  ) ?? [];

                                return (
                                  <div
                                    key={`${svc.id}-down-${dIndex}`}
                                    className="flex flex-wrap items-center gap-3 text-[11px] text-white/70"
                                  >
                                    <div className="min-w-[180px]">
                                      <label className="block text-[11px] font-medium text-white/70 mb-1">
                                        To (service:endpoint)
                                      </label>
                                      <select
                                        value={d.to}
                                        onChange={(e) =>
                                          setScenario((prev) => {
                                            const services = [...prev.services];
                                            const endpoints = [...services[svcIndex].endpoints];
                                            const downstream = [...endpoints[epIndex].downstream];
                                            downstream[dIndex] = {
                                              ...downstream[dIndex],
                                              to: e.target.value,
                                            };
                                            endpoints[epIndex] = {
                                              ...endpoints[epIndex],
                                              downstream,
                                            };
                                            services[svcIndex] = {
                                              ...services[svcIndex],
                                              endpoints,
                                            };
                                            return { ...prev, services };
                                          })
                                        }
                                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                      >
                                        {downstreamTargets.length === 0 && (
                                          <option value={d.to || ""}>
                                            {d.to || "No endpoints available"}
                                          </option>
                                        )}
                                        {downstreamTargets.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-white/70 mb-1">
                                        Call count (mean)
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={d.call_count_mean}
                                        onChange={(e) =>
                                          setScenario((prev) => {
                                            const services = [...prev.services];
                                            const endpoints = [...services[svcIndex].endpoints];
                                            const downstream = [...endpoints[epIndex].downstream];
                                            downstream[dIndex] = {
                                              ...downstream[dIndex],
                                              call_count_mean: Number(e.target.value) || 0,
                                            };
                                            endpoints[epIndex] = {
                                              ...endpoints[epIndex],
                                              downstream,
                                            };
                                            services[svcIndex] = {
                                              ...services[svcIndex],
                                              endpoints,
                                            };
                                            return { ...prev, services };
                                          })
                                        }
                                        className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-white/70 mb-1">
                                        Latency mean (ms)
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={d.call_latency_ms.mean}
                                        onChange={(e) =>
                                          setScenario((prev) => {
                                            const services = [...prev.services];
                                            const endpoints = [...services[svcIndex].endpoints];
                                            const downstream = [...endpoints[epIndex].downstream];
                                            downstream[dIndex] = {
                                              ...downstream[dIndex],
                                              call_latency_ms: {
                                                ...downstream[dIndex].call_latency_ms,
                                                mean: Number(e.target.value) || 0,
                                              },
                                            };
                                            endpoints[epIndex] = {
                                              ...endpoints[epIndex],
                                              downstream,
                                            };
                                            services[svcIndex] = {
                                              ...services[svcIndex],
                                              endpoints,
                                            };
                                            return { ...prev, services };
                                          })
                                        }
                                        className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-white/70 mb-1">
                                        Latency σ (ms)
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={d.call_latency_ms.sigma}
                                        onChange={(e) =>
                                          setScenario((prev) => {
                                            const services = [...prev.services];
                                            const endpoints = [...services[svcIndex].endpoints];
                                            const downstream = [...endpoints[epIndex].downstream];
                                            downstream[dIndex] = {
                                              ...downstream[dIndex],
                                              call_latency_ms: {
                                                ...downstream[dIndex].call_latency_ms,
                                                sigma: Number(e.target.value) || 0,
                                              },
                                            };
                                            endpoints[epIndex] = {
                                              ...endpoints[epIndex],
                                              downstream,
                                            };
                                            services[svcIndex] = {
                                              ...services[svcIndex],
                                              endpoints,
                                            };
                                            return { ...prev, services };
                                          })
                                        }
                                        className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-white/70 mb-1">
                                        CPU fraction
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={d.downstream_fraction_cpu}
                                        onChange={(e) =>
                                          setScenario((prev) => {
                                            const services = [...prev.services];
                                            const endpoints = [...services[svcIndex].endpoints];
                                            const downstream = [...endpoints[epIndex].downstream];
                                            downstream[dIndex] = {
                                              ...downstream[dIndex],
                                              downstream_fraction_cpu:
                                                Number(e.target.value) || 0,
                                            };
                                            endpoints[epIndex] = {
                                              ...endpoints[epIndex],
                                              downstream,
                                            };
                                            services[svcIndex] = {
                                              ...services[svcIndex],
                                              endpoints,
                                            };
                                            return { ...prev, services };
                                          })
                                        }
                                        className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setScenario((prev) => {
                                          const services = [...prev.services];
                                          const endpoints = [...services[svcIndex].endpoints];
                                          const downstream = endpoints[epIndex].downstream.filter(
                                            (_d, i) => i !== dIndex
                                          );
                                          endpoints[epIndex] = {
                                            ...endpoints[epIndex],
                                            downstream,
                                          };
                                          services[svcIndex] = {
                                            ...services[svcIndex],
                                            endpoints,
                                          };
                                          return { ...prev, services };
                                        })
                                      }
                                      className="px-2 py-1 text-[11px] rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-white/40">
                              No downstream calls yet. Use &quot;Add downstream call&quot; to model
                              dependencies to other services.
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {svc.endpoints.length === 0 && (
                      <p className="text-xs text-white/40">
                        No endpoints defined yet. Add endpoints to this service using the button below.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setScenario((prev) => {
                          const services = [...prev.services];
                          const endpoints = [
                            ...services[svcIndex].endpoints,
                            {
                              path: "/new-endpoint",
                              mean_cpu_ms: 10,
                              cpu_sigma_ms: 2,
                              default_memory_mb: 10,
                              downstream: [],
                              net_latency_ms: { mean: 1, sigma: 0.5 },
                            },
                          ];
                          services[svcIndex] = { ...services[svcIndex], endpoints };
                          return { ...prev, services };
                        })
                      }
                      className="mt-2 px-3 py-1.5 text-[11px] rounded bg-white/10 text-white hover:bg-white/20"
                    >
                      Add endpoint
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setScenario((prev) => ({
                    ...prev,
                    services: [
                      ...prev.services,
                      {
                        id: `svc${prev.services.length + 1}`,
                        replicas: 1,
                        model: "cpu",
                        cpu_cores: 1,
                        memory_mb: 512,
                        endpoints: [],
                      },
                    ],
                  }))
                }
                className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
              >
                Add service
              </button>
            </div>
          </div>

              {/* Scenario Workload Editor */}
              <div>
            <h2 className="text-lg font-semibold text-white mb-4">Workload Patterns</h2>
            <p className="text-xs text-white/60 mb-3">
              Define how traffic flows from clients to service endpoints. Services and endpoints come
              from the upstream scenario file; here you configure arrival patterns (RPS, bursts, etc.).
            </p>
            <div className="space-y-4">
              {scenario.workload.map((pattern, index) => {
                const endpointOptions =
                  scenario.services.flatMap((svc) =>
                    svc.endpoints.map((ep) => ({
                      value: `${svc.id}:${ep.path}`,
                      label: `${svc.id}${ep.path}`,
                    }))
                  ) ?? [];

                return (
                  <div
                    key={index}
                    className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        Pattern {index + 1}
                      </p>
                      <button
                        type="button"
                        disabled={scenario.workload.length === 1}
                        onClick={() =>
                          setScenario((prev) => ({
                            ...prev,
                            workload: prev.workload.filter((_, i) => i !== index),
                          }))
                        }
                        className="px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Remove pattern
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          From
                        </label>
                        <input
                          type="text"
                          value={pattern.from}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              workload[index] = { ...workload[index], from: e.target.value };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          placeholder="e.g. client"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          To (service:endpoint)
                        </label>
                        <select
                          value={pattern.to}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              workload[index] = { ...workload[index], to: e.target.value };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                          {endpointOptions.length === 0 && (
                            <option value={pattern.to || ""}>
                              {pattern.to || "No endpoints available"}
                            </option>
                          )}
                          {endpointOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Arrival type
                        </label>
                        <select
                          value={pattern.arrival.type}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              const current = workload[index];
                              workload[index] = {
                                ...current,
                                arrival: {
                                  ...current.arrival,
                                  type: e.target.value as ArrivalType,
                                },
                              };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                          {arrivalTypes.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Base rate (RPS)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={pattern.arrival.rate_rps}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              const current = workload[index];
                              workload[index] = {
                                ...current,
                                arrival: {
                                  ...current.arrival,
                                  rate_rps: Number(e.target.value) || 0,
                                },
                              };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>

                      {pattern.arrival.type === "normal" && (
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Std dev (RPS)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={pattern.arrival.stddev_rps ?? 0}
                            onChange={(e) =>
                              setScenario((prev) => {
                                const workload = [...prev.workload];
                                const current = workload[index];
                                workload[index] = {
                                  ...current,
                                  arrival: {
                                    ...current.arrival,
                                    stddev_rps: Number(e.target.value) || 0,
                                  },
                                };
                                return { ...prev, workload };
                              })
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                      )}

                      {pattern.arrival.type === "bursty" && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-white/70 mb-1">
                              Burst rate (RPS)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={pattern.arrival.burst_rate_rps ?? 0}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const workload = [...prev.workload];
                                  const current = workload[index];
                                  workload[index] = {
                                    ...current,
                                    arrival: {
                                      ...current.arrival,
                                      burst_rate_rps: Number(e.target.value) || 0,
                                    },
                                  };
                                  return { ...prev, workload };
                                })
                              }
                              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/70 mb-1">
                              Burst duration (s)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={pattern.arrival.burst_duration_seconds ?? 0}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const workload = [...prev.workload];
                                  const current = workload[index];
                                  workload[index] = {
                                    ...current,
                                    arrival: {
                                      ...current.arrival,
                                      burst_duration_seconds: Number(e.target.value) || 0,
                                    },
                                  };
                                  return { ...prev, workload };
                                })
                              }
                              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/70 mb-1">
                              Quiet duration (s)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={pattern.arrival.quiet_duration_seconds ?? 0}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const workload = [...prev.workload];
                                  const current = workload[index];
                                  workload[index] = {
                                    ...current,
                                    arrival: {
                                      ...current.arrival,
                                      quiet_duration_seconds: Number(e.target.value) || 0,
                                    },
                                  };
                                  return { ...prev, workload };
                                })
                              }
                              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setScenario((prev) => {
                    const defaultTo =
                      prev.services[0]?.endpoints[0]
                        ? `${prev.services[0].id}:${prev.services[0].endpoints[0].path}`
                        : "svc1:/test";
                    return {
                      ...prev,
                      workload: [
                        ...prev.workload,
                        {
                          from: "client",
                          to: defaultTo,
                          arrival: {
                            type: "poisson",
                            rate_rps: 10,
                          },
                        },
                      ],
                    };
                  })
                }
                className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg:white/20"
              >
                Add workload pattern
              </button>
            </div>
          </div>

              {/* Policies (Autoscaling) */}
              <div>
            <h2 className="text-lg font-semibold text-white mb-4">Policies (Autoscaling)</h2>
            <p className="text-xs text-white/60 mb-3">
              Configure autoscaling policies per service. These are emitted under
              {' '}<span className="font-mono text-[11px]">policies.autoscaling.services</span>{' '}
              in the generated YAML.
            </p>
            <div className="space-y-3">
              {(
                ((scenario.policies as ScenarioPolicies | undefined)?.autoscaling
                  ?.services) || []
              ).map((pol, polIndex) => (
                <div
                  key={`pol-${pol.service_id || polIndex}`}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-wrap items-end gap-3"
                >
                  <div>
                    <label className="block text-[11px] font-medium text-white/70 mb-1">
                      Service
                    </label>
                    <select
                      value={pol.service_id}
                      onChange={(e) =>
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            service_id: e.target.value,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    >
                      {scenario.services.length === 0 && (
                        <option value={pol.service_id || ""}>
                          {pol.service_id || "No services defined"}
                        </option>
                      )}
                      {scenario.services.map((svc) => (
                        <option key={svc.id} value={svc.id}>
                          {svc.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/70 mb-1">
                      Min replicas
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pol.min_replicas}
                      onChange={(e) =>
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            min_replicas: Number(e.target.value) || 1,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="w-20 px-3 py-1.5 bg.black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/70 mb-1">
                      Max replicas
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pol.max_replicas}
                      onChange={(e) =>
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            max_replicas: Number(e.target.value) || 1,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text.white focus:outline-none focus:ring-2 focus:ring-white/30"
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
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            target_p95_latency_ms: Number(e.target.value) || 0,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="w-28 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/70 mb-1">
                      Target CPU util
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={pol.target_cpu_utilization}
                      onChange={(e) =>
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            target_cpu_utilization: Number(e.target.value) || 0,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/70 mb-1">
                      Scale up step
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pol.scale_up_step}
                      onChange={(e) =>
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            scale_up_step: Number(e.target.value) || 1,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/70 mb-1">
                      Scale down step
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pol.scale_down_step}
                      onChange={(e) =>
                        setScenario((prev) => {
                          const policies = { ...(prev.policies as ScenarioPolicies) };
                          const autoscaling: ScenarioAutoscalingPolicies = {
                            services: [...(policies.autoscaling?.services || [])],
                          };
                          autoscaling.services[polIndex] = {
                            ...autoscaling.services[polIndex],
                            scale_down_step: Number(e.target.value) || 1,
                          };
                          policies.autoscaling = autoscaling;
                          return { ...prev, policies };
                        })
                      }
                      className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setScenario((prev) => {
                        const policies = { ...(prev.policies as ScenarioPolicies) };
                        const autoscaling: ScenarioAutoscalingPolicies = {
                          services: [...(policies.autoscaling?.services || [])],
                        };
                        autoscaling.services = autoscaling.services.filter(
                          (_p, i) => i !== polIndex
                        );
                        policies.autoscaling = autoscaling;
                        return { ...prev, policies };
                      })
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
                  setScenario((prev) => {
                    const policies = { ...(prev.policies as ScenarioPolicies) };
                    const autoscaling: ScenarioAutoscalingPolicies = {
                      services: [...(policies.autoscaling?.services || [])],
                    };
                    autoscaling.services.push({
                      service_id: "",
                      min_replicas: 1,
                      max_replicas: 1,
                      target_p95_latency_ms: 0,
                      target_cpu_utilization: 0,
                      scale_up_step: 1,
                      scale_down_step: 1,
                    });
                    policies.autoscaling = autoscaling;
                    return { ...prev, policies };
                  })
                }
                className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
              >
                Add autoscaling policy
              </button>
            </div>
          </div>

              {/* Scenario YAML preview (based on editor) */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Scenario YAML (preview)</h2>
                <p className="text-xs text-white/60 mb-2">
                  {isSampleScenario
                    ? "YAML generated from the editor for the sample flow (matches the predefined sample scenario file)."
                    : "YAML generated from the editor. For diagram versions, load/save via the simulation service; on review, run the saved draft, run once without saving, or save and run together."}
                </p>
                {scenarioYamlError && (
                  <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                    {scenarioYamlError}
                  </div>
                )}
                <textarea
                  readOnly
                  value={scenarioYaml}
                  className="w-full h-56 bg-black/60 border border-white/10 rounded-lg text-xs font-mono text-white p-3 resize-y"
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-border mt-4">
                <button
                  type="button"
                  disabled={diagramScenarioDraftBlocked}
                  onClick={() => {
                    if (validateScenarioStep()) {
                      setCurrentStep(2);
                    }
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Configuration
                </button>
              </div>
            </>
          )}

          {/* Error Message */}
          {errors.general && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{errors.general}</p>
            </div>
          )}

          {/* Step 3: Review & Submit */}
          {currentStep === 3 && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4">Review</h2>

              {/* Run details summary */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white/80 mb-3">Run details</h3>
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-white/50">Name</dt>
                    <dd className="text-white font-medium">{formData.name || "—"}</dd>
                  </div>
                  {formData.description && (
                    <div className="col-span-2">
                      <dt className="text-xs text-white/50">Description</dt>
                      <dd className="text-white">{formData.description}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-white/50">Run mode</dt>
                    <dd className="text-white capitalize">
                      {runMode === "standard"
                        ? "Standard"
                        : runMode === "batch_recommendation"
                        ? "Batch recommendation"
                        : runMode === "batch_legacy"
                        ? "Legacy batch objective"
                        : "Online optimization"}
                    </dd>
                  </div>
                  {runMode !== "online_optimization" && (
                    <div>
                      <dt className="text-xs text-white/50">Duration</dt>
                      <dd className="text-white">{formData.duration_seconds}s</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-white/50">Real-time mode</dt>
                    <dd className="text-white">{formData.real_time_mode ? "Yes" : "No"}</dd>
                  </div>
                  {seed > 0 && (
                    <div>
                      <dt className="text-xs text-white/50">Seed</dt>
                      <dd className="text-white">{seed}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Batch summary */}
              {runMode === "batch_recommendation" && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-3">Batch recommendation</h3>
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-white/50">UI mode</dt>
                      <dd className="text-white capitalize">{batchRecommendation.ui_mode}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Evaluation duration</dt>
                      <dd className="text-white">{batchRecommendation.evaluation_duration_ms} ms</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Max evaluations</dt>
                      <dd className="text-white">{batchRecommendation.max_evaluations}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Min throughput</dt>
                      <dd className="text-white">{batchRecommendation.min_throughput_rps} RPS</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">P95 / P99 cap</dt>
                      <dd className="text-white">
                        {batchRecommendation.max_p95_latency_ms} /{" "}
                        {batchRecommendation.ui_mode === "quick"
                          ? Math.max(1000, Math.round(batchRecommendation.max_p95_latency_ms * 2))
                          : batchRecommendation.max_p99_latency_ms}{" "}
                        ms
                      </dd>
                    </div>
                  </dl>
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-white/50">
                      Developer: full optimization JSON (as submitted)
                    </summary>
                    <pre className="mt-2 p-2 rounded border border-amber-500/20 bg-black/40 overflow-x-auto max-h-56 text-[10px] font-mono text-amber-100/80">
                      {JSON.stringify(buildBatchRecommendationOptimizationPayload(batchRecommendation), null, 2)}
                    </pre>
                  </details>
                </div>
              )}
              {runMode === "batch_legacy" && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-3">Legacy batch objective</h3>
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-white/50">Objective</dt>
                      <dd className="text-white">{optimization.objective}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Max iterations</dt>
                      <dd className="text-white">{optimization.max_iterations}</dd>
                    </div>
                    {optimization.max_evaluations != null && optimization.max_evaluations > 0 && (
                      <div>
                        <dt className="text-xs text-white/50">Max evaluations</dt>
                        <dd className="text-white">{optimization.max_evaluations}</dd>
                      </div>
                    )}
                    {optimization.batch_target_util_low != null &&
                      optimization.batch_target_util_high != null &&
                      optimization.batch_target_util_low < optimization.batch_target_util_high && (
                        <div>
                          <dt className="text-xs text-white/50">Target util band</dt>
                          <dd className="text-white">
                            {(optimization.batch_target_util_low * 100).toFixed(0)}%–{(optimization.batch_target_util_high * 100).toFixed(0)}%
                          </dd>
                        </div>
                      )}
                    <div>
                      <dt className="text-xs text-white/50">Step size</dt>
                      <dd className="text-white">{optimization.step_size}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Eval duration</dt>
                      <dd className="text-white">{optimization.evaluation_duration_ms}ms</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Online optimization summary */}
              {runMode === "online_optimization" && (
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
                  <h3 className="text-sm font-semibold text-sky-300 mb-3">Online optimization</h3>
                  <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-white/50">Primary target</dt>
                      <dd className="text-white capitalize">
                        {optimization.optimization_target_primary === "p95_latency"
                          ? "P95 latency"
                          : optimization.optimization_target_primary === "cpu_utilization"
                          ? "CPU utilization"
                          : "Memory utilization"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Target p95 latency</dt>
                      <dd className="text-white">{optimization.target_p95_latency_ms}ms</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Control interval</dt>
                      <dd className="text-white">{optimization.control_interval_ms}ms</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-white/50">Host range</dt>
                      <dd className="text-white">
                        {optimization.min_hosts} – {optimization.max_hosts}
                      </dd>
                    </div>
                    {(optimization.optimization_target_primary === "cpu_utilization" ||
                      optimization.optimization_target_primary === "memory_utilization") && (
                      <>
                        <div>
                          <dt className="text-xs text-white/50">Scale-up above</dt>
                          <dd className="text-white">{Math.round(optimization.target_util_high * 100)}%</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-white/50">Scale-down below</dt>
                          <dd className="text-white">{Math.round(optimization.target_util_low * 100)}%</dd>
                        </div>
                      </>
                    )}
                  </dl>
                  {(optimization.scale_down_cpu_util_max > 0 ||
                    optimization.scale_down_mem_util_max > 0 ||
                    optimization.scale_down_host_cpu_util_max > 0) && (
                    <div className="mt-3 pt-3 border-t border-sky-500/20">
                      <span className="text-xs text-white/50 block mb-1">Scale-down rules</span>
                      <div className="text-xs text-white/80 space-y-0.5">
                        {optimization.scale_down_cpu_util_max > 0 && (
                          <div>Service CPU below {Math.round(optimization.scale_down_cpu_util_max * 100)}%</div>
                        )}
                        {optimization.scale_down_mem_util_max > 0 && (
                          <div>Service memory below {Math.round(optimization.scale_down_mem_util_max * 100)}%</div>
                        )}
                        {optimization.scale_down_host_cpu_util_max > 0 && (
                          <div>Host CPU below {Math.round(optimization.scale_down_host_cpu_util_max * 100)}%</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scenario YAML — what was built in Step 1 (same as submitted to backend) */}
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-2">Scenario YAML</h3>
                <textarea
                  readOnly
                  value={scenarioYaml}
                  className="w-full h-48 bg-black/60 border border-white/10 rounded-lg text-xs font-mono text-white p-3 resize-y"
                />
              </div>

              {/* Step 3 navigation + submit */}
              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                {!isSampleScenario && (
                  <p className="text-xs text-white/50">
                    {isDiagramScenarioSynced
                      ? "Scenario matches the saved diagram draft — you can run without sending YAML again."
                      : "You have local edits relative to the last loaded server draft. Run once without persisting, or save into the diagram draft and run."}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 text-sm rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={`/project/${projectId}/simulation`}
                      className="inline-flex items-center px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      Cancel
                    </Link>
                    {isSampleScenario && (
                      <button
                        type="submit"
                        disabled={isSubmitting || diagramScenarioDraftBlocked}
                        className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:bg-white/50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Create simulation
                          </>
                        )}
                      </button>
                    )}
                    {!isSampleScenario && isDiagramScenarioSynced && (
                      <button
                        type="submit"
                        disabled={isSubmitting || diagramScenarioDraftBlocked}
                        className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:bg-white/50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                            Starting…
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Run saved scenario
                          </>
                        )}
                      </button>
                    )}
                    {!isSampleScenario && !isDiagramScenarioSynced && (
                      <>
                        <button
                          type="button"
                          disabled={isSubmitting || diagramScenarioDraftBlocked}
                          onClick={() => void executeCreateRun("diagram_transient")}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/25 bg-white/10 text-white text-sm hover:bg-white/15 disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Run without saving
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting || diagramScenarioDraftBlocked}
                          onClick={() => void executeCreateRun("diagram_save_and_run")}
                          className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:bg-white/50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                              Starting…
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4" />
                              Save and run
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </form>
        </>
      )}
    </div>
  );
}

