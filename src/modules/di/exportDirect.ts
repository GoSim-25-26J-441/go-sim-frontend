// src/modules/di/exportDirect.ts (dev only)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

export async function fetchFinalYaml(jobId: string, userId = "demo-user") {
  const res = await fetch(
    `${BACKEND_URL}/api/v1/design-input/jobs/${jobId}/export?format=yaml&download=false`,
    {
      method: "GET",
      headers: {
        "X-API-Key": "super-secret-key-123",   // ⚠️ visible in client
        "X-User-Id": userId,
      },
    }
  );
  if (!res.ok) throw new Error(`Export YAML failed: ${res.status}`);
  return await res.text();
}

export async function fetchFinalSpec(jobId: string, userId = "demo-user") {
  const res = await fetch(
    `${BACKEND_URL}/api/v1/design-input/jobs/${jobId}/export?format=json&download=false`,
    {
      method: "GET",
      headers: {
        "X-API-Key": "super-secret-key-123",   // ⚠️ visible in client
        "X-User-Id": userId,
      },
    }
  );
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return await res.json();
}
