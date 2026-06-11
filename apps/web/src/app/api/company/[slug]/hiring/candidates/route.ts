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

    if (rosterIds.length > 0) {
      const { data: opsRows } = await supabase
        .from("company_roster_operations_fact_v")
        .select("*")
        .in("roster_id", rosterIds);

      opsByRosterId = new Map(
        (opsRows ?? []).map((ops: any) => [ops.roster_id, ops])
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
      const stageKey = fact?.stage_key ?? fallbackStageKey(row);
      const stage = stageByKey.get(stageKey);

      return {
        id: row.roster_member_id,
        full_name: row.full_name ?? "Unknown",
        role: row.worker_type ?? "Unassigned",
        market: row.market_code ?? "—",
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

    const licenseNumber = cleanText(body.license_number);
    const issuingState = cleanText(body.issuing_state);
    const licenseIssueDate = dateOrNull(body.license_issue_date);
    const licenseExpirationDate = dateOrNull(body.license_expiration_date);

    if (!fullName) {
      return NextResponse.json(
        { error: "Candidate name is required." },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Candidate email is required." },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Candidate phone is required." },
        { status: 400 }
      );
    }

    if (!licenseNumber || !issuingState || !licenseIssueDate || !licenseExpirationDate) {
      return NextResponse.json(
        { error: "Driver license number, issuing state, issue date, and expiration date are required." },
        { status: 400 }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: stage, error: stageError } = await supabase
      .from("company_candidate_stage_config_v")
      .select("stage_type_id")
      .eq("company_id", company.id)
      .eq("stage_key", "candidate_created")
      .eq("is_enabled", true)
      .single();

    if (stageError || !stage) {
      return NextResponse.json(
        { error: "Candidate stage seed missing." },
        { status: 500 }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("company_roster")
      .insert({
        company_id: company.id,
        full_name: fullName,
        email,
        phone,
        worker_type: cleanText(body.worker_type),
        market_code: cleanText(body.market_code),
        hire_date: dateOrNull(body.start_date),
        separation_date: dateOrNull(body.end_date),
        employment_status: "Candidate",
        invite_status: "Not Invited",
        compliance_summary: "Missing",
        notes: cleanText(body.note),
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create candidate." },
        { status: 500 }
      );
    }

    const { error: detailError } = await supabase.rpc("update_company_roster_details", {
      p_company_slug: slug,
      p_roster_id: inserted.id,

      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_worker_type: cleanText(body.worker_type),
      p_market_code: cleanText(body.market_code),
      p_notes: cleanText(body.note),

      p_date_of_birth: dateOrNull(body.date_of_birth),
      p_address_line_1: cleanText(body.address_line_1),
      p_address_line_2: cleanText(body.address_line_2),
      p_city: cleanText(body.city),
      p_state_region: cleanText(body.state_region),
      p_postal_code: cleanText(body.postal_code),

      p_license_number: licenseNumber,
      p_issuing_state: issuingState,
      p_license_issue_date: licenseIssueDate,
      p_license_expiration_date: licenseExpirationDate,
    });

    if (detailError) {
      return NextResponse.json(
        {
          error: "Candidate row created, but profile/private/license details failed.",
          detail: detailError.message,
          roster_id: inserted.id,
        },
        { status: 500 }
      );
    }

    const payEffectiveDate =
      dateOrNull(body.start_date) ?? new Date().toISOString().slice(0, 10);

    const { error: opsError } = await supabase.rpc("update_company_roster_operations", {
      p_company_slug: slug,
      p_roster_id: inserted.id,
      p_fx_id: cleanText(body.fx_id),
      p_dswid: cleanText(body.dswid),
      p_scanner_serial: null,
      p_dot_exp: dateOrNull(body.dot_expiration_date),
      p_qual_cert_exp: dateOrNull(body.qual_cert_expiration_date),
      p_daily_pay_effective_date: payEffectiveDate,
      p_daily_pay_rate: numericOrDefault(body.daily_pay_rate, 130),
      p_fuel_card: null,
      p_pin_id_no: null,
    });

    if (opsError) {
      return NextResponse.json(
        {
          error: "Candidate row created, but operations facts failed.",
          detail: opsError.message,
          roster_id: inserted.id,
        },
        { status: 500 }
      );
    }

    await supabase.from("roster_candidate_stage").insert({
      company_id: company.id,
      roster_id: inserted.id,
      stage_type_id: stage.stage_type_id,
      note: cleanText(body.note),
    });

    await supabase.from("company_roster_event").insert({
      company_id: company.id,
      roster_id: inserted.id,
      event_category: "hiring",
      event_type: "candidate_created",
      event_detail: "Candidate record created.",
      event_metadata: {
        source: "add_candidate_overlay",
        profile_seeded: true,
        operations_seeded: true,
        license_seeded: true,
        invite_action: cleanText(body.invite_action) ?? "SAVE_ONLY",
      },
      occurred_at: new Date().toISOString(),
    });

    return NextResponse.json(
      { ok: true, roster_id: inserted.id },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create candidate.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
