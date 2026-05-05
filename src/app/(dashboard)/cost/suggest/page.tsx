"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    fetchSuggestions,
    fetchDesignByProjectRun,
    fetchRunCandidates,
    fetchSuggestionsFromRun,
    resolveClusterNodeCountFromRunCandidates,
} from '@/app/api/asm/routes';
import {
    mapRunCandidatesToSuggest,
    type MappedSuggestionCandidate,
    restoreSuggestionResponseCandidateSpecs,
} from '@/lib/simulation/map-run-candidates-to-suggest';
import {
    resolveCandidateNodes,
    resolveEffectiveCostNodes,
    resolveRequestedNodes,
} from '@/lib/simulation/simulation-node-counts';
import { Cpu, MemoryStick, AlertCircle, ChevronDown, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from "@/providers/auth-context";

type Candidate = MappedSuggestionCandidate;

interface SuggestionResponse {
    best: {
        candidate: Candidate;
        passed_all_required: boolean;
        workload_distance: number;
        suggestions: string[];
    };
    all_scores: Array<{
        candidate: Candidate;
        passed_all_required: boolean;
        workload_distance: number;
        suggestions: string[];
    }>;
    storage_id: string;
    design?: DesignRequirements;
}

interface DesignRequirements {
    preferred_vcpu: number;
    preferred_memory_gb: number;
    workload: { concurrent_users: number };
    budget: number;
}

interface SimulationRequirements {
    nodes: number;
}

type AnalysisRequestSimulation = SimulationRequirements & {
    candidate_nodes?: number;
    requested_nodes?: number;
};

type SuggestPageProps = {
    projectId?: string;
};

function normalizeDesignFromApi(raw: DesignRequirements | undefined): DesignRequirements | null {
    if (!raw) return null;
    return {
        preferred_vcpu: raw.preferred_vcpu ?? 0,
        preferred_memory_gb: raw.preferred_memory_gb ?? 0,
        workload: {
            concurrent_users: raw.workload?.concurrent_users ?? 0,
        },
        budget: raw.budget ?? 0,
    };
}

/** Delay between retries when a run has not published candidates yet (e.g. still persisting). */
const RUN_CANDIDATES_POLL_INTERVAL_MS = 3000;
/** Stop polling after this many empty responses after the initial fetch (~10 min at 3s). */
const RUN_CANDIDATES_MAX_EMPTY_POLLS = 200;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function shouldHideConflictingResourceSuggestion(
    suggestion: string,
    candidate: Candidate,
): boolean {
    const lower = suggestion.toLowerCase();
    const hasVcpu = lower.includes('vcpu');
    const hasMemory = lower.includes('memory');
    if (!hasVcpu && !hasMemory) return false;

    const toMatch = lower.match(/\bto\s+(\d+(?:\.\d+)?)/i);
    if (!toMatch) return false;
    const recommended = Number(toMatch[1]);
    if (!Number.isFinite(recommended)) return false;

    if (hasVcpu) return recommended !== candidate.spec.vcpu;
    if (hasMemory) return recommended !== candidate.spec.memory_gb;
    return false;
}

function sanitizeResourceSuggestions(
    response: SuggestionResponse,
): SuggestionResponse {
    return {
        ...response,
        best: response.best
            ? {
                ...response.best,
                suggestions: (response.best.suggestions ?? []).filter(
                    (s) => !shouldHideConflictingResourceSuggestion(s, response.best.candidate),
                ),
            }
            : response.best,
        all_scores: (response.all_scores ?? []).map((score) => ({
            ...score,
            suggestions: (score.suggestions ?? []).filter(
                (s) => !shouldHideConflictingResourceSuggestion(s, score.candidate),
            ),
        })),
    };
}

export default function SuggestPage({ projectId: projectIdProp }: SuggestPageProps = {}) {
    const [loading, setLoading] = useState(false);
    const [suggestionData, setSuggestionData] = useState<SuggestionResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [design, setDesign] = useState<DesignRequirements | null>(null);
    /** Effective cluster size sent to suggest APIs (candidate topology when known, else requested). */
    const [simulationForApi, setSimulationForApi] = useState<SimulationRequirements | null>(null);
    const [requestedNodesSummary, setRequestedNodesSummary] = useState<number | null>(null);
    const [candidateNodesSummary, setCandidateNodesSummary] = useState<number | null>(null);
    const [, setCandidates] = useState<Candidate[]>([]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, userId: firebaseUid } = useAuth();
    const projectId = projectIdProp ?? searchParams.get('projectId') ?? '';

    const runIdFromQuery =
        searchParams.get('run_id') ?? searchParams.get('runId') ?? '';
    const candidatesParam = searchParams.get('candidates');
    const projectIdFromSearch = searchParams.get('projectId') ?? '';

    useEffect(() => {
        if (!firebaseUid) return;

        const resolvedProjectId = projectIdProp ?? projectIdFromSearch;

        if (resolvedProjectId && !runIdFromQuery && !candidatesParam) {
            return;
        }

        let cancelled = false;

        const loadSuggestions = async () => {
            setLoading(true);
            setError(null);

            try {
                if (resolvedProjectId && runIdFromQuery && !candidatesParam) {
                    console.log('[cost/suggest] fetchRunCandidates:start', {
                        runId: runIdFromQuery,
                        projectId: resolvedProjectId,
                    });
                    let runData = await fetchRunCandidates(runIdFromQuery);
                    console.log('[cost/suggest] fetchRunCandidates:result', runData);
                    if (cancelled) return;

                    let storedAnalysis: Awaited<ReturnType<typeof fetchDesignByProjectRun>> | null =
                        null;
                    try {
                        storedAnalysis = await fetchDesignByProjectRun(
                            firebaseUid,
                            resolvedProjectId,
                            runIdFromQuery,
                        );
                    } catch {
                        storedAnalysis = null;
                    }
                    const analysisReq = storedAnalysis?.request as
                        | { simulation?: AnalysisRequestSimulation }
                        | undefined;

                    let mappedCandidates = mapRunCandidatesToSuggest(
                        runData.candidates ?? [],
                    );
                    let emptyPolls = 0;
                    while (
                        mappedCandidates.length === 0 &&
                        emptyPolls < RUN_CANDIDATES_MAX_EMPTY_POLLS
                    ) {
                        if (cancelled) return;
                        await delay(RUN_CANDIDATES_POLL_INTERVAL_MS);
                        if (cancelled) return;
                        runData = await fetchRunCandidates(runIdFromQuery);
                        console.log('[cost/suggest] fetchRunCandidates:poll', {
                            runId: runIdFromQuery,
                            attempt: emptyPolls + 1,
                            candidateCount: (runData.candidates ?? []).length,
                        });
                        if (cancelled) return;
                        mappedCandidates = mapRunCandidatesToSuggest(
                            runData.candidates ?? [],
                        );
                        emptyPolls += 1;
                    }

                    if (cancelled) return;

                    if (mappedCandidates.length === 0) {
                        setError(
                            'No candidates were found for this run after waiting. Try again once the simulation has finished exporting candidates.',
                        );
                        setDesign(null);
                        const requested = resolveRequestedNodes(runData, analysisReq);
                        const candidate = resolveCandidateNodes(runData, analysisReq);
                        const effectiveFallback =
                            resolveEffectiveCostNodes(runData, analysisReq) ??
                            Math.max(1, resolveClusterNodeCountFromRunCandidates(runData));
                        setRequestedNodesSummary(requested ?? null);
                        setCandidateNodesSummary(candidate ?? null);
                        setSimulationForApi({ nodes: Math.max(1, effectiveFallback) });
                        setSuggestionData(null);
                        return;
                    }

                    setCandidates(mappedCandidates);
                    const requested = resolveRequestedNodes(runData, analysisReq);
                    const candidate = resolveCandidateNodes(runData, analysisReq);
                    const effective =
                        resolveEffectiveCostNodes(runData, analysisReq) ??
                        Math.max(1, resolveClusterNodeCountFromRunCandidates(runData));
                    setRequestedNodesSummary(requested ?? null);
                    setCandidateNodesSummary(candidate ?? null);
                    const sim = { nodes: Math.max(1, effective) };
                    setSimulationForApi(sim);
                    const fallbackDesign: DesignRequirements = {
                        preferred_vcpu: mappedCandidates[0]?.spec.vcpu ?? 0,
                        preferred_memory_gb: mappedCandidates[0]?.spec.memory_gb ?? 0,
                        workload: {
                            concurrent_users:
                                mappedCandidates[0]?.sim_workload.concurrent_users ?? 0,
                        },
                        budget: 0,
                    };
                    const data = (await fetchSuggestionsFromRun(
                        firebaseUid,
                        resolvedProjectId,
                        runIdFromQuery,
                        sim,
                        mappedCandidates,
                    )) as SuggestionResponse;
                    if (cancelled) return;
                    const restoredData = restoreSuggestionResponseCandidateSpecs(
                        data,
                        mappedCandidates,
                    );
                    const sanitizedData = sanitizeResourceSuggestions(restoredData);
                    setSuggestionData(sanitizedData);
                    setDesign(normalizeDesignFromApi(sanitizedData.design) ?? fallbackDesign);
                    return;
                }

                // Flow 2: runId + candidates in URL (existing flow with design from stored request)
                if (!runIdFromQuery || !candidatesParam) {
                    if (cancelled) return;
                    setDesign(null);
                    setSimulationForApi(null);
                    setRequestedNodesSummary(null);
                    setCandidateNodesSummary(null);
                    setSuggestionData(null);
                    setError(
                        'Open this page from a simulation run, or provide both run ID and candidates in the URL.',
                    );
                    return;
                }

                const decodedCandidates = JSON.parse(
                    decodeURIComponent(candidatesParam),
                ) as Candidate[];
                setCandidates(decodedCandidates);

                const [stored, runCandResult] = await Promise.all([
                    fetchDesignByProjectRun(
                        firebaseUid,
                        resolvedProjectId,
                        runIdFromQuery,
                    ),
                    fetchRunCandidates(runIdFromQuery).catch(() => null),
                ]);
                if (cancelled) return;

                const storedRequest = stored.request as {
                    design: DesignRequirements;
                    simulation?: AnalysisRequestSimulation;
                };

                const resolvedDesign = storedRequest.design;

                const requested = resolveRequestedNodes(runCandResult, storedRequest);
                const candidate = resolveCandidateNodes(runCandResult, storedRequest);
                const effective =
                    resolveEffectiveCostNodes(runCandResult, storedRequest) ??
                    (runCandResult != null
                        ? Math.max(1, resolveClusterNodeCountFromRunCandidates(runCandResult))
                        : undefined) ??
                    Math.max(1, storedRequest.simulation?.nodes ?? 1);

                setRequestedNodesSummary(requested ?? null);
                setCandidateNodesSummary(candidate ?? null);
                const resolvedSimulation: SimulationRequirements = {
                    nodes: Math.max(1, effective),
                };
                setSimulationForApi(resolvedSimulation);

                setDesign(resolvedDesign);

                const data = (await fetchSuggestions(
                    firebaseUid,
                    resolvedDesign,
                    resolvedSimulation,
                    decodedCandidates,
                    resolvedProjectId,
                    runIdFromQuery,
                )) as SuggestionResponse;
                if (cancelled) return;
                const restoredData = restoreSuggestionResponseCandidateSpecs(
                    data,
                    decodedCandidates,
                );
                const sanitizedData = sanitizeResourceSuggestions(restoredData);
                setSuggestionData(sanitizedData);
                setDesign(
                    normalizeDesignFromApi(sanitizedData.design) ?? resolvedDesign,
                );
            } catch (err) {
                if (cancelled) return;
                console.error('Error fetching suggestions:', err);
                setError(err instanceof Error ? err.message : 'An error occurred');
                setDesign(null);
                setSimulationForApi(null);
                setRequestedNodesSummary(null);
                setCandidateNodesSummary(null);
                setSuggestionData(null);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadSuggestions();
        return () => {
            cancelled = true;
        };
    }, [firebaseUid, projectIdProp, projectIdFromSearch, runIdFromQuery, candidatesParam]);

    const formatPercentage = (value: number) => {
        return `${value.toFixed(1)}%`;
    };

    const workloadVsTarget = (achieved: number, target: number) => {
        const diff = achieved - target;
        const isSurplus = diff >= 0;
        const pctOfTarget = target > 0 ? (achieved / target) * 100 : null;
        return { diff, isSurplus, pctOfTarget };
    };

    const handleViewCostAnalysis = () => {
        if (suggestionData?.storage_id) {
            const path = projectId ? `/project/${projectId}/cost/${suggestionData.storage_id}` : `/cost/${suggestionData.storage_id}`;
            router.push(path);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-6">
                <Loader2
                    className="h-8 w-8 animate-spin text-white/80"
                    aria-hidden
                />
                <p className="text-sm text-white/70">
                    Loading run candidates and analysis…
                </p>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col p-6">
            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/40 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80"
                        aria-label="Go back"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h1 className="text-md font-bold text-white">Metrics Analysis</h1>
                </div>
                {suggestionData && (
                    <button
                        type="button"
                        onClick={handleViewCostAnalysis}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600/80 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500"
                    >
                        View Cost Analysis
                    </button>
                )}
            </div>

            <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-5">

                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    </div>
                )}

                {/* Requirements Summary */}
                {design && simulationForApi && (
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-white">Design Requirements</h2>
                        <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-5 md:divide-x md:divide-y-0">
                            <div className="min-w-0 py-3 md:px-4 md:py-2">
                                <p className="text-xs text-white/60">User</p>
                                {user ? (
                                    <p className="mt-0.5 truncate text-sm font-semibold text-white">
                                        {user?.displayName || user?.email || "Unnamed user"}
                                    </p>
                                ) : (
                                    <p className="mt-0.5 text-xs text-white/50">Not signed in</p>
                                )}
                            </div>
                            <div className="min-w-0 py-3 md:px-4 md:py-2">
                                <p className="text-xs text-white/60">Preferred vCPU</p>
                                <p className="mt-0.5 text-sm font-semibold text-white">{design.preferred_vcpu}</p>
                            </div>
                            <div className="min-w-0 py-3 md:px-4 md:py-2">
                                <p className="text-xs text-white/60">Preferred Memory</p>
                                <p className="mt-0.5 text-sm font-semibold text-white">{design.preferred_memory_gb} GB</p>
                            </div>
                            <div className="min-w-0 py-3 md:px-4 md:py-2">
                                <p className="text-xs text-white/60">Target Users</p>
                                <p className="mt-0.5 text-sm font-semibold text-white">{design.workload.concurrent_users} users</p>
                            </div>
                            <div className="min-w-0 py-3 md:px-4 md:py-2">
                                <p className="text-xs text-white/60">Requested nodes</p>
                                <p className="mt-0.5 text-sm font-semibold text-white">
                                    {requestedNodesSummary != null
                                        ? `${requestedNodesSummary} nodes`
                                        : "—"}
                                </p>
                                {candidateNodesSummary != null && (
                                    <>
                                        <p className="mt-3 text-xs text-white/60">Candidate nodes</p>
                                        <p className="mt-0.5 text-sm font-semibold text-white">
                                            {candidateNodesSummary} nodes
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Results Display */}
                {suggestionData && design && simulationForApi && (
                    <div className="space-y-5">
                        {/* Best Candidate */}
                        <div className="space-y-4 border-t border-white/40 pt-5">
                            <h3 className="text-sm font-semibold text-white">Best Candidate</h3>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                {/* Candidate Details */}
                                <div className="lg:col-span-2">
                                    <div className="mb-4 overflow-hidden rounded-lg bg-white/4">
                                        <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-4 md:divide-x md:divide-y-0">
                                            <div className="min-w-0 px-3 py-3 md:py-3">
                                                <p className="text-xs text-white/60">Candidate</p>
                                                <p className="mt-0.5 wrap-break-word text-sm font-semibold text-white">
                                                    {suggestionData.best.candidate.spec.label} ({suggestionData.best.candidate.id})
                                                </p>
                                            </div>
                                            <div className="min-w-0 px-3 py-3 md:py-3">
                                                <p className="text-xs text-white/60">Specification</p>
                                                <p className="mt-0.5 text-sm font-semibold text-white">
                                                    {suggestionData.best.candidate.spec.vcpu} vCPU / {suggestionData.best.candidate.spec.memory_gb} GB
                                                </p>
                                            </div>
                                            <div className="min-w-0 px-3 py-3 md:py-3">
                                                <p className="text-xs text-white/60">Workload Performance</p>
                                                <p className="mt-0.5 text-sm font-semibold text-white">
                                                    {suggestionData.best.candidate.sim_workload.concurrent_users} users
                                                </p>
                                            </div>
                                            <div className="min-w-0 px-3 py-3 md:py-3">
                                                <p className="text-xs text-white/60">Final scenario nodes</p>
                                                <p className="mt-0.5 text-sm font-semibold text-white">
                                                    {candidateNodesSummary != null
                                                        ? `${candidateNodesSummary} nodes`
                                                        : "—"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Performance Metrics */}
                                    <div className="mb-4 overflow-hidden rounded-lg bg-white/4">
                                        <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-2 md:divide-x md:divide-y-0">
                                            <div className="p-3">
                                                <p className="mb-2 text-xs text-white/60">CPU Utilization</p>
                                                <div className="flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="h-2 w-full rounded-full bg-white/10">
                                                            <div
                                                                className="h-2 rounded-full bg-white/80"
                                                                style={{ width: `${suggestionData.best.candidate.metrics.cpu_util_pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 tabular-nums text-sm font-semibold text-white">
                                                        {formatPercentage(suggestionData.best.candidate.metrics.cpu_util_pct)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-3">
                                                <p className="mb-2 text-xs text-white/60">Memory Utilization</p>
                                                <div className="flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="h-2 w-full rounded-full bg-white/10">
                                                            <div
                                                                className="h-2 rounded-full bg-white/80"
                                                                style={{ width: `${suggestionData.best.candidate.metrics.mem_util_pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 tabular-nums text-sm font-semibold text-white">
                                                        {formatPercentage(suggestionData.best.candidate.metrics.mem_util_pct)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Suggestions */}
                                    <div className="mt-5 space-y-2">
                                        <h4 className="text-xs font-semibold text-white/70">Recommendations</h4>
                                        <ul className="space-y-1.5 text-xs text-white/75">
                                            {suggestionData.best.suggestions.map((suggestion, index) => (
                                                <li key={index} className="flex gap-2">
                                                    <span className="mt-0.5 shrink-0 text-white/40">•</span>
                                                    <span>{suggestion}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* Performance Summary */}
                                <div className="lg:col-span-1">
                                    <h4 className="mb-3 text-xs font-semibold text-white/70">Performance Summary</h4>
                                    <div className="divide-y divide-white/40 text-xs">
                                        <div className="py-2.5 first:pt-0">
                                            <p className="text-white/60">Target Users</p>
                                            <p className="mt-0.5 text-sm font-semibold text-white">
                                                {design.workload.concurrent_users} users
                                            </p>
                                        </div>
                                        <div className="py-2.5">
                                            <p className="text-white/60">Achieved Users</p>
                                            <p className="mt-0.5 text-sm font-semibold text-white">
                                                {suggestionData.best.candidate.sim_workload.concurrent_users} users
                                            </p>
                                        </div>
                                        {(() => {
                                            const { diff, isSurplus, pctOfTarget } = workloadVsTarget(
                                                suggestionData.best.candidate.sim_workload.concurrent_users,
                                                design.workload.concurrent_users,
                                            );
                                            return (
                                                <div className="py-2.5">
                                                    <p className="text-white/60">{isSurplus ? 'Surplus' : 'Shortfall'}</p>
                                                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                                                        {isSurplus ? '+' : ''}{diff} users
                                                    </p>
                                                    {pctOfTarget != null && (
                                                        <p className="mt-1 text-[11px] text-white/50">
                                                            ({pctOfTarget.toFixed(1)}% of target)
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* All Candidates Comparison */}
                        <div className="space-y-4 border-t border-white/40 pt-5">
                            <div>
                                <h3 className="text-sm font-semibold text-white">All Candidates Comparison</h3>
                                <p className="mt-1 text-xs text-white/50">
                                    Storage ID:{" "}
                                    <span className="font-mono text-white/70">{suggestionData.storage_id}</span>
                                </p>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-border text-xs">
                                    <thead>
                                        <tr className="border-b border-border bg-white/5">
                                            <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                                                Rank
                                            </th>
                                            <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                                                Candidate
                                            </th>
                                            <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                                                Specification
                                            </th>
                                            <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                                                Utilization
                                            </th>
                                            <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                                                vs target
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {suggestionData.all_scores.map((score, index) => (
                                            <tr key={score.candidate.id} className="transition-colors hover:bg-white/5">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center">
                                                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${index === 0 ? 'bg-white/15 text-white' : 'bg-white/10 text-white/75'
                                                            }`}>
                                                            {index + 1}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div>
                                                        <p className="text-xs font-medium text-white">
                                                            {score.candidate.spec.label} ({score.candidate.id})
                                                        </p>
                                                        <p className="text-[11px] text-white/45">{score.candidate.source}</p>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <Cpu className="h-3.5 w-3.5 shrink-0 text-white/50" />
                                                        <p className="text-white/80">
                                                            {score.candidate.spec.vcpu} vCPU
                                                        </p>
                                                    </div>
                                                    <div className="mt-0.5 flex items-center gap-1.5">
                                                        <MemoryStick className="h-3.5 w-3.5 shrink-0 text-white/50" />
                                                        <p className="text-[11px] text-white/45">
                                                            {score.candidate.spec.memory_gb} GB RAM
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center">
                                                            <span className="text-xs opacity-50 w-8">CPU:</span>
                                                            <span className={`text-sm font-medium ${score.candidate.metrics.cpu_util_pct > 80 ? 'text-red-500' :
                                                                score.candidate.metrics.cpu_util_pct > 60 ? 'text-yellow-500' : 'text-green-500'
                                                                }`}>
                                                                {formatPercentage(score.candidate.metrics.cpu_util_pct)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center">
                                                            <span className="text-xs opacity-50 w-8">MEM:</span>
                                                            <span className={`text-sm font-medium ${score.candidate.metrics.mem_util_pct > 80 ? 'text-red-500' :
                                                                score.candidate.metrics.mem_util_pct > 60 ? 'text-yellow-500' : 'text-green-500'
                                                                }`}>
                                                                {formatPercentage(score.candidate.metrics.mem_util_pct)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    {(() => {
                                                        const { diff, isSurplus, pctOfTarget } = workloadVsTarget(
                                                            score.candidate.sim_workload.concurrent_users,
                                                            design.workload.concurrent_users,
                                                        );
                                                        return (
                                                            <>
                                                                <p className={`text-xs font-medium ${isSurplus ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    {isSurplus ? '+' : ''}{diff} users
                                                                </p>
                                                                {pctOfTarget != null && (
                                                                    <p className="mt-0.5 text-[11px] text-white/45">
                                                                        {pctOfTarget.toFixed(1)}% of target
                                                                    </p>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Detailed Suggestions */}
                            <div className="mt-4">
                                <details className="group">
                                    <summary className="flex cursor-pointer items-center text-xs font-medium text-white/70 transition-colors hover:text-white">
                                        <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                                        View detailed recommendations for all candidates
                                    </summary>
                                    <div className="mt-3 mb-12 divide-y divide-white/40 pb-6">
                                        {suggestionData.all_scores.map((score, index) => (
                                            <div key={score.candidate.id} className="py-3 first:pt-0 last:pb-0">
                                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                    <h4 className="text-xs font-semibold text-white">
                                                        {index + 1}. {score.candidate.spec.label} ({score.candidate.id})
                                                    </h4>
                                                    {(() => {
                                                        const { diff, isSurplus } = workloadVsTarget(
                                                            score.candidate.sim_workload.concurrent_users,
                                                            design.workload.concurrent_users,
                                                        );
                                                        return (
                                                            <span
                                                                className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${isSurplus
                                                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                                                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                                                                    }`}
                                                            >
                                                                {isSurplus ? 'Surplus' : 'Shortfall'}: {isSurplus ? '+' : ''}{diff} users
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                <ul className="space-y-1.5 text-xs text-white/70">
                                                    {score.suggestions.map((suggestion, sIndex) => (
                                                        <li key={sIndex} className="flex items-start gap-2">
                                                            <span className="mt-0.5 shrink-0 text-white/35">•</span>
                                                            <span>{suggestion}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}