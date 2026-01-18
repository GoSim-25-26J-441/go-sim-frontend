/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export type RemoteChat = {
  jobId: string;
  title: string;
  lastAt: number | null;
  lastBy: string | null;
};

type ChatsRes =
  | { ok: true; chats: RemoteChat[] }
  | { ok: false; error?: string };

type NewJobRes =
  | { ok: true; jobId: string }
  | { ok: false; error?: string };

function readUidCookie() {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/(?:^|;\s*)uid=([^;]+)/)?.[1] || "";
}

export const diApi = createApi({
  reducerPath: "diApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "",
    prepareHeaders: (headers) => {
      const uid = readUidCookie();
      if (uid) headers.set("x-user-id", uid);
      return headers;
    },
  }),
  tagTypes: ["Chats"],
  endpoints: (b) => ({
    getChats: b.query<RemoteChat[], void>({
      query: () => ({ url: "/api/di/chats", method: "GET" }),
      transformResponse: (res: ChatsRes) => {
        if (!res || (res as any).ok !== true) {
          throw new Error((res as any)?.error || "Failed to load server chats");
        }
        return (res as any).chats as RemoteChat[];
      },
      providesTags: ["Chats"],
    }),

    newJob: b.mutation<{ jobId: string }, void>({
      query: () => ({
        url: "/api/di/new-job",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {},
      }),
      transformResponse: (res: NewJobRes) => {
        if (!res || (res as any).ok !== true || !(res as any).jobId) {
          throw new Error((res as any)?.error || "Failed to create new project");
        }
        return { jobId: (res as any).jobId as string };
      },
      invalidatesTags: ["Chats"],
    }),

    sendChat: b.mutation<
      any,
      { jobId: string; message: string; mode?: string; forceLLM?: boolean }
    >({
      query: ({ jobId, message, mode, forceLLM }) => ({
        url: `/api/di/jobs/${jobId}/chat`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          message,
          ...(mode ? { mode } : {}),
          ...(forceLLM ? { force_llm: true } : {}),
        },
      }),
    }),
  }),
});

export const { useGetChatsQuery, useNewJobMutation, useSendChatMutation } = diApi;
