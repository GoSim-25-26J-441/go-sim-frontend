export function makeEdgeLabel(kind: string, attrs: any) {
  if (kind !== "CALLS") return kind?.toLowerCase?.() || "";

  const endpoints = Array.isArray(attrs?.endpoints) ? attrs.endpoints : [];

  let rpm = 0;
  if (typeof attrs?.rate_per_min === "number") rpm = attrs.rate_per_min;
  else if (typeof attrs?.rate_per_min === "string") {
    const parsed = parseInt(attrs.rate_per_min, 10);
    rpm = Number.isNaN(parsed) ? 0 : parsed;
  }

  const count =
    typeof attrs?.count === "number"
      ? attrs.count
      : endpoints.length > 0
      ? endpoints.length
      : 0;

  return count > 0 || rpm > 0 ? `calls (${count} ep), ${rpm}rpm` : "calls";
}
