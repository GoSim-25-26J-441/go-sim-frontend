/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { env } from "@/lib/env";

export interface Question {
  id: string;
  label: string;
  type: "number" | "text" | "textarea";
  placeholder?: string;
}

export interface QuestionsResponse {
  ok: boolean;
  enabled: boolean;
  questions?: Question[];
  error?: string;
}

export interface DesignPayload {
  preferred_vcpu?: number;
  preferred_memory_gb?: number;
  workload?: { concurrent_users?: number };
  budget?: number;
  [key: string]: unknown;
}

export interface SaveDesignRequest {
  user_id: string;
  project_id: string;
  design: DesignPayload;
  run_id?: string;
}

export interface DesignByProjectRunResponse {
  id: string;
  user_id: string;
  project_id: string;
  run_id?: string;
  request?: {
    design?: DesignPayload;
  };
  [key: string]: unknown;
}

export const designApi = createApi({
  reducerPath: "designApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "",
    prepareHeaders: async (headers) => {
      const token = await getFirebaseIdToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ["DesignQuestions", "DesignByProjectRun"],
  endpoints: (b) => ({
    // Fetch requirements questions (form field definitions)
    getRequirementsQuestions: b.query<QuestionsResponse, void>({
      query: () => ({
        url: "/api/design-input/rag/requirements-questions",
        method: "GET",
      }),
      transformResponse: (res: unknown) => {
        const data = res as any;
        return {
          ok: data?.ok ?? false,
          enabled: data?.enabled ?? false,
          questions: data?.questions ?? [],
          error: data?.error,
        };
      },
      providesTags: ["DesignQuestions"],
    }),

    // Save design (POST analysis-suggestions/design)
    saveDesign: b.mutation<unknown, SaveDesignRequest>({
      query: ({ user_id, project_id, design, run_id }) => ({
        url: `${env.BACKEND_BASE}/api/v1/analysis-suggestions/design`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: run_id
          ? { user_id, project_id, run_id, design }
          : { user_id, project_id, design },
      }),
      invalidatesTags: ["DesignByProjectRun"],
    }),

    // Fetch design by project
    getDesignByProjectRun: b.query<
      DesignByProjectRunResponse,
      { userId: string; projectId: string }
    >({
      query: ({ userId, projectId }) => {
        const params = new URLSearchParams({
          user_id: userId,
          project_id: projectId,
        });
        return {
          url: `${env.BACKEND_BASE}/api/v1/analysis-suggestions/requests/by-project-run?${params.toString()}`,
          method: "GET",
        };
      },
      transformResponse: (raw: unknown) => {
        const data = raw as Record<string, unknown>;
        if (data?.request != null) return data as DesignByProjectRunResponse;
        if (data?.design != null)
          return {
            ...data,
            request: { design: data.design },
          } as DesignByProjectRunResponse;
        return data as DesignByProjectRunResponse;
      },
      providesTags: (_res, _err, { projectId }) => [
        { type: "DesignByProjectRun", id: projectId },
      ],
    }),
  }),
});

export const {
  useGetRequirementsQuestionsQuery,
  useLazyGetRequirementsQuestionsQuery,
  useSaveDesignMutation,
  useGetDesignByProjectRunQuery,
  useLazyGetDesignByProjectRunQuery,
} = designApi;
