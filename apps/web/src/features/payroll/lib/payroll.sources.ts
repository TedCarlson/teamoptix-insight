const DSW_PAYROLL_SOURCES = new Set([
  "DSW_ACTUAL",
  "DSW_OWNERSHIP",
  "DSW_CANDIDATE",
]);

const FALLBACK_WORK_EVENT_SOURCES = new Set([
  "MANUAL_TRAINING",
  "MANUAL_HELPER",
  "DISPATCH_TRAINING",
  "DISPATCH_HELPER",
]);

export function isDswPayrollSource(
  sourceKind: string | null | undefined
) {
  return DSW_PAYROLL_SOURCES.has(String(sourceKind ?? ""));
}

export function isFallbackWorkEventSource(
  sourceKind: string | null | undefined
) {
  return FALLBACK_WORK_EVENT_SOURCES.has(String(sourceKind ?? ""));
}

export function isPayrollSource(sourceKind: string | null | undefined) {
  return (
    isDswPayrollSource(sourceKind) ||
    isFallbackWorkEventSource(sourceKind)
  );
}
