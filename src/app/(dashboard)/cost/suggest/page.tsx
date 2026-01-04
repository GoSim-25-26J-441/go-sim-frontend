"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchSuggestions } from '@/app/api/asm/routes';
import { BarChart3, Cpu, MemoryStick, AlertCircle, ChevronDown } from 'lucide-react';

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
    const router = useRouter();

    const userId = 'user-100';
    const design: DesignRequirements = {
        preferred_vcpu: 8,
        preferred_memory_gb: 16,
        workload: { concurrent_users: 2000 },
        budget: 2000
    };
    const simulation: SimulationRequirements = {
        nodes: 5
    };

    const candidates: Candidate[] = [
        {
            id: "c1",
            spec: { vcpu: 8, memory_gb: 16, label: "a" },
            metrics: { cpu_util_pct: 72, mem_util_pct: 61 },
            sim_workload: { concurrent_users: 1400 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "c2",
            spec: { vcpu: 6, memory_gb: 8, label: "b" },
            metrics: { cpu_util_pct: 65, mem_util_pct: 55 },
            sim_workload: { concurrent_users: 1300 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "c3",
            spec: { vcpu: 5, memory_gb: 8, label: "c" },
            metrics: { cpu_util_pct: 80, mem_util_pct: 75 },
            sim_workload: { concurrent_users: 1800 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "c4",
            spec: { vcpu: 10, memory_gb: 32, label: "d" },
            metrics: { cpu_util_pct: 40, mem_util_pct: 50 },
            sim_workload: { concurrent_users: 1500 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "c5",
            spec: { vcpu: 8, memory_gb: 16, label: "e" },
            metrics: { cpu_util_pct: 72, mem_util_pct: 61 },
            sim_workload: { concurrent_users: 1400 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "m1",
            spec: { vcpu: 4, memory_gb: 16, label: "m1" },
            metrics: { cpu_util_pct: 78, mem_util_pct: 70 },
            sim_workload: { concurrent_users: 1150 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "m2",
            spec: { vcpu: 6, memory_gb: 8, label: "m2" },
            metrics: { cpu_util_pct: 85, mem_util_pct: 80 },
            sim_workload: { concurrent_users: 1400 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "m3",
            spec: { vcpu: 40, memory_gb: 8, label: "m3" },
            metrics: { cpu_util_pct: 100, mem_util_pct: 60 },
            sim_workload: { concurrent_users: 1200 },
            source: "sim-run-2025-10-27"
        },
        {
            id: "m4",
            spec: { vcpu: 4, memory_gb: 8, label: "m4" },
            metrics: { cpu_util_pct: 60, mem_util_pct: 50 },
            sim_workload: { concurrent_users: 1900 },
            source: "sim-run-2025-10-27"
        }
    ];

    useEffect(() => {
        const loadSuggestions = async () => {
            setLoading(true);
            setError(null);

            try {
                const data = await fetchSuggestions(userId, design, simulation, candidates);
                setSuggestionData(data);
            } catch (err) {
                console.error('Error fetching suggestions:', err);
                setError(err instanceof Error ? err.message : 'An error occurred');
                setSuggestionData({
                    best: {
                        candidate: candidates.find(c => c.id === "m4")!,
                        passed_all_required: false,
                        workload_distance: 100,
                        suggestions: [
                            "Decrease vCPU from 8 to 4",
                            "Decrease memory from 16 GB to 8 GB"
                        ]
                    },
                    all_scores: candidates.map(candidate => ({
                        candidate,
                        passed_all_required: false,
                        workload_distance: Math.abs(design.workload.concurrent_users - candidate.sim_workload.concurrent_users),
                        suggestions: [
                            `Keep vCPU at ${candidate.spec.vcpu}`,
                            `Keep memory at ${candidate.spec.memory_gb} GB`,
                            `Shortfall of ${Math.abs(design.workload.concurrent_users - candidate.sim_workload.concurrent_users)} users`
                        ]
                    })).sort((a, b) => a.workload_distance - b.workload_distance),
                    storage_id: "demo-" + Date.now().toString()
                });
            } finally {
                setLoading(false);
            }
        };

        loadSuggestions();
    }, []);

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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-black text-white">
                <div className="text-xl text-gray-300">Analyzing infrastructure candidates...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black p-6 text-white">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">Metrices Analysis</h1>
                    {suggestionData && (
                        <button
                            onClick={handleViewCostAnalysis}
                            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium border border-gray-700"
                        >
                            View Cost Analysis
                        </button>
                    )}
                </div>

                {/* Requirements Summary */}
                <div className="bg-black border border-gray-800 rounded-lg p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Design Requirements</h2>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">User ID</p>
                            <p className="text-lg font-semibold">{userId}</p>
                        </div>
                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Preferred vCPU</p>
                            <p className="text-lg font-semibold">{design.preferred_vcpu}</p>
                        </div>
                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Preferred Memory</p>
                            <p className="text-lg font-semibold">{design.preferred_memory_gb} GB</p>
                        </div>
                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Target Users</p>
                            <p className="text-lg font-semibold">{design.workload.concurrent_users} users</p>
                        </div>
                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Cluster Nodes</p>
                            <p className="text-lg font-semibold">{simulation.nodes} nodes</p>
                        </div>
                    </div>
                </div>

                {/* Results Display */}
                {suggestionData && (
                    <div className="space-y-6">
                        {/* Best Candidate */}
                        <div className="bg-black border border-gray-800 rounded-lg p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold">Best Candidate</h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Candidate Details */}
                                <div className="lg:col-span-2">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                                            <p className="text-sm text-gray-500">Candidate</p>
                                            <p className="text-xl font-bold">
                                                {suggestionData.best.candidate.spec.label} ({suggestionData.best.candidate.id})
                                            </p>
                                        </div>
                                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                                            <p className="text-sm text-gray-500">Specification</p>
                                            <p className="text-xl font-bold">
                                                {suggestionData.best.candidate.spec.vcpu} vCPU / {suggestionData.best.candidate.spec.memory_gb} GB
                                            </p>
                                        </div>
                                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                                            <p className="text-sm text-gray-500">Workload Performance</p>
                                            <p className="text-xl font-bold">
                                                {suggestionData.best.candidate.sim_workload.concurrent_users} users
                                            </p>
                                        </div>
                                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                                            <p className="text-sm text-gray-500">Cluster Size</p>
                                            <p className="text-xl font-bold">
                                                {simulation.nodes} nodes
                                            </p>
                                        </div>
                                    </div>

                                    {/* Performance Metrics */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                                            <p className="text-sm text-gray-500 mb-2">CPU Utilization</p>
                                            <div className="flex items-center">
                                                <div className="flex-1">
                                                    <div className="w-full bg-gray-900 rounded-full h-2.5">
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
                                        <div className="bg-black border border-gray-800 p-4 rounded-lg">
                                            <p className="text-sm text-gray-500 mb-2">Memory Utilization</p>
                                            <div className="flex items-center">
                                                <div className="flex-1">
                                                    <div className="w-full bg-gray-900 rounded-full h-2.5">
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
                                                    <span className="text-gray-600 mr-2 mt-1">•</span>
                                                    <span className="text-gray-400">{suggestion}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* Performance Summary */}
                                <div className="lg:col-span-1">
                                    <div className="bg-black border border-gray-800 rounded-lg p-4">
                                        <h4 className="font-medium mb-4">Performance Summary</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Target Users</p>
                                                <p className="text-lg font-semibold">
                                                    {design.workload.concurrent_users} users
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Achieved Users</p>
                                                <p className="text-lg font-semibold">
                                                    {suggestionData.best.candidate.sim_workload.concurrent_users} users
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Shortfall</p>
                                                <p className={`text-lg font-semibold ${getWorkloadPerformanceColor(suggestionData.best.workload_distance, design.workload.concurrent_users)}`}>
                                                    {suggestionData.best.workload_distance} users
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    ({((suggestionData.best.workload_distance / design.workload.concurrent_users) * 100).toFixed(1)}% of target)
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Source</p>
                                                <p className="text-sm font-medium text-gray-400">
                                                    {suggestionData.best.candidate.source}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* All Candidates Comparison */}
                        <div className="bg-black border border-gray-800 rounded-lg p-6">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-semibold">All Candidates Comparison</h3>
                                    <div className="flex items-center gap-4 mt-1">
                                        <p className="text-gray-500">
                                            Storage ID: <span className="font-mono text-gray-400">{suggestionData.storage_id}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-800">
                                    <thead>
                                        <tr className="bg-black border-b border-gray-800">
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Rank
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Candidate
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Specification
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Utilization
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Performance
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Shortfall
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {suggestionData.all_scores.map((score, index) => (
                                            <tr key={score.candidate.id} className="hover:bg-black transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center">
                                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${index === 0 ? 'bg-gray-800 text-white' : 'bg-black text-gray-400 border border-gray-800'
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
                                                        <p className="text-sm text-gray-600">{score.candidate.source}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Cpu className="w-4 h-4 text-gray-500" />
                                                        <p className="text-gray-400">
                                                            {score.candidate.spec.vcpu} vCPU
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <MemoryStick className="w-4 h-4 text-gray-500" />
                                                        <p className="text-sm text-gray-600">
                                                            {score.candidate.spec.memory_gb} GB RAM
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center">
                                                            <span className="text-xs text-gray-600 w-8">CPU:</span>
                                                            <span className={`text-sm font-medium ${score.candidate.metrics.cpu_util_pct > 80 ? 'text-red-500' :
                                                                score.candidate.metrics.cpu_util_pct > 60 ? 'text-yellow-500' : 'text-green-500'
                                                                }`}>
                                                                {formatPercentage(score.candidate.metrics.cpu_util_pct)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center">
                                                            <span className="text-xs text-gray-600 w-8">MEM:</span>
                                                            <span className={`text-sm font-medium ${score.candidate.metrics.mem_util_pct > 80 ? 'text-red-500' :
                                                                score.candidate.metrics.mem_util_pct > 60 ? 'text-yellow-500' : 'text-green-500'
                                                                }`}>
                                                                {formatPercentage(score.candidate.metrics.mem_util_pct)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-gray-400 font-medium">
                                                        {score.candidate.sim_workload.concurrent_users} users
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className={`font-medium ${getWorkloadPerformanceColor(score.workload_distance, design.workload.concurrent_users)
                                                        }`}>
                                                        {score.workload_distance} users
                                                    </p>
                                                    <p className="text-xs text-gray-600">
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
                                    <summary className="cursor-pointer text-gray-400 font-medium hover:text-white transition-colors flex items-center">
                                        <ChevronDown className="w-4 h-4 mr-2 group-open:rotate-180 transition-transform" />
                                        View Detailed Recommendations for All Candidates
                                    </summary>
                                    <div className="mt-4 space-y-4">
                                        {suggestionData.all_scores.map((score, index) => (
                                            <div key={score.candidate.id} className="border border-gray-800 rounded-lg p-4 bg-black">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="font-medium">
                                                        {index + 1}. {score.candidate.spec.label} ({score.candidate.id})
                                                    </h4>
                                                    <span className={`px-2 py-1 text-xs rounded-full border ${score.passed_all_required
                                                        ? 'bg-gray-900 text-green-400 border-gray-800'
                                                        : 'bg-gray-900 text-yellow-400 border-gray-800'
                                                        }`}>
                                                        Shortfall: {score.workload_distance} users
                                                    </span>
                                                </div>
                                                <ul className="space-y-2">
                                                    {score.suggestions.map((suggestion, sIndex) => (
                                                        <li key={sIndex} className="flex items-start">
                                                            <span className="text-gray-700 mr-2 mt-1">•</span>
                                                            <span className="text-gray-500">{suggestion}</span>
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
                            <div className="bg-black border border-red-600 rounded-lg p-4">
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