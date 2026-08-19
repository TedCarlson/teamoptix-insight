export type WorkforceRosterCounts = {
  active?: number | null;
  trainees?: number | null;
};

/** Trainees stay in the development pipeline until promoted to Active. */
export function activeRosterHeadcount(counts: WorkforceRosterCounts | null | undefined) {
  return Number(counts?.active ?? 0);
}
