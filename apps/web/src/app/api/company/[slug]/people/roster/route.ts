import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadRosterAssetValues } from "@/features/people/server/assetAssignments";
import { deriveRosterComplianceSignals } from "@/features/compliance/lib/rosterCompliance";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", roster: [] },
        { status: 404 }
      );
    }

    const { data: roster, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("*")
      .eq("company_id", company.id)
      .order("full_name");

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message, roster: [] },
        { status: 500 }
      );
    }

    const baseRoster = roster ?? [];
    const rosterIds = baseRoster
      .map((row: any) => row.roster_member_id)
      .filter(Boolean);

    let stageByRosterId = new Map<string, any>();
    let opsByRosterId = new Map<string, any>();
    let licenseByRosterId = new Map<string, any>();
    let traineePayByRosterId = new Map<string, any>();
    let assetValuesByRosterId = new Map<string, { scanner_serial: string | null; fuel_card: string | null }>();

    if (rosterIds.length > 0) {
      const { data: opsRows } = await supabase
        .from("company_roster_operations_fact_v")
        .select("*")
        .in("roster_id", rosterIds);

      opsByRosterId = new Map(
        (opsRows ?? []).map((ops: any) => [ops.roster_id, ops])
      );

      const { data: licenseRows } = await supabase
        .from("company_roster_license_fact_v")
        .select("roster_id, license_number, issuing_state, issue_date, expiration_date")
        .eq("company_id", company.id)
        .in("roster_id", rosterIds);
      licenseByRosterId = new Map(
        (licenseRows ?? []).map((license: any) => [license.roster_id, license])
      );

      assetValuesByRosterId = await loadRosterAssetValues(supabase, slug, rosterIds);
    }

    if (rosterIds.length > 0) {
      const { data: traineePayRows, error: traineePayError } = await supabase
        .from("company_roster_trainee_pay_override_v")
        .select("roster_id, trainee_daily_pay_rate, effective_start")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .in("roster_id", rosterIds);

      if (traineePayError) {
        return NextResponse.json(
          { error: traineePayError.message, roster: [] },
          { status: 500 }
        );
      }

      traineePayByRosterId = new Map(
        (traineePayRows ?? []).map((row: any) => [row.roster_id, row])
      );
    }

    if (rosterIds.length > 0) {
      const { data: stageRows } = await supabase
        .from("roster_candidate_stage_v")
        .select("roster_id, stage_key, default_label, is_terminal, stage_sort_order")
        .eq("company_id", company.id)
        .in("roster_id", rosterIds);

      stageByRosterId = new Map(
        (stageRows ?? []).map((stage: any) => [stage.roster_id, stage])
      );
    }

    const hydratedRoster = baseRoster
      .map((row: any) => {
        const stage = stageByRosterId.get(row.roster_member_id);
        const ops = opsByRosterId.get(row.roster_member_id);
        const license = licenseByRosterId.get(row.roster_member_id);
        const traineePay = traineePayByRosterId.get(row.roster_member_id);
        const assetValues = assetValuesByRosterId.get(row.roster_member_id) ?? {
          scanner_serial: null,
          fuel_card: null,
        };

        return {
          ...row,
          fx_id: ops?.fx_id ?? row.fx_id ?? null,
          dswid: ops?.dswid ?? row.dswid ?? null,
          scanner_serial: assetValues.scanner_serial ?? ops?.scanner_serial ?? null,
          dot_expiration_date: ops?.dot_exp ?? null,
          qual_cert_expiration_date: ops?.qual_cert_exp ?? null,
          license_number: license?.license_number ?? null,
          issuing_state: license?.issuing_state ?? null,
          license_issue_date: license?.issue_date ?? null,
          license_expiration_date: license?.expiration_date ?? null,
          daily_pay_effective_date: ops?.daily_pay_effective_date ?? null,
          daily_pay_rate: ops?.daily_pay_rate ?? null,
          trainee_daily_pay_rate: traineePay?.trainee_daily_pay_rate ?? null,
          trainee_pay_effective_start: traineePay?.effective_start ?? null,
          fuel_card: assetValues.fuel_card ?? ops?.fuel_card ?? null,
          // The roster operations fact is the sole authority for a driver's
          // PIN. Asset records may display it, but cannot override it.
          pin_id_no: ops?.pin_id_no ?? null,
          candidate_stage_key: stage?.stage_key ?? null,
          candidate_stage_label: stage?.default_label ?? null,
          candidate_stage_is_terminal: Boolean(stage?.is_terminal ?? false),
          compliance_signals:
            row.roster_record_kind === "WALK_ON"
              ? []
              : deriveRosterComplianceSignals({
                  licenseExpirationDate:
                    license?.expiration_date ?? row.license_expiration_date ?? null,
                  dotExpirationDate: ops?.dot_exp ?? null,
                  qualificationExpirationDate: ops?.qual_cert_exp ?? null,
                }),
        };
      })
      .filter((row: any) => {
        if (row.employment_status !== "Candidate") return true;
        return row.candidate_stage_is_terminal !== true;
      });

    return NextResponse.json(
      {
        company_id: company.id,
        roster: hydratedRoster,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Roster query failed.";

    return NextResponse.json(
      { error: message, roster: [] },
      { status: 500 }
    );
  }
}
