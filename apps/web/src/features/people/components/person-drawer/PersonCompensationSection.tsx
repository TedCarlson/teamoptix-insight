"use client";

import { useEffect, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import {
  annualizeCompensation,
  DEFAULT_DAYS_PER_WEEK,
  DEFAULT_HOURS_PER_WEEK,
  type CompensationBasis,
} from "@/features/people/lib/compensationModel";
import { DrawerSection, FactRow, compactInput } from "./PersonDrawerRows";

type CompensationModel = {
  basis: CompensationBasis;
  rate: number | null;
  effective_date: string | null;
  hours_per_week: number;
  days_per_week: number;
  source: "MODEL" | "LEGACY_DAILY" | "DEFAULT";
  persisted: boolean;
};

type Draft = {
  basis: CompensationBasis;
  rate: string;
  effective_date: string;
  hours_per_week: string;
  days_per_week: string;
};

type Props = {
  companySlug: string;
  person: RosterRow;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const annualMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toDraft(model: CompensationModel): Draft {
  return {
    basis: model.basis,
    rate: model.rate == null ? "" : String(model.rate),
    effective_date: model.effective_date ?? today(),
    hours_per_week: String(model.hours_per_week ?? DEFAULT_HOURS_PER_WEEK),
    days_per_week: String(model.days_per_week ?? DEFAULT_DAYS_PER_WEEK),
  };
}

function basisLabel(basis: CompensationBasis) {
  if (basis === "HOURLY") return "Hourly";
  if (basis === "DAILY") return "Daily";
  return "Weekly salary";
}

function rateLabel(model: CompensationModel) {
  if (model.rate == null) return null;
  const suffix =
    model.basis === "HOURLY"
      ? "/hour"
      : model.basis === "DAILY"
        ? "/day"
        : "/week";
  return `${money.format(model.rate)}${suffix}`;
}

function assumptionLabel(model: CompensationModel) {
  if (model.basis === "HOURLY") return `${model.hours_per_week} hours/week × 52 weeks`;
  if (model.basis === "DAILY") return `${model.days_per_week} days/week × 52 weeks`;
  return "52 weeks/year";
}

export default function PersonCompensationSection({ companySlug, person }: Props) {
  const [model, setModel] = useState<CompensationModel | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/company/${companySlug}/people/roster/${person.roster_member_id}/compensation`,
          { credentials: "include" },
        );
        const data = await response.json();

        if (!active) return;
        if (!response.ok) {
          setError(data?.detail ?? data?.error ?? "Failed to load compensation.");
          return;
        }

        setModel(data.model as CompensationModel);
      } catch {
        if (active) setError("Failed to load compensation.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [companySlug, person.roster_member_id]);

  function beginEdit() {
    if (!model) return;
    setDraft(toDraft(model));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/company/${companySlug}/people/roster/${person.roster_member_id}/compensation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            basis: draft.basis,
            rate: draft.rate,
            effective_date: draft.effective_date,
            hours_per_week: draft.hours_per_week,
            days_per_week: draft.days_per_week,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to save compensation.");
        return;
      }

      setModel(data.model as CompensationModel);
      setEditing(false);
    } catch {
      setError("Failed to save compensation.");
    } finally {
      setSaving(false);
    }
  }

  const preview = draft
    ? annualizeCompensation({
        basis: draft.basis,
        rate: Number(draft.rate),
        hoursPerWeek: Number(draft.hours_per_week),
        daysPerWeek: Number(draft.days_per_week),
      })
    : 0;

  const annual = model?.rate == null
    ? null
    : annualizeCompensation({
        basis: model.basis,
        rate: model.rate,
        hoursPerWeek: model.hours_per_week,
        daysPerWeek: model.days_per_week,
      });

  return (
    <DrawerSection
      eyebrow="Compensation"
      title="Earnings model"
      editing={editing}
      saving={saving || loading}
      onEdit={() => (editing ? setEditing(false) : beginEdit())}
    >
      <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
        Modeling only. Live payroll continues using the Daily Pay Rate in FedEx workforce fields.
      </p>

      {loading ? <p style={{ margin: 0 }}>Loading compensation…</p> : null}

      {!loading && !editing && model ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FactRow label="Structure" value={basisLabel(model.basis)} />
          <FactRow label="Rate" value={rateLabel(model)} />
          <FactRow
            label="Annual estimate"
            value={annual == null ? null : annualMoney.format(annual)}
          />
          <FactRow label="Assumption" value={assumptionLabel(model)} />
          <FactRow label="Effective" value={model.effective_date} />
        </div>
      ) : null}

      {editing && draft ? (
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Pay structure</span>
            <select
              value={draft.basis}
              onChange={(event) =>
                setDraft((current) => current && ({
                  ...current,
                  basis: event.target.value as CompensationBasis,
                }))
              }
              style={compactInput}
            >
              <option value="HOURLY">Hourly</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly salary</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Rate</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.rate}
              onChange={(event) =>
                setDraft((current) => current && ({ ...current, rate: event.target.value }))
              }
              style={compactInput}
            />
          </label>

          {draft.basis === "HOURLY" ? (
            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Hours per week</span>
              <input
                type="number"
                min="0.01"
                max="168"
                step="0.25"
                value={draft.hours_per_week}
                onChange={(event) =>
                  setDraft((current) => current && ({ ...current, hours_per_week: event.target.value }))
                }
                style={compactInput}
              />
            </label>
          ) : null}

          {draft.basis === "DAILY" ? (
            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Days per week</span>
              <input
                type="number"
                min="0.01"
                max="7"
                step="0.25"
                value={draft.days_per_week}
                onChange={(event) =>
                  setDraft((current) => current && ({ ...current, days_per_week: event.target.value }))
                }
                style={compactInput}
              />
            </label>
          ) : null}

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Effective date</span>
            <input
              type="date"
              value={draft.effective_date}
              onChange={(event) =>
                setDraft((current) => current && ({ ...current, effective_date: event.target.value }))
              }
              style={compactInput}
            />
          </label>

          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              display: "grid",
              gap: 4,
            }}
          >
            <span className="hero-stat__label">Estimated annual earnings</span>
            <strong style={{ color: "#1d4ed8", fontSize: 22 }}>
              {annualMoney.format(preview)}
            </strong>
          </div>

          <button
            className="button button-primary"
            type="button"
            disabled={saving || !draft.rate || !draft.effective_date}
            onClick={save}
          >
            {saving ? "Saving..." : "Save compensation model"}
          </button>
        </div>
      ) : null}

      {error ? <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>{error}</p> : null}
    </DrawerSection>
  );
}
