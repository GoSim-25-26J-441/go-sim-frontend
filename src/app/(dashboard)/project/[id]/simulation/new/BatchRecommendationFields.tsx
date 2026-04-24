"use client";

import {
  useState,
  type ComponentType,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Boxes, Gauge, Layers, Search, ShieldCheck, Sparkles, Timer } from "lucide-react";
import { env } from "@/lib/env";
import { BATCH_SCALING_CHECKBOXES, type BatchScalingActionFlags } from "@/lib/simulation/batch-scaling-actions";

export type BatchRecommendationUiMode = "quick" | "balanced" | "advanced";

export interface BatchRecommendationFormState extends BatchScalingActionFlags {
  ui_mode: BatchRecommendationUiMode;
  evaluation_duration_ms: number;
  max_evaluations: number;
  max_p95_latency_ms: number;
  max_p99_latency_ms: number;
  max_error_rate: number;
  min_throughput_rps: number;
  service_cpu_low: number;
  service_cpu_high: number;
  service_mem_low: number;
  service_mem_high: number;
  host_cpu_low: number;
  host_cpu_high: number;
  host_mem_low: number;
  host_mem_high: number;
  min_hosts: number;
  max_hosts: number;
  min_replicas_per_service: number;
  max_replicas_per_service: number;
  min_cpu_cores_per_instance: number;
  max_cpu_cores_per_instance: number;
  min_memory_mb_per_instance: number;
  max_memory_mb_per_instance: number;
  min_host_cpu_cores: number;
  max_host_cpu_cores: number;
  min_host_memory_gb: number;
  max_host_memory_gb: number;
  beam_width: number;
  max_search_depth: number;
  max_neighbors_per_state: number;
  reevaluations_per_candidate: number;
  infeasible_beam_width: number;
  freeze_workload: boolean;
  freeze_policies: boolean;
}

function utilizationBandsForWorkload(expectedWorkloadRps: number) {
  const small = expectedWorkloadRps < 50;
  if (small) {
    return {
      service_cpu_low: 0.35,
      service_cpu_high: 0.7,
      host_cpu_low: 0.1,
      host_cpu_high: 0.75,
      service_mem_low: 0.2,
      service_mem_high: 0.75,
      host_mem_low: 0.05,
      host_mem_high: 0.8,
    };
  }
  return {
    service_cpu_low: 0.5,
    service_cpu_high: 0.7,
    host_cpu_low: 0.45,
    host_cpu_high: 0.75,
    service_mem_low: 0.4,
    service_mem_high: 0.75,
    host_mem_low: 0.35,
    host_mem_high: 0.8,
  };
}

export function defaultBatchRecommendation(expectedWorkloadRps: number): BatchRecommendationFormState {
  const minTp = Math.round(Math.max(0, expectedWorkloadRps) * 0.95 * 1000) / 1000;
  const bands = utilizationBandsForWorkload(expectedWorkloadRps);
  return {
    ui_mode: "balanced",
    allow_replica_scaling: true,
    allow_host_scaling: true,
    allow_service_cpu: true,
    allow_service_memory: true,
    allow_host_cpu: true,
    allow_host_memory: true,
    evaluation_duration_ms: 30_000,
    max_evaluations: 32,
    max_p95_latency_ms: 500,
    max_p99_latency_ms: 1000,
    max_error_rate: 0.01,
    min_throughput_rps: minTp > 0 ? minTp : 1,
    ...bands,
    min_hosts: 1,
    max_hosts: 4,
    min_replicas_per_service: 1,
    max_replicas_per_service: 10,
    min_cpu_cores_per_instance: 0.25,
    max_cpu_cores_per_instance: 8,
    min_memory_mb_per_instance: 128,
    max_memory_mb_per_instance: 8192,
    min_host_cpu_cores: 1,
    max_host_cpu_cores: 16,
    min_host_memory_gb: 1,
    max_host_memory_gb: 64,
    beam_width: 3,
    max_search_depth: 3,
    max_neighbors_per_state: 8,
    reevaluations_per_candidate: 1,
    infeasible_beam_width: 1,
    freeze_workload: true,
    freeze_policies: true,
  };
}

interface BatchRecommendationFieldsProps {
  value: BatchRecommendationFormState;
  setValue: Dispatch<SetStateAction<BatchRecommendationFormState>>;
  expectedWorkloadRps: number;
  markMinThroughputTouched: () => void;
}

function pct01(n: number) {
  return Math.min(100, Math.max(0, Math.round(n * 1000) / 10));
}

const inputClass =
  "w-full px-3 py-2 bg-black/50 border border-white/15 rounded-lg text-sm text-white font-mono tabular-nums " +
  "placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-amber-500/35 focus:border-amber-500/40";

const labelClass = "block text-xs font-medium text-white/75 mb-1";
const hintClass = "text-[11px] text-white/40 mt-1 leading-snug";

function SectionBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/25 overflow-hidden">
      <div className="flex gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.03]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <h4 className="text-sm font-semibold text-white pt-1.5">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function UtilBandCard({
  title,
  subtitle,
  lowPct,
  highPct,
  onLow,
  onHigh,
}: {
  title: string;
  subtitle?: string;
  lowPct: number;
  highPct: number;
  onLow: (pct: number) => void;
  onHigh: (pct: number) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="text-xs font-medium text-white/85 mb-0.5">{title}</div>
      {subtitle ? <p className="text-[10px] text-white/38 mb-3 leading-snug">{subtitle}</p> : null}
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-white/35">Low %</span>
          <input
            type="number"
            min={0}
            max={100}
            value={lowPct}
            onChange={(e) => onLow(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className={`${inputClass} mt-0.5`}
          />
        </div>
        <span className="text-white/25 pb-2 text-sm">→</span>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-white/35">High %</span>
          <input
            type="number"
            min={0}
            max={100}
            value={highPct}
            onChange={(e) => onHigh(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className={`${inputClass} mt-0.5`}
          />
        </div>
      </div>
    </div>
  );
}

const MODE_TABS: { id: BatchRecommendationUiMode; label: string; hint: string }[] = [
  { id: "quick", label: "Quick", hint: "Targets + shared CPU/memory ranges" },
  { id: "balanced", label: "Balanced", hint: "Separate service vs host utilization" },
  { id: "advanced", label: "Advanced", hint: "Scaling limits, search tuning, actions" },
];

export function BatchRecommendationFields({
  value: br,
  setValue: setBatchRecommendation,
  expectedWorkloadRps,
  markMinThroughputTouched,
}: BatchRecommendationFieldsProps) {
  const set = (patch: Partial<BatchRecommendationFormState>) =>
    setBatchRecommendation((prev) => ({ ...prev, ...patch }));

  const [durUnit, setDurUnit] = useState<"seconds" | "ms">("seconds");

  const suggestedMinRps = Math.round(expectedWorkloadRps * 0.95 * 1000) / 1000;
  const durDisplay =
    durUnit === "seconds" ? Math.round((br.evaluation_duration_ms / 1000) * 1000) / 1000 : br.evaluation_duration_ms;

  const setDurationFromDisplay = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const ms = durUnit === "seconds" ? Math.round(raw * 1000) : Math.round(raw);
    set({ evaluation_duration_ms: ms });
  };

  const applyWorkloadBands = () => {
    set(utilizationBandsForWorkload(expectedWorkloadRps));
  };

  const applyBalancedPreset = () => {
    setBatchRecommendation(defaultBatchRecommendation(expectedWorkloadRps));
  };

  const applyThoroughPreset = () => {
    set({
      ui_mode: "advanced",
      evaluation_duration_ms: 60_000,
      max_evaluations: 64,
      beam_width: 4,
      max_search_depth: 4,
      max_neighbors_per_state: 12,
      reevaluations_per_candidate: 2,
    });
  };

  const mirrorCpuFromQuick = (lowPct: number, highPct: number) => {
    const lo = lowPct / 100;
    const hi = highPct / 100;
    set({ service_cpu_low: lo, service_cpu_high: hi, host_cpu_low: lo, host_cpu_high: hi });
  };

  const mirrorMemFromQuick = (lowPct: number, highPct: number) => {
    const lo = lowPct / 100;
    const hi = highPct / 100;
    set({ service_mem_low: lo, service_mem_high: hi, host_mem_low: lo, host_mem_high: hi });
  };

  const quickCpuLow = pct01(Math.min(br.service_cpu_low, br.host_cpu_low));
  const quickCpuHigh = pct01(Math.max(br.service_cpu_high, br.host_cpu_high));
  const quickMemLow = pct01(Math.min(br.service_mem_low, br.host_mem_low));
  const quickMemHigh = pct01(Math.max(br.service_mem_high, br.host_mem_high));

  const scalingOpen = br.ui_mode === "advanced";
  const advancedSearchOpen = br.ui_mode === "advanced";

  return (
    <div className="rounded-xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.07] to-black/20 p-1 shadow-lg shadow-black/20">
      <div className="rounded-[10px] border border-white/[0.06] bg-black/20 p-5 space-y-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white tracking-tight">Batch recommendation</h3>
            <div className="flex rounded-lg border border-white/15 p-0.5 bg-black/40">
              {MODE_TABS.map((tab) => {
                const active = br.ui_mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    title={tab.hint}
                    onClick={() => set({ ui_mode: tab.id })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      active ? "bg-amber-500/25 text-amber-100" : "text-white/45 hover:text-white/75"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-white/55 max-w-3xl leading-relaxed">
            Batch recommendation finds a lower-cost configuration that meets your latency, error, throughput, CPU, and
            memory targets.
          </p>

          <p className="text-xs text-white/45 max-w-3xl leading-relaxed">
            <span className="text-white/60">Target CPU</span> is a healthy range, not a value to minimize. The
            optimizer may scale replicas, service resources, or hosts up or down to stay in range.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyBalancedPreset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/10 transition-colors"
            >
              <Layers className="h-3.5 w-3.5 opacity-70" />
              Reset defaults
            </button>
            <button
              type="button"
              onClick={applyThoroughPreset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 opacity-80" />
              Thorough (slower)
            </button>
            <button
              type="button"
              onClick={applyWorkloadBands}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55 hover:bg-white/5 transition-colors"
            >
              Re-apply utilization bands from workload
            </button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-white/40">Workload RPS (sum of patterns)</span>
              <span className="font-mono text-amber-200/90 tabular-nums">{expectedWorkloadRps.toFixed(2)}</span>
            </div>
            <span className="hidden sm:inline text-white/20">|</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/40">Default throughput target (95%)</span>
              <span className="font-mono text-white/80 tabular-nums">{suggestedMinRps.toFixed(3)} RPS</span>
              <button
                type="button"
                onClick={() => {
                  set({ min_throughput_rps: suggestedMinRps > 0 ? suggestedMinRps : 1 });
                  markMinThroughputTouched();
                }}
                className="text-[11px] text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
              >
                Use this value
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          <SectionBlock icon={Timer} title="1. Goal">
            <p className="text-sm text-white/60 leading-relaxed">
              Lower cost while meeting the performance and utilization targets below.
            </p>
          </SectionBlock>

          <SectionBlock icon={ShieldCheck} title="2. Performance targets">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Evaluation duration</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={durUnit === "seconds" ? 10 : 10_000}
                    max={durUnit === "seconds" ? 120 : 120_000}
                    step={durUnit === "seconds" ? 1 : 1000}
                    value={durDisplay}
                    onChange={(e) => setDurationFromDisplay(Number(e.target.value))}
                    className={`${inputClass} flex-1`}
                  />
                  <div className="flex rounded-lg border border-white/15 p-0.5 bg-black/40 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDurUnit("seconds")}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                        durUnit === "seconds" ? "bg-amber-500/25 text-amber-100" : "text-white/45 hover:text-white/70"
                      }`}
                    >
                      sec
                    </button>
                    <button
                      type="button"
                      onClick={() => setDurUnit("ms")}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                        durUnit === "ms" ? "bg-amber-500/25 text-amber-100" : "text-white/45 hover:text-white/70"
                      }`}
                    >
                      ms
                    </button>
                  </div>
                </div>
                <p className={hintClass}>10s–120s per candidate evaluation.</p>
              </div>
              <div>
                <label className={labelClass}>Max evaluations</label>
                <input
                  type="number"
                  min={1}
                  value={br.max_evaluations}
                  onChange={(e) => set({ max_evaluations: Math.max(1, Number(e.target.value) || 1) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Latency target (P95)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={br.max_p95_latency_ms}
                    onChange={(e) => set({ max_p95_latency_ms: Math.max(1, Number(e.target.value) || 500) })}
                    className={inputClass}
                  />
                  <span className="text-xs text-white/35 shrink-0 w-8">ms</span>
                </div>
                {br.ui_mode === "quick" ? (
                  <p className={hintClass}>P99 is set automatically from P95 when you submit.</p>
                ) : null}
              </div>
              {br.ui_mode !== "quick" ? (
                <div>
                  <label className={labelClass}>Max P99 latency</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={br.max_p99_latency_ms}
                      onChange={(e) => set({ max_p99_latency_ms: Math.max(1, Number(e.target.value) || 1000) })}
                      className={inputClass}
                    />
                    <span className="text-xs text-white/35 shrink-0 w-8">ms</span>
                  </div>
                </div>
              ) : null}
              <div>
                <label className={labelClass}>Error tolerance</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={pct01(br.max_error_rate)}
                    onChange={(e) =>
                      set({ max_error_rate: Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)) })
                    }
                    className={inputClass}
                  />
                  <span className="text-xs text-white/35 shrink-0 w-8">%</span>
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelClass}>Throughput target (min RPS)</label>
                <input
                  type="number"
                  min={0.001}
                  step={0.1}
                  value={br.min_throughput_rps}
                  onChange={(e) => {
                    markMinThroughputTouched();
                    set({ min_throughput_rps: Math.max(0.001, Number(e.target.value) || 0) });
                  }}
                  className={inputClass}
                />
                <p className={hintClass}>Defaults to 95% of configured workload RPS. Raise for stricter throughput.</p>
              </div>
            </div>
          </SectionBlock>

          <SectionBlock icon={Gauge} title="3. Utilization targets">
            {br.ui_mode === "quick" ? (
              <div className="space-y-3">
                <UtilBandCard
                  title="CPU utilization (services & hosts)"
                  subtitle="Same band applied to service and host CPU targets."
                  lowPct={quickCpuLow}
                  highPct={quickCpuHigh}
                  onLow={(p) => mirrorCpuFromQuick(p, quickCpuHigh)}
                  onHigh={(p) => mirrorCpuFromQuick(quickCpuLow, p)}
                />
                <UtilBandCard
                  title="Memory utilization (services & hosts)"
                  subtitle="Same band applied to service and host memory targets."
                  lowPct={quickMemLow}
                  highPct={quickMemHigh}
                  onLow={(p) => mirrorMemFromQuick(p, quickMemHigh)}
                  onHigh={(p) => mirrorMemFromQuick(quickMemLow, p)}
                />
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <UtilBandCard
                  title="Service CPU"
                  lowPct={pct01(br.service_cpu_low)}
                  highPct={pct01(br.service_cpu_high)}
                  onLow={(p) => set({ service_cpu_low: p / 100 })}
                  onHigh={(p) => set({ service_cpu_high: p / 100 })}
                />
                <UtilBandCard
                  title="Service memory"
                  lowPct={pct01(br.service_mem_low)}
                  highPct={pct01(br.service_mem_high)}
                  onLow={(p) => set({ service_mem_low: p / 100 })}
                  onHigh={(p) => set({ service_mem_high: p / 100 })}
                />
                <UtilBandCard
                  title="Host CPU"
                  lowPct={pct01(br.host_cpu_low)}
                  highPct={pct01(br.host_cpu_high)}
                  onLow={(p) => set({ host_cpu_low: p / 100 })}
                  onHigh={(p) => set({ host_cpu_high: p / 100 })}
                />
                <UtilBandCard
                  title="Host memory"
                  lowPct={pct01(br.host_mem_low)}
                  highPct={pct01(br.host_mem_high)}
                  onLow={(p) => set({ host_mem_low: p / 100 })}
                  onHigh={(p) => set({ host_mem_high: p / 100 })}
                />
              </div>
            )}
          </SectionBlock>

          <details open={scalingOpen} className="group rounded-xl border border-white/[0.08] bg-black/25">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-medium text-white/80 hover:text-white [&::-webkit-details-marker]:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-amber-300/90 group-open:bg-amber-500/15">
                <Boxes className="h-4 w-4" />
              </span>
              <span className="flex-1">
                4. Scaling limits
                <span className="block text-xs font-normal text-white/40 mt-0.5">
                  Bounds for hosts, replicas, and per-instance / host capacity.
                </span>
              </span>
              <span className="text-white/30 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="px-4 pb-4 pt-0 border-t border-white/[0.06]">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                <div>
                  <label className={labelClass}>Min hosts</label>
                  <input
                    type="number"
                    min={1}
                    value={br.min_hosts}
                    onChange={(e) => set({ min_hosts: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max hosts</label>
                  <input
                    type="number"
                    min={1}
                    value={br.max_hosts}
                    onChange={(e) => set({ max_hosts: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min replicas / service</label>
                  <input
                    type="number"
                    min={1}
                    value={br.min_replicas_per_service}
                    onChange={(e) => set({ min_replicas_per_service: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max replicas / service</label>
                  <input
                    type="number"
                    min={1}
                    value={br.max_replicas_per_service}
                    onChange={(e) => set({ max_replicas_per_service: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min CPU / instance</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.05}
                    value={br.min_cpu_cores_per_instance}
                    onChange={(e) =>
                      set({ min_cpu_cores_per_instance: Math.max(0.01, Number(e.target.value) || 0.25) })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max CPU / instance</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.25}
                    value={br.max_cpu_cores_per_instance}
                    onChange={(e) => set({ max_cpu_cores_per_instance: Math.max(0.01, Number(e.target.value) || 8) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min memory / instance (MB)</label>
                  <input
                    type="number"
                    min={1}
                    step={64}
                    value={br.min_memory_mb_per_instance}
                    onChange={(e) => set({ min_memory_mb_per_instance: Math.max(1, Number(e.target.value) || 128) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max memory / instance (MB)</label>
                  <input
                    type="number"
                    min={1}
                    step={256}
                    value={br.max_memory_mb_per_instance}
                    onChange={(e) => set({ max_memory_mb_per_instance: Math.max(1, Number(e.target.value) || 8192) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min host CPU cores</label>
                  <input
                    type="number"
                    min={1}
                    value={br.min_host_cpu_cores}
                    onChange={(e) => set({ min_host_cpu_cores: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max host CPU cores</label>
                  <input
                    type="number"
                    min={1}
                    value={br.max_host_cpu_cores}
                    onChange={(e) => set({ max_host_cpu_cores: Math.max(1, Number(e.target.value) || 16) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min host memory (GB)</label>
                  <input
                    type="number"
                    min={1}
                    value={br.min_host_memory_gb}
                    onChange={(e) => set({ min_host_memory_gb: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max host memory (GB)</label>
                  <input
                    type="number"
                    min={1}
                    value={br.max_host_memory_gb}
                    onChange={(e) => set({ max_host_memory_gb: Math.max(1, Number(e.target.value) || 64) })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </details>

          <details open={advancedSearchOpen} className="group rounded-xl border border-white/[0.08] bg-black/25 open:border-amber-500/20">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-medium text-white/80 hover:text-white [&::-webkit-details-marker]:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-amber-300/90 group-open:bg-amber-500/15">
                <Search className="h-4 w-4" />
              </span>
              <span className="flex-1">
                5. Advanced search settings
                <span className="block text-xs font-normal text-white/40 mt-0.5">
                  Beam search, scenario locks, and which scaling dimensions are allowed.
                </span>
              </span>
              <span className="text-white/30 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="px-4 pb-4 pt-0 border-t border-white/[0.06] space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                <div>
                  <label className={labelClass}>Beam width</label>
                  <input
                    type="number"
                    min={1}
                    value={br.beam_width}
                    onChange={(e) => set({ beam_width: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max search depth</label>
                  <input
                    type="number"
                    min={1}
                    value={br.max_search_depth}
                    onChange={(e) => set({ max_search_depth: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max neighbors per state</label>
                  <input
                    type="number"
                    min={1}
                    value={br.max_neighbors_per_state}
                    onChange={(e) => set({ max_neighbors_per_state: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reevaluations per candidate</label>
                  <input
                    type="number"
                    min={1}
                    value={br.reevaluations_per_candidate}
                    onChange={(e) => set({ reevaluations_per_candidate: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Infeasible beam width</label>
                  <input
                    type="number"
                    min={1}
                    value={br.infeasible_beam_width}
                    onChange={(e) => set({ infeasible_beam_width: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] p-3 space-y-2">
                <p className="text-[11px] text-amber-100/80 font-medium">Scenario locks</p>
                <label className="flex items-start gap-3 cursor-pointer text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={br.freeze_workload}
                    onChange={(e) => set({ freeze_workload: e.target.checked })}
                    className="mt-1 rounded border-white/30"
                  />
                  <span>
                    <span className="font-medium text-white/90">Freeze workload</span>
                    <span className="block text-xs text-white/45 mt-0.5">Keep traffic unchanged during optimization.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={br.freeze_policies}
                    onChange={(e) => set({ freeze_policies: e.target.checked })}
                    className="mt-1 rounded border-white/30"
                  />
                  <span>
                    <span className="font-medium text-white/90">Freeze policies</span>
                    <span className="block text-xs text-white/45 mt-0.5">
                      Keep autoscaling and policy settings unchanged.
                    </span>
                  </span>
                </label>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                <p className="text-[11px] text-white/55 font-medium">Allowed scaling dimensions</p>
                <p className="text-[10px] text-white/35 leading-snug">
                  Each selected dimension allows both increase and decrease. Example: service CPU may be scaled up or down
                  within the configured bounds.
                </p>
                <div className="grid sm:grid-cols-2 gap-2 pt-1">
                  {BATCH_SCALING_CHECKBOXES.map((row) => (
                    <label key={row.ordinal} className="flex items-center gap-2 cursor-pointer text-sm text-white/75">
                      <input
                        type="checkbox"
                        checked={br[row.key]}
                        onChange={(e) => set({ [row.key]: e.target.checked } as Partial<BatchRecommendationFormState>)}
                        className="rounded border-white/30"
                      />
                      {row.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <details className="rounded-lg border border-white/10 bg-black/20">
            <summary className="cursor-pointer px-3 py-2 text-[11px] text-white/35 hover:text-white/50">
              Developer / API diagnostics
            </summary>
            <div className="px-3 pb-3 pt-0 text-[10px] text-white/40 font-mono leading-relaxed space-y-1">
              <p>
                Create-run objective:{" "}
                <code className="text-white/55">
                  {env.NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE === "recommended_config"
                    ? "recommended_config"
                    : "cpu_utilization"}
                </code>{" "}
                (set <code className="text-white/45">NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE</code> when the backend
                accepts <code className="text-white/45">recommended_config</code>).
              </p>
              <p>
                <code className="text-white/45">allowed_actions</code> is derived from the checkboxes as integer
                ordinals{" "}
                <code className="text-white/45">[1=replicas … 6=host memory]</code>.
              </p>
              <p>
                Each ordinal is interpreted by simulation-core as bidirectional (e.g. replica scale-in and scale-out)
                within the search bounds; confirm behavior matches your engine version if results look one-sided.
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
