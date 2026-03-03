"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchSuggestions, fetchDesignByProjectRun } from '@/app/api/asm/routes';
import { Cpu, MemoryStick, AlertCircle, ChevronDown } from 'lucide-react';
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

export default function SuggestPage() {
    const [loading, setLoading] = useState(false);
    const [suggestionData, setSuggestionData] = useState<SuggestionResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [design, setDesign] = useState<DesignRequirements | null>(null);
    const [simulation, setSimulation] = useState<SimulationRequirements | null>(null);
    const [, setCandidates] = useState<Candidate[]>([]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, userId: firebaseUid } = useAuth();

    const hasFetchedRef = useRef(false);

    useEffect(() => {
        if (!firebaseUid) return;
        if (hasFetchedRef.current) return;
        hasFetchedRef.current = true;

        const loadSuggestions = async () => {
            setLoading(true);
            setError(null);

            try {
                const projectId = searchParams.get('projectId') || '';
                const runId = searchParams.get('runId') || '';
                const candidatesParam = searchParams.get('candidates');

                if (!projectId || !runId || !candidatesParam) {
                    throw new Error('Missing projectId, runId, or candidates in URL');
                }

                const decodedCandidates = JSON.parse(
                    decodeURIComponent(candidatesParam),
                ) as Candidate[];
                setCandidates(decodedCandidates);

                const stored = await fetchDesignByProjectRun(
                    firebaseUid,
                    projectId,
                    runId,
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
                    projectId,
                    runId,
                );
                setSuggestionData(data);
            } catch (err) {
                console.error('Error fetching suggestions:', err);
                setError(err instanceof Error ? err.message : 'An error occurred');
                setSuggestionData(null);
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
            router.push(`/cost/${suggestionData.storage_id}`);
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
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Metrices Analysis</h1>
                        {user && (
                            <p className="text-sm opacity-60 mt-1">
                                Signed in as{" "}
                                <span className="font-medium">
                                    {user.displayName || user.email || "Unnamed user"}
                                </span>
                            </p>
                        )}
                    </div>
                    {suggestionData && (
                        <button
                            onClick={handleViewCostAnalysis}
                            className="rounded-xl border border-border px-4 py-2 font-medium hover:bg-surface transition-colors"
                        >
                            View Cost Analysis
                        </button>
                    )}
                </div>

                {/* Requirements Summary */}
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
                                            <div>
                                                <p className="text-sm opacity-60">Source</p>
                                                <p className="text-sm font-medium opacity-80">
                                                    {suggestionData.best.candidate.source}
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
                                                Performance
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
                                                    <p className="opacity-80 font-medium">
                                                        {score.candidate.sim_workload.concurrent_users} users
                                                    </p>
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
                                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
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