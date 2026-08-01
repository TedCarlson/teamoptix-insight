import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function fallbackStageKey(row: {
  invite_status: string | null;
  onboarding_completed_at?: string | null;
}) {
  if (row.onboarding_completed_at) return "ready_for_activation";
  if (row.invite_status === "Accepted") return "onboarding";
  if (row.invite_status === "Invited") return "invited";
  return "candidate_created";
}

type ChecklistFactRow = {
  roster_id: string;
  item_type_id: string;
  is_complete: boolean;
};

function buildCandidateProgress(
  rosterId: string,
  requiredWeightsByItemId: Map<string, number>,
  checklistFacts: ChecklistFactRow[]
) {
  const requiredTotal = requiredWeightsByItemId.size;

  if (requiredTotal === 0) {
    return {
      required_total: 0,
      required_complete: 0,
      percent: 0,
    };
  }

  const requiredComplete = checklistFacts.filter(
    (fact) =>
      fact.roster_id === rosterId &&
      requiredWeightsByItemId.has(fact.item_type_id) &&
      fact.is_complete
  ).length;

  const requiredWeightTotal = Array.from(requiredWeightsByItemId.values()).reduce(
    (sum, weight) => sum + weight,
    0
  );

  const requiredWeightComplete = checklistFacts
    .filter(
      (fact) =>
        fact.roster_id === rosterId &&
        requiredWeightsByItemId.has(fact.item_type_id) &&
        fact.is_complete
    )
    .reduce(
      (sum, fact) => sum + (requiredWeightsByItemId.get(fact.item_type_id) ?? 1),
      0
    );

  return {
    required_total: requiredTotal,
    required_complete: requiredComplete,
    required_weight_total: requiredWeightTotal,
    required_weight_complete: requiredWeightComplete,
    percent:
      requiredWeightTotal === 0
        ? 100
        : Math.round((requiredWeightComplete / requiredWeightTotal) * 100),
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", stages: [], candidates: [] },
        { status: 404 }
      );
    }

    const { data: stageRows, error: stageError } = await supabase
      .from("company_candidate_stage_config_v")
      .select("*")
      .eq("company_id", company.id)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    if (stageError) {
      return NextResponse.json(
        { error: stageError.message, stages: [], candidates: [] },
        { status: 500 }
      );
    }

    const stages = ((stageRows ?? []) as any[]).map((row) => ({
      config_id: row.id,
      stage_type_id: row.stage_type_id ?? "",
      stage_key: row.stage_key ?? "",
      label: row.display_label ?? row.default_label ?? "Stage",
      is_terminal: Boolean(row.is_terminal),
      sort_order: row.sort_order ?? row.stage_sort_order ?? 100,
    }));

    const stageByKey = new Map(stages.map((stage) => [stage.stage_key, stage]));

    const { data: rosterRows, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("*")
      .eq("company_id", company.id)
      .eq("employment_status", "Candidate")
      .order("full_name");

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message, stages, candidates: [] },
        { status: 500 }
      );
    }

    const rosterIds = (rosterRows ?? []).map((row) => row.roster_member_id);

    const { data: checklistConfigRows } = await supabase
      .from("company_candidate_checklist_readiness_v")
      .select("item_type_id, is_required, readiness_weight")
      .eq("company_id", company.id)
      .eq("is_enabled", true);

    const requiredWeightsByItemId = new Map(
      ((checklistConfigRows ?? []) as Array<{
        item_type_id: string;
        is_required: boolean;
        readiness_weight?: number | string | null;
      }>)
        .filter((item) => item.is_required)
        .map((item) => [
          item.item_type_id,
          Number(item.readiness_weight ?? 1),
        ])
    );

    let checklistFacts: ChecklistFactRow[] = [];

    if (rosterIds.length > 0) {
      const { data: checklistFactRows } = await supabase
        .from("roster_candidate_checklist_fact_v")
        .select("roster_id, item_type_id, is_complete")
        .eq("company_id", company.id)
        .in("roster_id", rosterIds);

      checklistFacts = (checklistFactRows ?? []) as ChecklistFactRow[];
    }

    let opsByRosterId = new Map<string, any>();
    let personalByRosterId = new Map<string, any>();
    let licenseByRosterId = new Map<string, any>();

    if (rosterIds.length > 0) {
      const [opsResult, personalResult, licenseResult] = await Promise.all([
        supabase
          .from("company_roster_operations_fact_v")
          .select("*")
          .in("roster_id", rosterIds),
        supabase
          .from("company_roster_personal_fact_v")
          .select(
            "roster_id, date_of_birth, address_line_1, address_line_2, city, state_region, postal_code",
          )
          .eq("company_id", company.id)
          .in("roster_id", rosterIds),
        supabase
          .from("company_roster_license_fact_v")
          .select(
            "roster_id, license_number, issuing_state, issue_date, expiration_date",
          )
          .eq("company_id", company.id)
          .in("roster_id", rosterIds),
      ]);

      const factReadError =
        opsResult.error ?? personalResult.error ?? licenseResult.error;

      if (factReadError) {
        return NextResponse.json(
          { error: factReadError.message, stages, candidates: [] },
          { status: 500 },
        );
      }

      opsByRosterId = new Map(
        (opsResult.data ?? []).map((ops: any) => [ops.roster_id, ops]),
      );
      personalByRosterId = new Map(
        (personalResult.data ?? []).map((fact: any) => [fact.roster_id, fact]),
      );
      licenseByRosterId = new Map(
        (licenseResult.data ?? []).map((license: any) => [
          license.roster_id,
          license,
        ]),
      );
    }

    let factRows: any[] = [];

    if (rosterIds.length > 0) {
      const { data: facts } = await supabase
        .from("roster_candidate_stage_v")
        .select("*")
        .eq("company_id", company.id)
        .in("roster_id", rosterIds);

      factRows = facts ?? [];
    }

    const factByRosterId = new Map(
      factRows.map((fact) => [fact.roster_id, fact])
    );

    const candidates = (rosterRows ?? []).map((row) => {
      const fact = factByRosterId.get(row.roster_member_id);
      const ops = opsByRosterId.get(row.roster_member_id);
      const personal = personalByRosterId.get(row.roster_member_id);
      const license = licenseByRosterId.get(row.roster_member_id);
      const stageKey = fact?.stage_key ?? fallbackStageKey(row);
      const stage = stageByKey.get(stageKey);

      return {
        id: row.roster_member_id,
        full_name: row.full_name ?? "Unknown",
        email: row.email ?? null,
        phone: row.phone ?? null,
        worker_type: row.worker_type ?? "Unassigned",
        role: row.worker_type ?? "Unassigned",
        market_code: row.market_code ?? "—",
        market: row.market_code ?? "—",
        reports_to_name: row.reports_to_name ?? "—",
        hire_date: row.hire_date ?? null,
        separation_date: row.separation_date ?? null,
        notes: row.notes ?? null,
        profile_id: row.profile_id ?? null,
        person_id: row.person_id ?? null,
        date_of_birth: personal?.date_of_birth ?? null,
        address_line_1: personal?.address_line_1 ?? null,
        address_line_2: personal?.address_line_2 ?? null,
        city: personal?.city ?? null,
        state_region: personal?.state_region ?? null,
        postal_code: personal?.postal_code ?? null,
        license_number: license?.license_number ?? null,
        issuing_state: license?.issuing_state ?? null,
        license_issue_date: license?.issue_date ?? null,
        license_expiration_date: license?.expiration_date ?? null,
        stage_key: stageKey,
        stage_label:
          stage?.label ?? fact?.default_label ?? "New",
        stage_sort_order:
          stage?.sort_order ?? fact?.stage_sort_order ?? 100,
        stage_is_terminal: Boolean(stage?.is_terminal ?? fact?.is_terminal ?? false),
        invite_status: row.invite_status ?? "Not Invited",
        compliance: row.compliance_summary ?? "Missing",
        onboarding_completed_at: row.onboarding_completed_at ?? null,
        fx_id: row.fx_id ?? null,
        dswid: row.dswid ?? null,
        scanner_serial: ops?.scanner_serial ?? null,
        dot_expiration_date: ops?.dot_exp ?? null,
        qual_cert_expiration_date: ops?.qual_cert_exp ?? null,
        daily_pay_effective_date: ops?.daily_pay_effective_date ?? null,
        daily_pay_rate: ops?.daily_pay_rate ?? null,
        fuel_card: ops?.fuel_card ?? null,
        pin_id_no: ops?.pin_id_no ?? null,
        updated_at: fact?.updated_at ?? null,
        progress: buildCandidateProgress(
          row.roster_member_id,
          requiredWeightsByItemId,
          checklistFacts
        ),
      };
    });

    return NextResponse.json({
      company_id: company.id,
      stages,
      candidates,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load candidates.";

    return NextResponse.json(
      { error: message, stages: [], candidates: [] },
      { status: 500 }
    );
  }
}


function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericOrDefault(value: unknown, fallback: number) {
  if (value === "" || value == null) return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const fullName = cleanText(body.full_name);
    const email = cleanText(body.email)?.toLowerCase() ?? null;
    const phone = cleanText(body.phone);

    if (!fullName) return NextResponse.json({ error: "Candidate name is required." }, { status: 400 });

    const inviteAction = cleanText(body.invite_action) ?? "SAVE_ONLY";
    if (inviteAction === "SEND_INVITE" && !email) {
      return NextResponse.json(
        { error: "Candidate email is required before sending an invite." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("create_company_candidate_from_overlay", {
      p_company_slug: slug,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_worker_type: cleanText(body.worker_type),
      p_market_code: cleanText(body.market_code),
      p_note: cleanText(body.note),
      p_date_of_birth: dateOrNull(body.date_of_birth),
      p_license_number: cleanText(body.license_number),
      p_issuing_state: cleanText(body.issuing_state),
      p_license_issue_date: dateOrNull(body.license_issue_date),
      p_license_expiration_date: dateOrNull(body.license_expiration_date),
      p_address_line_1: cleanText(body.address_line_1),
      p_address_line_2: cleanText(body.address_line_2),
      p_city: cleanText(body.city),
      p_state_region: cleanText(body.state_region),
      p_postal_code: cleanText(body.postal_code),
      p_start_date: dateOrNull(body.start_date),
      p_end_date: dateOrNull(body.end_date),
      p_fx_id: cleanText(body.fx_id),
      p_dswid: cleanText(body.dswid),
      p_dot_expiration_date: dateOrNull(body.dot_expiration_date),
      p_qual_cert_expiration_date: dateOrNull(body.qual_cert_expiration_date),
      p_daily_pay_rate: numericOrDefault(body.daily_pay_rate, 130),
      p_invite_action: inviteAction,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, roster_id: data?.roster_id },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create candidate.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
