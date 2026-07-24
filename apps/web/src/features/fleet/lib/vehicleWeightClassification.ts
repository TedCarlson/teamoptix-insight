export type GvwrVerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "DISPUTED" | "EXPIRED";
export type FederalOvertimeWeightBand = "SMALL_VEHICLE_10K_OR_LESS" | "OVER_10K" | "UNVERIFIED";

export function dotWeightClass(gvwrLbs: number | null): number | null {
  if (gvwrLbs == null) return null;
  if (gvwrLbs <= 6000) return 1;
  if (gvwrLbs <= 10000) return 2;
  if (gvwrLbs <= 14000) return 3;
  if (gvwrLbs <= 16000) return 4;
  if (gvwrLbs <= 19500) return 5;
  if (gvwrLbs <= 26000) return 6;
  if (gvwrLbs <= 33000) return 7;
  return 8;
}

export function federalOvertimeWeightBand(
  gvwrLbs: number | null,
  status: GvwrVerificationStatus,
): FederalOvertimeWeightBand {
  if (gvwrLbs == null || status !== "VERIFIED") return "UNVERIFIED";
  return gvwrLbs <= 10000 ? "SMALL_VEHICLE_10K_OR_LESS" : "OVER_10K";
}

export function classificationChanged<T extends Record<string, unknown>>(current: T, next: T): boolean {
  return ["gvwr_lbs", "source_kind", "source_reference", "verification_status"]
    .some((key) => current[key] !== next[key]);
}
