"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGetProjectsQuery } from "@/app/store/projectsApi";

export default function ProjectIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const raw = params?.id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";

  const { data: projects = [], isLoading, isError, isFetching } =
    useGetProjectsQuery();

  useEffect(() => {
    if (!id) return;
    if (isLoading || isError) return;
    if (isFetching) return;
    const exists = projects.some((p) => p.id === id);
    if (!exists) {
      router.replace("/dashboard");
    }
  }, [id, isLoading, isError, isFetching, projects, router]);

  return <>{children}</>;
}
