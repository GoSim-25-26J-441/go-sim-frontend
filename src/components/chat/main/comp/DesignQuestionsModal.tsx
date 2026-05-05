/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Server,
  Cpu,
  MemoryStick,
  Users,
  DollarSign,
  Boxes,
  Loader2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import type { DesignByProjectRunResponse, Question } from "@/app/store/designApi";
import { resolveRequestedNodes } from "@/lib/simulation/simulation-node-counts";
import {
  useGetRequirementsQuestionsQuery,
  useSaveDesignMutation,
  useLazyGetDesignByProjectRunQuery,
} from "@/app/store/designApi";

interface DesignAnswers {
  preferred_vcpu?: number;
  preferred_memory_gb?: number;
  concurrent_users?: number;
  budget?: number;
  [key: string]: number | undefined;
}

export interface DesignModalSubmitPayload {
  design: Record<string, any>;
  simulation?: { nodes: number };
}

interface DesignQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: DesignModalSubmitPayload) => void;
  onSkip: () => void;
  onDesignLoaded?: (payload: {
    design: Record<string, any>;
    simulation?: { nodes: number };
  }) => void;
  initialDesign?: Record<string, any>;
  /** Prefill host/node count when reopening before refetch completes */
  initialSimulation?: { nodes?: number };
  projectId?: string;
  userId?: string;
}

// Icon map for known question IDs
const questionIconMap: Record<string, React.ReactNode> = {
  preferred_vcpu: <Cpu className="w-4 h-4" />,
  preferred_memory_gb: <MemoryStick className="w-4 h-4" />,
  concurrent_users: <Users className="w-4 h-4" />,
  budget: <DollarSign className="w-4 h-4" />,
};

const questionUnitMap: Record<string, string> = {
  preferred_vcpu: "vCPU",
  preferred_memory_gb: "GB",
  budget: "USD",
};

const questionHintMap: Record<string, string> = {
  preferred_vcpu: "Number of virtual CPU cores for compute workloads",
  preferred_memory_gb: "Total RAM allocation across your infrastructure",
  concurrent_users: "Peak simultaneous user connections expected",
  budget: "Monthly infrastructure spend limit",
};

function buildDesignFromAnswers(answers: DesignAnswers) {
  const design: Record<string, any> = {};
  if (answers.concurrent_users !== undefined)
    design.workload = { concurrent_users: answers.concurrent_users };
  if (answers.preferred_vcpu !== undefined)
    design.preferred_vcpu = answers.preferred_vcpu;
  if (answers.preferred_memory_gb !== undefined)
    design.preferred_memory_gb = answers.preferred_memory_gb;
  if (answers.budget !== undefined) design.budget = answers.budget;
  Object.keys(answers).forEach((key) => {
    if (
      ![
        "concurrent_users",
        "preferred_vcpu",
        "preferred_memory_gb",
        "budget",
      ].includes(key) &&
      answers[key] !== undefined
    )
      design[key] = answers[key];
  });
  return design;
}

function answersFromDesign(design: Record<string, any> | undefined, questions: Question[]): DesignAnswers {
  const init: DesignAnswers = {};
  questions.forEach((q) => {
    if (design) {
      if (
        q.id === "concurrent_users" &&
        design.workload?.concurrent_users !== undefined
      ) {
        init[q.id] = design.workload.concurrent_users;
      } else {
        init[q.id] = (design as any)[q.id] ?? undefined;
      }
    } else {
      init[q.id] = undefined;
    }
  });
  return init;
}

function areAnswerMapsEqual(a: DesignAnswers, b: DesignAnswers): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * When the saved request includes only `simulation` (no `design` key), we must
 * not merge `initialDesign` after fetch settles — that would hide host count and
 * show stale design fields. While the by-project-run query is loading, keep
 * merging `initialDesign` so locally applied values stay visible.
 */
function pickDesignForModal(
  userId: string | undefined,
  projectId: string | undefined,
  designLoading: boolean,
  designByRunData: DesignByProjectRunResponse | undefined,
  initialDesign: Record<string, any> | undefined,
): Record<string, any> | undefined {
  const awaitingFetch = Boolean(userId && projectId && designLoading);

  if (awaitingFetch) {
    return (
      (designByRunData?.request?.design as Record<string, any> | undefined) ??
      initialDesign ??
      undefined
    );
  }

  if (!userId || !projectId) {
    return initialDesign ?? undefined;
  }

  const request = designByRunData?.request;
  if (request == null) {
    return initialDesign ?? undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(request, "design")) {
    return undefined;
  }

  const d = request.design;
  if (d == null || typeof d !== "object" || Array.isArray(d)) {
    return undefined;
  }
  return d as Record<string, any>;
}

export default function DesignQuestionsModal({
  isOpen,
  onClose,
  onSubmit,
  onSkip,
  onDesignLoaded,
  initialDesign,
  initialSimulation,
  projectId,
  userId,
}: DesignQuestionsModalProps) {
  const [answers, setAnswers] = useState<DesignAnswers>({});
  const [simulationNodes, setSimulationNodes] = useState<number | undefined>(
    undefined,
  );
  const [enabled, setEnabled] = useState(false);
  const lastNotifiedRef = useRef<string | null>(null);

  const { data: questionsData, isLoading: questionsLoading } =
    useGetRequirementsQuestionsQuery(undefined, { skip: !isOpen });

  const [fetchDesignByProjectRun, { data: designByRunData, isLoading: designLoading }] =
    useLazyGetDesignByProjectRunQuery();

  const [saveDesign, { isLoading: saving }] = useSaveDesignMutation();

  const questions: Question[] = useMemo(() => {
    const data = questionsData;
    if (
      !data?.ok ||
      !data.enabled ||
      !Array.isArray(data.questions) ||
      data.questions.length === 0
    )
      return [];
    return data.questions
      .map((q: any) => ({
        id: q.ID || q.id || "",
        label: q.Label || q.label || "",
        type: (q.Type || q.type || "text").toLowerCase() as "number" | "text" | "textarea",
        placeholder: q.Placeholder || q.placeholder,
      }))
      .filter((q: Question) => q.id && q.label);
  }, [questionsData]);

  useEffect(() => {
    if (!isOpen) return;
    setEnabled(questions.length > 0);
  }, [isOpen, questions.length]);

  // When modal opens and we have project/user, fetch saved design to prefill form
  useEffect(() => {
    if (!isOpen || !userId || !projectId) return;
    fetchDesignByProjectRun({ userId, projectId });
  }, [isOpen, userId, projectId, fetchDesignByProjectRun]);

  // Populate answers and host count independently; design prefill must not
  // swallow simulation-only saves (see pickDesignForModal).
  useEffect(() => {
    if (questions.length === 0) return;
    const design = pickDesignForModal(
      userId,
      projectId,
      designLoading,
      designByRunData,
      initialDesign,
    );
    const rawNodes =
      resolveRequestedNodes(undefined, designByRunData?.request) ??
      initialSimulation?.nodes ??
      undefined;
    const normalizedNodes =
      typeof rawNodes === "number" &&
      Number.isFinite(rawNodes) &&
      rawNodes >= 1
        ? Math.floor(rawNodes)
        : undefined;

    const nextAnswers = answersFromDesign(design, questions);
    setAnswers((prev) =>
      areAnswerMapsEqual(prev, nextAnswers) ? prev : nextAnswers,
    );
    setSimulationNodes((prev) =>
      prev === normalizedNodes ? prev : normalizedNodes,
    );

    const requestedNodesFromSaved = resolveRequestedNodes(
      undefined,
      designByRunData?.request,
    );
    const mergedDesign = design ?? {};
    const shouldNotify =
      Object.keys(mergedDesign).length > 0 ||
      (requestedNodesFromSaved != null && requestedNodesFromSaved >= 1);

    const deferNotifyPendingFetch = Boolean(userId && projectId && designLoading);

    const notifyPayload = {
      design: mergedDesign,
      simulation:
        requestedNodesFromSaved != null && requestedNodesFromSaved >= 1
          ? { nodes: requestedNodesFromSaved }
          : undefined,
    };

    const notifyKey = JSON.stringify({
      design: notifyPayload.design,
      simulationNodes: notifyPayload.simulation?.nodes ?? null,
      deferNotifyPendingFetch,
      shouldNotify,
    });

    if (
      !deferNotifyPendingFetch &&
      shouldNotify &&
      onDesignLoaded &&
      lastNotifiedRef.current !== notifyKey
    ) {
      lastNotifiedRef.current = notifyKey;
      onDesignLoaded(notifyPayload);
    }
  }, [
    questions,
    designByRunData,
    initialDesign,
    initialSimulation?.nodes,
    designLoading,
    userId,
    projectId,
    onDesignLoaded,
  ]);
 
  const handleSimulationNodesChange = (value: string) => {
    if (value === "") {
      setSimulationNodes(undefined);
      return;
    }
    if (!/^\d+$/.test(value)) return;
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    setSimulationNodes(n >= 1 ? n : undefined);
  };

  const handleChange = (questionId: string, value: string, type: string) => {
    if (type === "number") {
      // Allow empty string (clear field), or valid positive numeric strings only
      // Permit digits and a single decimal point while typing — no minus sign
      if (value === "") {
        setAnswers((prev) => ({ ...prev, [questionId]: undefined }));
        return;
      }
      // Block anything that isn't a positive numeric pattern
      if (!/^\d*\.?\d*$/.test(value)) return;
      const num = parseFloat(value);
      // Keep raw string in a separate display map; only commit valid positive numbers
      setAnswers((prev) => ({
        ...prev,
        [questionId]: isNaN(num) ? undefined : Math.max(0, num),
      }));
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: value as any }));
    }
  };

  const loading = questionsLoading || designLoading;

  const handleSubmit = async () => {
    const design = buildDesignFromAnswers(answers);
    const simulation =
      simulationNodes !== undefined &&
      simulationNodes >= 1 &&
      Number.isFinite(simulationNodes)
        ? { nodes: Math.floor(simulationNodes) }
        : undefined;

    // Save to backend if we have user and project
    if (userId && projectId) {
      try {
        await saveDesign({
          user_id: userId,
          project_id: projectId,
          design,
          ...(simulation ? { simulation } : {}),
        }).unwrap();
      } catch {
        // Save failed – still proceed with onSubmit per requirements
      }
    }

    onSubmit({ design, ...(simulation ? { simulation } : {}) });
    onClose();
  };

  const hostFieldFilled =
    simulationNodes !== undefined &&
    simulationNodes >= 1 &&
    Number.isFinite(simulationNodes);
  const filledCount =
    Object.values(answers).filter((v) => v !== undefined && v !== null).length +
    (hostFieldFilled ? 1 : 0);
  const totalCount = questions.length + 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md">
      <div
        className="relative flex flex-col w-full mx-4 overflow-hidden rounded-md shadow-xl bg-[#1F1F1F]"
        style={{
          maxWidth: "40rem",
          maxHeight: "90vh",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
          }}
        />

        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-white/70" />
            <div>
              <h2 className="text-white font-semibold text-base leading-none">
                Server Design Requirements
              </h2>
              <p
                className="text-xs mt-1"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Configure your infrastructure parameters
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!loading && enabled && totalCount > 0 && (
          <div
            className="px-6 py-3 flex items-center gap-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width:
                    totalCount > 0
                      ? `${(filledCount / totalCount) * 100}%`
                      : "0%",
                  backgroundColor:
                    filledCount === totalCount
                      ? "#34d399"
                      : "rgba(255,255,255,0.4)",
                }}
              />
            </div>
            <span
              className="text-xs flex-shrink-0"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              {filledCount}/{totalCount} filled
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-2xl"
                style={{
                  backgroundColor: "#000",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                />
              </div>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                Loading configuration options…
              </p>
            </div>
          ) : !enabled || questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-2xl"
                style={{
                  backgroundColor: "#000",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <AlertCircle
                  className="w-5 h-5"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white/70 mb-1">
                  Design parameters unavailable
                </p>
                <p
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  You can continue to chat without specifying design
                  requirements.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p
                className="text-xs mb-5"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Provide the following parameters to receive tailored server
                architecture recommendations. All fields are optional but
                improve recommendation accuracy.
              </p>

              {questions.map((question) => {
                const hasValue =
                  answers[question.id] !== undefined &&
                  answers[question.id] !== null;
                const icon = questionIconMap[question.id];
                const unit = questionUnitMap[question.id];
                const hint = questionHintMap[question.id];

                return (
                  <div
                    key={question.id}
                    className="rounded-xl overflow-hidden transition-all duration-200"
                  >
                    <div className="flex items-center gap-2.5 pt-3 pb-1">
                      {icon && (
                        <span
                          style={{
                            color: hasValue
                              ? "rgba(255,255,255,0.6)"
                              : "rgba(255,255,255,0.25)",
                          }}
                        >
                          {icon}
                        </span>
                      )}
                      <label
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          hasValue ? "text-white/30" : "text-white"
                        }`}
                      >
                        {question.label}
                      </label>
                      {hasValue && (
                        <span
                          className="ml-auto text-xs px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: "rgba(52,211,153,0.1)",
                            color: "#6ee7b7",
                            border: "1px solid rgba(52,211,153,0.2)",
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </div>

                    {hint && (
                      <p
                        className="pb-2 text-xs text-white/60"
                      >
                        {hint}
                      </p>
                    )}

                    <div className="relative flex items-center pb-3">
                      {question.type === "textarea" ? (
                        <textarea
                          value={answers[question.id]?.toString() || ""}
                          onChange={(e) =>
                            handleChange(
                              question.id,
                              e.target.value,
                              question.type,
                            )
                          }
                          placeholder={question.placeholder || "Enter value…"}
                          rows={3}
                          className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none placeholder:text-white/15"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            color: "#fff",
                          }}
                        />
                      ) : (
                        <div className="relative flex items-center w-full">
                          <input
                            type={question.type}
                            value={answers[question.id]?.toString() || ""}
                            onChange={(e) =>
                              handleChange(
                                question.id,
                                e.target.value,
                                question.type,
                              )
                            }
                            placeholder={question.placeholder || "0"}
                            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none placeholder:text-white/15"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.07)",
                              color: "#fff",
                              paddingRight: unit ? "3.5rem" : "0.75rem",
                            }}
                          />
                          {unit && (
                            <span
                              className="absolute right-3 text-xs font-mono pointer-events-none"
                              style={{ color: "rgba(255,255,255,0.25)" }}
                            >
                              {unit}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="rounded-xl overflow-hidden transition-all duration-200">
                <div className="flex items-center gap-2.5 pt-3 pb-1">
                  <span
                    style={{
                      color: hostFieldFilled
                        ? "rgba(255,255,255,0.6)"
                        : "rgba(255,255,255,0.25)",
                    }}
                  >
                    <Boxes className="w-4 h-4" />
                  </span>
                  <label
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      hostFieldFilled ? "text-white/30" : "text-white"
                    }`}
                  >
                    Requested nodes
                  </label>
                  {hostFieldFilled && (
                    <span
                      className="ml-auto text-xs px-1.5 py-0.5 rounded-md"
                      style={{
                        backgroundColor: "rgba(52,211,153,0.1)",
                        color: "#6ee7b7",
                        border: "1px solid rgba(52,211,153,0.2)",
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
                <p className="pb-2 text-xs text-white/60">
                  Original cluster size requirement for modeling (integer, minimum 1).
                </p>
                <div className="relative flex items-center pb-3">
                  <div className="relative flex items-center w-full">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={
                        simulationNodes !== undefined
                          ? String(simulationNodes)
                          : ""
                      }
                      onChange={(e) =>
                        handleSimulationNodesChange(e.target.value)
                      }
                      placeholder="e.g. 3"
                      className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none placeholder:text-white/15"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        color: "#fff",
                        paddingRight: "3.5rem",
                      }}
                    />
                    <span
                      className="absolute right-3 text-xs font-mono pointer-events-none"
                      style={{ color: "rgba(255,255,255,0.25)" }}
                    >
                      nodes
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            type="button"
            onClick={() => {
              onSkip();
              onClose();
            }}
            disabled={saving}
            className="text-sm transition-all duration-150 px-2 py-1 rounded-md disabled:opacity-40 disabled:pointer-events-none"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "rgba(255,255,255,0.7)";
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "rgba(255,255,255,0.35)";
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "transparent";
            }}
          >
            Skip for now
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading || saving || !enabled || questions.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150"
            style={{
              backgroundColor:
                loading || saving || !enabled || questions.length === 0
                  ? "rgba(255,255,255,0.06)"
                  : "#fff",
              color:
                loading || saving || !enabled || questions.length === 0
                  ? "rgba(255,255,255,0.2)"
                  : "#000",
              cursor:
                loading || saving || !enabled || questions.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </>
            ) : saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Apply Configuration
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
