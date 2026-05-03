"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    fetchCostData,
    fetchGlobalCostRecommendation,
    fetchRegionsForRequest,
    type ClusterCostResultDTO,
    type GlobalCostRecommendResponse,
} from "@/app/api/asm/routes";
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
    GitCompare,
    ArrowLeft,
    Loader2,
} from "lucide-react";
import { getRegionDisplayName } from "@/utils/regionFormatter";
import { GENERIC_REGIONS, getGenericRegionById } from "@/utils/genericRegions";

interface ClusterCostResult {
    provider: string;
    purchase_type: string;
    lease_contract_length: string;
    instance_type: string;
    vcpus: number;
    memory_gb: number;
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
};

type ViewMode = "by-provider" | "by-region";

const DEFAULT_GENERIC_REGION_ID = GENERIC_REGIONS[0]?.id ?? "us-east";

type CostRunDetailProps = {
    requestId: string;
    projectId?: string;
};

function normalizeLeaseLabel(v: string | undefined | null) {
    return (v ?? "").trim();
}

function planMatchesPick(cost: ClusterCostResult, pick: ClusterCostResultDTO) {
    return (
        cost.purchase_type === pick.purchase_type &&
        normalizeLeaseLabel(cost.lease_contract_length) === normalizeLeaseLabel(pick.lease_contract_length) &&
        cost.instance_type === pick.instance_type &&
        cost.region === pick.region
    );
}

function supportsProviderBreakdownNav(provider: string) {
    const p = provider.toLowerCase();
    return p === "aws" || p === "azure";
}

type GlobalPanelProps = {
    globalRec: GlobalCostRecommendResponse | null;
    globalRecLoading: boolean;
    globalRecError: string | null;
    formatCurrency: (v: number) => string;
    onViewBreakdown?: (pick: ClusterCostResultDTO) => void;
    breakdownNavBusy?: boolean;
};

function GlobalRecommendPanel({
    globalRec,
    globalRecLoading,
    globalRecError,
    formatCurrency,
    onViewBreakdown,
    breakdownNavBusy,
}: GlobalPanelProps) {
    const [runnersOpen, setRunnersOpen] = useState(false);
    const runnersUp = globalRec?.recommendation?.runners_up ?? [];
    const runnersCount = runnersUp.length;

    useEffect(() => {
        setRunnersOpen(false);
    }, [globalRec?.request_id]);

    const toggleRunners = useCallback(() => {
        setRunnersOpen((o) => !o);
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <Target className="w-5 h-5 mt-0.5 shrink-0 opacity-90" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-white">
                        Best option across all providers &amp; regions
                    </h2>
                </div>
            </div>
            {globalRecLoading && (
                <p className="flex items-center gap-2 text-xs text-white/60">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Scanning catalog…
                </p>
            )}
            {globalRecError && !globalRecLoading && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-sm text-red-300">{globalRecError}</p>
                </div>
            )}
            {!globalRecLoading && !globalRecError && globalRec?.recommendation && (
                <div className="space-y-4">
                    {!globalRec.recommendation.recommended ? (
                        <div className="overflow-hidden rounded-lg bg-white/4 p-4">
                            {globalRec.recommendation.rationale.length > 0 ? (
                                <ul className="m-0 list-none space-y-1.5 p-0 text-xs text-white/75">
                                    {globalRec.recommendation.rationale.map((line, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="mt-0.5 shrink-0 text-white/40">•</span>
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-white/70">
                                    No recommendation could be built from stored prices.
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {globalRec.recommendation.fits_budget ? (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-green-600/25 text-green-400 border border-green-600/40">
                                        Within budget
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/35">
                                        Over budget — cheapest overall
                                    </span>
                                )}
                            </div>
                            <div className="overflow-hidden rounded-lg bg-white/4">
                                <div className="flex flex-wrap justify-between gap-3 p-4">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wide text-white/50">
                                            Monthly total
                                        </p>
                                        <p className="text-xl font-bold text-white">
                                            {formatCurrency(globalRec.recommendation.recommended.total_month)}
                                        </p>
                                    </div>
                                    <div className="text-right text-xs text-white/90">
                                        <p className="font-medium capitalize">
                                            {globalRec.recommendation.recommended.provider}
                                        </p>
                                        <p className="text-white/70">
                                            {getRegionDisplayName(
                                                globalRec.recommendation.recommended.region,
                                                globalRec.recommendation.recommended.provider as
                                                | "aws"
                                                | "azure",
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t border-white/40 px-4 py-3">
                                    <p className="text-xs text-white/85">
                                        <span className="font-mono">
                                            {globalRec.recommendation.recommended.instance_type}
                                        </span>
                                        <span className="text-white/60"> · </span>
                                        {globalRec.recommendation.recommended.purchase_type}
                                        {globalRec.recommendation.recommended.lease_contract_length
                                            ? ` (${globalRec.recommendation.recommended.lease_contract_length})`
                                            : ""}
                                    </p>
                                </div>
                                {onViewBreakdown &&
                                    supportsProviderBreakdownNav(globalRec.recommendation.recommended.provider) && (
                                        <div className="border-t border-white/40 px-4 pb-4 pt-3">
                                            <button
                                                type="button"
                                                disabled={breakdownNavBusy}
                                                onClick={() => onViewBreakdown(globalRec.recommendation.recommended!)}
                                                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-50"
                                            >
                                                <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />
                                                View pricing breakdown in this region
                                            </button>
                                        </div>
                                    )}
                            </div>
                            {globalRec.recommendation.rationale.length > 0 && (
                                <ul className="m-0 list-none space-y-1.5 p-0 text-xs text-white/75">
                                    {globalRec.recommendation.rationale.map((line, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="mt-0.5 shrink-0 text-white/40">•</span>
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {runnersCount > 0 && globalRec.recommendation.recommended && (
                                <div className="border-t border-white/40 pt-4">
                                    <button
                                        type="button"
                                        onClick={toggleRunners}
                                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-white/15 bg-white/4 px-4 py-3 text-left transition-colors hover:bg-white/6"
                                        aria-expanded={runnersOpen}
                                    >
                                        <div className="min-w-0 flex items-start gap-3">
                                            <GitCompare className="h-5 w-5 shrink-0 mt-0.5 text-white/50" aria-hidden />
                                            <div>
                                                <span className="block text-xs font-semibold text-white">
                                                    Other low-cost options
                                                </span>
                                                <span className="mt-0.5 block text-[10px] leading-relaxed text-white/50">
                                                    {!runnersOpen ? " Tap to expand." : ""}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronDown
                                            className={`h-5 w-5 shrink-0 text-white/50 transition-transform mt-0.5 ${runnersOpen ? "rotate-180" : ""}`}
                                            aria-hidden
                                        />
                                    </button>
                                    {runnersOpen && (
                                        <div className="mt-3 space-y-2">
                                            <p className="px-1 text-[10px] uppercase tracking-wider text-white/40">
                                                Compared to your pick (
                                                {formatCurrency(globalRec.recommendation.recommended.total_month)}
                                                /mo)
                                            </p>
                                            <ol className="m-0 list-none space-y-2 p-0">
                                                {runnersUp.map((r, idx) => {
                                                    const pick = globalRec.recommendation.recommended!;
                                                    const delta = r.total_month - pick.total_month;
                                                    const deltaPct =
                                                        pick.total_month > 0
                                                            ? (100 * delta) / pick.total_month
                                                            : 0;
                                                    const rank = idx + 2;
                                                    return (
                                                        <li
                                                            key={`${r.provider}-${r.region}-${r.instance_type}-${idx}`}
                                                            className="rounded-lg bg-white/4 px-3 py-3 sm:px-4"
                                                        >
                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                <div className="flex min-w-0 items-center gap-3">
                                                                    <span
                                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-white/90"
                                                                        title={`Rank ${rank} by price`}
                                                                    >
                                                                        #{rank}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <p className="text-base font-semibold tabular-nums text-white">
                                                                            {formatCurrency(r.total_month)}
                                                                            <span className="ml-2 text-[10px] font-normal text-amber-200/90">
                                                                                +{formatCurrency(delta)} / mo
                                                                                {deltaPct > 0.05 ? (
                                                                                    <span className="text-white/45">
                                                                                        {" "}
                                                                                        (+{deltaPct.toFixed(1)}%)
                                                                                    </span>
                                                                                ) : null}
                                                                            </span>
                                                                        </p>
                                                                        <p className="mt-1 text-xs text-white/80">
                                                                            <span className="font-medium capitalize">
                                                                                {r.provider}
                                                                            </span>
                                                                            <span className="text-white/35"> · </span>
                                                                            <span>
                                                                                {getRegionDisplayName(
                                                                                    r.region,
                                                                                    r.provider as
                                                                                    | "aws"
                                                                                    | "azure",
                                                                                )}
                                                                            </span>
                                                                        </p>
                                                                        <p className="mt-0.5 font-mono text-[10px] text-white/55">
                                                                            {r.instance_type}
                                                                            <span className="text-white/30"> · </span>
                                                                            {r.purchase_type}
                                                                            {r.lease_contract_length
                                                                                ? ` (${r.lease_contract_length})`
                                                                                : ""}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {globalRec.budget > 0 && (
                                                                    <div className="shrink-0">
                                                                        {r.within_budget ? (
                                                                            <span className="inline-block rounded-md border border-green-600/35 bg-green-600/15 px-2 py-1 text-[10px] font-medium text-green-400">
                                                                                Within budget
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-block rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-300/90">
                                                                                Over budget
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {onViewBreakdown && supportsProviderBreakdownNav(r.provider) && (
                                                                <div className="mt-3 pt-1 sm:pl-11">
                                                                    <button
                                                                        type="button"
                                                                        disabled={breakdownNavBusy}
                                                                        onClick={() => onViewBreakdown(r)}
                                                                        className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-50"
                                                                    >
                                                                        <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />
                                                                        View pricing breakdown in this region
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export function CostRunDetail({ requestId, projectId }: CostRunDetailProps) {
    const [costData, setCostData] = useState<CostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("by-provider");
    const [selectedProvider, setSelectedProvider] = useState<"aws" | "azure">("aws");
    const [regions, setRegions] = useState<string[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedGenericRegionId, setSelectedGenericRegionId] = useState<string>(DEFAULT_GENERIC_REGION_ID);
    const [compareRegionsEnabled, setCompareRegionsEnabled] = useState(false);
    const [reloadingProviderCost, setReloadingProviderCost] = useState(false);
    const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
    const [filteredGenericRegions, setFilteredGenericRegions] = useState<typeof GENERIC_REGIONS>([]);
    const [globalRec, setGlobalRec] = useState<GlobalCostRecommendResponse | null>(null);
    const [globalRecLoading, setGlobalRecLoading] = useState(true);
    const [globalRecError, setGlobalRecError] = useState<string | null>(null);
    const [pendingBreakdownPick, setPendingBreakdownPick] = useState<ClusterCostResultDTO | null>(null);
    const [breakdownNavBusy, setBreakdownNavBusy] = useState(false);
    const skipProviderRegionResetRef = useRef(false);

    const router = useRouter();

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

    const jumpToBreakdownForPick = async (pick: ClusterCostResultDTO) => {
        if (!requestId) return;
        const provider = pick.provider.toLowerCase();
        if (provider !== "aws" && provider !== "azure") return;

        setBreakdownNavBusy(true);
        try {
            skipProviderRegionResetRef.current = selectedProvider !== provider;

            setViewMode("by-provider");
            setCompareRegionsEnabled(false);
            setExpandedBreakdown(null);

            const list = await fetchRegionsForRequest(requestId, provider);
            setRegions(list);
            if (!list.includes(pick.region)) {
                skipProviderRegionResetRef.current = false;
                return;
            }

            setSelectedRegions([pick.region]);
            setSelectedProvider(provider as "aws" | "azure");

            await handleFetchCostData(provider, pick.region);
            setPendingBreakdownPick(pick);
        } catch (e) {
            console.error("jumpToBreakdownForPick:", e);
            skipProviderRegionResetRef.current = false;
        } finally {
            setBreakdownNavBusy(false);
        }
    };

    const handleFetchRegions = async (provider: string): Promise<string[]> => {
        try {
            if (!requestId) return [];
            const regionsData = await fetchRegionsForRequest(requestId, provider);
            setRegions(regionsData);
            return regionsData;
        } catch (e: any) {
            console.error("Error fetching regions for request:", e);
            setRegions([]);
            return [];
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

    const loadFilteredGenericRegions = async () => {
        if (!requestId) return;
        try {
            const [awsRegions, azureRegions] = await Promise.all([
                fetchRegionsForRequest(requestId, "aws"),
                fetchRegionsForRequest(requestId, "azure"),
            ]);
            const awsSet = new Set(awsRegions);
            const azureSet = new Set(azureRegions);

            const filtered = GENERIC_REGIONS.filter(
                (r) => awsSet.has(r.aws) && azureSet.has(r.azure)
            );
            setFilteredGenericRegions(filtered);

            if (filtered.length > 0 && !filtered.find((r) => r.id === selectedGenericRegionId)) {
                setSelectedGenericRegionId(filtered[0].id);
            }
        } catch (e: any) {
            console.error("Error loading filtered generic regions:", e);
            setFilteredGenericRegions(GENERIC_REGIONS);
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
            setGlobalRecLoading(false);
            return;
        }
        let cancelled = false;
        setGlobalRecLoading(true);
        setGlobalRecError(null);
        fetchGlobalCostRecommendation(requestId)
            .then((data) => {
                if (!cancelled) setGlobalRec(data);
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    setGlobalRecError(e instanceof Error ? e.message : String(e));
                }
            })
            .finally(() => {
                if (!cancelled) setGlobalRecLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [requestId]);

    useEffect(() => {
        if (!requestId) {
            setError("No request ID provided");
            setLoading(false);
            return;
        }
        if (viewMode === "by-region") {
            handleFetchCostForGenericRegion(selectedGenericRegionId);
        } else {
            handleFetchRegions(selectedProvider).then((list) => {
                const defaultRegion = list?.[0] ?? DEFAULT_REGIONS[selectedProvider] ?? "";
                setSelectedRegions([defaultRegion]);
                if (defaultRegion) handleFetchCostData(selectedProvider, defaultRegion);
            });
        }
    }, [requestId]);

    useEffect(() => {
        if (requestId && viewMode === "by-provider") {
            if (skipProviderRegionResetRef.current) {
                skipProviderRegionResetRef.current = false;
                return;
            }
            handleFetchRegions(selectedProvider).then((list) => {
                const defaultRegion = list?.[0] ?? "";
                setSelectedRegions([defaultRegion]);
                if (defaultRegion) handleFetchCostData(selectedProvider, defaultRegion);
            });
        }
    }, [selectedProvider, requestId, viewMode]);

    useEffect(() => {
        if (requestId && viewMode === "by-region") {
            loadFilteredGenericRegions();
            handleFetchCostForGenericRegion(selectedGenericRegionId);
        }
    }, [requestId, viewMode]);

    useEffect(() => {
        if (requestId && viewMode === "by-region") {
            handleFetchCostForGenericRegion(selectedGenericRegionId);
        }
    }, [selectedGenericRegionId]);

    useEffect(() => {
        if (!pendingBreakdownPick || !costData) return;
        const pick = pendingBreakdownPick;
        const prov = pick.provider.toLowerCase();
        const rows = (costData.cluster_costs?.[prov] ?? []).filter((c) => c.region === pick.region);
        const idx = rows.findIndex((c) => planMatchesPick(c, pick));
        if (idx < 0) {
            setPendingBreakdownPick(null);
            return;
        }
        const c = rows[idx];
        const planId = `${c.provider}-${c.purchase_type}-${c.lease_contract_length}-${idx}`;
        setExpandedBreakdown(planId);
        setPendingBreakdownPick(null);
        window.setTimeout(() => {
            document.getElementById(`cost-plan-${planId}`)?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }, 200);
    }, [pendingBreakdownPick, costData]);

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
        if (projectId) {
            router.push(`/project/${projectId}/cost`);
        } else {
            router.back();
        }
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
                        <h1 className="text-md font-bold text-white">Cluster Cost Analysis</h1>
                    </div>
                </div>
                <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-5">
                    <GlobalRecommendPanel
                        globalRec={globalRec}
                        globalRecLoading={globalRecLoading}
                        globalRecError={globalRecError}
                        formatCurrency={formatCurrency}
                        onViewBreakdown={jumpToBreakdownForPick}
                        breakdownNavBusy={breakdownNavBusy || reloadingProviderCost}
                    />
                    <div className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-3">
                        <Loader2
                            className="h-8 w-8 animate-spin text-white/80"
                            aria-hidden
                        />
                        <p className="text-sm text-white/70">Loading cluster costs…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 min-h-[80vh] flex items-center justify-center">
                <div className="max-w-md w-full rounded-2xl border border-border bg-surface/30 px-8 py-10 text-center shadow-sm">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-lg font-semibold mb-2">Resource Not Found</h2>
                    <p className="text-xs opacity-70">
                        We could not find the requested resource. It may have been removed or is no longer available.
                    </p>
                    <button
                        onClick={handleBackClick}
                        className="mt-6 px-4 py-2 rounded-lg font-medium border border-border inline-flex items-center gap-2 hover:bg-surface transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Designs
                    </button>
                </div>
            </div>
        );
    }

    if (!costData) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 opacity-70 mx-auto mb-4" />
                    <p className="text-base mb-4 opacity-80">No data available for this request</p>
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
    const combinedRegionCosts = viewMode === "by-region" ? [...costsByRegionAWS, ...costsByRegionAzure] : [];
    const { best: bestRegion, minimal: minimalRegion } = identifyBestOptions(combinedRegionCosts);

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
                    <h1 className="text-md font-bold text-white">Cluster Cost Analysis</h1>
                </div>
            </div>

            <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-5">
                <GlobalRecommendPanel
                    globalRec={globalRec}
                    globalRecLoading={globalRecLoading}
                    globalRecError={globalRecError}
                    formatCurrency={formatCurrency}
                    onViewBreakdown={jumpToBreakdownForPick}
                    breakdownNavBusy={breakdownNavBusy || reloadingProviderCost}
                />

                {/* Provider & Region Selection */}
                <div className="bg-card border-b border-border p-6 my-8">
                    <h2 className="text-lg font-semibold mb-4">Cloud Provider & Region</h2>

                    <div className="mb-6">
                        <div className="border-b border-border">
                            <nav className="flex gap-6" role="tablist" aria-label="View mode">
                                <button
                                    type="button"
                                    role="tab"
                                    onClick={() => setViewMode("by-provider")}
                                    aria-selected={viewMode === "by-provider"}
                                    className={`pb-3 px-1 font-medium text-xs border-b-2 transition-colors -mb-px ${viewMode === "by-provider"
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
                                    className={`pb-3 px-1 font-medium text-xs border-b-2 transition-colors -mb-px ${viewMode === "by-region"
                                        ? "border-white text-white"
                                        : "border-transparent opacity-60 hover:opacity-100"
                                        }`}
                                >
                                    By region (AWS & Azure)
                                </button>
                            </nav>
                        </div>
                        <p className="text-[10px] opacity-50 mt-3">
                            {viewMode === "by-region"
                                ? "Select a region to see costs for both AWS and Azure in that area."
                                : "Select a provider, then region(s) to compare."}
                        </p>
                    </div>

                    {viewMode === "by-region" ? (
                        <div>
                                <p className="mb-3 text-xs font-medium text-white/70">Select region:</p>
                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    className="region-select w-full max-w-md rounded-lg border-0 bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={selectedGenericRegionId}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) setSelectedGenericRegionId(v);
                                    }}
                                    disabled={reloadingProviderCost}
                                >
                                    {filteredGenericRegions.length === 0 && (
                                        <option value="" disabled className="bg-white text-black">
                                            Loading regions…
                                        </option>
                                    )}
                                    {filteredGenericRegions.map((r) => (
                                        <option key={r.id} value={r.id} className="bg-white text-black">
                                            {r.displayName}
                                        </option>
                                    ))}
                                </select>
                                {reloadingProviderCost && (
                                    <span className="text-xs opacity-70 animate-pulse flex items-center gap-2">
                                        <RefreshCw className="w-3 h-3" />
                                        Updating…
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] opacity-50 mt-2">
                                Only regions where both AWS and Azure have matching instances are shown.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6">
                                <p className="mb-3 text-xs font-medium text-white/70">Select Provider:</p>
                                <div className="flex flex-wrap gap-2">
                                    {(["aws", "azure"] as const).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setSelectedProvider(p)}
                                            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${selectedProvider === p
                                                ? "bg-white text-black shadow-sm"
                                                : "border border-white/20 bg-white/10 text-white hover:bg-white/15"
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
                                    <span className="text-xs font-medium">Compare multiple regions</span>
                                </label>
                                <p className="text-[10px] opacity-50 mt-1 ml-6">Enable to add and compare costs across up to {MAX_REGIONS} regions</p>
                            </div>

                            <div>
                                <p className="mb-3 text-xs font-medium text-white/70">
                                    {compareRegionsEnabled ? "Regions to compare:" : "Select region:"}
                                </p>
                                {compareRegionsEnabled ? (
                                    <div className="flex flex-wrap gap-2 items-center mb-3">
                                        {selectedRegions.map((r) => (
                                            <span
                                                key={r}
                                                className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white"
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
                                            className="region-select max-w-[220px] rounded-lg border-0 bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                                                    <option key={r} value={r} className="bg-white text-black">
                                                        {getRegionDisplayName(r, selectedProvider)}
                                                    </option>
                                                ))}
                                        </select>
                                        {reloadingProviderCost && (
                                            <span className="text-xs opacity-70 animate-pulse flex items-center gap-2">
                                                <RefreshCw className="w-3 h-3" />
                                                Updating…
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <select
                                            className="region-select w-full max-w-md rounded-lg border-0 bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                                                <option key={r} value={r} className="bg-white text-black">
                                                    {getRegionDisplayName(r, selectedProvider)}
                                                </option>
                                            ))}
                                        </select>
                                        {reloadingProviderCost && (
                                            <span className="text-xs opacity-70 animate-pulse flex items-center gap-2">
                                                <RefreshCw className="w-3 h-3" />
                                                Updating…
                                            </span>
                                        )}
                                    </div>
                                )}
                                <p className="text-[10px] opacity-50 mt-2">
                                    {compareRegionsEnabled
                                        ? `Add multiple regions to compare pricing.`
                                        : ` `}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Region comparison table (when enabled and 2+ regions) */}
                {viewMode === "by-provider" && compareRegionsEnabled && selectedRegions.length >= 2 && currentCosts.length > 0 && (
                    <div className="mb-8 overflow-hidden rounded-lg bg-white/4">
                        <h2 className="flex items-center gap-2 border-b border-white/40 px-4 py-3 text-sm font-semibold text-white">
                            <GitCompare className="h-4 w-4 shrink-0 opacity-90" />
                            Region comparison
                        </h2>
                        <div className="overflow-x-auto px-2 pb-3 pt-1 sm:px-4 sm:pb-4">
                            <table className="min-w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-white/40">
                                        <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-white/50">Plan</th>

                                        {selectedRegions.map((r) => (
                                            <th key={r} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-white/50">
                                                {getRegionDisplayName(r, selectedProvider)}
                                            </th>
                                        ))}
                                        <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-white/50">Best</th>
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
                                                <tr key={planKey} className="border-b border-white/25 transition-colors last:border-b-0 hover:bg-white/6">
                                                    <td className="px-3 py-2.5 text-xs font-medium text-white/90">{planLabel}</td>
                                                    {selectedRegions.map((r) => {
                                                        const cost = byRegion.get(r);
                                                        const isMin = cost != null && validValues.length > 0 && cost.total_month === minMonthly;
                                                        return (
                                                            <td key={r} className="align-top px-3 py-2.5 text-xs text-white/85">
                                                                {cost != null ? (
                                                                    <div className="space-y-1">
                                                                        <span className={isMin ? "font-bold text-green-400" : ""}>
                                                                            {formatCurrency(cost.total_month)}
                                                                        </span>
                                                                        <div className="text-[10px] text-white/50">
                                                                            {cost.instance_type} • {cost.vcpus} vCPUs • {cost.memory_gb} GB RAM
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-white/40">—</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2.5 text-xs font-medium text-green-400">
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
                        <div className="mb-4 flex items-start gap-3">
                            <MapPin className="mt-0.5 h-5 w-5 shrink-0 opacity-90" />
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold text-white">
                                    Pricing by region — {genericRegion.displayName}
                                </h2>
                                <p className="mt-1 text-[10px] text-white/50">
                                    Costs for both AWS and Azure in this region
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg bg-white/4 p-4">
                                <div className="mb-4">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                                        AWS
                                    </p>
                                    <p className="mt-0.5 text-xs font-semibold text-white">
                                        {getRegionDisplayName(genericRegion.aws, "aws")}
                                    </p>
                                </div>
                                {costsByRegionAWS.length === 0 ? (
                                    <div className="py-6 text-center text-xs text-white/50">
                                        <Server className="mx-auto mb-2 h-8 w-8 opacity-40" />
                                        <p>No instances found for AWS in this region</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {costsByRegionAWS.map((cost, index) => {
                                            const isBest = bestAWS && cost.total_month === bestAWS.total_month;
                                            const isMinimal = minimalAWS && cost.total_month === minimalAWS.total_month;
                                            return (
                                                <div key={`aws-${index}`} className="rounded-lg bg-white/6 px-3 py-3 sm:px-4">
                                                    <div className="mb-1.5 flex items-start justify-between gap-2">
                                                        <span className="text-xs font-medium text-white/90">{cost.purchase_type} {cost.lease_contract_length && `(${cost.lease_contract_length})`}</span>
                                                        <span className={`shrink-0 text-[10px] font-bold ${cost.within_budget ? "text-green-400" : "text-red-400"}`}>
                                                            {cost.within_budget ? "Within Budget" : "Over Budget"}
                                                        </span>
                                                    </div>
                                                    <div className="mb-2 text-[10px] text-white/55">
                                                        {cost.instance_type} • {cost.vcpus} vCPUs • {cost.memory_gb} GB RAM
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm font-bold text-white">
                                                        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Monthly</span>
                                                        <span>{formatCurrency(cost.total_month)}</span>
                                                    </div>
                                                    {(isBest || isMinimal) && (
                                                        <span className="text-[10px] font-bold text-blue-400 mt-2 inline-block">
                                                            {isMinimal ? "MINIMAL COST" : "BEST IN BUDGET"}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="rounded-lg bg-white/4 p-4">
                                <div className="mb-4">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                                        Azure
                                    </p>
                                    <p className="mt-0.5 text-xs font-semibold text-white">
                                        {getRegionDisplayName(genericRegion.azure, "azure")}
                                    </p>
                                </div>
                                {costsByRegionAzure.length === 0 ? (
                                    <div className="py-6 text-center text-xs text-white/50">
                                        <Server className="mx-auto mb-2 h-8 w-8 opacity-40" />
                                        <p>No instances found for Azure in this region</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {costsByRegionAzure.map((cost, index) => {
                                            const isBest = bestAzure && cost.total_month === bestAzure.total_month;
                                            const isMinimal = minimalAzure && cost.total_month === minimalAzure.total_month;
                                            return (
                                                <div key={`azure-${index}`} className="rounded-lg bg-white/6 px-3 py-3 sm:px-4">
                                                    <div className="mb-1.5 flex items-start justify-between gap-2">
                                                        <span className="text-xs font-medium text-white/90">{cost.purchase_type} {cost.lease_contract_length && `(${cost.lease_contract_length})`}</span>
                                                        <span className={`shrink-0 text-[10px] font-bold ${cost.within_budget ? "text-green-400" : "text-red-400"}`}>
                                                            {cost.within_budget ? "Within Budget" : "Over Budget"}
                                                        </span>
                                                    </div>
                                                    <div className="mb-2 text-[10px] text-white/55">
                                                        {cost.instance_type} • {cost.vcpus} vCPUs • {cost.memory_gb} GB RAM
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm font-bold text-white">
                                                        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Monthly</span>
                                                        <span>{formatCurrency(cost.total_month)}</span>
                                                    </div>
                                                    {(isBest || isMinimal) && (
                                                        <span className="text-[10px] font-bold text-blue-400 mt-2 inline-block">
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
                        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                            <h2 className="text-sm font-semibold text-white">Pricing Options Breakdown</h2>
                            <div className="text-[10px] text-white/50">
                                Showing {currentCosts.length} pricing option{currentCosts.length !== 1 ? 's' : ''}
                                {compareRegionsEnabled && selectedRegions.length > 1 && (
                                    <span className="ml-1.5">
                                        across {selectedRegions.length} regions
                                    </span>
                                )}
                            </div>
                        </div>

                        {currentCosts.length === 0 ? (
                            <div className="rounded-lg bg-white/4 px-4 py-12 text-center">
                                <Server className="mx-auto mb-3 h-10 w-10 text-white/35" />
                                <p className="text-xs text-white/60">No instances found for {selectedProvider.toUpperCase()}</p>
                                {selectedRegions.length > 0 && <p className="mt-2 text-[10px] text-white/45">in selected region(s)</p>}
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-lg bg-white/4 divide-y divide-white/40">
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
                                            id={`cost-plan-${planId}`}
                                            key={planId}
                                            className="relative scroll-mt-24 overflow-hidden px-4 py-5 transition-all sm:px-5"
                                        >
                                            {/* Left side accent */}
                                            {(isBest || isMinimal) && (
                                                <div className={`absolute bottom-0 left-0 top-0 w-1 bg-white`}></div>
                                            )}

                                            {/* Plan Header */}
                                            <div className="mb-4 flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                                        <h3 className="text-sm font-semibold text-white">
                                                            {cost.purchase_type}
                                                            {cost.lease_contract_length && (
                                                                <span className="ml-1.5 text-xs font-normal text-white/55">
                                                                    ({cost.lease_contract_length})
                                                                </span>
                                                            )}
                                                        </h3>
                                                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${cost.within_budget
                                                            ? "border border-green-600/40 bg-green-600/25 text-green-400"
                                                            : "border border-red-500/30 bg-red-600/20 text-red-300"
                                                            }`}>

                                                            {cost.within_budget ? "Within Budget" : "Over Budget"}
                                                        </span>
                                                        {(isMinimal) && (
                                                            <div>
                                                                {isMinimal && (
                                                                    <div className="bg-blue-900 text-blue-300 px-3 py-1 text-[10px] font-bold rounded-bl-lg">
                                                                        MINIMAL COST
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/55">
                                                        <div className="flex items-center gap-1">
                                                            <Building className="h-3.5 w-3.5 shrink-0" />
                                                            <span>{cost.instance_type} • {cost.vcpus} vCPUs • {cost.memory_gb} GB RAM</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                                                            <span>{getRegionDisplayName(cost.region, selectedProvider)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Users className="h-3.5 w-3.5 shrink-0" />
                                                            <span>{cost.nodes} nodes</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => toggleBreakdown(planId)}
                                                    className="flex shrink-0 items-center gap-1.5 text-xs text-white/80 transition-opacity hover:opacity-100"
                                                >
                                                    <ChevronDown
                                                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                    />
                                                    {isExpanded ? 'Hide Details' : 'Show Details'}
                                                </button>
                                            </div>

                                            {/* Cost Summary */}
                                            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                                                {/* Per Node Cost */}
                                                <div className="rounded-lg bg-white/6 p-3">
                                                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/80">
                                                        <Server className="h-3.5 w-3.5" />
                                                        Per Node Cost
                                                    </h4>
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] text-white/50">Hourly Rate</span>
                                                            <span className="text-xs font-semibold text-white">
                                                                ${cost.price_per_node_hour.toFixed(3)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] text-white/50">Monthly Estimate</span>
                                                            <span className="text-xs font-semibold text-white">
                                                                {formatCurrency(cost.price_per_node_month)}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 border-t border-white/40 pt-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-white/60">Total for {cost.nodes} nodes</span>
                                                                <span className="text-xs font-semibold text-white">
                                                                    {formatCurrency(totalNodeMonthly)}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 text-[10px] text-white/45">
                                                                ${cost.price_per_node_hour.toFixed(3)} × {cost.nodes} nodes × 730h
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Control Plane Cost */}
                                                <div className="rounded-lg bg-white/6 p-3">
                                                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/80">
                                                        <Target className="h-3.5 w-3.5" />
                                                        Control Plane
                                                    </h4>
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] text-white/50">Tier</span>
                                                            <span className="text-xs font-semibold text-white">
                                                                {cost.control_plane_tier.charAt(0).toUpperCase() + cost.control_plane_tier.slice(1)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] text-white/50">Hourly Cost</span>
                                                            <span className="text-xs font-semibold text-white">
                                                                ${cost.control_plane_hour.toFixed(3)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] text-white/50">Monthly Cost</span>
                                                            <span className="text-xs font-semibold text-white">
                                                                {formatCurrency(cost.control_plane_month)}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1.5 text-[10px] text-white/45">
                                                            Fixed cost for cluster management
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Total Cluster Cost */}
                                                <div className="rounded-lg bg-white/6 p-3">
                                                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
                                                        <Calculator className="h-3.5 w-3.5" />
                                                        Total Cluster Cost
                                                    </h4>
                                                    <div className="space-y-2.5">
                                                        <div>
                                                            <div className="mb-0.5 flex items-center justify-between">
                                                                <span className="text-[10px] text-white/60">Hourly Total</span>
                                                                <span className="text-base font-bold text-white">
                                                                    ${cost.total_hour.toFixed(3)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-white/45">
                                                                ${totalNodeHourly.toFixed(3)} (nodes) + ${cost.control_plane_hour.toFixed(3)} (control)
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="mb-0.5 flex items-center justify-between">
                                                                <span className="text-[10px] uppercase tracking-wide text-white/50">Monthly Total</span>
                                                                <span className="text-lg font-bold text-white">
                                                                    {formatCurrency(cost.total_month)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-white/45">
                                                                ${totalNodeMonthly.toFixed(2)} (nodes) + ${cost.control_plane_month.toFixed(2)} (control)
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Budget Comparison */}
                                            <div className="mb-4 rounded-lg bg-white/6 p-3">
                                                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/80">
                                                    <BarChart3 className="h-3.5 w-3.5" />
                                                    Budget Comparison
                                                </h4>
                                                <div className="space-y-2.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-white/60">Monthly Budget</span>
                                                        <span className="text-xs font-semibold text-white">{formatCurrency(cost.budget_month)}</span>
                                                    </div>
                                                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                                        <div
                                                            className={`h-full ${cost.within_budget ? 'bg-green-600' : 'bg-red-600'} transition-all duration-500`}
                                                            style={{
                                                                width: `${Math.min(100, budgetPercentage)}%`
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-white/45">
                                                        <span>0%</span>
                                                        <span className={cost.within_budget ? 'text-green-500' : 'text-red-500'}>
                                                            {budgetPercentage.toFixed(1)}%
                                                        </span>
                                                        <span>100%+</span>
                                                    </div>
                                                    <div className="flex items-center justify-between border-t border-white/40 pt-2">
                                                        <span className="text-[10px] text-white/55">Status</span>
                                                        <span className={`text-xs font-semibold ${cost.within_budget ? 'text-green-500' : 'text-red-500'}`}>
                                                            {cost.within_budget ? 'Within Budget' : `Over Budget by ${formatCurrency(monthlyBudgetExcess)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Detailed Breakdown */}
                                            {isExpanded && (
                                                <div className="border-t border-white/40 pt-4">
                                                    <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-white">
                                                        <PieChart className="h-4 w-4" />
                                                        Detailed Calculation Breakdown
                                                    </h4>

                                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                        {/*Base Calculations */}
                                                        <div className="space-y-3">
                                                            <div className="rounded-lg bg-white/6 p-3">
                                                                <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
                                                                    <Clock className="h-3.5 w-3.5" />
                                                                    Hourly Cost Calculation
                                                                </h5>
                                                                <div className="space-y-1.5 text-[10px] text-white/80">
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Node hourly cost:</span>
                                                                        <span className="font-mono">${cost.price_per_node_hour.toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Total nodes hourly:</span>
                                                                        <span className="text-right font-mono">
                                                                            ${cost.price_per_node_hour.toFixed(3)} × {cost.nodes} = ${totalNodeHourly.toFixed(3)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Control plane hourly:</span>
                                                                        <span className="font-mono">${cost.control_plane_hour.toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="mt-2 border-t border-white/40 pt-2">
                                                                        <div className="flex justify-between gap-2 font-semibold text-white">
                                                                            <span>TOTAL HOURLY:</span>
                                                                            <span className="text-right font-mono">
                                                                                ${totalNodeHourly.toFixed(3)} + ${cost.control_plane_hour.toFixed(3)} = ${cost.total_hour.toFixed(3)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="rounded-lg bg-white/6 p-3">
                                                                <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
                                                                    <Calendar className="h-3.5 w-3.5" />
                                                                    Monthly Cost Calculation
                                                                </h5>
                                                                <div className="space-y-1.5 text-[10px] text-white/80">
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Node monthly cost:</span>
                                                                        <span className="text-right font-mono">
                                                                            ${cost.price_per_node_hour.toFixed(3)} × 730h = ${cost.price_per_node_month.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Total nodes monthly:</span>
                                                                        <span className="text-right font-mono">
                                                                            ${cost.price_per_node_month.toFixed(2)} × {cost.nodes} = ${totalNodeMonthly.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Control plane monthly:</span>
                                                                        <span className="text-right font-mono">
                                                                            ${cost.control_plane_hour.toFixed(3)} × 730h = ${cost.control_plane_month.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="mt-2 border-t border-white/40 pt-2">
                                                                        <div className="flex justify-between gap-2 font-semibold text-white">
                                                                            <span>TOTAL MONTHLY:</span>
                                                                            <span className="text-right font-mono">
                                                                                ${totalNodeMonthly.toFixed(2)} + ${cost.control_plane_month.toFixed(2)} = ${cost.total_month.toFixed(2)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/*Budget & Savings */}
                                                        <div className="space-y-3">
                                                            <div className="rounded-lg bg-white/6 p-3">
                                                                <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
                                                                    <Target className="h-3.5 w-3.5" />
                                                                    Budget Analysis
                                                                </h5>
                                                                <div className="space-y-1.5 text-[10px] text-white/80">
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Available budget:</span>
                                                                        <span className="font-mono">${cost.budget_month.toFixed(2)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Cluster cost:</span>
                                                                        <span className="font-mono">${cost.total_month.toFixed(2)}</span>
                                                                    </div>
                                                                    <div className="mt-2 border-t border-white/40 pt-2">
                                                                        <div className={`flex justify-between gap-2 font-semibold ${monthlyBudgetExcess > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                                            <span>{monthlyBudgetExcess > 0 ? 'OVER BUDGET BY:' : 'UNDER BUDGET BY:'}</span>
                                                                            <span className="font-mono">
                                                                                ${Math.abs(monthlyBudgetExcess).toFixed(2)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-2 border-t border-white/40 pt-2">
                                                                        <div className="flex justify-between gap-2">
                                                                            <span className="text-white/50">Budget utilization:</span>
                                                                            <span className={`font-semibold ${budgetPercentage > 100 ? 'text-red-500' : budgetPercentage > 80 ? 'text-yellow-500' : 'text-green-500'}`}>
                                                                                {budgetPercentage.toFixed(1)}%
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="rounded-lg bg-white/6 p-3">
                                                                <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
                                                                    <TrendingUp className="h-3.5 w-3.5" />
                                                                    Cost Efficiency
                                                                </h5>
                                                                <div className="space-y-1.5 text-[10px] text-white/80">
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Cost per node per hour:</span>
                                                                        <span className="font-mono">${cost.price_per_node_hour.toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Cost per node per month:</span>
                                                                        <span className="font-mono">{formatCurrency(cost.price_per_node_month)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between gap-2">
                                                                        <span className="text-white/50">Control plane % of total:</span>
                                                                        <span className="font-mono">
                                                                            {((cost.control_plane_month / cost.total_month) * 100).toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                    <div className="mt-2 border-t border-white/40 pt-2">
                                                                        <div className="flex justify-between gap-2">
                                                                            <span className="text-white/50">Average hourly cost:</span>
                                                                            <span className="font-mono">${(cost.total_hour / cost.nodes).toFixed(3)}/node</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="mt-4 border-t border-white/40 pt-3">
                                                        <h5 className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-white/45">
                                                            <Info className="h-3.5 w-3.5" />
                                                            Calculation Assumptions
                                                        </h5>
                                                        <div className="grid grid-cols-1 gap-3 text-[10px] text-white/45 md:grid-cols-3">
                                                            <div className="flex items-start gap-2">
                                                                <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/30"></div>
                                                                <span>1 month = 730 hours (24h × 30 days)</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/30"></div>
                                                                <span>Control plane cost is fixed per cluster</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/30"></div>
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
                <div className="mt-8 border-t border-white/40 pt-6">
                    <div className="text-center text-[10px] text-white/45">
                        <p className="mt-1">Prices are estimates based on public pricing and may vary based on actual usage, commitments, and additional services</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CostRunDetailPage() {
    const params = useParams();
    const requestId = params.id as string;
    return <CostRunDetail requestId={requestId} />;
}