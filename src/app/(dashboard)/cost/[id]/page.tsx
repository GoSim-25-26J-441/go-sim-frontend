"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
    Calendar
} from "lucide-react";
import { getRegionDisplayName } from "@/utils/regionFormatter";

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

export default function CostPage2() {
    const [costData, setCostData] = useState<CostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<"aws" | "azure" | "gcp">("aws");
    const [regions, setRegions] = useState<string[]>([]);
    const [selectedRegion, setSelectedRegion] = useState<string>("");
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

    useEffect(() => {
        if (requestId) {
            if (selectedProvider === "aws") {
                setSelectedRegion("argentinabuenosaires");
            } else if (selectedProvider === "azure") {
                setSelectedRegion("attdallas1");
            }

            if (selectedProvider === "aws") {
                handleFetchCostData("aws", "argentinabuenosaires");
            } else if (selectedProvider === "azure") {
                handleFetchCostData("azure", "attdallas1");
            }

            handleFetchRegions(selectedProvider);
        } else {
            setError("No request ID provided");
            setLoading(false);
        }
    }, [requestId]);

    useEffect(() => {
        if (requestId) {
            handleFetchRegions(selectedProvider);

            if (selectedProvider === "aws") {
                setSelectedRegion("argentinabuenosaires");
                handleFetchCostData("aws", "argentinabuenosaires");
            } else if (selectedProvider === "azure") {
                setSelectedRegion("attdallas1");
                handleFetchCostData("azure", "attdallas1");
            }
        }
    }, [selectedProvider, requestId]);

    const handleRegionChange = async (region: string) => {
        setSelectedRegion(region);
        await handleFetchCostData(selectedProvider, region);
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

        if (selectedRegion) {
            return providerCosts.filter(c => c.region === selectedRegion);
        }

        return providerCosts;
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
            <div className="min-h-screen bg-black p-6 text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-400 mx-auto mb-4"></div>
                    <p className="text-lg text-gray-300">Loading cluster costs...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-black p-6 text-white">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-black border border-gray-800 rounded-lg p-6">
                        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                        <h1 className="text-2xl font-bold text-red-500 mb-2">Error</h1>
                        <p className="text-gray-400">{error}</p>
                        <p className="text-sm text-gray-500 mt-4">Request ID: {requestId}</p>
                        <button
                            onClick={handleBackClick}
                            className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium border border-gray-700 flex items-center gap-2"
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
            <div className="min-h-screen bg-black p-6 text-white flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg mb-4 text-gray-400">No data available for this request</p>
                    <button
                        onClick={handleBackClick}
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium border border-gray-700 flex items-center gap-2"
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

    return (
        <div className="min-h-screen bg-black p-6 text-white">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleBackClick}
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-4xl font-bold">Cluster Cost Analysis</h1>
                    </div>
                </div>

                {/* Summary */}
                <div className="mb-8">
                    <p className="text-gray-500 mb-6">Detailed cost breakdown for each pricing option</p>
                </div>

                {/* Provider & Region Selection */}
                <div className="bg-black border border-gray-800 rounded-lg p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Cloud Provider & Region</h2>

                    <div className="mb-6">
                        <p className="text-sm text-gray-500 mb-3">Select Provider:</p>
                        <div className="flex flex-wrap gap-3">
                            {(["aws", "azure"] as const).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setSelectedProvider(p)}
                                    className={`px-6 py-2 rounded-lg font-medium capitalize transition-all ${selectedProvider === p
                                        ? "bg-gray-800 text-white border border-gray-700"
                                        : "bg-black border border-gray-800 hover:bg-gray-900 text-gray-300"
                                        }`}
                                >
                                    {p.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm text-gray-500 mb-3">Select Region:</p>
                        <div className="flex gap-3 items-center">
                            <select
                                className="bg-black text-white p-3 rounded-lg border border-gray-800 focus:border-gray-700 focus:outline-none w-full max-w-md"
                                value={selectedRegion}
                                onChange={(e) => handleRegionChange(e.target.value)}
                                disabled={regions.length === 0}
                            >
                                {regions.map((r) => (
                                    <option key={r} value={r}>
                                        {getRegionDisplayName(r, selectedProvider)}
                                    </option>
                                ))}
                            </select>
                            {reloadingProviderCost && (
                                <span className="text-sm text-gray-400 animate-pulse flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3" />
                                    Updating…
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                            Default: {getRegionDisplayName(selectedProvider === "aws" ? "argentinabuenosaires" : "attdallas1", selectedProvider)}
                        </p>
                    </div>
                </div>

                {/* Pricing Cards */}
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">Pricing Options Breakdown</h2>
                        <div className="text-sm text-gray-500">
                            Showing {currentCosts.length} pricing option{currentCosts.length !== 1 ? 's' : ''}
                            {selectedRegion && (
                                <span className="ml-2">
                                    in {getRegionDisplayName(selectedRegion, selectedProvider)}
                                </span>
                            )}
                        </div>
                    </div>

                    {currentCosts.length === 0 ? (
                        <div className="text-center py-12 bg-black border border-gray-800 rounded-lg">
                            <Server className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-500">No instances found for {selectedProvider.toUpperCase()}</p>
                            {selectedRegion && <p className="text-sm text-gray-600 mt-2">in region: {getRegionDisplayName(selectedRegion, selectedProvider)}</p>}
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
                                            ? "bg-black border-gray-800"
                                            : "bg-black border-gray-800"
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
                                                            <span className="text-lg text-gray-500 ml-2">
                                                                ({cost.lease_contract_length})
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${cost.within_budget
                                                        ? "bg-gray-900 text-green-400 border border-gray-800"
                                                        : "bg-gray-900 text-red-400 border border-gray-800"
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
                                                <div className="flex items-center gap-4 text-sm text-gray-500">
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
                                                className="flex items-center gap-2 text-gray-400 hover:text-white"
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
                                            <div className="bg-black border border-gray-800 rounded-lg p-4">
                                                <h4 className="font-semibold mb-3 text-gray-400 flex items-center gap-2">
                                                    <Server className="w-4 h-4" />
                                                    Per Node Cost
                                                </h4>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-500">Hourly Rate</span>
                                                        <span className="font-bold">
                                                            ${cost.price_per_node_hour.toFixed(3)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-500">Monthly Estimate</span>
                                                        <span className="font-bold">
                                                            {formatCurrency(cost.price_per_node_month)}
                                                        </span>
                                                    </div>
                                                    <div className="pt-2 mt-2 border-t border-gray-800">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-400">Total for {cost.nodes} nodes</span>
                                                            <span className="font-bold">
                                                                {formatCurrency(totalNodeMonthly)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            ${cost.price_per_node_hour.toFixed(3)} × {cost.nodes} nodes × 720h
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Control Plane Cost */}
                                            <div className="bg-black border border-gray-800 rounded-lg p-4">
                                                <h4 className="font-semibold mb-3 text-gray-400 flex items-center gap-2">
                                                    <Target className="w-4 h-4" />
                                                    Control Plane
                                                </h4>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-500">Tier</span>
                                                        <span className="font-bold">
                                                            {cost.control_plane_tier.charAt(0).toUpperCase() + cost.control_plane_tier.slice(1)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-500">Hourly Cost</span>
                                                        <span className="font-bold">
                                                            ${cost.control_plane_hour.toFixed(3)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-500">Monthly Cost</span>
                                                        <span className="font-bold">
                                                            {formatCurrency(cost.control_plane_month)}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-600 mt-2">
                                                        Fixed cost for cluster management
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Total Cluster Cost */}
                                            <div className={`bg-black border ${cost.within_budget
                                                ? "border-gray-800"
                                                : "border-gray-800"
                                                } rounded-lg p-4`}>
                                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                    <Calculator className="w-4 h-4" />
                                                    Total Cluster Cost
                                                </h4>
                                                <div className="space-y-3">
                                                    <div>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-sm text-gray-400">Hourly Total</span>
                                                            <span className="font-bold text-xl">
                                                                ${cost.total_hour.toFixed(3)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            ${totalNodeHourly.toFixed(3)} (nodes) + ${cost.control_plane_hour.toFixed(3)} (control)
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-sm text-gray-400">Monthly Total</span>
                                                            <span className="font-bold text-2xl">
                                                                {formatCurrency(cost.total_month)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            ${totalNodeMonthly.toFixed(2)} (nodes) + ${cost.control_plane_month.toFixed(2)} (control)
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Budget Comparison */}
                                        <div className="bg-black border border-gray-800 rounded-lg p-4 mb-4">
                                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4" />
                                                Budget Comparison
                                            </h4>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-400">Monthly Budget</span>
                                                    <span className="font-bold">{formatCurrency(cost.budget_month)}</span>
                                                </div>
                                                <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${cost.within_budget ? 'bg-green-600' : 'bg-red-600'} transition-all duration-500`}
                                                        style={{
                                                            width: `${Math.min(100, budgetPercentage)}%`
                                                        }}
                                                    ></div>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">0%</span>
                                                    <span className={cost.within_budget ? 'text-green-500' : 'text-red-500'}>
                                                        {budgetPercentage.toFixed(1)}%
                                                    </span>
                                                    <span className="text-gray-600">100%+</span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                                                    <span className="text-gray-500">Status</span>
                                                    <span className={`font-bold ${cost.within_budget ? 'text-green-500' : 'text-red-500'}`}>
                                                        {cost.within_budget ? 'Within Budget' : `Over Budget by ${formatCurrency(monthlyBudgetExcess)}`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Detailed Breakdown */}
                                        {isExpanded && (
                                            <div className="mt-4 pt-4 border-t border-gray-800">
                                                <h4 className="font-semibold mb-4 text-lg flex items-center gap-2">
                                                    <PieChart className="w-5 h-5" />
                                                    Detailed Calculation Breakdown
                                                </h4>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {/*Base Calculations */}
                                                    <div className="space-y-4">
                                                        <div className="bg-black border border-gray-800 rounded-lg p-4">
                                                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                <Clock className="w-4 h-4" />
                                                                Hourly Cost Calculation
                                                            </h5>
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Node hourly cost:</span>
                                                                    <span className="font-mono">${cost.price_per_node_hour.toFixed(3)}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Total nodes hourly:</span>
                                                                    <span className="font-mono">
                                                                        ${cost.price_per_node_hour.toFixed(3)} × {cost.nodes} = ${totalNodeHourly.toFixed(3)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Control plane hourly:</span>
                                                                    <span className="font-mono">${cost.control_plane_hour.toFixed(3)}</span>
                                                                </div>
                                                                <div className="pt-2 mt-2 border-t border-gray-800">
                                                                    <div className="flex justify-between font-bold">
                                                                        <span>TOTAL HOURLY:</span>
                                                                        <span className="font-mono">
                                                                            ${totalNodeHourly.toFixed(3)} + ${cost.control_plane_hour.toFixed(3)} = ${cost.total_hour.toFixed(3)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-black border border-gray-800 rounded-lg p-4">
                                                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                <Calendar className="w-4 h-4" />
                                                                Monthly Cost Calculation
                                                            </h5>
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Node monthly cost:</span>
                                                                    <span className="font-mono">
                                                                        ${cost.price_per_node_hour.toFixed(3)} × 720h = ${cost.price_per_node_month.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Total nodes monthly:</span>
                                                                    <span className="font-mono">
                                                                        ${cost.price_per_node_month.toFixed(2)} × {cost.nodes} = ${totalNodeMonthly.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Control plane monthly:</span>
                                                                    <span className="font-mono">
                                                                        ${cost.control_plane_hour.toFixed(3)} × 720h = ${cost.control_plane_month.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                <div className="pt-2 mt-2 border-t border-gray-800">
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
                                                        <div className="bg-black border border-gray-800 rounded-lg p-4">
                                                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                <Target className="w-4 h-4" />
                                                                Budget Analysis
                                                            </h5>
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Available budget:</span>
                                                                    <span className="font-mono">${cost.budget_month.toFixed(2)}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Cluster cost:</span>
                                                                    <span className="font-mono">${cost.total_month.toFixed(2)}</span>
                                                                </div>
                                                                <div className="pt-2 mt-2 border-t border-gray-800">
                                                                    <div className={`flex justify-between font-bold ${monthlyBudgetExcess > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                                        <span>{monthlyBudgetExcess > 0 ? 'OVER BUDGET BY:' : 'UNDER BUDGET BY:'}</span>
                                                                        <span className="font-mono">
                                                                            ${Math.abs(monthlyBudgetExcess).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="pt-2 mt-2 border-t border-gray-800">
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-500">Budget utilization:</span>
                                                                        <span className={`font-bold ${budgetPercentage > 100 ? 'text-red-500' : budgetPercentage > 80 ? 'text-yellow-500' : 'text-green-500'}`}>
                                                                            {budgetPercentage.toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-black border border-gray-800 rounded-lg p-4">
                                                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                                                <TrendingUp className="w-4 h-4" />
                                                                Cost Efficiency
                                                            </h5>
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Cost per node per hour:</span>
                                                                    <span className="font-mono">${cost.price_per_node_hour.toFixed(3)}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Cost per node per month:</span>
                                                                    <span className="font-mono">{formatCurrency(cost.price_per_node_month)}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Control plane % of total:</span>
                                                                    <span className="font-mono">
                                                                        {((cost.control_plane_month / cost.total_month) * 100).toFixed(1)}%
                                                                    </span>
                                                                </div>
                                                                <div className="pt-2 mt-2 border-t border-gray-800">
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-500">Average hourly cost:</span>
                                                                        <span className="font-mono">${(cost.total_hour / cost.nodes).toFixed(3)}/node</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Footer */}
                                                <div className="mt-6 pt-4 border-t border-gray-800">
                                                    <h5 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                                                        <Info className="w-4 h-4" />
                                                        Calculation Assumptions
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
                                                        <div className="flex items-start gap-2">
                                                            <div className="w-1 h-1 bg-gray-700 rounded-full mt-1"></div>
                                                            <span>1 month = 720 hours (24h × 30 days)</span>
                                                        </div>
                                                        <div className="flex items-start gap-2">
                                                            <div className="w-1 h-1 bg-gray-700 rounded-full mt-1"></div>
                                                            <span>Control plane cost is fixed per cluster</span>
                                                        </div>
                                                        <div className="flex items-start gap-2">
                                                            <div className="w-1 h-1 bg-gray-700 rounded-full mt-1"></div>
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
                <div className="mt-8 pt-6 border-t border-gray-800">
                    <div className="text-center text-sm text-gray-600">
                        <p>Data fetched from cloud provider APIs on {new Date(costData.stored_at).toLocaleString()}</p>
                        <p className="mt-1">Prices are estimates based on public pricing and may vary based on actual usage, commitments, and additional services</p>
                    </div>
                </div>
            </div>
        </div>
    );
}