export type ResignationNoticeSourceRow = {
  id: string;
  roster_member_id: string;
  override_type?: string | null;
  start_date: string;
  end_date: string;
  separation_effective_date?: string | null;
  workflow_status?: string | null;
  is_active?: boolean | null;
};

export type ResignationNoticeRosterRow = {
  roster_member_id: string;
  full_name?: string | null;
  worker_type?: string | null;
  employment_status?: string | null;
};

export type WorkforceResignationNotice = {
  id: string;
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  employment_status: string | null;
  notice_date: string;
  last_scheduled_date: string;
  separation_effective_date: string;
  workflow_status: string;
  days_until_last_day: number;
  days_until_separation: number;
  route_ready_departure: boolean;
};

const DAY_MS = 86_400_000;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00Z`).getTime();
  const end = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((end - start) / DAY_MS);
}

export function buildResignationNoticeCountdowns(
  noticeRows: ResignationNoticeSourceRow[],
  rosterRows: ResignationNoticeRosterRow[],
  asOfDate: string
): WorkforceResignationNotice[] {
  if (!isIsoDate(asOfDate)) return [];

  const rosterById = new Map(
    rosterRows.map((row) => [String(row.roster_member_id), row])
  );
  const noticesByRoster = new Map<string, WorkforceResignationNotice>();

  for (const row of noticeRows) {
    if (row.override_type && row.override_type !== "RESIGNATION_NOTICE") continue;
    if (row.is_active === false) continue;
    if (["CANCELLED", "RESCINDED"].includes(String(row.workflow_status ?? "").toUpperCase())) continue;
    if (!isIsoDate(row.start_date) || !isIsoDate(row.end_date)) continue;

    const roster = rosterById.get(String(row.roster_member_id));
    if (!roster || !["Active", "Trainee"].includes(String(roster.employment_status))) continue;

    const separationDate = isIsoDate(row.separation_effective_date)
      ? row.separation_effective_date
      : addDays(row.end_date, 1);
    if (separationDate < asOfDate) continue;

    const notice: WorkforceResignationNotice = {
      id: String(row.id),
      roster_member_id: String(row.roster_member_id),
      full_name: roster.full_name?.trim() || "Roster member",
      worker_type: roster.worker_type ?? null,
      employment_status: roster.employment_status ?? null,
      notice_date: row.start_date,
      last_scheduled_date: row.end_date,
      separation_effective_date: separationDate,
      workflow_status: String(row.workflow_status ?? "COUNTDOWN_ACTIVE"),
      days_until_last_day: Math.max(0, daysBetween(asOfDate, row.end_date)),
      days_until_separation: Math.max(0, daysBetween(asOfDate, separationDate)),
      route_ready_departure: roster.employment_status === "Active",
    };

    const current = noticesByRoster.get(notice.roster_member_id);
    if (!current || notice.last_scheduled_date < current.last_scheduled_date) {
      noticesByRoster.set(notice.roster_member_id, notice);
    }
  }

  return Array.from(noticesByRoster.values()).sort((left, right) =>
    left.last_scheduled_date.localeCompare(right.last_scheduled_date)
  );
}
