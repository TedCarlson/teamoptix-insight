import type { PersonRecord } from "@/features/people/lib/person-detail.types";

type Args = {
  setError: (value: string | null) => void;
  setPerson: React.Dispatch<React.SetStateAction<PersonRecord | null>>;
};

export function useFormerPersonDetailActions(args: Args) {
  const { setError, setPerson } = args;

  async function restoreToActive(setSubmitting: (value: boolean) => void) {
    try {
      setSubmitting(true);
      setError(null);

      setPerson((current) =>
        current
          ? {
              ...current,
              employment_status: "Active",
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