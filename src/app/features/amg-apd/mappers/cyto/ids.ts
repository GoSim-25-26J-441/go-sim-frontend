export function canonicalNodeId(id: string): string {
  return id.replace(/^(SERVICE|DATABASE)\s*:\s*/i, "").trim();
}
