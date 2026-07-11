"use client";

import { useEffect, useState } from "react";

type RepairRow = {
  roster_member_id: string;
  person_name: string;
  daily_pay_rate: number | null;
  daily_pay_effective_date: string | null;
  missing_daily_pay_rate: boolean;
  missing_daily_pay_effective_date: boolean;
  issue_codes: string[];
  affected_service_dates: string[];
  source_row_count: number;
};

type Draft = {
  daily_pay_rate: string;
  daily_pay_effective_date: string;
};

export default function PayrollRecordRepairTool({
  slug,
  weekEnd,
  onChanged,
}: {
  slug: string;
  weekEnd: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/payroll/record-repairs?weekEnd=${weekEnd}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load payroll record repairs.");
      }

      const repairs = Array.isArray(data?.repairs)
        ? (data.repairs as RepairRow[])
        : [];

      setRows(repairs);
      setDrafts(
        Object.fromEntries(
          repairs.map((row) => [
            row.roster_member_id,
            {
              daily_pay_rate:
                row.daily_pay_rate == null
                  ? ""
                  : String(row.daily_pay_rate),
              daily_pay_effective_date:
                row.daily_pay_effective_date ?? "",
            },
          ])
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load payroll record repairs."
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, weekEnd]);

  function updateDraft(
    rosterId: string,
    field: keyof Draft,
    value: string
  ) {
    setDrafts((current) => ({
      ...current,
      [rosterId]: {
        daily_pay_rate:
          current[rosterId]?.daily_pay_rate ?? "",
        daily_pay_effective_date:
          current[rosterId]?.daily_pay_effective_date ?? "",
        [field]: value,
      },
    }));
  }

  async function saveRepair(row: RepairRow) {
    const draft = drafts[row.roster_member_id];

    if (!draft?.daily_pay_effective_date) {
      setError(`${row.person_name} requires a Daily Pay Effective date.`);
      return;
    }

    const rate = Number(draft.daily_pay_rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      setError(`${row.person_name} requires a valid Daily Pay Rate.`);
      return;
    }

    setSaving(row.roster_member_id);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${row.roster_member_id}/operations`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            daily_pay_effective_date:
              draft.daily_pay_effective_date,
            daily_pay_rate: rate,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.detail ??
            data?.error ??
            "Failed to repair payroll record."
        );
      }

      setMessage(`${row.person_name} payroll record repaired.`);
      await load();
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to repair payroll record."
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      {error ? (
        <div style={{ color: "#991b1b", fontWeight: 900 }}>
          {error}
        </div>
      ) : null}

      {message ? (
        <div style={{ color: "#166534", fontWeight: 900 }}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "#64748b", fontWeight: 800 }}>
          Loading payroll record repairs...
        </div>
      ) : rows.length === 0 ? (
        <div style={{ color: "#166534", fontWeight: 900 }}>
          No payroll record repairs are needed.
        </div>
      ) : (
        rows.map((row) => {
          const draft = drafts[row.roster_member_id] ?? {
            daily_pay_rate: "",
            daily_pay_effective_date: "",
          };

          const issueLabels = [
            row.missing_daily_pay_effective_date
              ? "Daily Pay Effective date missing"
              : null,
            row.missing_daily_pay_rate
              ? "Daily Pay Rate missing"
              : null,
          ].filter(Boolean);

          return (
            <article
              key={row.roster_member_id}
              style={{
                border: "1px solid #e6edf5",
                borderRadius: 12,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 950 }}>
                  {row.person_name}
                </div>

                <div
                  style={{
                    color: "#991b1b",
                    fontSize: 12,
                    fontWeight: 850,
                    marginTop: 2,
                  }}
                >
                  {issueLabels.join(" · ")}
                </div>

                <div
                  style={{
                    color: "#64748b",
                    fontSize: 12,
                    fontWeight: 750,
                    marginTop: 2,
                  }}
                >
                  {row.source_row_count} source row
                  {row.source_row_count === 1 ? "" : "s"} ·{" "}
                  {row.affected_service_dates.join(", ")}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1fr) minmax(0, 1fr) auto",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <label style={{ display: "grid", gap: 5 }}>
                  <span
                    style={{
                      color: "#475569",
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Daily Pay Effective
                  </span>

                  <input
                    type="date"
                    value={draft.daily_pay_effective_date}
                    onChange={(event) =>
                      updateDraft(
                        row.roster_member_id,
                        "daily_pay_effective_date",
                        event.target.value
                      )
                    }
                    style={{
                      height: 42,
                      borderRadius: 10,
                      border: "1px solid #d6dfeb",
                      padding: "0 10px",
                      font: "inherit",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 5 }}>
                  <span
                    style={{
                      color: "#475569",
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Daily Pay Rate
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={draft.daily_pay_rate}
                    onChange={(event) =>
                      updateDraft(
                        row.roster_member_id,
                        "daily_pay_rate",
                        event.target.value
                      )
                    }
                    placeholder="0.00"
                    style={{
                      height: 42,
                      borderRadius: 10,
                      border: "1px solid #d6dfeb",
                      padding: "0 10px",
                      font: "inherit",
                    }}
                  />
                </label>

                <button
                  type="button"
                  className="button button-primary"
                  disabled={saving === row.roster_member_id}
                  onClick={() => void saveRepair(row)}
                  style={{ minHeight: 42 }}
                >
                  {saving === row.roster_member_id
                    ? "Saving..."
                    : "Save Repair"}
                </button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
