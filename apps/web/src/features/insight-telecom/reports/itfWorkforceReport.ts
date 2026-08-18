import {
  compareItfRosterRowsByTechId,
  type ItfRosterReviewRow,
  type ItfRosterStatus,
} from "../roster/itfRosterForm";

export type ItfWorkforceReportGroup = "company" | "location" | "team" | "position";

export type ItfWorkforceReportFilters = {
  search: string;
  status: ItfRosterStatus | "all";
  company: string;
  location: string;
  office: string;
  position: string;
  seat: string;
  team: string;
};

export const DEFAULT_ITF_WORKFORCE_REPORT_FILTERS: ItfWorkforceReportFilters = {
  search: "",
  status: "active",
  company: "all",
  location: "all",
  office: "all",
  position: "all",
  seat: "all",
  team: "all",
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function filterItfWorkforceReportRows(
  rows: ItfRosterReviewRow[],
  filters: ItfWorkforceReportFilters
) {
  const search = normalize(filters.search);

  return rows.filter((row) => {
    if (filters.status !== "all" && row.person.status !== filters.status) return false;
    if (filters.company !== "all" && row.scope.companyName !== filters.company) return false;
    if (filters.location !== "all" && row.placement.workforceUnit !== filters.location) return false;
    if (filters.office !== "all" && row.scope.officeName !== filters.office) return false;
    if (filters.position !== "all" && row.placement.positionTitle !== filters.position) return false;
    if (filters.seat !== "all" && row.placement.seatType !== filters.seat) return false;
    if (filters.team !== "all" && row.scope.groupName !== filters.team) return false;

    if (!search) return true;

    return [
      row.person.fullName,
      row.identifiers.tech_id,
      row.identifiers.fuse_emp_id,
      row.identifiers.nt_login,
      row.scope.companyName,
      row.placement.workforceUnit,
      row.scope.officeName,
      row.placement.positionTitle,
      row.placement.reportsTo,
    ].some((value) => normalize(value).includes(search));
  });
}

export function itfWorkforceReportGroupLabel(
  row: ItfRosterReviewRow,
  groupBy: ItfWorkforceReportGroup
) {
  if (groupBy === "company") return row.scope.companyName;
  if (groupBy === "location") return row.placement.workforceUnit === "company"
    ? "Company wide"
    : row.placement.workforceUnit;
  if (groupBy === "team") return row.scope.groupName;
  return row.placement.positionTitle;
}

export function groupItfWorkforceReportRows(
  rows: ItfRosterReviewRow[],
  groupBy: ItfWorkforceReportGroup
) {
  const groups = new Map<string, ItfRosterReviewRow[]>();

  for (const row of rows) {
    const label = itfWorkforceReportGroupLabel(row, groupBy) || "Unassigned";
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([label, groupRows]) => ({
      label,
      rows: [...groupRows].sort(compareItfRosterRowsByTechId),
    }));
}

export function summarizeItfWorkforceReportRows(rows: ItfRosterReviewRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      summary[row.placement.seatType] += 1;
      return summary;
    },
    {
      total: 0,
      UNASSIGNED: 0,
      FIELD: 0,
      LEADERSHIP: 0,
      SUPPORT: 0,
      TRAVEL: 0,
      DROP_BURY: 0,
      TRAINING: 0,
      FMLA: 0,
    }
  );
}

export function uniqueItfWorkforceReportValues(
  rows: ItfRosterReviewRow[],
  select: (row: ItfRosterReviewRow) => string
) {
  return [...new Set(rows.map(select).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  );
}

function csvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildItfWorkforceReportCsv(rows: ItfRosterReviewRow[]) {
  const headers = [
    "Company",
    "Person",
    "Tech ID",
    "Position",
    "Seat",
    "Location",
    "Office",
    "Reports To",
    "Status",
  ];
  const body = [...rows].sort(compareItfRosterRowsByTechId).map((row) => [
    row.scope.companyName,
    row.person.fullName,
    row.identifiers.tech_id || "-",
    row.placement.positionTitle,
    row.placement.seatType,
    row.placement.workforceUnit === "company" ? "Company wide" : row.placement.workforceUnit,
    row.scope.officeName,
    row.placement.reportsTo || "Unassigned",
    row.person.status,
  ]);

  return [headers, ...body].map((record) => record.map(csvValue).join(",")).join("\n");
}
