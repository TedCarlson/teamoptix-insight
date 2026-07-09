"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { DrawerSection, FactRow, compactInput } from "./PersonDrawerRows";

export type CoreDraft = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
  notes: string;
  hire_date: string;

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
};

type Props = {
  person: RosterRow;
  saving: boolean;
  onSave: (draft: CoreDraft) => Promise<void>;
};

function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildDraft(person: RosterRow): CoreDraft {
  return {
    full_name: person.full_name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    worker_type: person.worker_type ?? "",
    market_code: person.market_code ?? "",
    notes: person.notes ?? "",
    hire_date: toInputDate(person.hire_date),

    date_of_birth: toInputDate(person.date_of_birth),
    address_line_1: person.address_line_1 ?? "",
    address_line_2: person.address_line_2 ?? "",
    city: person.city ?? "",
    state_region: person.state_region ?? "",
    postal_code: person.postal_code ?? "",

    license_number: person.license_number ?? "",
    issuing_state: person.issuing_state ?? "",
    license_issue_date: toInputDate(person.license_issue_date),
    license_expiration_date: toInputDate(person.license_expiration_date),
  };
}

function TextInput(props: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="hero-stat__label">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder ?? props.label}
        style={compactInput}
      />
    </label>
  );
}

export default function PersonCoreSection({ person, saving, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CoreDraft>(() => buildDraft(person));

  function beginEdit() {
    setDraft(buildDraft(person));
    setEditing(true);
  }

  async function save() {
    const original = buildDraft(person);
    const dirty = Object.fromEntries(
      Object.entries(draft).filter(
        ([key, value]) => value !== original[key as keyof CoreDraft]
      )
    ) as Partial<CoreDraft>;

    await onSave(dirty as CoreDraft);
    setEditing(false);
  }

  return (
    <DrawerSection
      eyebrow="Details"
      title="Core record"
      editing={editing}
      saving={saving}
      onEdit={() => (editing ? setEditing(false) : beginEdit())}
    >
      {!editing ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <FactRow label="Name" value={person.full_name} />
            <FactRow label="Email" value={person.email} />
            <FactRow label="Phone" value={person.phone} />
            <FactRow label="Role" value={person.worker_type} />
            <FactRow label="Market" value={person.market_code} />
            <FactRow label="Reports to" value={person.reports_to_name} />
            <FactRow label="Notes" value={person.notes} />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>
              Private profile
            </p>
            <FactRow label="DOB" value={person.date_of_birth} />
            <FactRow label="Address 1" value={person.address_line_1} />
            <FactRow label="Address 2" value={person.address_line_2} />
            <FactRow label="City" value={person.city} />
            <FactRow label="State / Territory" value={person.state_region} />
            <FactRow label="Zip Code" value={person.postal_code} />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>
              Driver license
            </p>
            <FactRow label="License" value={person.license_number} />
            <FactRow label="Issuing State" value={person.issuing_state} />
            <FactRow label="Issue Date" value={person.license_issue_date} />
            <FactRow label="Expiration Date" value={person.license_expiration_date} />
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <TextInput
              label="Full Name"
              value={draft.full_name}
              onChange={(value) => setDraft((d) => ({ ...d, full_name: value }))}
            />
            <TextInput
              label="Email"
              value={draft.email}
              onChange={(value) => setDraft((d) => ({ ...d, email: value }))}
            />
            <TextInput
              label="Phone"
              value={draft.phone}
              onChange={(value) => setDraft((d) => ({ ...d, phone: value }))}
            />
            <TextInput
              label="Role"
              value={draft.worker_type}
              onChange={(value) => setDraft((d) => ({ ...d, worker_type: value }))}
            />
            <TextInput
              label="Market"
              value={draft.market_code}
              onChange={(value) => setDraft((d) => ({ ...d, market_code: value }))}
            />
            <TextInput
              label="Hire Date"
              type="date"
              value={draft.hire_date}
              onChange={(value) => setDraft((d) => ({ ...d, hire_date: value }))}
            />
            <TextInput
              label="DOB"
              type="date"
              value={draft.date_of_birth}
              onChange={(value) => setDraft((d) => ({ ...d, date_of_birth: value }))}
            />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>
              Address
            </p>
            <TextInput
              label="Address Line 1"
              value={draft.address_line_1}
              onChange={(value) => setDraft((d) => ({ ...d, address_line_1: value }))}
            />
            <TextInput
              label="Address Line 2"
              value={draft.address_line_2}
              onChange={(value) => setDraft((d) => ({ ...d, address_line_2: value }))}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              <TextInput
                label="City"
                value={draft.city}
                onChange={(value) => setDraft((d) => ({ ...d, city: value }))}
              />
              <TextInput
                label="State / Territory"
                value={draft.state_region}
                onChange={(value) => setDraft((d) => ({ ...d, state_region: value }))}
              />
              <TextInput
                label="Zip Code"
                value={draft.postal_code}
                onChange={(value) => setDraft((d) => ({ ...d, postal_code: value }))}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>
              Driver license
            </p>
            <TextInput
              label="Driver's License"
              value={draft.license_number}
              onChange={(value) => setDraft((d) => ({ ...d, license_number: value }))}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              <TextInput
                label="Issuing State"
                value={draft.issuing_state}
                onChange={(value) => setDraft((d) => ({ ...d, issuing_state: value }))}
              />
              <TextInput
                label="Issue Date"
                type="date"
                value={draft.license_issue_date}
                onChange={(value) => setDraft((d) => ({ ...d, license_issue_date: value }))}
              />
              <TextInput
                label="Expiration Date"
                type="date"
                value={draft.license_expiration_date}
                onChange={(value) =>
                  setDraft((d) => ({ ...d, license_expiration_date: value }))
                }
              />
            </div>
          </div>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) =>
                setDraft((d) => ({ ...d, notes: event.target.value }))
              }
              placeholder="Notes"
              style={{
                ...compactInput,
                minHeight: 74,
                paddingTop: 10,
                resize: "vertical",
              }}
            />
          </label>

          <button
            className="button button-primary"
            type="button"
            disabled={saving || !draft.full_name.trim()}
            onClick={save}
          >
            {saving ? "Saving..." : "Save details"}
          </button>
        </div>
      )}
    </DrawerSection>
  );
}
