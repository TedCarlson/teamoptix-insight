import { useEffect, useState } from "react";
import type {
  ApiEventRow,
  ApiRosterRow,
  PersonRecord,
} from "@/features/people/lib/person-detail.types";

export function useActivePersonDetailData(slug: string, rosterId: string) {
  const [person, setPerson] = useState<PersonRecord | null>(null);
  const [events, setEvents] = useState<ApiEventRow[]>([]);

  const [loadingPerson, setLoadingPerson] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPerson() {
      try {
        setLoadingPerson(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load person.");
          setPerson(null);
          return;
        }

        const found = ((data?.roster ?? []) as ApiRosterRow[]).find(
          (row) => row.roster_member_id === rosterId
        );

        if (!found) {
          setError("Person record not found.");
          setPerson(null);
          return;
        }

        setPerson({
          id: found.roster_member_id,
          full_name: found.full_name ?? "Unknown",
          worker_type: found.worker_type ?? "Unassigned",
          employment_status: found.employment_status ?? "Active",
          market_code: found.market_code ?? "—",
          reports_to_name: found.reports_to_name ?? "—",
          hire_date: found.hire_date ?? "—",
          invite_status: found.invite_status ?? "Not Invited",
          compliance_summary: found.compliance_summary ?? "Missing",
          onboarding_completed_at: found.onboarding_completed_at ?? null,

          dswid: found.dswid ?? null,
          dot_expiration_date: found.dot_expiration_date ?? null,
          qual_cert_expiration_date: found.qual_cert_expiration_date ?? null,
          daily_pay: found.daily_pay ?? null,
          scanner_serial: found.scanner_serial ?? null,
        });
      } catch {
        if (!active) return;
        setError("Person request failed.");
        setPerson(null);
      } finally {
        if (active) setLoadingPerson(false);
      }
    }

    async function loadEvents() {
      try {
        setLoadingEvents(true);

        const res = await fetch(
          `/api/company/${slug}/people/roster/${rosterId}/events`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setEvents([]);
          return;
        }

        setEvents((data?.events ?? []) as ApiEventRow[]);
      } catch {
        if (!active) return;
        setEvents([]);
      } finally {
        if (active) setLoadingEvents(false);
      }
    }

    if (slug && rosterId) {
      loadPerson();
      loadEvents();
    }

    return () => {
      active = false;
    };
  }, [slug, rosterId]);

  return {
    person,
    events,
    loadingPerson,
    loadingEvents,
    error,
    setPerson,
  };
}