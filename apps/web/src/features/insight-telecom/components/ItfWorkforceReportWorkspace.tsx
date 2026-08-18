"use client";

import { useMemo, useState } from "react";
import type { ItfWorkspaceContext } from "../access/itfWorkspaceContext";
import type { ItfRosterReviewRow, ItfRosterStatus } from "../roster/itfRosterForm";
import {
  DEFAULT_ITF_WORKFORCE_REPORT_FILTERS,
  buildItfWorkforceReportCsv,
  filterItfWorkforceReportRows,
  groupItfWorkforceReportRows,
  summarizeItfWorkforceReportRows,
  uniqueItfWorkforceReportValues,
  type ItfWorkforceReportFilters,
  type ItfWorkforceReportGroup,
} from "../reports/itfWorkforceReport";
import styles from "./ItfWorkforceReportWorkspace.module.css";

const STATUS_OPTIONS: Array<{ value: ItfRosterStatus | "all"; label: string }> = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inactive", label: "Inactive" },
  { value: "onboarding_closed", label: "Onboarding closed" },
  { value: "all", label: "All statuses" },
];

const SEAT_LABELS: Record<string, string> = {
  UNASSIGNED: "Not placed",
  FIELD: "Field",
  LEADERSHIP: "Leadership",
  SUPPORT: "Support",
  TRAVEL: "Travel Tech",
  DROP_BURY: "Drop Bury",
  TRAINING: "Training",
  FMLA: "FMLA",
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function workforceUnitLabel(value: string) {
  return value === "company" ? "Company wide" : value;
}

export default function ItfWorkforceReportWorkspace({
  context,
  initialRows,
}: {
  context: ItfWorkspaceContext;
  initialRows: ItfRosterReviewRow[];
}) {
  const [filters, setFilters] = useState<ItfWorkforceReportFilters>(
    DEFAULT_ITF_WORKFORCE_REPORT_FILTERS
  );
  const [groupBy, setGroupBy] = useState<ItfWorkforceReportGroup>(() =>
    new Set(initialRows.map((row) => row.scope.companyName)).size > 1 ? "company" : "location"
  );

  const companies = useMemo(
    () => uniqueItfWorkforceReportValues(initialRows, (row) => row.scope.companyName),
    [initialRows]
  );
  const locations = useMemo(
    () => uniqueItfWorkforceReportValues(initialRows, (row) => row.placement.workforceUnit),
    [initialRows]
  );
  const offices = useMemo(
    () => uniqueItfWorkforceReportValues(initialRows, (row) => row.scope.officeName),
    [initialRows]
  );
  const positions = useMemo(
    () => uniqueItfWorkforceReportValues(initialRows, (row) => row.placement.positionTitle),
    [initialRows]
  );
  const seats = useMemo(
    () => uniqueItfWorkforceReportValues(initialRows, (row) => row.placement.seatType),
    [initialRows]
  );
  const teams = useMemo(
    () => uniqueItfWorkforceReportValues(initialRows, (row) => row.scope.groupName),
    [initialRows]
  );

  const visibleRows = useMemo(
    () => filterItfWorkforceReportRows(initialRows, filters),
    [filters, initialRows]
  );
  const groups = useMemo(
    () => groupItfWorkforceReportRows(visibleRows, groupBy),
    [groupBy, visibleRows]
  );
  const summary = useMemo(() => summarizeItfWorkforceReportRows(visibleRows), [visibleRows]);
  const showStatus = filters.status === "all";
  const showCompany = companies.length > 1;
  const groupOptions: ItfWorkforceReportGroup[] = showCompany
    ? ["company", "location", "team", "position"]
    : ["location", "team", "position"];
  const columnCount = 6 + Number(showStatus) + Number(showCompany);

  function updateFilter<Key extends keyof ItfWorkforceReportFilters>(
    key: Key,
    value: ItfWorkforceReportFilters[Key]
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function downloadCsv() {
    if (!visibleRows.length) return;
    const csv = buildItfWorkforceReportCsv(visibleRows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${context.company_slug}-workforce-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page} aria-label="ITF workforce report">
      <section className={styles.reportSurface}>
        <div className={styles.toolbar}>
          <label className={styles.searchControl}>
            <span>Search workforce</span>
            <input
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Name, Tech ID, login, company"
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value as ItfRosterStatus | "all")}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {companies.length > 1 ? (
            <label>
              <span>Company</span>
              <select value={filters.company} onChange={(event) => updateFilter("company", event.target.value)}>
                <option value="all">All companies</option>
                {companies.map((company) => <option key={company} value={company}>{company}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>Location</span>
            <select value={filters.location} onChange={(event) => updateFilter("location", event.target.value)}>
              <option value="all">All locations</option>
              {locations.map((location) => (
                <option key={location} value={location}>{workforceUnitLabel(location)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Office</span>
            <select value={filters.office} onChange={(event) => updateFilter("office", event.target.value)}>
              <option value="all">All offices</option>
              {offices.map((office) => <option key={office} value={office}>{office}</option>)}
            </select>
          </label>
          <label>
            <span>Position</span>
            <select value={filters.position} onChange={(event) => updateFilter("position", event.target.value)}>
              <option value="all">All positions</option>
              {positions.map((position) => <option key={position} value={position}>{position}</option>)}
            </select>
          </label>
          <label>
            <span>Seat</span>
            <select value={filters.seat} onChange={(event) => updateFilter("seat", event.target.value)}>
              <option value="all">All seats</option>
              {seats.map((seat) => <option key={seat} value={seat}>{SEAT_LABELS[seat] ?? seat}</option>)}
            </select>
          </label>
          <label>
            <span>Team</span>
            <select value={filters.team} onChange={(event) => updateFilter("team", event.target.value)}>
              <option value="all">All teams</option>
              {teams.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </label>
          <div className={styles.actions}>
            <button className="button" type="button" onClick={() => setFilters(DEFAULT_ITF_WORKFORCE_REPORT_FILTERS)}>
              Clear
            </button>
            <button className="button button-primary" type="button" disabled={!visibleRows.length} onClick={downloadCsv}>
              Download CSV
            </button>
          </div>
        </div>

        <div className={styles.summary} aria-label="Visible workforce summary">
          <span><small>Visible workforce</small><strong>{summary.total}</strong></span>
          <span><small>Not placed</small><strong>{summary.UNASSIGNED}</strong></span>
          <span><small>Field</small><strong>{summary.FIELD}</strong></span>
          <span><small>Leadership</small><strong>{summary.LEADERSHIP}</strong></span>
          <span><small>Support</small><strong>{summary.SUPPORT}</strong></span>
          <span><small>Training</small><strong>{summary.TRAINING}</strong></span>
          <span><small>Travel</small><strong>{summary.TRAVEL}</strong></span>
          <span><small>Drop Bury</small><strong>{summary.DROP_BURY}</strong></span>
          <span><small>FMLA</small><strong>{summary.FMLA}</strong></span>
        </div>

        <div className={styles.reportRail}>
          <div>
            <strong>Workforce report</strong>
            <span>{context.company_name} · authorized roster rows only</span>
          </div>
          <div className={styles.grouping} aria-label="Group report by">
            <span>Group by</span>
            {groupOptions.map((option) => (
              <button
                className={groupBy === option ? styles.groupingActive : undefined}
                key={option}
                type="button"
                onClick={() => setGroupBy(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showStatus ? <th>Status</th> : null}
                <th>Tech ID / worker</th>
                {showCompany ? <th>Company</th> : null}
                <th>Position</th>
                <th>Location</th>
                <th>Office</th>
                <th>Seat</th>
                <th>Reports to</th>
              </tr>
            </thead>
            <tbody>
              {!visibleRows.length ? (
                <tr><td className={styles.empty} colSpan={columnCount}>No workforce rows match this report.</td></tr>
              ) : groups.map((group) => (
                <FragmentGroup
                  key={group.label}
                  columnCount={columnCount}
                  label={group.label}
                  rows={group.rows}
                  showCompany={showCompany}
                  showStatus={showStatus}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function FragmentGroup({
  columnCount,
  label,
  rows,
  showCompany,
  showStatus,
}: {
  columnCount: number;
  label: string;
  rows: ItfRosterReviewRow[];
  showCompany: boolean;
  showStatus: boolean;
}) {
  return (
    <>
      <tr className={styles.groupRow}>
        <th colSpan={columnCount}><span>{label}</span><span>{rows.length}</span></th>
      </tr>
      {rows.map((row) => {
        const hidesTechId = row.placement.seatType === "LEADERSHIP" || row.placement.seatType === "SUPPORT";
        return (
          <tr key={row.id}>
            {showStatus ? (
              <td><span className={`${styles.status} ${styles[`status_${row.person.status}`]}`}>{statusLabel(row.person.status)}</span></td>
            ) : null}
            <td className={styles.identity}>
              <strong>{hidesTechId ? row.person.fullName : row.identifiers.tech_id || "-"}</strong>
              {!hidesTechId ? <span>{row.person.fullName}</span> : null}
            </td>
            {showCompany ? <td>{row.scope.companyName}</td> : null}
            <td>{row.placement.positionTitle}</td>
            <td>{workforceUnitLabel(row.placement.workforceUnit)}</td>
            <td>{row.scope.officeName}</td>
            <td>{SEAT_LABELS[row.placement.seatType] ?? row.placement.seatType}</td>
            <td>{row.placement.reportsTo || "Unassigned"}</td>
          </tr>
        );
      })}
    </>
  );
}
