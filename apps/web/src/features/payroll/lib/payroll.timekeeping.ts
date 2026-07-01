export type PayrollTimeKeepingState = "CLOCKED_IN" | "CLOCKED_OUT" | "NONE";

export type PayrollTimeKeepingRow = {
  roster_member_id: string;
  service_date: string;
  full_name: string | null;
  worker_type: string | null;
  clock_in: string | null;
  clock_out: string | null;
  state: PayrollTimeKeepingState;
  event_count: number;
};

export function formatClockTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(clockIn: string | null, clockOut: string | null) {
  if (!clockIn || !clockOut) return "—";

  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "—";
  }

  const minutes = Math.round((end - start) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

export function stateLabel(state: PayrollTimeKeepingState) {
  if (state === "CLOCKED_IN") return "Active";
  if (state === "CLOCKED_OUT") return "Closed";
  return "No session";
}

export function summarizeTimeKeepingRows(rows: PayrollTimeKeepingRow[]) {
  return {
    totalRows: rows.length,
    activeSessions: rows.filter((row) => row.state === "CLOCKED_IN").length,
    closedSessions: rows.filter((row) => row.state === "CLOCKED_OUT").length,
    missingClockOut: rows.filter((row) => row.clock_in && !row.clock_out).length,
  };
}
