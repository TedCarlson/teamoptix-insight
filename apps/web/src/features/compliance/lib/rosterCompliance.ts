export type RosterComplianceStatus = "warning" | "urgent" | "expired" | "missing";
export type RosterComplianceSeverity = "yellow" | "orange" | "red";

export type RosterComplianceSignal = {
  documentType: "driver_license" | "dot_medical" | "qualification_certificate";
  label: string;
  status: RosterComplianceStatus;
  expirationDate: string | null;
  severity: RosterComplianceSeverity;
  daysRemaining: number | null;
};

export type RosterComplianceFacts = {
  licenseExpirationDate?: string | null;
  dotExpirationDate?: string | null;
  qualificationExpirationDate?: string | null;
};

const DAY_MS = 86_400_000;

function utcDay(value: Date | string) {
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function deriveDocumentSignal(
  documentType: RosterComplianceSignal["documentType"],
  label: string,
  expirationDate: string | null | undefined,
  asOf: Date,
): RosterComplianceSignal | null {
  if (!expirationDate) {
    return { documentType, label, status: "missing", expirationDate: null, severity: "red", daysRemaining: null };
  }

  const parsed = new Date(`${expirationDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) {
    return { documentType, label, status: "missing", expirationDate: null, severity: "red", daysRemaining: null };
  }

  const daysRemaining = Math.round((utcDay(parsed) - utcDay(asOf)) / DAY_MS);
  if (daysRemaining >= 61) return null;
  if (daysRemaining < 0) {
    return { documentType, label, status: "expired", expirationDate, severity: "red", daysRemaining };
  }
  if (daysRemaining <= 30) {
    return { documentType, label, status: "urgent", expirationDate, severity: "orange", daysRemaining };
  }
  return { documentType, label, status: "warning", expirationDate, severity: "yellow", daysRemaining };
}

/** The only compliance policy boundary. Surfaces consume these derived signals. */
export function deriveRosterComplianceSignals(
  facts: RosterComplianceFacts,
  options: { asOf?: Date } = {},
): RosterComplianceSignal[] {
  const asOf = options.asOf ?? new Date();
  return [
    deriveDocumentSignal("driver_license", "Driver License", facts.licenseExpirationDate, asOf),
    deriveDocumentSignal("dot_medical", "DOT Medical Card", facts.dotExpirationDate, asOf),
    deriveDocumentSignal("qualification_certificate", "Qualification Certificate", facts.qualificationExpirationDate, asOf),
  ].filter((signal): signal is RosterComplianceSignal => signal !== null);
}

export function complianceSignalKey(signal: RosterComplianceSignal) {
  return `${signal.documentType}:${signal.expirationDate ?? "missing"}`;
}
