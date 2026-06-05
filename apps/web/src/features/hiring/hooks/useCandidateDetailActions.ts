import type {
  ApiEventRow,
  CandidateRecord,
} from "@/features/hiring/lib/candidate-detail.types";

type Args = {
  slug: string;
  rosterId: string;
  setError: (value: string | null) => void;
  setCandidate: React.Dispatch<React.SetStateAction<CandidateRecord | null>>;
  setEvents: React.Dispatch<React.SetStateAction<ApiEventRow[]>>;
};

export function useCandidateDetailActions(args: Args) {
  const { slug, rosterId, setError, setCandidate, setEvents } = args;

  async function activateCandidate(
    setActivating: (value: boolean) => void
  ) {
    try {
      setActivating(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${rosterId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            employment_status: "Active",
            effective_date: new Date().toISOString().slice(0, 10),
            note: "Activated from candidate detail.",
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Failed to activate candidate.");
        return;
      }

      setCandidate((current) =>
        current
          ? {
              ...current,
              employment_status: data?.roster?.employment_status ?? "Active",
            }
          : current
      );

      window.location.href = `/company/${slug}/people/active/${rosterId}`;

      setEvents((current) => [
        {
          id: `local-activate-${Date.now()}`,
          company_id: "",
          roster_id: rosterId,
          event_category: "lifecycle",
          event_type: "candidate_activated",
          event_detail: "Candidate activated from candidate detail.",
          event_metadata: null,
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch {
      setError("Failed to activate candidate.");
    } finally {
      setActivating(false);
    }
  }

  async function sendInvite(
    setInviting: (value: boolean) => void
  ) {
    try {
      setInviting(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${rosterId}/invite`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Failed to send invite.");
        return;
      }

      const nextInviteStatus = String(data?.invite_status ?? "Invited");

      setCandidate((current) =>
        current
          ? {
              ...current,
              invite_status: nextInviteStatus,
            }
          : current
      );

      setEvents((current) => [
        {
          id: `local-invite-${Date.now()}`,
          company_id: "",
          roster_id: rosterId,
          event_category: "onboarding",
          event_type: "invite_sent",
          event_detail: "Invite sent from candidate detail.",
          event_metadata: {
            email: typeof data?.email === "string" ? data.email : null,
          },
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch {
      setError("Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  return {
    activateCandidate,
    sendInvite,
  };
}
