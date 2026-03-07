// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";

// import { useEffect, useState } from "react";
// import { X } from "lucide-react";
// import { getFirebaseIdToken } from "@/lib/firebase/auth";

// interface Question {
//   id: string;
//   label: string;
//   type: "number" | "text" | "textarea";
//   placeholder?: string;
// }

// interface QuestionsResponse {
//   ok: boolean;
//   enabled: boolean;
//   questions?: Question[];
//   error?: string;
// }

// interface DesignAnswers {
//   preferred_vcpu?: number;
//   preferred_memory_gb?: number;
//   concurrent_users?: number;
//   budget?: number;
//   [key: string]: number | undefined;
// }

// interface DesignQuestionsModalProps {
//   isOpen: boolean;
//   onClose: () => void;
//   onSubmit: (design: DesignAnswers) => void;
//   onSkip: () => void;
//   initialDesign?: Record<string, any>;
// }

// export default function DesignQuestionsModal({
//   isOpen,
//   onClose,
//   onSubmit,
//   onSkip,
//   initialDesign,
// }: DesignQuestionsModalProps) {
//   const [questions, setQuestions] = useState<Question[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [answers, setAnswers] = useState<DesignAnswers>({});
//   const [enabled, setEnabled] = useState(false);

//   useEffect(() => {
//     if (!isOpen) return;

//     async function fetchQuestions() {
//       setLoading(true);
//       try {
//         const token = await getFirebaseIdToken();
//         if (!token) {
//           throw new Error("No authentication token available");
//         }

//         const res = await fetch("/api/design-input/rag/requirements-questions", {
//           method: "GET",
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//           cache: "no-store",
//         });

//         if (!res.ok) {
//           const errorText = await res.text();
//           console.error("Failed to fetch questions:", res.status, errorText);
//           throw new Error(`Failed to fetch questions: ${res.status}`);
//         }

//         const data: QuestionsResponse = await res.json();
//         console.log("Design questions response:", data);

//         if (data.ok && data.enabled && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
//           console.log("Setting questions:", data.questions);
//           const normalizedQuestions: Question[] = data.questions.map((q: any) => ({
//             id: q.ID || q.id || "",
//             label: q.Label || q.label || "",
//             type: ((q.Type || q.type || "text").toLowerCase() as "number" | "text" | "textarea"),
//             placeholder: q.Placeholder || q.placeholder,
//           })).filter((q) => q.id && q.label);

//           if (normalizedQuestions.length > 0) {
//             setQuestions(normalizedQuestions);
//             setEnabled(true);
//             const initialAnswers: DesignAnswers = {};
//             normalizedQuestions.forEach((q) => {
//               if (initialDesign) {
//                 if (q.id === "concurrent_users" && initialDesign.workload?.concurrent_users !== undefined) {
//                   initialAnswers[q.id] = initialDesign.workload.concurrent_users;
//                 } else if (initialDesign[q.id] !== undefined) {
//                   initialAnswers[q.id] = initialDesign[q.id];
//                 } else {
//                   initialAnswers[q.id] = undefined;
//                 }
//               } else {
//                 initialAnswers[q.id] = undefined;
//               }
//             });
//             setAnswers(initialAnswers);
//             console.log("Initial answers set:", initialAnswers);
//           } else {
//             console.warn("No valid questions after normalization");
//             setEnabled(false);
//             setQuestions([]);
//           }
//         } else {
//           console.warn("Design questions not enabled or empty:", {
//             ok: data.ok,
//             enabled: data.enabled,
//             questionsLength: data.questions?.length,
//             questionsType: typeof data.questions,
//             isArray: Array.isArray(data.questions),
//             error: data.error,
//             fullResponse: data,
//           });
//           setEnabled(false);
//           setQuestions([]);
//         }
//       } catch (error) {
//         console.error("Failed to fetch design questions:", error);
//         setEnabled(false);
//         setQuestions([]);
//       } finally {
//         setLoading(false);
//       }
//     }

//     fetchQuestions();
//   }, [isOpen, initialDesign]);

//   const handleChange = (questionId: string, value: string) => {
//     setAnswers((prev) => ({
//       ...prev,
//       [questionId]: value === "" ? undefined : parseFloat(value),
//     }));
//   };

//   const handleSubmit = () => {
//     const design: any = {};

//     if (answers.concurrent_users !== undefined) {
//       design.workload = { concurrent_users: answers.concurrent_users };
//     }

//     if (answers.preferred_vcpu !== undefined) {
//       design.preferred_vcpu = answers.preferred_vcpu;
//     }
//     if (answers.preferred_memory_gb !== undefined) {
//       design.preferred_memory_gb = answers.preferred_memory_gb;
//     }
//     if (answers.budget !== undefined) {
//       design.budget = answers.budget;
//     }

//     Object.keys(answers).forEach((key) => {
//       if (
//         key !== "concurrent_users" &&
//         key !== "preferred_vcpu" &&
//         key !== "preferred_memory_gb" &&
//         key !== "budget" &&
//         answers[key] !== undefined
//       ) {
//         design[key] = answers[key];
//       }
//     });

//     onSubmit(design);
//     onClose();
//   };

//   if (!isOpen) return null;

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
//       <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
//         <div className="flex items-center justify-between p-4 border-b border-gray-800">
//           <h2 className="text-lg font-semibold text-white">Design Requirements</h2>
//           <button
//             onClick={onClose}
//             className="text-gray-400 hover:text-white transition-colors"
//           >
//             <X className="w-5 h-5" />
//           </button>
//         </div>

//         <div className="flex-1 overflow-y-auto p-6">
//           {loading ? (
//             <div className="text-center text-gray-400 py-8">
//               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
//               Loading questions...
//             </div>
//           ) : !enabled || questions.length === 0 ? (
//             <div className="text-center text-gray-400 py-8">
//               <p className="mb-2">Design questions are not available at this time.</p>
//               <p className="text-xs text-gray-500">
//                 You can still use the chat without providing design requirements.
//               </p>
//               <p className="text-xs text-gray-500 mt-2">
//                 Click {'"'}Skip{'"'} to continue.
//               </p>
//             </div>
//           ) : (
//             <div className="space-y-4">
//               <p className="text-sm text-gray-400 mb-4">
//                 Please provide the following information to help us better assist you with your design:
//               </p>
//               {questions.map((question) => (
//                 <div key={question.id}>
//                   <label className="block text-sm font-medium text-gray-300 mb-2">
//                     {question.label}
//                   </label>
//                   {question.type === "textarea" ? (
//                     <textarea
//                       key={`textarea-${question.id}`}
//                       value={answers[question.id]?.toString() || ""}
//                       onChange={(e) => handleChange(question.id, e.target.value)}
//                       placeholder={question.placeholder}
//                       className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
//                       rows={3}
//                     />
//                   ) : (
//                     <input
//                       key={`input-${question.id}`}
//                       type={question.type}
//                       value={answers[question.id]?.toString() || ""}
//                       onChange={(e) => handleChange(question.id, e.target.value)}
//                       placeholder={question.placeholder}
//                       className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
//                     />
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>

//         <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
//           <button
//             onClick={onSkip}
//             className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
//           >
//             Skip
//           </button>
//           <button
//             onClick={handleSubmit}
//             disabled={loading || !enabled || questions.length === 0}
//             className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//           >
//             Submit
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Server,
  Cpu,
  MemoryStick,
  Users,
  DollarSign,
  Loader2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import type { Question } from "@/app/store/designApi";
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

interface DesignQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (design: DesignAnswers) => void;
  onSkip: () => void;
  initialDesign?: Record<string, any>;
  projectId?: string;
  userId?: string;
  runId?: string;
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

export default function DesignQuestionsModal({
  isOpen,
  onClose,
  onSubmit,
  onSkip,
  initialDesign,
  projectId,
  userId,
  runId,
}: DesignQuestionsModalProps) {
  const [answers, setAnswers] = useState<DesignAnswers>({});
  const [enabled, setEnabled] = useState(false);

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

  // When modal opens and we have project/user/run, fetch saved design to prefill form
  useEffect(() => {
    if (!isOpen || !userId || !projectId || !runId) return;
    fetchDesignByProjectRun({ userId, projectId, runId });
  }, [isOpen, userId, projectId, runId, fetchDesignByProjectRun]);

  // Populate answers: prefer designByRunData, then initialDesign, else empty
  useEffect(() => {
    if (questions.length === 0) return;
    const design =
      designByRunData?.request?.design ??
      initialDesign ??
      undefined;
    setAnswers(answersFromDesign(design, questions));
  }, [questions, designByRunData?.request?.design, initialDesign]);

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

    // Save to backend if we have user and project
    if (userId && projectId) {
      try {
        await saveDesign({
          user_id: userId,
          project_id: projectId,
          design,
          ...(runId ? { run_id: runId } : {}),
        }).unwrap();
      } catch {
        // Save failed – still proceed with onSubmit per requirements
      }
    }

    onSubmit(design);
    onClose();
  };

  const filledCount = Object.values(answers).filter(
    (v) => v !== undefined && v !== null,
  ).length;
  const totalCount = questions.length;

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
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={onSkip}
            className="text-sm transition-all duration-150 px-2 py-1 rounded-md"
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
