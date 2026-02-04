"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCostData, fetchRegions } from "@/app/api/asm/routes";
import {
    ChevronLeft,
    RefreshCw,
    ChevronDown,
    Building,
    MapPin,
    Users,
    Server,
    AlertCircle,
    CheckCircle,
    XCircle,
    Calculator,
    PieChart,
    Target,
    BarChart3,
    Info,
    Clock,
    TrendingUp,
    Calendar,
    X,
    GitCompare
} from "lucide-react";
import { getRegionDisplayName } from "@/utils/regionFormatter";
import { GENERIC_REGIONS, getGenericRegionById } from "@/utils/genericRegions";

interface ClusterCostResult {
    provider: string;
    purchase_type: string;
    lease_contract_length: string;
    instance_type: string;
    region: string;
    nodes: number;
    price_per_node_hour: number;
    price_per_node_month: number;
    control_plane_tier: string;
    control_plane_hour: number;
    control_plane_month: number;
    total_hour: number;
    total_month: number;
    budget_month: number;
    within_budget: boolean;
}

interface CostData {
    request_id: string;
    best_candidate: any;
    nodes: number;
    budget: number;
    cluster_costs: Record<string, ClusterCostResult[]>;
    stored_at: string;
}

const MAX_REGIONS = 5;

const DEFAULT_REGIONS: Record<string, string> = {
    aws: "argentinabuenosaires",
    azure: "attdallas1",
    gcp: "us-central1",
};

type ViewMode = "by-provider" | "by-region";

const DEFAULT_GENERIC_REGION_ID = GENERIC_REGIONS[0]?.id ?? "us-east";

export default function CostPage2() {
    const [costData, setCostData] = useState<CostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("by-provider");
    const [selectedProvider, setSelectedProvider] = useState<"aws" | "azure" | "gcp">("aws");
    const [regions, setRegions] = useState<string[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedGenericRegionId, setSelectedGenericRegionId] = useState<string>(DEFAULT_GENERIC_REGION_ID);
    const [compareRegionsEnabled, setCompareRegionsEnabled] = useState(false);
    const [reloadingProviderCost, setReloadingProviderCost] = useState(false);
    const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);

    const params = useParams();
    const router = useRouter();

    const requestId = params.id as string;

    console.log("Request ID from route params:", requestId);

    const handleFetchCostData = async (provider?: string, region?: string) => {
        try {
            if (!requestId) {
                throw new Error("No request ID found");
            }

            setReloadingProviderCost(true);
            const json = await fetchCostData(requestId, provider, region);
            setCostData(json);
        } catch (e: any) {
            setError(e.message);
            console.error("Error fetching cost data:", e);
        } finally {
            setReloadingProviderCost(false);
            setLoading(false);
        }
    };

    const handleFetchRegions = async (provider: string) => {
        try {
            const regionsData = await fetchRegions(provider);
            setRegions(regionsData);
        } catch (e: any) {
            console.error("Error fetching regions:", e);
            setRegions([]);
        }
    };

    const fetchAndMergeRegions = async (regionsToFetch: string[]) => {
        if (!requestId || regionsToFetch.length === 0) return;
        setReloadingProviderCost(true);
        try {
            const responses = await Promise.all(
                regionsToFetch.map((region) => fetchCostData(requestId, selectedProvider, region))
            );
            const merged: CostData = {
                ...responses[0],
                cluster_costs: {
                    ...responses[0].cluster_costs,
                    [selectedProvider]: responses.flatMap((r) => r.cluster_costs?.[selectedProvider] ?? []),
                },
            };
            setCostData(merged);
        } catch (e: any) {
            setError(e.message);
            console.error("Error fetching cost data:", e);
        } finally {
            setReloadingProviderCost(false);
            setLoading(false);
        }
    };

    const handleFetchCostForGenericRegion = async (genericRegionId: string) => {
        const genericRegion = getGenericRegionById(genericRegionId);
        if (!requestId || !genericRegion) return;
        setReloadingProviderCost(true);
        try {
            const [awsRes, azureRes] = await Promise.all([
                fetchCostData(requestId, "aws", genericRegion.aws),
                fetchCostData(requestId, "azure", genericRegion.azure),
            ]);
            const merged: CostData = {
                ...awsRes,
                cluster_costs: {
                    aws: awsRes.cluster_costs?.aws ?? [],
                    azure: azureRes.cluster_costs?.azure ?? [],
                },
            };
            setCostData(merged);
        } catch (e: any) {
            setError(e.message);
            console.error("Error fetching cost data for generic region:", e);
        } finally {
            setReloadingProviderCost(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!requestId) {
            setError("No request ID provided");
            setLoading(false);
            return;
        }
        if (viewMode === "by-region") {
            handleFetchCostForGenericRegion(selectedGenericRegionId);
        } else {
            const defaultRegion = DEFAULT_REGIONS[selectedProvider] ?? regions[0] ?? "";
            setSelectedRegions([defaultRegion]);
            handleFetchRegions(selectedProvider);
            handleFetchCostData(selectedProvider, defaultRegion);
        }
    }, [requestId]);

    useEffect(() => {
        if (requestId && viewMode === "by-provider") {
            handleFetchRegions(selectedProvider);
            const defaultRegion = DEFAULT_REGIONS[selectedProvider] ?? "";
            setSelectedRegions([defaultRegion]);
            handleFetchCostData(selectedProvider, defaultRegion);
        }
    }, [selectedProvider, requestId, viewMode]);

    useEffect(() => {
        if (requestId && viewMode === "by-region") {
            handleFetchCostForGenericRegion(selectedGenericRegionId);
        }
    }, [requestId, viewMode, selectedGenericRegionId]);

    const addRegion = async (region: string) => {
        if (selectedRegions.includes(region) || selectedRegions.length >= MAX_REGIONS) return;
        const next = [...selectedRegions, region];
        setSelectedRegions(next);
        if (next.length === 1) {
            await handleFetchCostData(selectedProvider, region);
        } else {
            await fetchAndMergeRegions(next);
        }
    };

    const removeRegion = (region: string) => {
        const next = selectedRegions.filter((r) => r !== region);
        setSelectedRegions(next);
        if (next.length === 0) return;
        if (next.length === 1) {
            handleFetchCostData(selectedProvider, next[0]);
        } else {
            if (!costData) return;
            const providerCosts = costData.cluster_costs?.[selectedProvider] ?? [];
            const filtered = providerCosts.filter((c) => next.includes(c.region));
            setCostData({
                ...costData,
                cluster_costs: {
                    ...costData.cluster_costs,
                    [selectedProvider]: filtered,
                },
            });
        }
    };

    const formatCurrency = (v: number) =>
        new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(v);

    const getCurrentProviderCosts = () => {
        if (!costData) return [];
        const providerCosts = costData.cluster_costs?.[selectedProvider] || [];
        if (selectedRegions.length === 0) return providerCosts;
        if (!compareRegionsEnabled) {
            return providerCosts.filter((c) => c.region === selectedRegions[0]);
        }
        return providerCosts.filter((c) => selectedRegions.includes(c.region));
    };

    const toggleBreakdown = (planId: string) => {
        setExpandedBreakdown(expandedBreakdown === planId ? null : planId);
    };

    const handleBackClick = () => {
        router.push('/cost');
    };

    const identifyBestOptions = (costs: ClusterCostResult[]) => {
        if (costs.length === 0) return { best: null, minimal: null };

        const withinBudget = costs.filter(c => c.within_budget);
        const best = withinBudget.length > 0
            ? withinBudget.reduce((prev, current) =>
                (prev.total_month < current.total_month) ? prev : current
            )
            : null;

        const minimal = costs.reduce((prev, current) =>
            (prev.total_month < current.total_month) ? prev : current
        );

        return { best, minimal };
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-border mx-auto mb-4"></div>
                    <p className="text-lg opacity-70">Loading cluster costs...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-card border border-border rounded-lg p-6">
                        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                        <h1 className="text-2xl font-bold text-red-500 mb-2">Error</h1>
                        <p className="opacity-80">{error}</p>
                        <p className="text-sm opacity-60 mt-4">Request ID: {requestId}</p>
                        <button
                            onClick={handleBackClick}
                            className="mt-4 px-4 py-2 rounded-lg font-medium border border-border flex items-center gap-2 hover:bg-surface transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to Designs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!costData) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 opacity-70 mx-auto mb-4" />
                    <p className="text-lg mb-4 opacity-80">No data available for this request</p>
                    <button
                        onClick={handleBackClick}
                        className="px-4 py-2 rounded-lg font-medium border border-border flex items-center gap-2 hover:bg-surface transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Designs
                    </button>
                </div>
            </div>
        );
    }

    const currentCosts = getCurrentProviderCosts();
    const { best, minimal } = identifyBestOptions(currentCosts);

    const costsByRegionAWS = viewMode === "by-region" ? (costData?.cluster_costs?.aws ?? []) : [];
    const costsByRegionAzure = viewMode === "by-region" ? (costData?.cluster_costs?.azure ?? []) : [];
    const genericRegion = viewMode === "by-region" ? getGenericRegionById(selectedGenericRegionId) : null;
    const { best: bestAWS, minimal: minimalAWS } = identifyBestOptions(costsByRegionAWS);
    const { best: bestAzure, minimal: minimalAzure } = identifyBestOptions(costsByRegionAzure);

    return (
        <div className="p-6 space-y-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleBackClick}
                            className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-4xl font-bold">Cluster Cost Analysis</h1>
                    </div>
                    <Link
                        href={`/cost/suggest/${requestId}`}
                        className="rounded-xl border border-border px-4 py-2 font-medium flex items-center gap-2 hover:bg-surface transition-colors"
                    >
                        <BarChart3 className="w-5 h-5" />
                        View Metrices Analysis
                    </Link>
                </div>

                {/* Summary */}
                <div className="mb-8">
                    <p className="opacity-60 mb-6 text-sm">Detailed cost breakdown for each pricing option</p>
                </div>

                {/* Provider & Region Selection */}
                <div className="bg-card border border-border rounded-lg p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Cloud Provider & Region</h2>

                    <div className="mb-6">
                        <div className="border-b border-border">
                            <nav className="flex gap-6" role="tablist" aria-label="View mode">
                                <button
                                    type="button"
                                    role="tab"
                                    onClick={() => setViewMode("by-provider")}
                                    aria-selected={viewMode === "by-provider"}
                                    className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors -mb-px ${viewMode === "by-provider"
                                        ? "border-white text-white"
                                        : "border-transparent opacity-60 hover:opacity-100"
                                        }`}
                                >
                                    By provider
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    onClick={() => setViewMode("by-region")}
                                    aria-selected={viewMode === "by-region"}
                                    className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors -mb-px ${viewMode === "by-region"
                                        ? "border-white text-white"
                                        : "border-transparent opacity-60 hover:opacity-100"
                                        }`}
                                >
                                    By region (AWS & Azure)
                                </button>
                            </nav>
                        </div>
                        <p className="text-xs opacity-50 mt-3">
                            {viewMode === "by-region"
                                ? "Select a region to see costs for both AWS and Azure in that area."
                                : "Select a provider, then region(s) to compare."}
                        </p>
                    </div>

                    {viewMode === "by-region" ? (
                        <div>
                            <p className="text-sm opacity-60 mb-3">Select region:</p>
                            <div className="flex gap-3 items-center flex-wrap">
                                <select
                                    className="region-select bg-card text-white p-3 rounded-lg border border-border focus:border-white/30 focus:outline-none w-full max-w-md [color-scheme:dark]"
                                    value={selectedGenericRegionId}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) setSelectedGenericRegionId(v);
                                    }}
                                    disabled={reloadingProviderCost}
                                >
                                    {GENERIC_REGIONS.map((r) => (
                                        <option key={r.id} value={r.id} className="bg-[#1a1a1a] text-white">
                                            {r.displayName}
                                        </option>
                                    ))}
                                </select>
                                {reloadingProviderCost && (
                                    <span className="text-sm opacity-70 animate-pulse flex items-center gap-2">
                                        <RefreshCw className="w-3 h-3" />
                                        Updating…
                                    </span>
                                )}
                            </div>
                            <p className="text-xs opacity-50 mt-2">
                                Showing AWS and Azure pricing for the selected region.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6">
                                <p className="text-sm opacity-60 mb-3">Select Provider:</p>
                                <div className="flex flex-wrap gap-3">
                                    {(["aws", "azure"] as const).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setSelectedProvider(p)}
                                            className={`px-6 py-2 rounded-lg font-medium capitalize transition-all ${selectedProvider === p
                                                ? "bg-surface border border-border"
                                                : "border border-border hover:bg-surface opacity-80"
                                                }`}
                                        >
                                            {p.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={compareRegionsEnabled}
                                        onChange={(e) => setCompareRegionsEnabled(e.target.checked)}
                                        className="rounded border-border bg-card text-green-500 focus:ring-green-500"
                                    />
                                    <span className="text-sm font-medium">Compare multiple regions</span>
                                </label>
                                <p className="text-xs opacity-50 mt-1 ml-6">Enable to add and compare costs across up to {MAX_REGIONS} regions</p>
                            </div>

                            <div>
                                <p className="text-sm opacity-60 mb-3">
                                    {compareRegionsEnabled ? "Regions to compare:" : "Select region:"}
                                </p>
                                {compareRegionsEnabled ? (
                                    <div className="flex flex-wrap gap-2 items-center mb-3">
                                        {selectedRegions.map((r) => (
                                            <span
                                                key={r}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-sm"
                                            >
                                                <MapPin className="w-3.5 h-3.5 opacity-70" />
                                                {getRegionDisplayName(r, selectedProvider)}
                                                <button
                                                    type="button"
                                                    onClick={() => removeRegion(r)}
                                                    className="p-0.5 rounded hover:bg-surface opacity-70 hover:opacity-100 transition-opacity"
                                                    aria-label={`Remove ${getRegionDisplayName(r, selectedProvider)}`}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </span>
                                        ))}
                                        <select
                                            className="region-select bg-card text-white p-2.5 rounded-lg border border-border focus:border-white/30 focus:outline-none text-sm max-w-[220px] [color-scheme:dark]"
                                            value=""
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v) addRegion(v);
                                                e.target.value = "";
                                            }}
                                            disabled={regions.length === 0 || reloadingProviderCost || selectedRegions.length >= MAX_REGIONS}
                                            title={selectedRegions.length >= MAX_REGIONS ? `Maximum ${MAX_REGIONS} regions` : undefined}
                                        >
                                            <option value="">
                                                {selectedRegions.length >= MAX_REGIONS ? `Max ${MAX_REGIONS} regions` : "+ Add region"}
                                            </option>
                                            {regions
                                                .filter((r) => !selectedRegions.includes(r))
                                                .map((r) => (
                                                    <option key={r} value={r} className="bg-[#1a1a1a] text-white">
                                                        {getRegionDisplayName(r, selectedProvider)}
                                                    </option>
                                                ))}
                                        </select>
                                        {reloadingProviderCost && (
                                            <span className="text-sm opacity-70 animate-pulse flex items-center gap-2">
                                                <RefreshCw className="w-3 h-3" />
                                                Updating…
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-3 items-center">
                                        <select
                                            className="region-select bg-card text-white p-3 rounded-lg border border-border focus:border-white/30 focus:outline-none w-full max-w-md [color-scheme:dark]"
                                            value={selectedRegions[0] ?? ""}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v) {
                                                    setSelectedRegions([v]);
                                                    handleFetchCostData(selectedProvider, v);
                                                }
                                            }}
                                            disabled={regions.length === 0 || reloadingProviderCost}
                                        >
                                            {regions.map((r) => (
                                                <option key={r} value={r} className="bg-[#1a1a1a] text-white">
                                                    {getRegionDisplayName(r, selectedProvider)}
                                                </option>
                                            ))}
                                        </select>
                                        {reloadingProviderCost && (
                                            <span className="text-sm opacity-70 animate-pulse flex items-center gap-2">
                                                <RefreshCw className="w-3 h-3" />
                                                Updating…
                                            </span>
                                        )}
                                    </div>
                                )}
                                <p className="text-xs opacity-50 mt-2">
                                    {compareRegionsEnabled
                                        ? `Add multiple regions to compare pricing. Default: ${getRegionDisplayName(DEFAULT_REGIONS[selectedProvider] ?? "", selectedProvider)}`
                                        : `Default: ${getRegionDisplayName(DEFAULT_REGIONS[selectedProvider] ?? "", selectedProvider)}`}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Region comparison table (when enabled and 2+ regions) */}
                {viewMode === "by-provider" && compareRegionsEnabled && selectedRegions.length >= 2 && currentCosts.length > 0 && (
                    <div className="bg-card border border-border rounded-lg p-6 mb-8">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <GitCompare className="w-5 h-5" />
                            Region comparison
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-3 px-4 text-sm font-medium opacity-80">Plan</th>

                                        {selectedRegions.map((r) => (
                                            <th key={r} className="text-left py-3 px-4 text-sm font-medium opacity-80 whitespace-nowrap">
                                                {getRegionDisplayName(r, selectedProvider)}
                                            </th>
                                        ))}
                                        <th className="text-left py-3 px-4 text-sm font-medium opacity-80">Best</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const byPlan = new Map<string, ClusterCostResult[]>();
                                        currentCosts.forEach((c) => {
                                            const key = `${c.purchase_type}-${c.lease_contract_length || ""}`;
                                            if (!byPlan.has(key)) byPlan.set(key, []);
                                            byPlan.get(key)!.push(c);
                                        });
                                        return Array.from(byPlan.entries()).map(([planKey, costs]) => {
                                            const planLabel = costs[0].purchase_type + (costs[0].lease_contract_length ? ` (${costs[0].lease_contract_length})` : "");
                                            const byRegion = new Map(costs.map((c) => [c.region, c]));
                                            const monthlyValues = selectedRegions.map((r) => byRegion.get(r)?.total_month ?? null);
                                            const validValues = monthlyValues.filter((v): v is number => v != null);
                                            const minMonthly = validValues.length > 0 ? Math.min(...validValues) : 0;
                                            return (
                                                <tr key={planKey} className="border-b border-border hover:bg-surface/50 transition-colors">
                                                    <td className="py-3 px-4 font-medium">{planLabel}</td>
                                                    {selectedRegions.map((r) => {
                                                        const cost = byRegion.get(r);
                                                        const isMin = cost != null && validValues.length > 0 && cost.total_month === minMonthly;
                                                        return (
                                                            <td key={r} className="py-3 px-4 align-top">
                                                                {cost != null ? (
                                                                    <div className="space-y-1">
                                                                        <span className={isMin ? "font-bold text-green-400" : ""}>
                                                                            {formatCurrency(cost.total_month)}
                                                                        </span>
                                                                        <div className="text-xs opacity-60">
                                                                            {cost.instance_type}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="opacity-50">—</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="py-3 px-4 text-green-400 font-medium">
                                                        {validValues.length > 0 ? formatCurrency(minMonthly) : "—"}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {viewMode === "by-region" && genericRegion && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                            <MapPin className="w-6 h-6" />
                            Pricing by region — {genericRegion.displayName}
                        </h2>
                        <p className="text-sm opacity-60 mb-6">Costs for both AWS and Azure in this region</p>
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="bg-card border border-border rounded-lg p-6">
                                <h3 className="text-xl font-semibold mb-4">AWS — {getRegionDisplayName(genericRegion.aws, "aws")}</h3>
                                {costsByRegionAWS.length === 0 ? (
                                    <div className="text-center py-8 opacity-60">
                                        <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                        <p>No instances found for AWS in this region</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {costsByRegionAWS.map((cost, index) => {
                                            const isBest = bestAWS && cost.total_month === bestAWS.total_month;
                                            const isMinimal = minimalAWS && cost.total_month === minimalAWS.total_month;
                                            return (
                                                <div key={`aws-${index}`} className="border border-border rounded-lg p-4">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-medium">{cost.purchase_type} {cost.lease_contract_length && `(${cost.lease_contract_length})`}</span>
                                                        <span className={`text-sm font-bold ${cost.within_budget ? "text-green-400" : "text-red-400"}`}>
                                                            {cost.within_budget ? "Within Budget" : "Over Budget"}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm opacity-70 mb-2">{cost.instance_type}</div>
                                                    <div className="flex justify-between items-center text-lg font-bold">
                                                        <span>Monthly</span>
                                                        <span>{formatCurrency(cost.total_month)}</span>
                                                    </div>
                                                    {(isBest || isMinimal) && (
                                                        <span className="text-xs font-bold text-blue-400 mt-2 inline-block">
                                                            {isMinimal ? "MINIMAL COST" : "BEST IN BUDGET"}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="bg-card border border-border rounded-lg p-6">
                                <h3 className="text-xl font-semibold mb-4">Azure — {getRegionDisplayName(genericRegion.azure, "azure")}</h3>
                                {costsByRegionAzure.length === 0 ? (
                                    <div className="text-center py-8 opacity-60">
                                        <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                        <p>No instances found for Azure in this region</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {costsByRegionAzure.map((cost, index) => {
                                            const isBest = bestAzure && cost.total_month === bestAzure.total_month;
                                            const isMinimal = minimalAzure && cost.total_month === minimalAzure.total_month;
                                            return (
                                                <div key={`azure-${index}`} className="border border-border rounded-lg p-4">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-medium">{cost.purchase_type} {cost.lease_contract_length && `(${cost.lease_contract_length})`}</span>
                                                        <span className={`text-sm font-bold ${cost.within_budget ? "text-green-400" : "text-red-400"}`}>
                                                            {cost.within_budget ? "Within Budget" : "Over Budget"}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm opacity-70 mb-2">{cost.instance_type}</div>
                                                    <div className="flex justify-between items-center text-lg font-bold">
                                                        <span>Monthly</span>
                                                        <span>{formatCurrency(cost.total_month)}</span>
                                                    </div>
                                                    {(isBest || isMinimal) && (
                                                        <span className="text-xs font-bold text-blue-400 mt-2 inline-block">
                                                            {isMinimal ? "MINIMAL COST" : "BEST IN BUDGET"}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === "by-provider" && (!compareRegionsEnabled || selectedRegions.length < 2) && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">Pricing Options Breakdown</h2>
                            <div className="text-sm opacity-60">
                                Showing {currentCosts.length} pricing option{currentCosts.length !== 1 ? 's' : ''}
                                {compareRegionsEnabled && selectedRegions.length > 1 && (
                                    <span className="ml-2">
                                        across {selectedRegions.length} regions
                                    </span>
                                )}
                            </div>
                        </div>

                        {currentCosts.length === 0 ? (
                            <div className="text-center py-12 bg-card border border-border rounded-lg">
                                <Server className="w-12 h-12 opacity-50 mx-auto mb-4" />
                                <p className="opacity-60">No instances found for {selectedProvider.toUpperCase()}</p>
                                {selectedRegions.length > 0 && <p className="text-sm opacity-50 mt-2">in selected region(s)</p>}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {currentCosts.map((cost, index) => {
                                    const planId = `${cost.provider}-${cost.purchase_type}-${cost.lease_contract_length}-${index}`;
                                    const isExpanded = expandedBreakdown === planId;
                                    const isBest = best && cost.total_month === best.total_month;
                                    const isMinimal = minimal && cost.total_month === minimal.total_month;

                                    const totalNodeHourly = cost.price_per_node_hour * cost.nodes;
                                    const totalNodeMonthly = cost.price_per_node_month * cost.nodes;
                                    const monthlyBudgetExcess = cost.total_month - cost.budget_month;
                                    const budgetPercentage = (cost.total_month / cost.budget_month) * 100;

                                    return (
                                        <div
                                            key={planId}
                                            className={`border rounded-xl p-6 transition-all relative overflow-hidden ${cost.within_budget
                                                ? "bg-card border-border"
                                                : "bg-card border-border"
                                                }`}
                                        >
                                            {/* Left side accent */}
                                            {(isBest || isMinimal) && (
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-white`}></div>
                                            )}

                                            {/* Plan Header */}
                                            <div className="flex items-start justify-between mb-6">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="text-2xl font-bold">
                                                            {cost.purchase_type}
                                                            {cost.lease_contract_length && (
                                                                <span className="text-lg opacity-60 ml-2">
                                                                    ({cost.lease_contract_length})
                                                                </span>
                                                            )}
                                                        </h3>
                                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${cost.within_budget
                                                            ? "bg-card text-green-400 border border-border"
                                                            : "bg-card text-red-400 border border-border"
                                                            }`}>
                                                            {cost.within_budget ?
                                                                <CheckCircle className="w-3 h-3 inline mr-1" /> :
                                                                <XCircle className="w-3 h-3 inline mr-1" />
                                                            }
                                                            {cost.within_budget ? "Within Budget" : "Over Budget"}
                                                        </span>
                                                        {(isMinimal) && (
                                                            <div>
                                                                {isMinimal && (
                                                                    <div className="bg-blue-900 text-blue-300 px-3 py-1 text-xs font-bold rounded-bl-lg">
                                                                        MINIMAL COST
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm opacity-60">
                                                        <div className="flex items-center gap-1">
                                                            <Building className="w-4 h-4" />
                                                            <span>{cost.instance_type}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className="w-4 h-4" />
                                                            <span>{getRegionDisplayName(cost.region, selectedProvider)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Users className="w-4 h-4" />
                                                            <span>{cost.nodes} nodes</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => toggleBreakdown(planId)}
                                                    className="flex items-center gap-2 opacity-80 hover:opacity-100"
                                                >
                                                    <ChevronDown
                                                        className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                    />
                                                    {isExpanded ? 'Hide Details' : 'Show Details'}
                                                </button>
                                            </div>

                                            {/* Cost Summary */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                                {/* Per Node Cost */}
                                                <div className="bg-card border border-border rounded-lg p-4">
                                                    <h4 className="font-semibold mb-3 opacity-80 flex items-center gap-2">
                                                        <Server className="w-4 h-4" />
                                                        Per Node Cost
                                                    </h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm opacity-60">Hourly Rate</span>
                                                            <span className="font-bold">
                                                                ${cost.price_per_node_hour.toFixed(3)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm opacity-60">Monthly Estimate</span>
                                                            <span className="font-bold">
                                                                {formatCurrency(cost.price_per_node_month)}
                                                            </span>
                                                        </div>
                                                        <div className="pt-2 mt-2 border-t border-border">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-sm opacity-80">Total for {cost.nodes} nodes</span>
                                                                <span className="font-bold">
                                                                    {formatCurrency(totalNodeMonthly)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs opacity-50 mt-1">
                                                                ${cost.price_per_node_hour.toFixed(3)} × {cost.nodes} nodes × 720h
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Control Plane Cost */}
                                                <div className="bg-card border border-border rounded-lg p-4">
                                                    <h4 className="font-semibold mb-3 opacity-80 flex items-center gap-2">
                                                        <Target className="w-4 h-4" />
                                                        Control Plane
                                                    </h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm opacity-60">Tier</span>
                                                            <span className="font-bold">
                                                                {cost.control_plane_tier.charAt(0).toUpperCase() + cost.control_plane_tier.slice(1)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm opacity-60">Hourly Cost</span>
                                                            <span className="font-bold">
                                                                ${cost.control_plane_hour.toFixed(3)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm opacity-60">Monthly Cost</span>
                                                            <span className="font-bold">
                                                                {formatCurrency(cost.control_plane_month)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs opacity-50 mt-2">
                                                            Fixed cost for cluster management
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Total Cluster Cost */}
                                                <div className={`bg-card border ${cost.within_budget
                                                    ? "border-border"
                                                    : "border-border"
                                                    } rounded-lg p-4`}>
                                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                        <Calculator className="w-4 h-4" />
                                                        Total Cluster Cost
                                                    </h4>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="text-sm opacity-80">Hourly Total</span>
                                                                <span className="font-bold text-xl">
                                                                    ${cost.total_hour.toFixed(3)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs opacity-50">
                                                                ${totalNodeHourly.toFixed(3)} (nodes) + ${cost.control_plane_hour.toFixed(3)} (control)
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="text-sm opacity-80">Monthly Total</span>
                                                                <span className="font-bold text-2xl">
                                                                    {formatCurrency(cost.total_month)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs opacity-50">
                                                                ${totalNodeMonthly.toFixed(2)} (nodes) + ${cost.control_plane_month.toFixed(2)} (control)
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Budget Comparison */}
                                            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                    <BarChart3 className="w-4 h-4" />
                                                    Budget Comparison
                                                </h4>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="opacity-80">Monthly Budget</span>
                                                        <span className="font-bold">{formatCurrency(cost.budget_month)}</span>
                                                    </div>
                                                    <div className="h-2 bg-card rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full ${cost.within_budget ? 'bg-green-600' : 'bg-red-600'} transition-all duration-500`}
                                                            style={{
                                                                width: `${Math.min(100, budgetPercentage)}%`
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="opacity-50">0%</span>
                                                        <span className={cost.within_budget ? 'text-green-500' : 'text-red-500'}>
                                                            {budgetPercentage.toFixed(1)}%
                                                        </span>
                                                        <span className="opacity-50">100%+</span>
                                                    </div>
                                                    <div className="flex justify-between items-center pt-2 border-t border-border">
                                                        <span className="opacity-60">Status</span>
                                                        <span className={`font-bold ${cost.within_budget ? 'text-green-500' : 'text-red-500'}`}>
                                                            {cost.within_budget ? 'Within Budget' : `Over Budget by ${formatCurrency(monthlyBudgetExcess)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Detailed Breakdown */}
                                            {isExpanded && (
                                                <div className="mt-4 pt-4 border-t border-border">
                                                    <h4 className="font-semibold mb-4 text-lg flex items-center gap-2">
                                                        <PieChart className="w-5 h-5" />
                                                        Detailed Calculation Breakdown
                                                    </h4>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {/*Base Calculations */}
                                                        <div className="space-y-4">
                                                            <div className="bg-card border border-border rounded-lg p-4">
                                                                <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                    <Clock className="w-4 h-4" />
                                                                    Hourly Cost Calculation
                                                                </h5>
                                                                <div className="space-y-2 text-sm">
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Node hourly cost:</span>
                                                                        <span className="font-mono">${cost.price_per_node_hour.toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Total nodes hourly:</span>
                                                                        <span className="font-mono">
                                                                            ${cost.price_per_node_hour.toFixed(3)} × {cost.nodes} = ${totalNodeHourly.toFixed(3)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Control plane hourly:</span>
                                                                        <span className="font-mono">${cost.control_plane_hour.toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="pt-2 mt-2 border-t border-border">
                                                                        <div className="flex justify-between font-bold">
                                                                            <span>TOTAL HOURLY:</span>
                                                                            <span className="font-mono">
                                                                                ${totalNodeHourly.toFixed(3)} + ${cost.control_plane_hour.toFixed(3)} = ${cost.total_hour.toFixed(3)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="bg-card border border-border rounded-lg p-4">
                                                                <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                    <Calendar className="w-4 h-4" />
                                                                    Monthly Cost Calculation
                                                                </h5>
                                                                <div className="space-y-2 text-sm">
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Node monthly cost:</span>
                                                                        <span className="font-mono">
                                                                            ${cost.price_per_node_hour.toFixed(3)} × 720h = ${cost.price_per_node_month.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Total nodes monthly:</span>
                                                                        <span className="font-mono">
                                                                            ${cost.price_per_node_month.toFixed(2)} × {cost.nodes} = ${totalNodeMonthly.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Control plane monthly:</span>
                                                                        <span className="font-mono">
                                                                            ${cost.control_plane_hour.toFixed(3)} × 720h = ${cost.control_plane_month.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="pt-2 mt-2 border-t border-border">
                                                                        <div className="flex justify-between font-bold">
                                                                            <span>TOTAL MONTHLY:</span>
                                                                            <span className="font-mono">
                                                                                ${totalNodeMonthly.toFixed(2)} + ${cost.control_plane_month.toFixed(2)} = ${cost.total_month.toFixed(2)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/*Budget & Savings */}
                                                        <div className="space-y-4">
                                                            <div className="bg-card border border-border rounded-lg p-4">
                                                                <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                    <Target className="w-4 h-4" />
                                                                    Budget Analysis
                                                                </h5>
                                                                <div className="space-y-2 text-sm">
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Available budget:</span>
                                                                        <span className="font-mono">${cost.budget_month.toFixed(2)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Cluster cost:</span>
                                                                        <span className="font-mono">${cost.total_month.toFixed(2)}</span>
                                                                    </div>
                                                                    <div className="pt-2 mt-2 border-t border-border">
                                                                        <div className={`flex justify-between font-bold ${monthlyBudgetExcess > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                                            <span>{monthlyBudgetExcess > 0 ? 'OVER BUDGET BY:' : 'UNDER BUDGET BY:'}</span>
                                                                            <span className="font-mono">
                                                                                ${Math.abs(monthlyBudgetExcess).toFixed(2)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="pt-2 mt-2 border-t border-border">
                                                                        <div className="flex justify-between">
                                                                            <span className="opacity-60">Budget utilization:</span>
                                                                            <span className={`font-bold ${budgetPercentage > 100 ? 'text-red-500' : budgetPercentage > 80 ? 'text-yellow-500' : 'text-green-500'}`}>
                                                                                {budgetPercentage.toFixed(1)}%
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="bg-card border border-border rounded-lg p-4">
                                                                <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                    <TrendingUp className="w-4 h-4" />
                                                                    Cost Efficiency
                                                                </h5>
                                                                <div className="space-y-2 text-sm">
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Cost per node per hour:</span>
                                                                        <span className="font-mono">${cost.price_per_node_hour.toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Cost per node per month:</span>
                                                                        <span className="font-mono">{formatCurrency(cost.price_per_node_month)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="opacity-60">Control plane % of total:</span>
                                                                        <span className="font-mono">
                                                                            {((cost.control_plane_month / cost.total_month) * 100).toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                    <div className="pt-2 mt-2 border-t border-border">
                                                                        <div className="flex justify-between">
                                                                            <span className="opacity-60">Average hourly cost:</span>
                                                                            <span className="font-mono">${(cost.total_hour / cost.nodes).toFixed(3)}/node</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="mt-6 pt-4 border-t border-border">
                                                        <h5 className="text-sm font-medium opacity-60 mb-2 flex items-center gap-2">
                                                            <Info className="w-4 h-4" />
                                                            Calculation Assumptions
                                                        </h5>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs opacity-50">
                                                            <div className="flex items-start gap-2">
                                                                <div className="w-1 h-1 bg-border rounded-full mt-1"></div>
                                                                <span>1 month = 720 hours (24h × 30 days)</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <div className="w-1 h-1 bg-border rounded-full mt-1"></div>
                                                                <span>Control plane cost is fixed per cluster</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <div className="w-1 h-1 bg-border rounded-full mt-1"></div>
                                                                <span>Prices exclude taxes, discounts, and additional services</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                <div className="mt-8 pt-6 border-t border-border">
                    <div className="text-center text-sm opacity-50">
                        <p className="mt-1">Prices are estimates based on public pricing and may vary based on actual usage, commitments, and additional services</p>
                    </div>
                </div>
            </div>
        </div>
    );
}