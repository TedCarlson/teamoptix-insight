import type { PersonRecord } from "@/features/people/lib/person-detail.types";

type Args = {
  slug: string;
  rosterId: string;
  setError: (value: string | null) => void;
  setPerson: React.Dispatch<React.SetStateAction<PersonRecord | null>>;
};

function mapRosterToPersonPatch(roster: any): Partial<PersonRecord> {
  return {
    employment_status: roster?.employment_status ?? "Active",
    separation_date: roster?.separation_date ?? null,
  };
}

export function useFormerPersonDetailActions(args: Args) {
  const { slug, rosterId, setError, setPerson } = args;

  async function restoreToActive(setSubmitting: (value: boolean) => void) {
    try {
      const note = window.prompt("Optional reactivation note", "") ?? "";

      setSubmitting(true);
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
            note,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to update former person.");
        return;
      }

      setPerson((current) =>
        current
          ? {
              ...current,
              ...mapRosterToPersonPatch(data?.roster),
            }
          : current
      );
    } catch {
      setError("Failed to update former person.");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    restoreToActive,
  };
}
