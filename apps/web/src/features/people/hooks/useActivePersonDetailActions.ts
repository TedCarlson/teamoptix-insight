import type { PersonRecord } from "@/features/people/lib/person-detail.types";

type Args = {
  setError: (value: string | null) => void;
  setPerson: React.Dispatch<React.SetStateAction<PersonRecord | null>>;
};

export function useActivePersonDetailActions(args: Args) {
  const { setError, setPerson } = args;

  async function markFormer(setSubmitting: (value: boolean) => void) {
    try {
      setSubmitting(true);
      setError(null);

      setPerson((current) =>
        current
          ? {
              ...current,
              employment_status: "Former",
            }
          : current
      );
    } catch {
      setError("Failed to update active person.");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    markFormer,
  };
}