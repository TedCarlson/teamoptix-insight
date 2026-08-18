export type ItfRosterStatus =
  | "active"
  | "inactive"
  | "onboarding"
  | "onboarding_closed";

const ITF_NAME_SUFFIXES: Record<string, string> = {
  ii: "II",
  iii: "III",
  iv: "IV",
  v: "V",
  jr: "Jr.",
  sr: "Sr.",
};

function normalizeNamePart(value: string) {
  const lower = value.toLocaleLowerCase("en-US");
  const suffix = ITF_NAME_SUFFIXES[lower.replaceAll(".", "")];
  if (suffix) return suffix;
  if (lower.length === 1) return lower.toLocaleUpperCase("en-US");

  const titled = lower.replace(/(^|[-'’])([\p{L}])/gu, (_match, boundary: string, letter: string) =>
    `${boundary}${letter.toLocaleUpperCase("en-US")}`
  );
  return /^Mc[a-z]/.test(titled)
    ? `${titled.slice(0, 2)}${titled[2].toLocaleUpperCase("en-US")}${titled.slice(3)}`
    : titled;
}

/** Normalize display names while keeping source spelling separately for audit. */
export function normalizeItfPersonName(value: string) {
  return value.trim().replaceAll(/\s+/g, " ").split(" ").map(normalizeNamePart).join(" ");
}

export type ItfAssignmentStatus = "active" | "inactive" | "pending" | "archived";

export type ItfSeatType =
  | "UNASSIGNED"
  | "FIELD"
  | "LEADERSHIP"
  | "SUPPORT"
  | "TRAVEL"
  | "DROP_BURY"
  | "TRAINING"
  | "FMLA";

/**
 * Active Position Title records from the donor ITF application, ordered by
 * the donor's configured sort order. Keep this vocabulary governed: roster
 * entry must select a known title instead of introducing free-form variants.
 */
export const ITF_POSITION_TITLE_OPTIONS = [
  "Technician",
  "Drop Bury",
  "BP Supervisor",
  "BP Lead",
  "BP Owner",
  "ITG Supervisor",
  "QA Supervisor",
  "Project Manager",
  "Regional Manager",
  "Director",
  "VP",
  "Admin",
  "Unknown",
] as const;

export type ItfPositionTitle = (typeof ITF_POSITION_TITLE_OPTIONS)[number];

const ITF_POSITION_TITLE_LABELS: Partial<Record<ItfPositionTitle, string>> = {
  "BP Supervisor": "Service Provider Supervisor",
  "BP Lead": "Service Provider Lead",
  "BP Owner": "Service Provider Owner",
};

export function itfPositionTitleLabel(title: ItfPositionTitle) {
  return ITF_POSITION_TITLE_LABELS[title] ?? title;
}

export const ITF_ROSTER_IDENTIFIER_FIELDS = [
  { type: "tech_id", label: "Tech ID", hint: "Primary technician reference" },
  { type: "fuse_emp_id", label: "FUSE ID", hint: "FUSE employee reference" },
  { type: "nt_login", label: "NT login", hint: "Network login" },
  { type: "csg", label: "CSG", hint: "CSG identifier" },
] as const;

export type ItfRosterIdentifierType =
  (typeof ITF_ROSTER_IDENTIFIER_FIELDS)[number]["type"];

export type ItfRosterIdentifierValues = Record<ItfRosterIdentifierType, string>;

export type ItfWorkforceUnit = string;

export type ItfWorkforceUnitOption = {
  id: string;
  locationCode: string;
  locationName: string;
  divisionId: string;
  divisionName: string;
  divisionCode: string;
  regionId: string;
  regionName: string;
  regionCode: string;
};

export type ItfRegionOption = {
  id: string;
  divisionId: string;
  divisionName: string;
  divisionCode: string;
  regionName: string;
  regionCode: string;
};

export type ItfOfficeOption = {
  id: string;
  locationId: string;
  workforceUnit: string;
  locationName: string;
  officeName: string;
  address: string;
  subRegion: string;
};

export type ItfAffiliationType = "W-2" | "Business Partner";

export function itfAffiliationLabel(value: string) {
  if (value === "Business Partner") return "Provider workforce";
  if (value === "W-2") return "Direct workforce";
  return value;
}

export function itfAffiliationTypeLabel(type: ItfAffiliationType) {
  return itfAffiliationLabel(type);
}

export type ItfRelationshipOption = {
  ownerCompanyId: string;
  ownerCompanyName: string;
  ownerCompanySlug: string;
  affiliationType: ItfAffiliationType;
  engagementParticipantId: string;
  relationshipId: string;
  relationshipLabel: string;
  relationshipStatus: string;
  engagementId: string;
  engagementStatus: string;
  principalCompanyName: string;
  reportingCompanyName: string;
  engagementLocationId: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  regionName: string;
  divisionName: string;
  engagementOfficeId: string;
  officeId: string;
  officeName: string;
  canAssign: boolean;
};

export type ItfRosterDraft = {
  person: {
    fullName: string;
    email: string;
    phone: string;
    status: ItfRosterStatus;
  };
  identifiers: ItfRosterIdentifierValues;
  placement: {
    ownerCompanyId: string;
    affiliationType: ItfAffiliationType;
    engagementParticipantId: string;
    relationshipId: string;
    relationshipName: string;
    relationshipStatus: string;
    engagementLocationId: string;
    engagementOfficeId: string;
    locationId: string;
    workforceUnit: ItfWorkforceUnit;
    officeId: string;
    positionTitle: ItfPositionTitle;
    seatType: ItfSeatType;
    assignmentStatus: ItfAssignmentStatus;
    reportsTo: string;
    effectiveFrom: string;
  };
};

export type ItfStartedPlacement = "training" | "field" | "travel";

const ITF_STARTED_PLACEMENT_SEATS: Record<ItfStartedPlacement, ItfSeatType> = {
  training: "TRAINING",
  field: "FIELD",
  travel: "TRAVEL",
};

/** A Started FUSE handoff becomes active roster work in the selected seat. */
export function applyItfStartedPlacement(
  draft: ItfRosterDraft,
  placement: ItfStartedPlacement
): ItfRosterDraft {
  return {
    ...draft,
    person: { ...draft.person, status: "active" },
    placement: {
      ...draft.placement,
      positionTitle: "Technician",
      seatType: ITF_STARTED_PLACEMENT_SEATS[placement],
      assignmentStatus: "active",
    },
  };
}

export type ItfRosterReviewRow = ItfRosterDraft & {
  id: string;
  reportsToRosterId: string;
  source: "Donor import" | "Company added" | "Added on behalf" | "ITG added" | "ITG sourced";
  scope: {
    companyName: string;
    affiliationName: string;
    groupName: string;
    officeName: string;
    divisionName: string;
    regionName: string;
  };
  onboarding?: {
    candidateId: string;
    fuseStatus: string;
    processingStartDate: string;
    noteUpdateDate: string;
    lastNote: string;
    statusUpdateAt: string;
    localDisposition: string;
    hasCurrentAssignment: boolean;
    requiresPlacement: boolean;
  };
};

const techIdCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareItfRosterRowsByTechId(
  left: ItfRosterReviewRow,
  right: ItfRosterReviewRow
) {
  const leftTechId = left.identifiers.tech_id.trim();
  const rightTechId = right.identifiers.tech_id.trim();

  if (leftTechId && rightTechId) {
    return techIdCollator.compare(leftTechId, rightTechId) ||
      left.person.fullName.localeCompare(right.person.fullName);
  }
  if (leftTechId) return -1;
  if (rightTechId) return 1;
  return left.person.fullName.localeCompare(right.person.fullName);
}

export type ItfRosterCommandPayload = {
  person: {
    full_name: string;
    email: string | null;
    phone: string | null;
    status: ItfRosterStatus;
  };
  identifiers: Array<{
    identifier_type: ItfRosterIdentifierType;
    identifier_value: string;
  }>;
  workforce_assignment: {
    roster_company_id: string | null;
    affiliation_type: ItfAffiliationType;
    engagement_participant_id: string | null;
    relationship_id: string | null;
    engagement_location_id: string | null;
    engagement_office_id: string | null;
    location_id: string | null;
    location_code: string | null;
    office_id: string | null;
    position_title: ItfPositionTitle;
    seat_type: ItfSeatType;
    assignment_status: ItfAssignmentStatus;
    reports_to: string | null;
    effective_from: string;
  };
  entry: {
    channel: "manual";
  };
};

export function createEmptyItfRosterDraft(): ItfRosterDraft {
  return {
    person: {
      fullName: "",
      email: "",
      phone: "",
      status: "active",
    },
    identifiers: {
      tech_id: "",
      fuse_emp_id: "",
      nt_login: "",
      csg: "",
    },
    placement: {
      ownerCompanyId: "",
      affiliationType: "W-2",
      engagementParticipantId: "",
      relationshipId: "",
      relationshipName: "Direct company workforce",
      relationshipStatus: "active",
      engagementLocationId: "",
      engagementOfficeId: "",
      locationId: "",
      workforceUnit: "company",
      officeId: "",
      positionTitle: "Technician",
      seatType: "FIELD",
      assignmentStatus: "active",
      reportsTo: "",
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  };
}

function clipboardValue(value: string) {
  return value.trim() || "—";
}

/**
 * Preserve the donor roster's compact Comcast handoff format. This is a
 * presentation-only projection: copying a record never creates or saves a
 * roster row.
 */
export function buildItfRosterCopyText(
  draft: ItfRosterDraft,
  affiliationName: string
) {
  const techId = draft.identifiers.tech_id.replaceAll(/\s/g, "").toUpperCase() || "—";

  return `${clipboardValue(draft.person.fullName)} • Tech ID: ${techId}
Mobile:      ${clipboardValue(draft.person.phone)}
NT Login:    ${clipboardValue(draft.identifiers.nt_login)}
CSG:         ${clipboardValue(draft.identifiers.csg)}
Email:       ${clipboardValue(draft.person.email)}
Affiliation: ${clipboardValue(affiliationName)}
Reports To:  ${clipboardValue(draft.placement.reportsTo)}`;
}

function optionalText(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

/**
 * The UI submits one command. The server transaction is responsible for
 * updating the platform roster, identifier, placement, provenance, and event
 * records together.
 */
export function buildItfRosterCommandPayload(
  draft: ItfRosterDraft
): ItfRosterCommandPayload {
  return {
    person: {
      full_name: normalizeItfPersonName(draft.person.fullName),
      email: optionalText(draft.person.email)?.toLowerCase() ?? null,
      phone: optionalText(draft.person.phone),
      status: draft.person.status,
    },
    identifiers: ITF_ROSTER_IDENTIFIER_FIELDS.flatMap((field) => {
      const value = draft.identifiers[field.type].trim();
      return value
        ? [{ identifier_type: field.type, identifier_value: value }]
        : [];
    }),
    workforce_assignment: {
      roster_company_id: optionalText(draft.placement.ownerCompanyId),
      affiliation_type: draft.placement.affiliationType,
      engagement_participant_id: optionalText(draft.placement.engagementParticipantId),
      relationship_id: optionalText(draft.placement.relationshipId),
      engagement_location_id: optionalText(draft.placement.engagementLocationId),
      engagement_office_id: optionalText(draft.placement.engagementOfficeId),
      location_id: optionalText(draft.placement.locationId),
      location_code: draft.placement.workforceUnit === "company"
        ? null
        : draft.placement.workforceUnit,
      office_id: optionalText(draft.placement.officeId),
      position_title: draft.placement.positionTitle,
      seat_type: draft.placement.seatType,
      assignment_status: draft.placement.assignmentStatus,
      reports_to: optionalText(draft.placement.reportsTo),
      effective_from: draft.placement.effectiveFrom,
    },
    entry: {
      channel: "manual",
    },
  };
}

export function copyItfRosterDraft(row: ItfRosterDraft): ItfRosterDraft {
  return {
    person: { ...row.person },
    identifiers: { ...row.identifiers },
    placement: { ...row.placement },
  };
}
