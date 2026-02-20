/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getFirebaseIdToken } from "@/lib/firebase/auth";

export type Project = {
  id: string;
  name?: string;
  is_temporary?: boolean;
  [key: string]: unknown;
};


export type CreateProjectArg = {
  name: string;
  is_temporary?: boolean;
};

export type UpdateProjectArg = {
  id: string;
  name: string;
};

export type TempChatArg = {
  message: string;
  mode?: string;
};

export type TempChatResponse = {
  ok: boolean;
  answer: string;
  source: string;
  refs: unknown[];
};

export const projectsApi = createApi({
  reducerPath: "projectsApi",
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
  tagTypes: ["Projects"],
  endpoints: (b) => ({
    getProjects: b.query<Project[], void>({
      query: () => ({ url: "/api/projects", method: "GET" }),
      transformResponse: (res: unknown): Project[] => {
        const data = res as any;
        console.log("Raw projects API response:", data);
        
        // Handle different response formats
        let projectsArray: any[] = [];
        
        if (Array.isArray(data)) {
          // Backend returns array directly
          projectsArray = data;
        } else if (data && typeof data === "object") {
          // Backend returns object with projects key
          if (Array.isArray(data.projects)) {
            projectsArray = data.projects;
          } else if (Array.isArray(data.items)) {
            projectsArray = data.items;
          } else if (data.error) {
            console.error("Projects API error:", data.error);
            throw new Error(data.error || "Failed to load projects");
          } else {
            // Try to find any array in the response
            const arrayKey = Object.keys(data).find((key) => Array.isArray(data[key]));
            if (arrayKey) {
              projectsArray = data[arrayKey];
            } else {
              console.error("Invalid projects response format:", data);
              throw new Error("Invalid projects response format");
            }
          }
        } else {
          console.error("Invalid projects response:", data);
          throw new Error("Invalid projects response");
        }
        
        console.log("Parsed projects array:", projectsArray);
        
        // Normalize project objects - backend uses public_id as the identifier
        const normalized = projectsArray
          .filter((p) => {
            const hasId = !!(p && (p.id || p.public_id || p.ID || p.project_id));
            if (!hasId) {
              console.warn("Project missing ID:", p);
            }
            return hasId;
          })
          .map((p: any) => {
            const projectId = String(p.id ?? p.public_id ?? p.ID ?? p.project_id ?? "");
            if (!projectId) {
              console.warn("Project ID is empty after normalization:", p);
            }
            return {
              id: projectId,
              name: typeof p.name === "string" ? p.name : undefined,
              is_temporary:
                typeof p.is_temporary === "boolean" ? p.is_temporary : undefined,
              // Preserve other fields like created_at, updated_at, public_id
              ...Object.fromEntries(
                Object.entries(p).filter(([key]) => 
                  !["id", "ID", "project_id"].includes(key)
                )
              ),
            } as Project;
          });
        
        console.log("Normalized projects:", normalized);
        console.log("Normalized projects count:", normalized.length);
        return normalized;
      },
      providesTags: ["Projects"],
    }),

    createProject: b.mutation<Project, CreateProjectArg>({
      query: (body) => ({
        url: "/api/projects",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          name: body.name,
          is_temporary: body.is_temporary ?? false,
        },
      }),
      transformResponse: (res: unknown): Project => {
        const obj = res as any;
        console.log("Create project response:", obj);
      
        const normalize = (p: any): Project => ({
          id: String(p?.id ?? p?.public_id ?? ""),
          name: typeof p?.name === "string" ? p.name : undefined,
          is_temporary:
            typeof p?.is_temporary === "boolean" ? p.is_temporary : undefined,
          ...p,
        });
      
        if (obj && typeof obj === "object" && obj.project) {
          return normalize(obj.project);
        }
        const raw = res as Record<string, unknown>;
        return {
          id: String(raw?.id ?? raw?.public_id ?? ""),
          name: raw?.name as string | undefined,
          is_temporary: raw?.is_temporary as boolean | undefined,
          ...raw,
        } satisfies Project;
      },
      
      invalidatesTags: ["Projects"],
    }),

    updateProject: b.mutation<Project, UpdateProjectArg>({
      query: ({ id, name }) => ({
        url: `/api/projects/${id}`,
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: { name },
      }),
      transformResponse: (res: unknown): Project => {
        const raw = res as Record<string, unknown>;
        return {
          id: String(raw?.id ?? raw?.public_id ?? ""),
          name: raw?.name as string | undefined,
          is_temporary: raw?.is_temporary as boolean | undefined,
          ...raw,
        } satisfies Project;
      },
      invalidatesTags: ["Projects"],
    }),

    deleteProject: b.mutation<void, string>({
      query: (id) => ({
        url: `/api/projects/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Projects"],
    }),

    getProjectSummary: b.query<
      {
        ok: boolean;
        project?: {
          public_id: string;
          name?: string;
          current_diagram_version_id?: string;
          [key: string]: unknown;
        };
        latest_diagram_version?: {
          id: string;
          diagram_json?: unknown;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      },
      string
    >({
      query: (projectId) => ({
        url: `/api/projects/${projectId}/summary`,
        method: "GET",
      }),
      transformResponse: (res: unknown) => {
        const data = res as any;
        return {
          ok: data?.ok ?? true,
          project: data?.project,
          latest_diagram_version: data?.latest_diagram_version,
          ...data,
        };
      },
    }),

    saveDiagram: b.mutation<
      { ok: boolean; [key: string]: unknown },
      { projectId: string; diagram: unknown }
    >({
      query: ({ projectId, diagram }) => ({
        url: `/api/projects/${projectId}/diagram`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: diagram,
      }),
      transformResponse: (res: unknown) => {
        const data = res as any;
        return {
          ok: data?.ok ?? true,
          ...data,
        };
      },
    }),

    tempChat: b.mutation<TempChatResponse, TempChatArg>({
      query: (body) => ({
        url: "/api/temp-chat",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          message: body.message,
          mode: body.mode || "default",
        },
      }),
      transformResponse: (res: unknown): TempChatResponse => {
        const data = res as any;
        return {
          ok: data?.ok ?? true,
          answer: data?.answer || "",
          source: data?.source || "",
          refs: data?.refs || [],
        };
      },
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useGetProjectSummaryQuery,
  useSaveDiagramMutation,
  useTempChatMutation,
} = projectsApi;
