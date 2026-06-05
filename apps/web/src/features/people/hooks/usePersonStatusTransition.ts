import type { PersonRecord } from "@/features/people/lib/person-detail.types";

type PersonStatus = "Candidate" | "Active" | "Former";

type Args = {
  slug: string;
  rosterId: string;
  setError: (value: string | null) => void;
  setPerson: React.Dispatch<React.SetStateAction<PersonRecord | null>>;
};

export function usePersonStatusTransition(args: Args) {
  const { slug, rosterId, setError, setPerson } = args;

  async function transitionStatus(
    nextStatus: PersonStatus,
    setSubmitting: (value: boolean) => void
  ) {
    try {
      const effectiveDate =
        nextStatus === "Former"
          ? window.prompt("Former effective date", new Date().toISOString().slice(0, 10)) ?? ""
          : new Date().toISOString().slice(0, 10);

      if (nextStatus === "Former" && !effectiveDate.trim()) return;

      const note = window.prompt("Optional status note", "") ?? "";

      setSubmitting(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${rosterId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            employment_status: nextStatus,
            effective_date: effectiveDate,
            note,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to update person status.");
        return;
      }

      setPerson((current) =>
        current
          ? {
              ...current,
              employment_status: data?.roster?.employment_status ?? nextStatus,
              separation_date: data?.roster?.separation_date ?? null,
            }
          : current
      );
    } catch {
      setError("Failed to update person status.");
    } finally {
      setSubmitting(false);
    }
  }

  return { transitionStatus };
}
