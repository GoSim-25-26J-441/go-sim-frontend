"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    fetchSuggestions,
    fetchDesignByProjectRun,
    fetchRunCandidates,
    fetchSuggestionsFromRun,
    type RunCandidateItem,
} from '@/app/api/asm/routes';
import { Cpu, MemoryStick, AlertCircle, ChevronDown, ArrowLeft } from 'lucide-react';
import { useAuth } from "@/providers/auth-context";

interface Candidate {
    id: string;
    spec: {
        vcpu: number;
        memory_gb: number;
        label: string;
    };
    metrics: {
        cpu_util_pct: number;
        mem_util_pct: number;
    };
    sim_workload: {
        concurrent_users: number;
    };
    source: string;
}

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

const DUMMY_DESIGN: DesignRequirements = {
    preferred_vcpu: 4,
    preferred_memory_gb: 16,
    workload: { concurrent_users: 500 },
    budget: 500,
};

const DUMMY_SIMULATION: SimulationRequirements = {
    nodes: 3,
};

const DUMMY_CANDIDATE = (id: string, label: string, vcpu: number, memory_gb: number, cpu_util: number, mem_util: number, users: number, source: string): Candidate => ({
    id,
    spec: { vcpu, memory_gb, label },
    metrics: { cpu_util_pct: cpu_util, mem_util_pct: mem_util },
    sim_workload: { concurrent_users: users },
    source,
});

const DUMMY_SUGGESTION_RESPONSE: SuggestionResponse = {
    storage_id: 'b2cf17cb-085e-4be4-ba62-2cac869b0157',
    best: {
        candidate: DUMMY_CANDIDATE('t3.xlarge', 't3.xlarge', 4, 16, 62, 58, 480, 'AWS'),
        passed_all_required: false,
        workload_distance: 20,
        suggestions: [
            'Consider scaling to 4 nodes to meet target concurrent users.',
            'CPU utilization is within healthy range; memory has headroom.',
            'For production, enable enhanced networking if available.',
        ],
    },
    all_scores: [
        {
            candidate: DUMMY_CANDIDATE('t3.xlarge', 't3.xlarge', 4, 16, 62, 58, 480, 'AWS'),
            passed_all_required: false,
            workload_distance: 20,
            suggestions: [
                'Consider scaling to 4 nodes to meet target concurrent users.',
                'CPU utilization is within healthy range; memory has headroom.',
            ],
        },
        {
            candidate: DUMMY_CANDIDATE('t3.large', 't3.large', 2, 8, 78, 72, 320, 'AWS'),
            passed_all_required: false,
            workload_distance: 180,
            suggestions: [
                'Instance is under-provisioned for target workload.',
                'Upgrade to t3.xlarge or add more nodes.',
            ],
        },
        {
            candidate: DUMMY_CANDIDATE('m5.large', 'm5.large', 2, 8, 82, 75, 300, 'AWS'),
            passed_all_required: false,
            workload_distance: 200,
            suggestions: [
                'High CPU and memory utilization; consider larger instance.',
                'm5.xlarge would better match your preferred spec.',
            ],
        },
    ],
};

type SuggestPageProps = {
    projectId?: string;
};

function mapRunCandidatesToSuggest(candidates: RunCandidateItem[]): Candidate[] {
    return candidates.map((c) => ({
        id: c.id,
        spec: {
            vcpu: c.spec.vcpu,
            memory_gb: c.spec.memory_gb,
            label: c.spec.label ?? c.id,
        },
        metrics: {
            cpu_util_pct: c.metrics.cpu_util_pct,
            mem_util_pct: c.metrics.mem_util_pct,
        },
        sim_workload: {
            concurrent_users: c.sim_workload?.concurrent_users ?? 0,
        },
        source: c.source ?? 'export',
    }));
}

export default function SuggestPage({ projectId: projectIdProp }: SuggestPageProps = {}) {
    const [loading, setLoading] = useState(false);
    const [suggestionData, setSuggestionData] = useState<SuggestionResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [design, setDesign] = useState<DesignRequirements | null>(null);
    const [simulation, setSimulation] = useState<SimulationRequirements | null>(null);
    const [, setCandidates] = useState<Candidate[]>([]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, userId: firebaseUid } = useAuth();
    const projectId = projectIdProp ?? searchParams.get('projectId') ?? '';

    const hasFetchedRef = useRef(false);

    useEffect(() => {
        if (!firebaseUid) return;
        if (hasFetchedRef.current) return;
        hasFetchedRef.current = true;

        const loadSuggestions = async () => {
            setLoading(true);
            setError(null);

            const runIdFromQuery = searchParams.get('run_id') ?? searchParams.get('runId') ?? '';
            const candidatesParam = searchParams.get('candidates');
            const resolvedProjectId = projectIdProp ?? searchParams.get('projectId') ?? '';

            try {
                if (resolvedProjectId && runIdFromQuery && !candidatesParam) {
                    const runData = await fetchRunCandidates(runIdFromQuery);
                    const mappedCandidates = mapRunCandidatesToSuggest(runData.candidates ?? []);
                    if (mappedCandidates.length === 0) {
                        setError('No candidates found for this run');
                        setDesign(DUMMY_DESIGN);
                        setSimulation(runData.simulation ?? DUMMY_SIMULATION);
                        setSuggestionData(null);
                        setLoading(false);
                        return;
                    }
                    setCandidates(mappedCandidates);
                    const sim = runData.simulation ?? { nodes: 0 };
                    setSimulation(sim);
                    setDesign({
                        ...DUMMY_DESIGN,
                        preferred_vcpu: mappedCandidates[0]?.spec.vcpu ?? 0,
                        preferred_memory_gb: mappedCandidates[0]?.spec.memory_gb ?? 0,
                        workload: {
                            concurrent_users: mappedCandidates[0]?.sim_workload.concurrent_users ?? 0,
                        },
                    });
                    const data = await fetchSuggestionsFromRun(
                        firebaseUid,
                        resolvedProjectId,
                        runIdFromQuery,
                        sim,
                        mappedCandidates,
                    );
                    setSuggestionData(data);
                    setLoading(false);
                    return;
                }

                // Flow 2: runId + candidates in URL (existing flow with design from stored request)
                if (!runIdFromQuery || !candidatesParam) {
                    setDesign(DUMMY_DESIGN);
                    setSimulation(DUMMY_SIMULATION);
                    setSuggestionData(DUMMY_SUGGESTION_RESPONSE);
                    setLoading(false);
                    return;
                }

                const decodedCandidates = JSON.parse(
                    decodeURIComponent(candidatesParam),
                ) as Candidate[];
                setCandidates(decodedCandidates);

                const stored = await fetchDesignByProjectRun(
                    firebaseUid,
                    resolvedProjectId,
                    runIdFromQuery,
                );

                const storedRequest = stored.request as {
                    design: DesignRequirements;
                    simulation?: SimulationRequirements;
                };

                const resolvedDesign = storedRequest.design;
                const resolvedSimulation =
                    storedRequest.simulation || { nodes: 0 };

                setDesign(resolvedDesign);
                setSimulation(resolvedSimulation);

                const data = await fetchSuggestions(
                    firebaseUid,
                    resolvedDesign,
                    resolvedSimulation,
                    decodedCandidates,
                    resolvedProjectId,
                    runIdFromQuery,
                );
                setSuggestionData(data);
            } catch (err) {
                console.error('Error fetching suggestions:', err);
                setError(err instanceof Error ? err.message : 'An error occurred');
                setDesign(DUMMY_DESIGN);
                setSimulation(DUMMY_SIMULATION);
                setSuggestionData(DUMMY_SUGGESTION_RESPONSE);
            } finally {
                setLoading(false);
            }
        };

        loadSuggestions();
    }, [firebaseUid, searchParams]);

    const formatPercentage = (value: number) => {
        return `${value.toFixed(1)}%`;
    };

    const getWorkloadPerformanceColor = (distance: number, target: number) => {
        const percentage = (distance / target) * 100;
        if (percentage <= 5) return 'text-green-500';
        if (percentage <= 20) return 'text-yellow-500';
        return 'text-red-500';
    };

    const handleViewCostAnalysis = () => {
        if (suggestionData?.storage_id) {
            const path = projectId ? `/project/${projectId}/cost/${suggestionData.storage_id}` : `/cost/${suggestionData.storage_id}`;
            router.push(path);
        }
    };

    if (loading || !design || !simulation) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="text-xl opacity-70">Analyzing infrastructure candidates...</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <div className="p-6 space-y-4">
                {/* Header */}
                {/* <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Metrices Analysis</h1>
                    </div>
                    {suggestionData && (
                        <button
                            onClick={handleViewCostAnalysis}
                            className="rounded-xl border border-border px-4 py-2 font-medium hover:bg-surface transition-colors"
                        >
                            View Cost Analysis
                        </button>
                    )}
                </div> */}
                <div
                    className=" flex items-center justify-between"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                >
                    <div className='px-4 py-2.5 flex items-center justify-start gap-3 flex-wrap'>
                        <button
                            onClick={() => router.back()}
                            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
                            aria-label="Go back"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>

                        <div>
                            <h1 className="text-md font-bold text-white flex items-center gap-2">
                                Metrices Analysis
                            </h1>
                        </div>
                    </div>
                    <div>
                        {suggestionData && (
                            <button
                                onClick={handleViewCostAnalysis}
                                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
                            >
                                View Cost Analysis
                            </button>
                        )}
                    </div>
                </div>

                {/* Requirements Summary */}
                {design && simulation && (
                    <div className="bg-card border border-border rounded-lg p-6 mb-8">
                        <h2 className="text-xl font-semibold mb-4">Design Requirements</h2>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="bg-card border border-border p-4 rounded-lg">
                                <p className="text-sm opacity-60">User (Firebase)</p>
                                {user ? (
                                    <>
                                        <p className="text-sm font-medium">
                                            {user.displayName || user.email || "Unnamed user"}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm opacity-70">Not signed in</p>
                                )}
                            </div>
                            <div className="bg-card border border-border p-4 rounded-lg">
                                <p className="text-sm opacity-60">Preferred vCPU</p>
                                <p className="text-lg font-semibold">{design.preferred_vcpu}</p>
                            </div>
                            <div className="bg-card border border-border p-4 rounded-lg">
                                <p className="text-sm opacity-60">Preferred Memory</p>
                                <p className="text-lg font-semibold">{design.preferred_memory_gb} GB</p>
                            </div>
                            <div className="bg-card border border-border p-4 rounded-lg">
                                <p className="text-sm opacity-60">Target Users</p>
                                <p className="text-lg font-semibold">{design.workload.concurrent_users} users</p>
                            </div>
                            <div className="bg-card border border-border p-4 rounded-lg">
                                <p className="text-sm opacity-60">Cluster Nodes</p>
                                <p className="text-lg font-semibold">{simulation.nodes} nodes</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Results Display */}
                {suggestionData && (
                    <div className="space-y-6">
                        {/* Best Candidate */}
                        <div className="bg-card border border-border rounded-lg p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold">Best Candidate</h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Candidate Details */}
                                <div className="lg:col-span-2">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                        <div className="bg-card border border-border p-4 rounded-lg">
                                            <p className="text-sm opacity-60">Candidate</p>
                                            <p className="text-xl font-bold">
                                                {suggestionData.best.candidate.spec.label} ({suggestionData.best.candidate.id})
                                            </p>
                                        </div>
                                        <div className="bg-card border border-border p-4 rounded-lg">
                                            <p className="text-sm opacity-60">Specification</p>
                                            <p className="text-xl font-bold">
                                                {suggestionData.best.candidate.spec.vcpu} vCPU / {suggestionData.best.candidate.spec.memory_gb} GB
                                            </p>
                                        </div>
                                        <div className="bg-card border border-border p-4 rounded-lg">
                                            <p className="text-sm opacity-60">Workload Performance</p>
                                            <p className="text-xl font-bold">
                                                {suggestionData.best.candidate.sim_workload.concurrent_users} users
                                            </p>
                                        </div>
                                        <div className="bg-card border border-border p-4 rounded-lg">
                                            <p className="text-sm opacity-60">Cluster Size</p>
                                            <p className="text-xl font-bold">
                                                {simulation.nodes} nodes
                                            </p>
                                        </div>
                                    </div>

                                    {/* Performance Metrics */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                        <div className="bg-card border border-border p-4 rounded-lg">
                                            <p className="text-sm opacity-60 mb-2">CPU Utilization</p>
                                            <div className="flex items-center">
                                                <div className="flex-1">
                                                    <div className="w-full bg-card rounded-full h-2.5">
                                                        <div
                                                            className="bg-white h-2.5 rounded-full"
                                                            style={{ width: `${suggestionData.best.candidate.metrics.cpu_util_pct}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                                <span className="ml-3 text-lg font-semibold">
                                                    {formatPercentage(suggestionData.best.candidate.metrics.cpu_util_pct)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="bg-card border border-border p-4 rounded-lg">
                                            <p className="text-sm opacity-60 mb-2">Memory Utilization</p>
                                            <div className="flex items-center">
                                                <div className="flex-1">
                                                    <div className="w-full bg-card rounded-full h-2.5">
                                                        <div
                                                            className="bg-white h-2.5 rounded-full"
                                                            style={{ width: `${suggestionData.best.candidate.metrics.mem_util_pct}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                                <span className="ml-3 text-lg font-semibold">
                                                    {formatPercentage(suggestionData.best.candidate.metrics.mem_util_pct)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Suggestions */}
                                    <div>
                                        <h4 className="font-medium mb-3">Recommendations</h4>
                                        <ul className="space-y-2">
                                            {suggestionData.best.suggestions.map((suggestion, index) => (
                                                <li key={index} className="flex items-start">
                                                    <span className="opacity-50 mr-2 mt-1">•</span>
                                                    <span className="opacity-80">{suggestion}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* Performance Summary */}
                                <div className="lg:col-span-1">
                                    <div className="bg-card border border-border rounded-lg p-4">
                                        <h4 className="font-medium mb-4">Performance Summary</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-sm opacity-60">Target Users</p>
                                                <p className="text-lg font-semibold">
                                                    {design.workload.concurrent_users} users
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm opacity-60">Achieved Users</p>
                                                <p className="text-lg font-semibold">
                                                    {suggestionData.best.candidate.sim_workload.concurrent_users} users
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm opacity-60">Shortfall</p>
                                                <p className={`text-lg font-semibold ${getWorkloadPerformanceColor(suggestionData.best.workload_distance, design.workload.concurrent_users)}`}>
                                                    {suggestionData.best.workload_distance} users
                                                </p>
                                                <p className="text-xs opacity-50 mt-1">
                                                    ({((suggestionData.best.workload_distance / design.workload.concurrent_users) * 100).toFixed(1)}% of target)
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* All Candidates Comparison */}
                        <div className="bg-card border border-border rounded-lg p-6">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-semibold">All Candidates Comparison</h3>
                                    <div className="flex items-center gap-4 mt-1">
                                        <p className="opacity-60">
                                            Storage ID: <span className="font-mono opacity-80">{suggestionData.storage_id}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-border">
                                    <thead>
                                        <tr className="bg-card border-b border-border">
                                            <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                                                Rank
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                                                Candidate
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                                                Specification
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                                                Utilization
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                                                Shortfall
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {suggestionData.all_scores.map((score, index) => (
                                            <tr key={score.candidate.id} className="hover:bg-surface transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center">
                                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${index === 0 ? 'bg-card text-white' : 'bg-card opacity-80 border border-border'
                                                            }`}>
                                                            {index + 1}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="font-medium">
                                                            {score.candidate.spec.label} ({score.candidate.id})
                                                        </p>
                                                        <p className="text-sm opacity-50">{score.candidate.source}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Cpu className="w-4 h-4 opacity-60" />
                                                        <p className="opacity-80">
                                                            {score.candidate.spec.vcpu} vCPU
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <MemoryStick className="w-4 h-4 opacity-60" />
                                                        <p className="text-sm opacity-50">
                                                            {score.candidate.spec.memory_gb} GB RAM
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
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
                                                <td className="px-4 py-3">
                                                    <p className={`font-medium ${getWorkloadPerformanceColor(score.workload_distance, design.workload.concurrent_users)
                                                        }`}>
                                                        {score.workload_distance} users
                                                    </p>
                                                    <p className="text-xs opacity-50">
                                                        {((score.workload_distance / design.workload.concurrent_users) * 100).toFixed(1)}% of target
                                                    </p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Detailed Suggestions */}
                            <div className="mt-6">
                                <details className="group">
                                    <summary className="cursor-pointer opacity-80 font-medium hover:text-white transition-colors flex items-center">
                                        <ChevronDown className="w-4 h-4 mr-2 group-open:rotate-180 transition-transform" />
                                        View Detailed Recommendations for All Candidates
                                    </summary>
                                    <div className="mt-4 space-y-4">
                                        {suggestionData.all_scores.map((score, index) => (
                                            <div key={score.candidate.id} className="border border-border rounded-lg p-4 bg-card">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="font-medium">
                                                        {index + 1}. {score.candidate.spec.label} ({score.candidate.id})
                                                    </h4>
                                                    <span className={`px-2 py-1 text-xs rounded-full border ${score.passed_all_required
                                                        ? 'bg-card text-green-400 border-border'
                                                        : 'bg-card text-yellow-400 border-border'
                                                        }`}>
                                                        Shortfall: {score.workload_distance} users
                                                    </span>
                                                </div>
                                                <ul className="space-y-2">
                                                    {score.suggestions.map((suggestion, sIndex) => (
                                                        <li key={sIndex} className="flex items-start">
                                                            <span className="opacity-50 mr-2 mt-1">•</span>
                                                            <span className="opacity-60">{suggestion}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-card border border-red-600 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-red-500">Note: {error}</p>
                                        <p className="text-red-600 text-sm mt-1">Showing demo data instead.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}