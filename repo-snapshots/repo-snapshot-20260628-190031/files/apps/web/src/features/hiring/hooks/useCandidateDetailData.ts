import { useEffect, useState } from "react";
import type {
  ApiRosterRow,
  ApiEventRow,
  CandidateRecord,
  OnboardingPayload,
} from "@/features/hiring/lib/candidate-detail.types";

export function useCandidateDetailData(slug: string, rosterId: string) {
  const [candidate, setCandidate] = useState<CandidateRecord | null>(null);
  const [events, setEvents] = useState<ApiEventRow[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingPayload | null>(null);

  const [loadingCandidate, setLoadingCandidate] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCandidate() {
      try {
        setLoadingCandidate(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/people/roster/${rosterId}`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load candidate.");
          setCandidate(null);
          return;
        }

        const found = data?.roster as ApiRosterRow | null;

        if (!found) {
          setError("Candidate record not found.");
          setCandidate(null);
          return;
        }

        setCandidate({
          id: found.roster_member_id,
          full_name: found.full_name ?? "Unknown",
          email: found.email ?? null,
          phone: found.phone ?? null,
          worker_type: found.worker_type ?? "Unassigned",
          employment_status: found.employment_status ?? "Candidate",
          market_code: found.market_code ?? "—",
          reports_to_name: found.reports_to_name ?? "—",
          hire_date: found.hire_date ?? "—",
          invite_status: found.invite_status ?? "Not Invited",
          compliance_summary: found.compliance_summary ?? "Missing",
          onboarding_completed_at: found.onboarding_completed_at ?? null,
        });
      } catch {
        if (!active) return;
        setError("Candidate request failed.");
        setCandidate(null);
      } finally {
        if (active) setLoadingCandidate(false);
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

    async function loadOnboarding() {
      try {
        setLoadingOnboarding(true);

        const res = await fetch(
          `/api/company/${slug}/people/roster/${rosterId}/onboarding`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setOnboarding(null);
          return;
        }

        setOnboarding((data?.onboarding ?? null) as OnboardingPayload | null);
      } catch {
        if (!active) return;
        setOnboarding(null);
      } finally {
        if (active) setLoadingOnboarding(false);
      }
    }

    if (slug && rosterId) {
      loadCandidate();
      loadEvents();
      loadOnboarding();
    }

    return () => {
      active = false;
    };
  }, [slug, rosterId]);

  return {
    candidate,
    events,
    onboarding,
    loadingCandidate,
    loadingEvents,
    loadingOnboarding,
    error,
    setCandidate,
    setEvents,
  };
}
