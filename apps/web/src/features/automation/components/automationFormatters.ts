import type { AutomationStatusValue, CollectionRequest, ScheduleRow } from "./automation.types";

export function formatStatus(value: AutomationStatusValue | null) {
  if (!value) return "Loading...";
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

export function formatWindow(row: ScheduleRow | null | undefined) {
  if (!row) return "—";
  if (row.window_preset === "OFF") return "Off";
  return `${row.start_time.slice(0, 5)} → ${row.end_time.slice(0, 5)}`;
}

export function scheduleLabel(value: string) {
  if (value === "SORT_DELIVERY_DAY") return "Sort Delivery Day";
  if (value === "BUSINESS_DAY") return "Business Day";
  if (value === "OFF") return "Off";
  return value;
}

export function summarizeArtifacts(items: any[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (item.artifact_kind !== "REPORT_FILE") continue;
    const key = item.report_family_key ?? "Artifact";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) return "—";

  return Array.from(counts.entries())
    .map(([key, count]) => `${key} ×${count}`)
    .join(", ");
}

export function formatRequestTiming(request: CollectionRequest) {
  const payload = request.request_payload ?? {};
  const cadence = typeof payload.cadence_minutes === "number" ? `${payload.cadence_minutes}m` : null;
  const windows = Array.isArray(payload.windows)
    ? payload.windows
        .map((window) => {
          if (!window || typeof window !== "object") return null;
          const record = window as Record<string, unknown>;
          const report = String(record.report ?? "");
          const start = String(record.start_time ?? "").slice(0, 5);
          const end = String(record.end_time ?? "").slice(0, 5);
          return report && start && end ? `${report} ${start}-${end}` : null;
        })
        .filter(Boolean)
        .join(" · ")
    : "";

  if (cadence && windows) return `${cadence} · ${windows}`;
  if (cadence) return cadence;
  return "—";
}
