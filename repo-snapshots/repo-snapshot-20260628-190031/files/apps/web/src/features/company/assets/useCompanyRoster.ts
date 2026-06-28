"use client";

import { useEffect, useState } from "react";

export type AssetDriverOption = {
  roster_member_id: string;
  full_name: string;
  employment_status: string;
};

type RosterApiRow = {
  roster_member_id?: string | null;
  full_name?: string | null;
  worker_type?: string | null;
  employment_status?: string | null;
};

export function useCompanyRoster(companySlug: string) {
  const [drivers, setDrivers] = useState<AssetDriverOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!companySlug) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/company/${companySlug}/people/roster`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));
        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load roster.");
          setDrivers([]);
          return;
        }

        const rows = Array.isArray(data?.roster) ? (data.roster as RosterApiRow[]) : [];

        setDrivers(
          rows
            .filter((row) => row.employment_status === "Active" || row.employment_status === "Trainee")
            .filter((row) => Boolean(row.roster_member_id))
            .map((row) => ({
              roster_member_id: String(row.roster_member_id),
              full_name: row.full_name ?? "Unnamed driver",
              employment_status: row.employment_status ?? "Active",
            }))
            .sort((a, b) => a.full_name.localeCompare(b.full_name))
        );
      } catch {
        if (!active) return;
        setError("Failed to load roster.");
        setDrivers([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [companySlug]);

  return { drivers, loading, error };
}
