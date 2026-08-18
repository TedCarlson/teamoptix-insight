import { normalizeItfPersonName, type ItfWorkforceUnitOption } from "../roster/itfRosterForm";

export const FUSE_ONBOARDING_HEADERS = [
  "Date",
  "Last Name",
  "First Name",
  "Tech ID",
  "Personnel ID",
  "Office",
  "Office Address",
  "Company Name",
  "Contractor Type",
  "Status",
  "Note Update",
  "Last Note",
  "Status Update",
] as const;

export const FUSE_ONBOARDING_STATUSES = [
  "Started",
  "DT Pass/Pending BG",
  "Pending D&B",
  "Pending DT/BG Pass",
  "Drug & Background Sent",
  "Badge/Creds Submitted",
  "Ready for Badge/Creds",
  "Ready to Start",
  "Consent Forms Pending Return",
  "Not Hiring",
  "Not Qualified",
  "Terminated",
] as const;

export type FuseCellValue = string | number | boolean | Date | null | undefined;
export type FuseSourceRow = Record<(typeof FUSE_ONBOARDING_HEADERS)[number], string>;

export type FuseRowIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
};

export type FuseSourceAction =
  | "insert_or_update"
  | "update_existing_only"
  | "ignore";

export type NormalizedFuseOnboardingRow = {
  rowNumber: number;
  source: FuseSourceRow;
  normalized: {
    fullName: string;
    personStatus: "onboarding";
    techId: string;
    fuseEmployeeId: string;
    companyName: string;
    contractorType: string;
    positionTitle: "Technician";
    startDate: string | null;
    fuseStatus: string;
    sourceAction: FuseSourceAction;
    noteUpdatedOn: string | null;
    lastNote: string;
    statusUpdatedAt: string | null;
    statusEffectiveAt: string | null;
    locationCode: string;
    locationName: string;
    sourceOffice: string;
    regionalIdentifier: string;
    sourceSnapshotCount: number;
  };
  issues: FuseRowIssue[];
};

export type FuseOnboardingInspection = {
  recognized: true;
  sourceKind: "fuse_onboarding";
  sheetName: string;
  headerRow: number;
  headers: string[];
  ignoredHeaders: string[];
  rows: NormalizedFuseOnboardingRow[];
  counts: {
    total: number;
    ready: number;
    review: number;
    invalid: number;
  };
};

export type FuseOnboardingRejection = {
  recognized: false;
  reason: string;
  headers: string[];
  missingHeaders: string[];
};

const PLACEHOLDERS = new Set(["", "n/a", "na", "-"]);
const STATUS_SET = new Set<string>(FUSE_ONBOARDING_STATUSES);
const INACTIVE_STATUS_SET = new Set<string>([
  "Not Hiring",
  "Not Qualified",
  "Terminated",
]);

export function normalizeFuseHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function textValue(value: FuseCellValue) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hour = String(value.getHours()).padStart(2, "0");
    const minute = String(value.getMinutes()).padStart(2, "0");
    const second = String(value.getSeconds()).padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    return hour === "00" && minute === "00" && second === "00"
      ? date
      : `${date} ${hour}:${minute}:${second}`;
  }
  return String(value ?? "").trim();
}

function identifierValue(value: FuseCellValue) {
  const normalized = textValue(value);
  return PLACEHOLDERS.has(normalized.toLowerCase()) ? "" : normalized;
}

function isoDate(value: FuseCellValue) {
  const normalized = textValue(value);
  if (!normalized || PLACEHOLDERS.has(normalized.toLowerCase())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function localDateTime(value: FuseCellValue) {
  const normalized = textValue(value);
  if (!normalized || PLACEHOLDERS.has(normalized.toLowerCase())) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.replace(" ", "T");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return null;
}

function matchKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function locationCodeFromOrg(value: string) {
  return value.match(/^(\d{3})(?:-|$)/)?.[1] ?? "";
}

function regionalIdentifierFromOrg(value: string) {
  return value.replace(/^\d{3}-?/, "").trim();
}

function sourceActionForStatus(status: string): FuseSourceAction {
  if (!STATUS_SET.has(status)) return "ignore";
  if (INACTIVE_STATUS_SET.has(status)) return "update_existing_only";
  return "insert_or_update";
}

function sourceIdentityGroups(rows: NormalizedFuseOnboardingRow[]) {
  const nameCounts = new Map<string, number>();
  const techIdentities = new Map<string, Set<string>>();
  const personnelIdentities = new Map<string, Set<string>>();

  for (const row of rows) {
    const identityKey = [
      row.normalized.fullName,
      row.normalized.companyName,
    ].map(matchKey).join("|");
    if (identityKey.replaceAll("|", "")) {
      nameCounts.set(identityKey, (nameCounts.get(identityKey) ?? 0) + 1);
    }

    const techKey = matchKey(row.normalized.techId);
    if (techKey) {
      const identities = techIdentities.get(techKey) ?? new Set<string>();
      identities.add(identityKey);
      techIdentities.set(techKey, identities);
    }

    const personnelKey = matchKey(row.normalized.fuseEmployeeId);
    if (personnelKey) {
      const identities = personnelIdentities.get(personnelKey) ?? new Set<string>();
      identities.add(identityKey);
      personnelIdentities.set(personnelKey, identities);
    }
  }

  return { nameCounts, techIdentities, personnelIdentities };
}

export function inspectFuseOnboardingRows(
  rows: FuseCellValue[][],
  options: {
    sheetName: string;
    workforceUnits: ItfWorkforceUnitOption[];
  }
): FuseOnboardingInspection | FuseOnboardingRejection {
  const knownHeaderKeys = new Set(FUSE_ONBOARDING_HEADERS.map(normalizeFuseHeader));
  let headerIndex = -1;
  let headers: string[] = [];

  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const candidateHeaders = (rows[index] ?? []).map(textValue);
    const candidateKeys = new Set(candidateHeaders.map(normalizeFuseHeader).filter(Boolean));
    if (FUSE_ONBOARDING_HEADERS.every((header) => candidateKeys.has(normalizeFuseHeader(header)))) {
      headerIndex = index;
      headers = candidateHeaders;
      break;
    }
  }

  if (headerIndex < 0) {
    const firstNonempty = rows.find((row) => row.some((value) => textValue(value))) ?? [];
    const detectedHeaders = firstNonempty.map(textValue).filter(Boolean);
    const detectedKeys = new Set(detectedHeaders.map(normalizeFuseHeader));
    return {
      recognized: false,
      reason: "This workbook does not match the governed FUSE onboarding column contract.",
      headers: detectedHeaders,
      missingHeaders: FUSE_ONBOARDING_HEADERS.filter(
        (header) => !detectedKeys.has(normalizeFuseHeader(header))
      ),
    };
  }

  const indexByHeader = new Map(headers.map((header, index) => [normalizeFuseHeader(header), index]));
  const valueFor = (row: FuseCellValue[], header: (typeof FUSE_ONBOARDING_HEADERS)[number]) =>
    row[indexByHeader.get(normalizeFuseHeader(header)) ?? -1];

  const normalizedRows = rows.slice(headerIndex + 1)
    .map((row, index): NormalizedFuseOnboardingRow | null => {
      if (!row.some((value) => textValue(value))) return null;
      const source = Object.fromEntries(FUSE_ONBOARDING_HEADERS.map((header) => [
        header,
        textValue(valueFor(row, header)),
      ])) as FuseSourceRow;

      const locationCode = locationCodeFromOrg(source.Office);
      const location = options.workforceUnits.find((unit) => unit.locationCode === locationCode) ?? null;
      const fullName = normalizeItfPersonName(
        [source["First Name"], source["Last Name"]].filter(Boolean).join(" ")
      );
      const issues: FuseRowIssue[] = [];

      if (!fullName) issues.push({ severity: "error", code: "missing_name", message: "Candidate name is missing." });
      if (!source["Company Name"]) issues.push({ severity: "error", code: "missing_company", message: "Source company is missing." });
      if (!location) issues.push({ severity: "error", code: "unknown_location", message: `Location ${locationCode || "—"} is not configured for this ITF company.` });
      if (!STATUS_SET.has(source.Status)) issues.push({ severity: "error", code: "unknown_status", message: `FUSE status “${source.Status || "—"}” is not governed.` });

      const startDate = isoDate(valueFor(row, "Date"));
      const noteUpdatedOn = isoDate(valueFor(row, "Note Update"));
      const statusUpdatedAt = localDateTime(valueFor(row, "Status Update"));
      if (!startDate) issues.push({ severity: "error", code: "invalid_start_date", message: "FUSE processing start date is missing or invalid." });
      if (source["Status Update"] && !PLACEHOLDERS.has(source["Status Update"].toLowerCase()) && !statusUpdatedAt) {
        issues.push({ severity: "warning", code: "invalid_status_update", message: "Status update timestamp could not be normalized." });
      }

      return {
        rowNumber: headerIndex + index + 2,
        source,
        normalized: {
          fullName,
          personStatus: "onboarding",
          techId: identifierValue(valueFor(row, "Tech ID")).toUpperCase(),
          fuseEmployeeId: identifierValue(valueFor(row, "Personnel ID")),
          companyName: source["Company Name"],
          contractorType: source["Contractor Type"],
          positionTitle: "Technician",
          startDate,
          fuseStatus: source.Status,
          sourceAction: sourceActionForStatus(source.Status),
          noteUpdatedOn,
          lastNote: source["Last Note"],
          statusUpdatedAt,
          statusEffectiveAt: statusUpdatedAt ?? noteUpdatedOn ?? startDate,
          locationCode,
          locationName: location?.locationName ?? "Unresolved",
          sourceOffice: source.Office,
          regionalIdentifier: regionalIdentifierFromOrg(source.Office),
          sourceSnapshotCount: 1,
        },
        issues,
      };
    })
    .filter((row): row is NormalizedFuseOnboardingRow => row !== null);

  const sourceGroups = sourceIdentityGroups(normalizedRows);
  for (const row of normalizedRows) {
    const identityKey = [row.normalized.fullName, row.normalized.companyName]
      .map(matchKey)
      .join("|");
    row.normalized.sourceSnapshotCount = sourceGroups.nameCounts.get(identityKey) ?? 1;

    const techKey = matchKey(row.normalized.techId);
    if (techKey && (sourceGroups.techIdentities.get(techKey)?.size ?? 0) > 1) {
      row.issues.push({ severity: "error", code: "conflicting_tech_id", message: "Tech ID is attached to more than one candidate identity in this source file." });
    }
    const personnelKey = matchKey(row.normalized.fuseEmployeeId);
    if (personnelKey && (sourceGroups.personnelIdentities.get(personnelKey)?.size ?? 0) > 1) {
      row.issues.push({ severity: "error", code: "conflicting_fuse_id", message: "Personnel ID is attached to more than one candidate identity in this source file." });
    }
  }

  const invalid = normalizedRows.filter((row) => row.issues.some((issue) => issue.severity === "error")).length;
  const review = normalizedRows.filter((row) => row.issues.length > 0).length;

  return {
    recognized: true,
    sourceKind: "fuse_onboarding",
    sheetName: options.sheetName,
    headerRow: headerIndex + 1,
    headers,
    ignoredHeaders: headers.filter((header) => header && !knownHeaderKeys.has(normalizeFuseHeader(header))),
    rows: normalizedRows,
    counts: {
      total: normalizedRows.length,
      ready: normalizedRows.length - review,
      review,
      invalid,
    },
  };
}
