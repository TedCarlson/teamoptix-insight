"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ManagePersonDrawer from "@/features/people/components/ManagePersonDrawer";
import CandidateWorkflowDrawer from "@/features/hiring/components/candidate-drawer/CandidateWorkflowDrawer";
import TraineePayOverrideOverlay from "@/features/people/components/TraineePayOverrideOverlay";
import RosterControlsBar, {
  type RosterTab,
} from "@/features/people/components/RosterControlsBar";
import RosterTable from "@/features/people/components/RosterTable";
import type { RosterRow } from "@/features/people/types/roster.types";

type TimelineEvent = {
  id: string;
  event_category: string;
  event_type: string;
  event_detail: string | null;
  event_metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

type ApiRosterRow = {
  roster_member_id: string;
  profile_id?: string | null;
  person_id?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  worker_type: string | null;
  employment_status: "Active" | "Candidate" | "Trainee" | "Former" | null;
  market_code: string | null;
  reports_to_name: string | null;
  notes?: string | null;
  hire_date: string | null;
  separation_date?: string | null;
  date_of_birth?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  license_number?: string | null;
  issuing_state?: string | null;
  license_issue_date?: string | null;
  license_expiration_date?: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
  fx_id?: string | null;
  dswid?: string | null;
  dot_expiration_date?: string | null;
  qual_cert_expiration_date?: string | null;
  daily_pay_effective_date?: string | null;
  daily_pay_rate?: string | number | null;
  trainee_daily_pay_rate?: string | number | null;
  trainee_pay_effective_start?: string | null;
  scanner_serial?: string | null;
  fuel_card?: string | null;
  pin_id_no?: string | null;
  candidate_stage_key?: string | null;
  candidate_stage_label?: string | null;
  candidate_stage_is_terminal?: boolean | null;
};

function normalizeRosterRow(row: ApiRosterRow): RosterRow {
  return {
    roster_member_id: row.roster_member_id,
    profile_id: row.profile_id ?? null,
    person_id: row.person_id ?? null,
    full_name: row.full_name ?? "Unknown",
    email: row.email ?? null,
    phone: row.phone ?? null,
    worker_type: row.worker_type ?? "Unassigned",
    employment_status: row.employment_status ?? "Candidate",
    market_code: row.market_code ?? "—",
    reports_to_name: row.reports_to_name ?? "—",
    notes: row.notes ?? null,
    hire_date: row.hire_date ?? "—",
    separation_date: row.separation_date ?? null,
    date_of_birth: row.date_of_birth ?? null,
    address_line_1: row.address_line_1 ?? null,
    address_line_2: row.address_line_2 ?? null,
    city: row.city ?? null,
    state_region: row.state_region ?? null,
    postal_code: row.postal_code ?? null,
    license_number: row.license_number ?? null,
    issuing_state: row.issuing_state ?? null,
    license_issue_date: row.license_issue_date ?? null,
    license_expiration_date: row.license_expiration_date ?? null,
    invite_status: row.invite_status ?? "Not Invited",
    compliance_summary: row.compliance_summary ?? "Missing",
    fx_id: row.fx_id ?? null,
    dswid: row.dswid ?? null,
    dot_expiration_date: row.dot_expiration_date ?? null,
    qual_cert_expiration_date: row.qual_cert_expiration_date ?? null,
    daily_pay_effective_date: row.daily_pay_effective_date ?? null,
    daily_pay_rate: row.daily_pay_rate ?? null,
    trainee_daily_pay_rate: row.trainee_daily_pay_rate ?? null,
    trainee_pay_effective_start: row.trainee_pay_effective_start ?? null,
    scanner_serial: row.scanner_serial ?? null,
    fuel_card: row.fuel_card ?? null,
    pin_id_no: row.pin_id_no ?? null,
    candidate_stage_key: row.candidate_stage_key ?? null,
    candidate_stage_label: row.candidate_stage_label ?? null,
    candidate_stage_is_terminal: row.candidate_stage_is_terminal ?? null,
  };
}

function StatCard(props: { label: string; value: number }) {

  



  return (
    <div className="hero-stat">
      <span className="hero-stat__label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export default function CompanyRosterPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [tab, setTab] = useState<RosterTab>("active");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [managedPerson, setManagedPerson] = useState<RosterRow | null>(null);
  const [traineePayPerson, setTraineePayPerson] = useState<RosterRow | null>(null);
  const [traineePayEffectiveDate, setTraineePayEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [candidateWorkflowPerson, setCandidateWorkflowPerson] = useState<RosterRow | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingOperations, setSavingOperations] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [invitingPerson, setInvitingPerson] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRoster() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load roster.");
          setRows([]);
          return;
        }

        setRows(((data?.roster ?? []) as ApiRosterRow[]).map(normalizeRosterRow));
      } catch {
        if (!active) return;
        setError("Roster request failed.");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void loadRoster();

    return () => {
      active = false;
    };
  }, [slug]);

  async function refreshRoster() {
    if (!slug) return;

    const res = await fetch(`/api/company/${slug}/people/roster`, {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data?.error ?? "Failed to refresh roster.");
      return;
    }

    const nextRows = ((data?.roster ?? []) as ApiRosterRow[]).map(normalizeRosterRow);
    setRows(nextRows);

    setCandidateWorkflowPerson((current) => {
      if (!current) return current;

      return (
        nextRows.find((row) => row.roster_member_id === current.roster_member_id) ??
        null
      );
    });
  }

  async function hydrateRosterPerson(rosterId: string) {
    const res = await fetch(`/api/company/${slug}/people/roster/${rosterId}`, {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok || !data?.roster) {
      setError(data?.error ?? "Failed to hydrate person record.");
      return null;
    }

    const hydrated = normalizeRosterRow(data.roster as ApiRosterRow);

    setRows((current) =>
      current.map((row) =>
        row.roster_member_id === hydrated.roster_member_id ? hydrated : row
      )
    );

    setManagedPerson((current) =>
      current?.roster_member_id === hydrated.roster_member_id ? hydrated : current
    );

    return hydrated;
  }

  const filteredRows = useMemo(() => {
    const byTab =
      tab === "all"
        ? rows
        : rows.filter((row) => {
            if (tab === "active") return row.employment_status === "Active";
            if (tab === "trainee") return row.employment_status === "Trainee";
            if (tab === "candidates") {
              return (
                row.employment_status === "Candidate" &&
                row.candidate_stage_is_terminal !== true
              );
            }
            if (tab === "former") return row.employment_status === "Former";
            return true;
          });

    const q = search.trim().toLowerCase();
    if (!q) return byTab;

    return byTab.filter((row) =>
      [
        row.full_name,
        row.email,
        row.phone,
        row.worker_type,
        row.market_code,
        row.reports_to_name,
        row.invite_status,
        row.compliance_summary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search, tab]);

  const activeCount = rows.filter((r) => r.employment_status === "Active").length;
  const traineeCount = rows.filter((r) => r.employment_status === "Trainee").length;
  const candidateCount = rows.filter((r) => r.employment_status === "Candidate").length;
  const formerCount = rows.filter((r) => r.employment_status === "Former").length;
  const complianceAlertCount = rows.filter(
    (r) => r.compliance_summary !== "Compliant"
  ).length;

  async function hydrateManagedPerson(row: RosterRow) {
    await hydrateRosterPerson(row.roster_member_id);
  }

  function openWorkflowDrawer(row: RosterRow) {
    if (row.employment_status === "Candidate") {
      setCandidateWorkflowPerson(row);
      setManagedPerson(null);
      return;
    }

    setManagedPerson(row);
    setCandidateWorkflowPerson(null);
    void hydrateManagedPerson(row);
  }

  async function loadTimeline(rosterId: string) {
    try {
      setLoadingTimeline(true);

      const res = await fetch(`/api/company/${slug}/people/roster/${rosterId}/events`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setTimelineEvents([]);
        return;
      }

      setTimelineEvents((data?.events ?? []) as TimelineEvent[]);
    } catch {
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function savePersonDetails(draft: {
    full_name: string;
    email: string;
    phone: string;
    worker_type: string;
    market_code: string;
    notes: string;

    date_of_birth: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    state_region: string;
    postal_code: string;

    license_number: string;
    issuing_state: string;
    license_issue_date: string;
    license_expiration_date: string;
  }) {
    if (!managedPerson) return;

    setSavingDetails(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${managedPerson.roster_member_id}/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save person details.");
        return;
      }

      await hydrateRosterPerson(managedPerson.roster_member_id);
    } catch {
      setError("Failed to save person details.");
    } finally {
      setSavingDetails(false);
    }
  }


  async function saveOperations(draft: {
    fx_id: string;
    dswid: string;
    scanner_serial: string;
    dot_expiration_date: string;
    qual_cert_expiration_date: string;
    daily_pay_effective_date: string;
  daily_pay_rate: string;
    fuel_card: string;
    pin_id_no: string;
  }) {
    if (!managedPerson) return;

    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${managedPerson.roster_member_id}/operations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save operations.");
        return;
      }

      await hydrateRosterPerson(managedPerson.roster_member_id);
    } catch {
      setError("Failed to save operations.");
    }
  }

  async function sendManagedPersonInvite() {
    if (!managedPerson) return;

    setInvitingPerson(true);
    setInviteMessage(null);
    setInviteError(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${managedPerson.roster_member_id}/invite`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setInviteError(data?.error ?? "Failed to send invite.");
        return;
      }

      const nextInviteStatus = String(data?.invite_status ?? "Invited");

      setRows((current) =>
        current.map((row) =>
          row.roster_member_id === managedPerson.roster_member_id
            ? {
                ...row,
                invite_status: nextInviteStatus,
              }
            : row
        )
      );

      setManagedPerson((current) =>
        current
          ? {
              ...current,
              invite_status: nextInviteStatus,
            }
          : current
      );

      setTimelineEvents((current) => [
        {
          id: `local-invite-${Date.now()}`,
          event_category: "onboarding",
          event_type: "invite_sent",
          event_detail: "Invite sent from person drawer.",
          event_metadata: {
            email: typeof data?.email === "string" ? data.email : null,
          },
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);

      setInviteMessage("Invite sent.");
      await refreshRoster();
    } catch {
      setInviteError("Failed to send invite.");
    } finally {
      setInvitingPerson(false);
    }
  }

  async function saveStatus(draft: {
    employment_status: "Active" | "Candidate" | "Trainee" | "Former";
    effective_date: string;
    note: string;
  }) {
    if (!managedPerson) return;

    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${managedPerson.roster_member_id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to update status.");
        return;
      }

      const nextStatus =
        data?.roster?.employment_status ?? draft.employment_status;

      setRows((current) =>
        current.map((row) =>
          row.roster_member_id === managedPerson.roster_member_id
            ? {
                ...row,
                employment_status: nextStatus,
              }
            : row
        )
      );

      const updatedManagedPerson = await hydrateRosterPerson(
        managedPerson.roster_member_id
      );

      if (nextStatus === "Trainee" && updatedManagedPerson) {
        setTraineePayEffectiveDate(draft.effective_date);
        setTraineePayPerson(updatedManagedPerson);
      }
    } catch {
      setError("Failed to update status.");
    }
  }


  return (
    <main className="landing-page">
      <section
        style={{
          width: "min(1440px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "28px 0 32px",
          display: "grid",
          gap: 16,
        }}
      >
        {error ? (
          <article className="value-card" style={{ padding: 14 }}>
            <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>
              {error}
            </p>
          </article>
        ) : null}

        <article className="value-card">
          <RosterControlsBar
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
            counts={{
              active: activeCount,
              trainee: traineeCount,
              candidates: candidateCount,
              former: formerCount,
              all: rows.length,
              complianceAlerts: complianceAlertCount,
            }}
          />
        </article>

        <article className="value-card" style={{ padding: 18, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <p className="value-card__eyebrow">Roster table</p>
              <h3 className="value-card__title">Operational people records</h3>
              <p className="value-card__body">
                Use Manage to update details, status, invite posture, compliance, and lifecycle history.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="value-card__body">Loading roster...</p>
          ) : (
            <RosterTable rows={filteredRows} onManagePerson={openWorkflowDrawer} />
          )}
        </article>

        <CandidateWorkflowDrawer
          open={Boolean(candidateWorkflowPerson)}
          slug={slug}
          person={candidateWorkflowPerson}
          onSaved={(updated) => {
            setRows((current) =>
              current.map((row) =>
                row.roster_member_id === updated.roster_member_id ? updated : row
              )
            );

            if (updated.candidate_stage_is_terminal === true) {
              setCandidateWorkflowPerson(null);
              void refreshRoster();
              return;
            }

            setCandidateWorkflowPerson(updated);
          }}
          onRefresh={refreshRoster}
          onClose={() => setCandidateWorkflowPerson(null)}
        />

        <ManagePersonDrawer
          open={Boolean(managedPerson)}
          person={managedPerson}
          savingDetails={savingDetails}
          savingOperations={savingOperations}
          savingStatus={savingStatus}
          inviting={invitingPerson}
          inviteError={inviteError}
          inviteMessage={inviteMessage}
          onSaveDetails={savePersonDetails}
          onSaveOperations={saveOperations}
          onSaveStatus={saveStatus}
          onSendInvite={sendManagedPersonInvite}
          timelineEvents={timelineEvents}
          loadingTimeline={loadingTimeline}
          onClose={() => {
            setManagedPerson(null);
            setTimelineEvents([]);
            setInviteMessage(null);
            setInviteError(null);
          }}
        />
      <TraineePayOverrideOverlay
        open={Boolean(traineePayPerson)}
        slug={slug}
        person={traineePayPerson}
        effectiveDate={traineePayEffectiveDate}
        onClose={() => setTraineePayPerson(null)}
        onSaved={refreshRoster}
      />

      </section>
    </main>
  );
}
