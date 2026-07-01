"use client";

import { useEffect, useState } from "react";
import { PayrollTimeKeepingTable } from "@/features/payroll/components/PayrollTimeKeepingTable";
import type { PayrollTimeKeepingRow } from "@/features/payroll/lib/payroll.timekeeping";

type PayrollTimeKeepingPageProps = {
  slug: string;
  weekEnd: string;
};

export function PayrollTimeKeepingPage({
  slug,
  weekEnd,
}: PayrollTimeKeepingPageProps) {
  const [rows, setRows] = useState<PayrollTimeKeepingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTimeKeeping() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/payroll/time-keeping?weekEnd=${weekEnd}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setRows([]);
          setError(data?.error ?? "Failed to load time keeping.");
          return;
        }

        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (!active) return;
        setRows([]);
        setError("Failed to load time keeping.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && weekEnd) void loadTimeKeeping();

    return () => {
      active = false;
    };
  }, [slug, weekEnd]);

  return (
    <>
      {error ? (
        <section className="value-strip" style={{ paddingTop: 12 }}>
          <div className="value-grid">
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="value-strip" style={{ paddingTop: 12 }}>
          <div className="value-grid">
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              Loading time keeping...
            </article>
          </div>
        </section>
      ) : (
        <PayrollTimeKeepingTable rows={rows} />
      )}
    </>
  );
}
