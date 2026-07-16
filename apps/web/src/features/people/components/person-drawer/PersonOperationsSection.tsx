"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import {
  DrawerSection,
  FactRow,
  compactInput,
} from "./PersonDrawerRows";

export type OperationsDraft = {
  fx_id: string;
  dswid: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay_effective_date: string;
  daily_pay_rate: string;
};

type Props = {
  person: RosterRow;
  saving: boolean;
  onSave: (draft: OperationsDraft) => Promise<void>;
};

function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildDraft(person: RosterRow): OperationsDraft {
  return {
    fx_id: person.fx_id ?? "",
    dswid: person.dswid ?? "",
    dot_expiration_date: toInputDate(
      person.dot_expiration_date,
    ),
    qual_cert_expiration_date: toInputDate(
      person.qual_cert_expiration_date,
    ),
    daily_pay_effective_date: toInputDate(
      person.daily_pay_effective_date,
    ),
    daily_pay_rate:
      person.daily_pay_rate == null
        ? ""
        : String(person.daily_pay_rate),
  };
}

export default function PersonOperationsSection({
  person,
  saving,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OperationsDraft>(() =>
    buildDraft(person),
  );

  function beginEdit() {
    setDraft(buildDraft(person));
    setEditing(true);
  }

  async function save() {
    const original = buildDraft(person);

    const dirty = Object.fromEntries(
      Object.entries(draft).filter(
        ([key, value]) =>
          value !==
          original[key as keyof OperationsDraft],
      ),
    ) as Partial<OperationsDraft>;

    await onSave(dirty as OperationsDraft);
    setEditing(false);
  }

  return (
    <DrawerSection
      eyebrow="Operations"
      title="FedEx workforce fields"
      editing={editing}
      saving={saving}
      onEdit={() =>
        editing ? setEditing(false) : beginEdit()
      }
    >
      {!editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FactRow label="FX ID" value={person.fx_id} />
          <FactRow label="DSWID" value={person.dswid} />
          <FactRow
            label="DOT Exp"
            value={person.dot_expiration_date}
          />
          <FactRow
            label="Qual Cert"
            value={person.qual_cert_expiration_date}
          />
          <FactRow
            label="Daily Pay Effective"
            value={person.daily_pay_effective_date}
          />
          <FactRow
            label="Daily Pay Rate"
            value={
              person.daily_pay_rate == null
                ? null
                : `$${person.daily_pay_rate}`
            }
          />

          {person.trainee_daily_pay_rate != null ? (
            <div
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 14,
                background: "#f8fafc",
                padding: "10px 12px",
                display: "grid",
                gap: 6,
              }}
            >
              <div
                style={{
                  color: "#475569",
                  fontSize: 11,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                Trainee override active
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 4,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>Base daily pay</span>
                  <strong style={{ color: "#334155" }}>
                    {person.daily_pay_rate == null
                      ? "—"
                      : `$${person.daily_pay_rate}/day`}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>Payroll override</span>
                  <strong style={{ color: "#0f172a" }}>
                    ${person.trainee_daily_pay_rate}/day
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>Effective start</span>
                  <strong style={{ color: "#334155" }}>
                    {person.trainee_pay_effective_start ??
                      "—"}
                  </strong>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">
              FX ID
            </span>
            <input
              value={draft.fx_id}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  fx_id: event.target.value,
                }))
              }
              placeholder="FX ID"
              style={compactInput}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">
              DSWID
            </span>
            <input
              value={draft.dswid}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dswid: event.target.value,
                }))
              }
              placeholder="DSWID"
              style={compactInput}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">
              DOT Exp
            </span>
            <input
              type="date"
              value={draft.dot_expiration_date}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dot_expiration_date:
                    event.target.value,
                }))
              }
              style={compactInput}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">
              Qual Cert
            </span>
            <input
              type="date"
              value={draft.qual_cert_expiration_date}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  qual_cert_expiration_date:
                    event.target.value,
                }))
              }
              style={compactInput}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">
              Daily Pay Effective
            </span>
            <input
              type="date"
              value={draft.daily_pay_effective_date}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  daily_pay_effective_date:
                    event.target.value,
                }))
              }
              style={compactInput}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">
              Daily Pay Rate
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.daily_pay_rate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  daily_pay_rate: event.target.value,
                }))
              }
              placeholder="Daily Pay Rate"
              style={compactInput}
            />
          </label>

          <button
            className="button button-primary"
            type="button"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save operations"}
          </button>
        </div>
      )}
    </DrawerSection>
  );
}
