/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getFirebaseIdToken } from "@/lib/firebase/auth";

export interface Thread {
  id: string;
  project_public_id: string;
  title: string;
  binding_mode: string;
  pinned_diagram_version_id?: string | null;
  created_at: string;
}

export interface ThreadsResponse {
  ok: boolean;
  threads?: Thread[];
  error?: string;
}

export interface ChatMessageItem {
  role: "user" | "assistant";
  message: string;
  ts?: number;
}

export interface SendMessageArg {
  projectId: string;
  threadId: string;
  message: string;
  mode?: "thinking" | "default" | "instant";
  detail?: string;
  design?: Record<string, unknown>;
  /** When set, sent to backend so the first turns can bind to a concrete saved diagram version */
  diagram_version_id?: string;
}

export interface ChatResponse {
  answer?: string;
  message?: string;
  source?: "rag" | "llm" | "assistant";
  [key: string]: unknown;
}

export const chatApi = createApi({
  reducerPath: "chatApi",
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
  tagTypes: ["ChatThreads", "ChatMessages"],
  endpoints: (builder) => ({
    getThreads: builder.query<Thread[], void>({
      query: () => ({
        url: "/api/projects/chats",
        method: "GET",
      }),
      transformResponse: (res: ThreadsResponse) => {
        if (!res?.ok || !res.threads) {
          throw new Error(res?.error || "Failed to get threads");
        }
        return res.threads;
      },
      providesTags: ["ChatThreads"],
    }),

    getProjectThreadId: builder.query<string | null, string>({
      query: () => ({
        url: "/api/projects/chats",
        method: "GET",
      }),
      transformResponse: (res: ThreadsResponse, _meta, projectId) => {
        if (!res?.ok || !res.threads) {
          throw new Error(res?.error || "Failed to get threads");
        }
        const thread = res.threads.find((t) => t.project_public_id === projectId);
        return thread?.id ?? null;
      },
      providesTags: ["ChatThreads"],
    }),

    getMessages: builder.query<
      ChatMessageItem[],
      { projectId: string; threadId: string }
    >({
      query: ({ projectId, threadId }) => ({
        url: `/api/projects/${projectId}/chats/${threadId}/messages`,
        method: "GET",
      }),
      transformResponse: (res: unknown) => {
        const data = res as any;
        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data?.messages)
            ? data.messages
            : [];
        return arr.map((m: any) => ({
          role: m.role === "user" ? "user" : "assistant",
          message: m.message || m.text || m.content || "",
          ts: m.ts || m.timestamp || Date.now(),
        }));
      },
      providesTags: (_result, _err, arg) => [
        { type: "ChatMessages", id: `${arg.projectId}-${arg.threadId}` },
      ],
    }),

    sendMessage: builder.mutation<ChatResponse, SendMessageArg>({
      query: ({
        projectId,
        threadId,
        message,
        mode,
        detail,
        design,
        diagram_version_id,
      }) => ({
        url: `/api/projects/${projectId}/chats/${threadId}/messages`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          message,
          mode: mode ?? "default",
          ...(mode === "thinking" && detail ? { detail } : {}),
          ...(design && Object.keys(design).length > 0 ? { design } : {}),
          ...(diagram_version_id
            ? { diagram_version_id: diagram_version_id }
            : {}),
        },
      }),
      transformResponse: (res: unknown) => res as ChatResponse,
      transformErrorResponse: (res: { data?: unknown; status: number }) => {
        const data = res.data as any;
        const msg =
          typeof data?.error === "string"
            ? data.error
            : `Failed to send message: ${res.status}`;
        return new Error(msg);
      },
      invalidatesTags: (_result, _err, arg) => [
        { type: "ChatMessages", id: `${arg.projectId}-${arg.threadId}` },
      ],
    }),
  }),
});

export const {
  useGetThreadsQuery,
  useLazyGetThreadsQuery,
  useGetProjectThreadIdQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
} = chatApi;
