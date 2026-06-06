"use client";

import type { RosterRow } from "@/features/people/types/roster.types";

type Props = {
  open: boolean;
  person: RosterRow | null;
  onClose: () => void;
};

function Row(props: { label: string; value: string | null | undefined }) {
  return (
    <div className="hero-stat">
      <span className="hero-stat__label">{props.label}</span>
      <strong>{props.value || "—"}</strong>
    </div>
  );
}

export default function ManagePersonDrawer({ open, person, onClose }: Props) {
  if (!open || !person) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.28)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        style={{
          width: "min(720px, 100%)",
          height: "100%",
          overflow: "auto",
          background: "#fff",
          borderLeft: "1px solid #d6dfeb",
          boxShadow: "-24px 0 60px rgba(15, 23, 42, 0.18)",
          padding: 18,
          display: "grid",
          gap: 14,
          alignContent: "start",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid #e6edf5",
            paddingBottom: 14,
          }}
        >
          <div>
            <p className="eyebrow">Person record</p>
            <h2 style={{ margin: "2px 0 0", fontSize: 24 }}>
              {person.full_name}
            </h2>
            <p className="workspace-card-body" style={{ marginTop: 6 }}>
              {person.employment_status} · {person.worker_type || "Unassigned"} · Market{" "}
              {person.market_code || "—"}
            </p>
          </div>

          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="workspace-card">
          <p className="workspace-eyebrow">Details</p>
          <h3 className="workspace-card-title">Core record</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <Row label="Display name" value={person.full_name} />
            <Row label="Email" value={person.email} />
            <Row label="Phone" value={person.phone} />
            <Row label="Worker type" value={person.worker_type} />
            <Row label="Market" value={person.market_code} />
            <Row label="Reports to" value={person.reports_to_name} />
          </div>
        </section>

        <section className="workspace-card">
          <p className="workspace-eyebrow">Status</p>
          <h3 className="workspace-card-title">Lifecycle posture</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <Row label="Employment status" value={person.employment_status} />
            <Row label="Invite status" value={person.invite_status} />
            <Row label="Compliance" value={person.compliance_summary} />
            <Row label="Start date" value={person.hire_date} />
          </div>
        </section>

        <section className="workspace-card">
          <p className="workspace-eyebrow">Timeline</p>
          <h3 className="workspace-card-title">Change log</h3>
          <p className="workspace-card-body">
            Every saved change will write to the lifecycle event log and appear here.
          </p>
        </section>
      </aside>
    </div>
  );
}
