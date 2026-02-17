/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase/auth";

interface Question {
  id: string;
  label: string;
  type: "number" | "text" | "textarea";
  placeholder?: string;
}

interface QuestionsResponse {
  ok: boolean;
  enabled: boolean;
  questions?: Question[];
  error?: string;
}

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
}

export default function DesignQuestionsModal({
  isOpen,
  onClose,
  onSubmit,
  onSkip,
  initialDesign,
}: DesignQuestionsModalProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<DesignAnswers>({});
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchQuestions() {
      setLoading(true);
      try {
        const token = await getFirebaseIdToken();
        if (!token) {
          throw new Error("No authentication token available");
        }

        const res = await fetch("/api/design-input/rag/requirements-questions", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Failed to fetch questions:", res.status, errorText);
          throw new Error(`Failed to fetch questions: ${res.status}`);
        }

        const data: QuestionsResponse = await res.json();
        console.log("Design questions response:", data);
        
        if (data.ok && data.enabled && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
          console.log("Setting questions:", data.questions);
          // Normalize question objects to use lowercase properties (backend uses capitalized)
          const normalizedQuestions: Question[] = data.questions.map((q: any) => ({
            id: q.ID || q.id || "",
            label: q.Label || q.label || "",
            type: ((q.Type || q.type || "text").toLowerCase() as "number" | "text" | "textarea"),
            placeholder: q.Placeholder || q.placeholder,
          })).filter((q) => q.id && q.label); // Filter out invalid questions
          
          if (normalizedQuestions.length > 0) {
            setQuestions(normalizedQuestions);
            setEnabled(true);
            // Initialize answers with initialDesign values or empty
            const initialAnswers: DesignAnswers = {};
            normalizedQuestions.forEach((q) => {
              // Check if we have initial design data
              if (initialDesign) {
                if (q.id === "concurrent_users" && initialDesign.workload?.concurrent_users !== undefined) {
                  initialAnswers[q.id] = initialDesign.workload.concurrent_users;
                } else if (initialDesign[q.id] !== undefined) {
                  initialAnswers[q.id] = initialDesign[q.id];
                } else {
                  initialAnswers[q.id] = undefined;
                }
              } else {
                initialAnswers[q.id] = undefined;
              }
            });
            setAnswers(initialAnswers);
            console.log("Initial answers set:", initialAnswers);
          } else {
            console.warn("No valid questions after normalization");
            setEnabled(false);
            setQuestions([]);
          }
        } else {
          console.warn("Design questions not enabled or empty:", {
            ok: data.ok,
            enabled: data.enabled,
            questionsLength: data.questions?.length,
            questionsType: typeof data.questions,
            isArray: Array.isArray(data.questions),
            error: data.error,
            fullResponse: data,
          });
          setEnabled(false);
          setQuestions([]);
        }
      } catch (error) {
        console.error("Failed to fetch design questions:", error);
        setEnabled(false);
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchQuestions();
  }, [isOpen, initialDesign]);

  const handleChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value === "" ? undefined : parseFloat(value),
    }));
  };

  const handleSubmit = () => {
    // Build design object with proper structure matching API spec
    const design: any = {};
    
    // Handle workload separately (nested object)
    if (answers.concurrent_users !== undefined) {
      design.workload = { concurrent_users: answers.concurrent_users };
    }
    
    // Add other fields directly
    if (answers.preferred_vcpu !== undefined) {
      design.preferred_vcpu = answers.preferred_vcpu;
    }
    if (answers.preferred_memory_gb !== undefined) {
      design.preferred_memory_gb = answers.preferred_memory_gb;
    }
    if (answers.budget !== undefined) {
      design.budget = answers.budget;
    }

    // Add any other fields that aren't already handled
    Object.keys(answers).forEach((key) => {
      if (
        key !== "concurrent_users" &&
        key !== "preferred_vcpu" &&
        key !== "preferred_memory_gb" &&
        key !== "budget" &&
        answers[key] !== undefined
      ) {
        design[key] = answers[key];
      }
    });

    onSubmit(design);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Design Requirements</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              Loading questions...
            </div>
          ) : !enabled || questions.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p className="mb-2">Design questions are not available at this time.</p>
              <p className="text-xs text-gray-500">
                You can still use the chat without providing design requirements.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Click {'"'}Skip{'"'} to continue.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-4">
                Please provide the following information to help us better assist you with your design:
              </p>
              {questions.map((question) => (
                <div key={question.id}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {question.label}
                  </label>
                  {question.type === "textarea" ? (
                    <textarea
                      key={`textarea-${question.id}`}
                      value={answers[question.id]?.toString() || ""}
                      onChange={(e) => handleChange(question.id, e.target.value)}
                      placeholder={question.placeholder}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      rows={3}
                    />
                  ) : (
                    <input
                      key={`input-${question.id}`}
                      type={question.type}
                      value={answers[question.id]?.toString() || ""}
                      onChange={(e) => handleChange(question.id, e.target.value)}
                      placeholder={question.placeholder}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !enabled || questions.length === 0}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
