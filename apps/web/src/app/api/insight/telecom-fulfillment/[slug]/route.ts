import { NextResponse } from "next/server";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import type {
  ItfRosterCommandPayload,
  ItfRosterStatus,
  ItfStartedPlacement,
} from "@/features/insight-telecom/roster/itfRosterForm";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RosterActionRequest = {
  action?:
    | "save-roster-member"
    | "update-onboarding-identity"
    | "place-started-onboarding";
  rosterId?: string;
  candidateId?: string;
  placement?: ItfStartedPlacement;
  command?: ItfRosterCommandPayload;
  reportsToRosterId?: string;
  replacementRosterId?: string;
};

const persistedStatus: Record<ItfRosterStatus, "Active" | "Candidate" | "Former"> = {
  active: "Active",
  onboarding: "Candidate",
  inactive: "Former",
  onboarding_closed: "Former",
};

export async function PATCH(
  request: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const context = await resolveItfWorkspaceContext(slug);

  if (!context?.can_enter) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (!context.can_manage) {
    return NextResponse.json({ error: "Company management access is required." }, { status: 403 });
  }

  const body = await request.json() as RosterActionRequest;
  const rosterId = body.rosterId?.trim();

  const supabase = await getSupabaseServerClient();

  if (
    body.action === "update-onboarding-identity" ||
    body.action === "place-started-onboarding"
  ) {
    const command = body.command;
    const candidateId = body.candidateId?.trim();
    if (!command?.person.full_name || !candidateId) {
      return NextResponse.json({ error: "A complete onboarding roster member is required." }, { status: 400 });
    }

    const identifiers = Object.fromEntries(command.identifiers.map((identifier) => [
      identifier.identifier_type,
      identifier.identifier_value,
    ]));

    if (body.action === "update-onboarding-identity") {
      const { data, error } = await supabase.rpc("itf_update_onboarding_roster_identity", {
        p_company_slug: context.company_slug,
        p_candidate_id: candidateId,
        p_full_name: command.person.full_name,
        p_email: command.person.email,
        p_phone: command.person.phone,
        p_identifiers: identifiers,
        p_local_disposition: command.person.status === "onboarding" || command.person.status === "active"
          ? "active"
          : command.person.status === "onboarding_closed" ? "filed" : "inactive",
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data });
    }

    if (!body.placement) {
      return NextResponse.json({ error: "Choose Active Training, Active Field, or Active Travel Tech." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_place_started_onboarding_candidate", {
      p_company_slug: context.company_slug,
      p_candidate_id: candidateId,
      p_placement: body.placement,
      p_company_location_id: command.workforce_assignment.location_id,
      p_company_location_office_id: command.workforce_assignment.office_id,
      p_engagement_participant_id: command.workforce_assignment.engagement_participant_id,
      p_engagement_location_id: command.workforce_assignment.engagement_location_id,
      p_engagement_office_id: command.workforce_assignment.engagement_office_id,
      p_reports_to_roster_id: body.reportsToRosterId?.trim() || null,
      p_effective_from: command.workforce_assignment.effective_from,
      p_full_name: command.person.full_name,
      p_email: command.person.email,
      p_phone: command.person.phone,
      p_identifiers: identifiers,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  }

  if (body.action === "save-roster-member") {
    const command = body.command;
    if (!command?.person.full_name || !command.person.status) {
      return NextResponse.json({ error: "A complete roster member is required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_save_workspace_roster_member", {
      p_company_slug: context.company_slug,
      p_roster_id: rosterId || null,
      p_roster_company_id: command.workforce_assignment.roster_company_id,
      p_full_name: command.person.full_name,
      p_email: command.person.email,
      p_phone: command.person.phone,
      p_employment_status: persistedStatus[command.person.status],
      p_company_location_id: command.workforce_assignment.location_id,
      p_company_location_office_id: command.workforce_assignment.office_id,
      p_engagement_participant_id: command.workforce_assignment.engagement_participant_id,
      p_engagement_location_id: command.workforce_assignment.engagement_location_id,
      p_engagement_office_id: command.workforce_assignment.engagement_office_id,
      p_job_title: command.workforce_assignment.position_title,
      p_seat_type: command.workforce_assignment.seat_type,
      p_assignment_status: command.workforce_assignment.assignment_status,
      p_reports_to_roster_id: body.reportsToRosterId?.trim() || null,
      p_effective_from: command.workforce_assignment.effective_from,
      p_identifiers: Object.fromEntries(command.identifiers.map((identifier) => [
        identifier.identifier_type,
        identifier.identifier_value,
      ])),
      p_replacement_roster_id: body.replacementRosterId?.trim() || null,
    });
    if (error) {
      console.error("Unable to save ITF roster member", {
        rosterId,
        companySlug: context.company_slug,
        error,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ result: data });
  }

  return NextResponse.json({ error: "A supported roster action is required." }, { status: 400 });
}
