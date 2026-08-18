import "server-only";

import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ItfPositionTitle,
  ItfOfficeOption,
  ItfRegionOption,
  ItfRelationshipOption,
  ItfRosterReviewRow,
  ItfRosterStatus,
  ItfSeatType,
  ItfWorkforceUnit,
  ItfWorkforceUnitOption,
} from "./itfRosterForm";
import { ITF_POSITION_TITLE_OPTIONS } from "./itfRosterForm";

type ItfRosterProjectionRow = {
  roster_member_id: string;
  company_id: string;
  company_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  worker_type: string | null;
  job_title: string | null;
  seat_type: string | null;
  employment_status: string | null;
  company_location_id: string | null;
  location_code: string | null;
  division_name: string | null;
  region_name: string | null;
  office_id: string | null;
  office_name: string | null;
  reports_to_roster_id: string | null;
  reports_to_name: string | null;
  tech_id: string | null;
  fuse_emp_id: string | null;
  nt_login: string | null;
  csg: string | null;
  source_system: string | null;
  source_label: string | null;
  assignment_id: string | null;
  assignment_status: string | null;
  effective_start: string | null;
  affiliation_type: "W-2" | "Business Partner" | null;
  engagement_participant_id: string | null;
  relationship_id: string | null;
  relationship_name: string | null;
  relationship_status: string | null;
};

type ItfOnboardingLifecycleProjectionRow = {
  candidate_id: string;
  roster_id: string;
  roster_company_id: string;
  fuse_status: string;
  fuse_processing_start_date: string | null;
  note_update_date: string | null;
  last_note: string | null;
  status_update_at: string | null;
  local_disposition: string;
  location_code: string;
  engagement_participant_id: string | null;
  relationship_id: string | null;
  relationship_name: string | null;
  relationship_status: string | null;
  engagement_location_id: string | null;
  company_location_id: string | null;
  engagement_office_id: string | null;
  company_location_office_id: string | null;
  has_current_assignment: boolean;
  requires_placement: boolean;
};

type ItfRelationshipProjectionRow = {
  owner_company_id: string;
  owner_company_name: string;
  owner_company_slug: string;
  affiliation_type: "W-2" | "Business Partner";
  engagement_participant_id: string | null;
  relationship_id: string | null;
  relationship_label: string;
  relationship_status: string;
  engagement_id: string | null;
  engagement_status: string;
  principal_company_name: string;
  reporting_company_name: string;
  engagement_location_id: string | null;
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
  region_name: string | null;
  division_name: string | null;
  engagement_office_id: string | null;
  office_id: string | null;
  office_name: string | null;
  can_assign: boolean;
};

type ItfOfficeProjectionRow = {
  office_id: string;
  company_location_id: string;
  location_code: string;
  location_name: string;
  office_name: string;
  address: string | null;
  sub_region: string | null;
};

type ItfWorkforceUnitProjectionRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  division_id: string | null;
  division_name: string | null;
  division_code: string | null;
  region_id: string | null;
  region_name: string | null;
  region_code: string | null;
};

type ItfRegionProjectionRow = {
  region_id: string;
  division_id: string;
  division_name: string;
  division_code: string;
  region_name: string;
  region_code: string;
};

function rosterStatus(value: string | null): ItfRosterStatus {
  if (value === "Active") return "active";
  if (value === "Former") return "inactive";
  if (value === "Candidate" || value === "Trainee") return "onboarding";
  return "inactive";
}

function workforceUnit(value: string | null): ItfWorkforceUnit {
  return value?.trim() || "company";
}

function positionTitle(value: string | null): ItfPositionTitle {
  return ITF_POSITION_TITLE_OPTIONS.find((title) => title === value) ?? "Unknown";
}

function seatType(
  row: ItfRosterProjectionRow,
  lifecycle?: ItfOnboardingLifecycleProjectionRow
): ItfSeatType {
  if (
    row.seat_type === "FIELD" ||
    row.seat_type === "LEADERSHIP" ||
    row.seat_type === "SUPPORT" ||
    row.seat_type === "TRAVEL" ||
    row.seat_type === "DROP_BURY" ||
    row.seat_type === "TRAINING" ||
    row.seat_type === "FMLA"
  ) return row.seat_type;

  if (lifecycle && !lifecycle.has_current_assignment) return "UNASSIGNED";

  const role = `${row.worker_type ?? ""} ${row.job_title ?? ""}`.toUpperCase();
  if (/DIRECTOR|MANAGER|SUPERVISOR|LEADERSHIP/.test(role)) return "LEADERSHIP";
  if (/TECH|FIELD/.test(role)) return "FIELD";
  return "SUPPORT";
}

function sourceLabel(
  value: string | null,
  sourceSystem: string | null
): ItfRosterReviewRow["source"] {
  if (sourceSystem === "itg-roster-export") return "ITG sourced";
  if (value === "Donor import") return "Donor import";
  if (value === "Added on behalf") return "Added on behalf";
  return "Company added";
}

export const loadItfCompanyRoster = cache(async function loadItfCompanyRoster(
  companySlug: string
): Promise<ItfRosterReviewRow[]> {
  const supabase = await getSupabaseServerClient();
  const [rosterResult, lifecycleResult] = await Promise.all([
    supabase.rpc("itf_workspace_roster", { p_company_slug: companySlug }),
    supabase.rpc("itf_workspace_onboarding_lifecycle", { p_company_slug: companySlug }),
  ]);

  if (rosterResult.error) {
    throw new Error(`Unable to load the ITF company roster: ${rosterResult.error.message}`);
  }
  if (lifecycleResult.error) {
    throw new Error(`Unable to load the ITF onboarding lifecycle: ${lifecycleResult.error.message}`);
  }

  const lifecycles = new Map(
    ((lifecycleResult.data ?? []) as ItfOnboardingLifecycleProjectionRow[])
      .map((row) => [row.roster_id, row])
  );

  return ((rosterResult.data ?? []) as ItfRosterProjectionRow[]).map((row) => {
    const lifecycle = lifecycles.get(row.roster_member_id);
    const hasAssignment = Boolean(row.assignment_id || lifecycle?.has_current_assignment);
    const lifecycleLocationId = lifecycle?.company_location_id ?? "";
    const lifecycleOfficeId = lifecycle?.company_location_office_id ?? "";

    return ({
    id: row.roster_member_id,
    person: {
      fullName: row.full_name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      status: rosterStatus(row.employment_status),
    },
    identifiers: {
      tech_id: row.tech_id ?? "",
      fuse_emp_id: row.fuse_emp_id ?? "",
      nt_login: row.nt_login ?? "",
      csg: row.csg ?? "",
    },
    placement: {
      ownerCompanyId: row.company_id,
      affiliationType: row.affiliation_type ?? (lifecycle?.engagement_participant_id ? "Business Partner" : "W-2"),
      engagementParticipantId: row.engagement_participant_id ?? lifecycle?.engagement_participant_id ?? "",
      relationshipId: row.relationship_id ?? lifecycle?.relationship_id ?? "",
      relationshipName: row.relationship_name ?? lifecycle?.relationship_name ?? "Direct company workforce",
      relationshipStatus: row.relationship_status ?? lifecycle?.relationship_status ?? "active",
      engagementLocationId: lifecycle?.engagement_location_id ?? "",
      engagementOfficeId: lifecycle?.engagement_office_id ?? "",
      locationId: row.company_location_id ?? lifecycleLocationId,
      workforceUnit: workforceUnit(row.location_code ?? lifecycle?.location_code ?? null),
      officeId: row.office_id ?? lifecycleOfficeId,
      positionTitle: positionTitle(row.job_title ?? row.worker_type),
      seatType: seatType(row, lifecycle),
      assignmentStatus: hasAssignment
        ? row.assignment_status === "pending" ? "pending" : row.assignment_status === "inactive" ? "inactive" : "active"
        : "pending",
      reportsTo: row.reports_to_name ?? "",
      effectiveFrom: row.effective_start ?? lifecycle?.fuse_processing_start_date ?? new Date().toISOString().slice(0, 10),
    },
    reportsToRosterId: row.reports_to_roster_id ?? "",
    source: sourceLabel(row.source_label, row.source_system),
    scope: {
      companyName: row.company_name,
      affiliationName: row.affiliation_type ?? (lifecycle?.engagement_participant_id ? "Business Partner" : "W-2"),
      groupName: row.reports_to_name ?? "Unassigned",
      officeName: row.office_name ?? "Unassigned",
      divisionName: row.division_name ?? "Unassigned",
      regionName: row.region_name ?? "Unassigned",
    },
    onboarding: lifecycle ? {
      candidateId: lifecycle.candidate_id,
      fuseStatus: lifecycle.fuse_status,
      processingStartDate: lifecycle.fuse_processing_start_date ?? "",
      noteUpdateDate: lifecycle.note_update_date ?? "",
      lastNote: lifecycle.last_note ?? "",
      statusUpdateAt: lifecycle.status_update_at ?? "",
      localDisposition: lifecycle.local_disposition,
      hasCurrentAssignment: lifecycle.has_current_assignment,
      requiresPlacement: lifecycle.requires_placement,
    } : undefined,
  });
  });
});

export const loadItfRosterRelationshipContext = cache(async function loadItfRosterRelationshipContext(
  companySlug: string
): Promise<ItfRelationshipOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("itf_roster_relationship_context", {
    p_company_slug: companySlug,
  });

  if (error) {
    throw new Error(`Unable to load ITF relationship choices: ${error.message}`);
  }

  return ((data ?? []) as ItfRelationshipProjectionRow[]).map((row) => ({
    ownerCompanyId: row.owner_company_id,
    ownerCompanyName: row.owner_company_name,
    ownerCompanySlug: row.owner_company_slug,
    affiliationType: row.affiliation_type,
    engagementParticipantId: row.engagement_participant_id ?? "",
    relationshipId: row.relationship_id ?? "",
    relationshipLabel: row.relationship_label,
    relationshipStatus: row.relationship_status,
    engagementId: row.engagement_id ?? "",
    engagementStatus: row.engagement_status,
    principalCompanyName: row.principal_company_name,
    reportingCompanyName: row.reporting_company_name,
    engagementLocationId: row.engagement_location_id ?? "",
    locationId: row.location_id ?? "",
    locationCode: row.location_code ?? "company",
    locationName: row.location_name ?? "Company wide",
    regionName: row.region_name ?? "Unassigned",
    divisionName: row.division_name ?? "Unassigned",
    engagementOfficeId: row.engagement_office_id ?? "",
    officeId: row.office_id ?? "",
    officeName: row.office_name ?? "Company wide",
    canAssign: row.can_assign,
  }));
});

export const loadItfCompanyOffices = cache(async function loadItfCompanyOffices(
  companySlug: string
): Promise<ItfOfficeOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("itf_company_office_v")
    .select("office_id, company_location_id, location_code, location_name, office_name, address, sub_region")
    .eq("company_slug", companySlug)
    .eq("office_status", "active")
    .order("location_code")
    .order("office_name");

  if (error) {
    throw new Error(`Unable to load ITF company offices: ${error.message}`);
  }

  return ((data ?? []) as ItfOfficeProjectionRow[]).map((row) => ({
    id: row.office_id,
    locationId: row.company_location_id,
    workforceUnit: row.location_code,
    locationName: row.location_name,
    officeName: row.office_name,
    address: row.address ?? "",
    subRegion: row.sub_region ?? "",
  }));
});

export const loadItfCompanyWorkforceUnits = cache(async function loadItfCompanyWorkforceUnits(
  companySlug: string
): Promise<ItfWorkforceUnitOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("itf_company_workforce_unit_v")
    .select("location_id, location_code, location_name, division_id, division_name, division_code, region_id, region_name, region_code")
    .eq("company_slug", companySlug)
    .eq("location_status", "active")
    .order("location_code");

  if (error) {
    throw new Error(`Unable to load ITF workforce units: ${error.message}`);
  }

  return ((data ?? []) as ItfWorkforceUnitProjectionRow[]).map((row) => ({
    id: row.location_id,
    locationCode: row.location_code,
    locationName: row.location_name,
    divisionId: row.division_id ?? "",
    divisionName: row.division_name ?? "Unassigned",
    divisionCode: row.division_code ?? "",
    regionId: row.region_id ?? "",
    regionName: row.region_name ?? "Unassigned",
    regionCode: row.region_code ?? "",
  }));
});

export const loadItfCompanyRegions = cache(async function loadItfCompanyRegions(
  companySlug: string
): Promise<ItfRegionOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("itf_company_region_v")
    .select("region_id, division_id, division_name, division_code, region_name, region_code")
    .eq("company_slug", companySlug)
    .eq("region_status", "active")
    .order("division_name")
    .order("region_name");

  if (error) {
    throw new Error(`Unable to load ITF company regions: ${error.message}`);
  }

  return ((data ?? []) as ItfRegionProjectionRow[]).map((row) => ({
    id: row.region_id,
    divisionId: row.division_id,
    divisionName: row.division_name,
    divisionCode: row.division_code,
    regionName: row.region_name,
    regionCode: row.region_code,
  }));
});
