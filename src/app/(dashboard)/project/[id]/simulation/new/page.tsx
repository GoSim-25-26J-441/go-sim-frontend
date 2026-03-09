"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileCode2, Play } from "lucide-react";
import { InputField, TextAreaField } from "@/components/common/inputFeild/page";
import { createProjectSimulationRun, CreateProjectRunRequest } from "@/lib/api-client/simulation";
import { useAuth } from "@/providers/auth-context";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import {
  amgApdTemplateToScenarioState,
  parseAmgApdTemplate,
} from "./amgApdTemplateToScenario";

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

// Scenario editor state mirroring simulation-core YAML schema
// memory_gb is optional; omit or 0 means simulator default (16 GB)
interface ScenarioHost {
  id: string;
  cores: number;
  memory_gb?: number;
}

interface ScenarioDownstreamCallLatency {
  mean: number;
  sigma: number;
}

interface ScenarioDownstreamCall {
  to: string;
  call_count_mean: number;
  call_latency_ms: ScenarioDownstreamCallLatency;
  downstream_fraction_cpu: number;
}

interface ScenarioNetLatency {
  mean: number;
  sigma: number;
}

interface ScenarioEndpoint {
  path: string;
  mean_cpu_ms: number;
  cpu_sigma_ms: number;
  default_memory_mb?: number;
  downstream: ScenarioDownstreamCall[];
  net_latency_ms: ScenarioNetLatency;
}

interface ScenarioService {
  id: string;
  replicas: number;
  model: string;
  cpu_cores?: number;
  memory_mb?: number;
  endpoints: ScenarioEndpoint[];
}

type ArrivalType = "poisson" | "uniform" | "normal" | "bursty" | "constant";

interface ScenarioArrival {
  type: ArrivalType;
  rate_rps: number;
  stddev_rps?: number;
  burst_rate_rps?: number;
  burst_duration_seconds?: number;
  quiet_duration_seconds?: number;
}

interface ScenarioWorkloadPattern {
  from: string;
  to: string;
  arrival: ScenarioArrival;
}

interface ScenarioAutoscalingServicePolicy {
  service_id: string;
  min_replicas: number;
  max_replicas: number;
  target_p95_latency_ms: number;
  target_cpu_utilization: number;
  scale_up_step: number;
  scale_down_step: number;
}

interface ScenarioAutoscalingPolicies {
  services: ScenarioAutoscalingServicePolicy[];
}

interface ScenarioPolicies {
  autoscaling?: ScenarioAutoscalingPolicies;
  // Other policy groups are passed through to simulation-core
  [key: string]: unknown;
}

interface ScenarioState {
  hosts: ScenarioHost[];
  services: ScenarioService[];
  workload: ScenarioWorkloadPattern[];
  policies?: ScenarioPolicies;
}

type RunMode = "standard" | "batch_optimization" | "online_optimization";

function scenarioToYaml(scenario: ScenarioState): string {
  const lines: string[] = [];

  // hosts
  lines.push("hosts:");
  if (scenario.hosts.length === 0) {
    lines.push("  []");
  } else {
    for (const host of scenario.hosts) {
      lines.push(`  - id: ${host.id || "host-1"}`);
      lines.push(`    cores: ${host.cores || 1}`);
      if (host.memory_gb != null && host.memory_gb > 0) {
        lines.push(`    memory_gb: ${host.memory_gb}`);
      }
    }
  }

  // services
  lines.push("", "services:");
  if (scenario.services.length === 0) {
    lines.push("  []");
  } else {
    for (const svc of scenario.services) {
      lines.push(`  - id: ${svc.id || "svc1"}`);
      lines.push(`    replicas: ${svc.replicas || 1}`);
      lines.push(`    model: ${svc.model || "cpu"}`);

      const cpuCores = svc.cpu_cores && svc.cpu_cores > 0 ? svc.cpu_cores : 1.0;
      const memoryMb = svc.memory_mb && svc.memory_mb > 0 ? svc.memory_mb : 512.0;
      lines.push(`    cpu_cores: ${cpuCores}`);
      lines.push(`    memory_mb: ${memoryMb}`);

      lines.push("    endpoints:");
      if (svc.endpoints.length === 0) {
        lines.push("      []");
      } else {
        for (const ep of svc.endpoints) {
          lines.push(`      - path: ${ep.path}`);
          lines.push(`        mean_cpu_ms: ${ep.mean_cpu_ms}`);
          lines.push(`        cpu_sigma_ms: ${ep.cpu_sigma_ms}`);
          const defaultMem = ep.default_memory_mb && ep.default_memory_mb > 0 ? ep.default_memory_mb : 10.0;
          lines.push(`        default_memory_mb: ${defaultMem}`);

          // downstream
          lines.push("        downstream:");
          if (!ep.downstream || ep.downstream.length === 0) {
            lines.push("          []");
          } else {
            for (const d of ep.downstream) {
              lines.push(`          - to: ${d.to}`);
              lines.push(`            call_count_mean: ${d.call_count_mean}`);
              lines.push("            call_latency_ms:");
              lines.push(`              mean: ${d.call_latency_ms.mean}`);
              lines.push(`              sigma: ${d.call_latency_ms.sigma}`);
              lines.push(`            downstream_fraction_cpu: ${d.downstream_fraction_cpu}`);
            }
          }

          // net latency
          lines.push("        net_latency_ms:");
          lines.push(`          mean: ${ep.net_latency_ms.mean}`);
          lines.push(`          sigma: ${ep.net_latency_ms.sigma}`);
        }
      }
    }
  }

  // workload
  lines.push("", "workload:");
  if (scenario.workload.length === 0) {
    lines.push("  []");
  } else {
    for (const w of scenario.workload) {
      lines.push(`  - from: ${w.from || "client"}`);
      lines.push(`    to: ${w.to || "svc1:/test"}`);
      lines.push("    arrival:");
      lines.push(`      type: ${w.arrival.type}`);
      lines.push(`      rate_rps: ${w.arrival.rate_rps ?? 0}`);

      if (w.arrival.type === "normal") {
        lines.push(`      stddev_rps: ${w.arrival.stddev_rps ?? 0}`);
      } else if (w.arrival.type === "bursty") {
        lines.push(`      burst_rate_rps: ${w.arrival.burst_rate_rps ?? 0}`);
        lines.push(
          `      burst_duration_seconds: ${w.arrival.burst_duration_seconds ?? 0}`
        );
        lines.push(
          `      quiet_duration_seconds: ${w.arrival.quiet_duration_seconds ?? 0}`
        );
      } else {
        // keep optional fields present with safe defaults so the engine has everything it expects
        lines.push(`      stddev_rps: ${w.arrival.stddev_rps ?? 0}`);
        lines.push(`      burst_rate_rps: ${w.arrival.burst_rate_rps ?? 0}`);
        lines.push(
          `      burst_duration_seconds: ${w.arrival.burst_duration_seconds ?? 0}`
        );
        lines.push(
          `      quiet_duration_seconds: ${w.arrival.quiet_duration_seconds ?? 0}`
        );
      }
    }
  }

  // policies (optional, passed through)
  lines.push("", "policies:");
  const autoscaling = (scenario.policies as ScenarioPolicies | undefined)?.autoscaling;
  if (!autoscaling || !autoscaling.services || autoscaling.services.length === 0) {
    lines.push("  {}");
  } else {
    lines.push("  autoscaling:");
    lines.push("    services:");
    for (const svcPol of autoscaling.services) {
      lines.push("      - service_id: " + (svcPol.service_id || "service"));
      lines.push("        min_replicas: " + (svcPol.min_replicas ?? 1));
      lines.push("        max_replicas: " + (svcPol.max_replicas ?? 1));
      lines.push(
        "        target_p95_latency_ms: " + (svcPol.target_p95_latency_ms ?? 0)
      );
      lines.push(
        "        target_cpu_utilization: " + (svcPol.target_cpu_utilization ?? 0)
      );
      lines.push("        scale_up_step: " + (svcPol.scale_up_step ?? 1));
      lines.push("        scale_down_step: " + (svcPol.scale_down_step ?? 1));
    }
  }

  return lines.join("\n");
}

export default function ProjectNewSimulationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const searchParams = useSearchParams();
  const version = searchParams.get("version");

  const SAMPLE_SCENARIO_YAML = `hosts:
  - id: host-1
    cores: 4
    memory_gb: 16

services:
  - id: users
    replicas: 2
    model: cpu
    cpu_cores: 1.0
    memory_mb: 512
    endpoints:
      - path: /login
        mean_cpu_ms: 10
        cpu_sigma_ms: 2
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 5
          sigma: 1

workload:
  - from: client
    to: users:/login
    arrival:
      type: poisson
      rate_rps: 10
      stddev_rps: 0
      burst_rate_rps: 0
      burst_duration_seconds: 0
      quiet_duration_seconds: 0
`;

  // Version/diagram selector phase (shown before the multi-step form)
  const { userId } = useAuth();
  const [versionPhase, setVersionPhase] = useState(true);
  const sampleOption: DiagramVersion = {
    id: "sample",
    label: "Sample scenario",
    description: "A pre-built sample scenario to get started quickly.",
  };
  const [availableVersions, setAvailableVersions] = useState<DiagramVersion[]>([sampleOption]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState("sample");
  const [versionDetailResponse, setVersionDetailResponse] = useState<unknown>(null);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [debugView, setDebugView] = useState<"hide" | "show" | "yaml">("hide");
  const isSampleScenario = selectedVersionId === "sample" || version === "sample";

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
          setAvailableVersions([sampleOption, ...mapped]);
        }
      })
      .catch(() => {
        // Keep sample only on error or no data
      })
      .finally(() => setVersionsLoading(false));
    return () => controller.abort();
  }, [projectId, userId]);

  // When URL has ?version=..., show the form with that version (e.g. after refresh or shared link)
  useEffect(() => {
    if (!version) return;
    setSelectedVersionId(version);
    setVersionPhase(false);
  }, [version]);

  // Fetch version detail (GET /api/amg-apd/versions/:id) when a non-sample version is selected
  useEffect(() => {
    if (!selectedVersionId || selectedVersionId === "sample") {
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

  // When a saved version's YAML template is available, parse and apply as baseline scenario
  useEffect(() => {
    if (!versionYamlTemplate || selectedVersionId === "sample") return;
    const parsed = parseAmgApdTemplate(versionYamlTemplate);
    if (parsed) {
      try {
        setScenario(amgApdTemplateToScenarioState(parsed));
        setScenarioError(null);
      } catch {
        setScenarioError("Could not load diagram as baseline; using default scenario.");
      }
    } else {
      setScenarioError("Could not load diagram as baseline; using default scenario.");
    }
  }, [versionYamlTemplate, selectedVersionId]);

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioState>({
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
  });

  const arrivalTypes: ArrivalType[] = ["poisson", "uniform", "normal", "bursty", "constant"];

  const { yaml: scenarioYaml, error: scenarioYamlError } = useMemo(() => {
    try {
      return { yaml: scenarioToYaml(scenario), error: null as string | null };
    } catch (err) {
      return {
        yaml: "",
        error: err instanceof Error ? err.message : "Invalid scenario (YAML generation failed).",
      };
    }
  }, [scenario]);

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

    if (scenario.hosts.length === 0) {
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

    if (runMode !== "online_optimization") {
      if (!formData.duration_seconds || formData.duration_seconds <= 0) {
        newErrors.duration_seconds = "Duration must be greater than 0";
      }
    }

    if (runMode === "batch_optimization") {
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);

    try {
      // Always use the scenario built in Step 1 (sample only seeds the form; edits are what we send)
      const finalScenarioYaml = scenarioYaml;
      const durationMs = runMode === "online_optimization" ? 0 : Math.max(0, formData.duration_seconds * 1000);

      // Build optimization payload based on run mode
      let optimizationPayload: Record<string, unknown> | undefined;
      if (runMode === "batch_optimization") {
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
        optimizationPayload = {
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
      }

      const body: CreateProjectRunRequest = {
        scenario_yaml: finalScenarioYaml,
        duration_ms: durationMs,
        real_time_mode: formData.real_time_mode,
        metadata: {
          name: formData.name,
          description: formData.description || undefined,
          project_id: projectId,
          source: "frontend-scenario-editor",
        },
        ...(configYaml.trim() ? { config_yaml: configYaml.trim() } : {}),
        ...(seed > 0 ? { seed } : {}),
        ...(optimizationPayload ? { optimization: optimizationPayload } : {}),
      };

      const { run } = await createProjectSimulationRun(projectId, body);

      router.push(`/project/${projectId}/simulation/${run.run_id}`);
    } catch (error) {
      console.error("Error creating simulation:", error);
      setErrors({
        general:
          error instanceof Error
            ? error.message
            : "Failed to create simulation. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
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
              {availableVersions.length === 1 && (
                <p className="text-xs text-amber-400/80 pt-1">
                  No saved diagram versions for this project. Use the sample or create versions in
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
            ) : selectedVersionId === "sample" ? (
              <p className="text-xs text-white/50">Select a saved diagram version (not sample) to load response.</p>
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
            ) : selectedVersionId === "sample" ? (
              <p className="text-xs text-white/50">Select a saved diagram version (not sample) to load YAML template.</p>
            ) : (
              <p className="text-xs text-white/50">No YAML template in response yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
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
                <p className="text-xs text-white/60 mb-3">
                  Choose how this simulation should run. This controls which additional options are
                  sent to the backend (standard, batch optimization, or online controller).
                </p>
                <div className="inline-flex rounded-lg border border-white/15 bg-white/5 p-1 text-xs text-white/80">
                  {(
                    [
                      { id: "standard", label: "Standard" },
                      { id: "batch_optimization", label: "Batch optimization" },
                      { id: "online_optimization", label: "Online optimization" },
                    ] as { id: RunMode; label: string }[]
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
                        label="Duration (seconds)"
                        value={formData.duration_seconds.toString()}
                        onChange={handleChange}
                        error={errors.duration_seconds}
                        required
                      />
                    </div>
                    <p className="text-xs text-white/50 pb-2">
                      How long the simulation will run. Converted to milliseconds when submitted.
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

              {/* Batch optimization settings */}
              {runMode === "batch_optimization" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-2">
                    Batch Optimization Settings
                  </h3>
                  <p className="text-xs text-white/50">
                    The optimizer runs multiple short experiments to find a better configuration. Each
                    candidate is evaluated for the duration below.
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
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Scale-down blocked if P95 would exceed this.
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
                  onClick={() => {
                    if (validateConfigStep()) setCurrentStep(3);
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90"
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
                  This is the YAML that will be generated from the editor and sent to the simulation
                  engine in the new flow. In sample mode it should mirror the predefined scenario file.
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
                  onClick={() => {
                    if (validateScenarioStep()) {
                      setCurrentStep(2);
                    }
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90"
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
                        : runMode === "batch_optimization"
                        ? "Batch optimization"
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

              {/* Batch optimization summary */}
              {runMode === "batch_optimization" && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-3">Batch optimization</h3>
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
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-sm rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Back
                </button>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/project/${projectId}/simulation`}
                    className="inline-flex items-center px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={isSubmitting}
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
                        Create Simulation
                      </>
                    )}
                  </button>
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

