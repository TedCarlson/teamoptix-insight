import type { PersonRecord } from "@/features/people/lib/person-detail.types";

function formatOptionalDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function formatDailyPay(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

export default function ActiveOperationalPanel(props: {
  person: PersonRecord | null;
  loading: boolean;
}) {
  const { person, loading } = props;

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Operations</p>
      <h3 className="value-card__title">Active workforce posture</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        FedEx / last-mile workforce fields for operational, compliance, and equipment posture.
      </p>

      {loading ? (
        <div style={{ paddingTop: 16 }}>Loading active posture...</div>
      ) : (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div className="hero-stat">
              <span className="hero-stat__label">DSWID</span>
              <strong>{person?.dswid ?? "—"}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Scanner serial</span>
              <strong>{person?.scanner_serial ?? "—"}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Daily pay</span>
              <strong>{formatDailyPay(person?.daily_pay ?? null)}</strong>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div className="hero-stat">
              <span className="hero-stat__label">DOT expiration</span>
              <strong>
                {formatOptionalDate(person?.dot_expiration_date ?? null)}
              </strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Qual cert expiration</span>
              <strong>
                {formatOptionalDate(person?.qual_cert_expiration_date ?? null)}
              </strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Supervisor</span>
              <strong>{person?.reports_to_name ?? "—"}</strong>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}