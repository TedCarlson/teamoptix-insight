import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRosterAssetValues } from "@/features/people/server/assetAssignments";
import { deriveRosterComplianceSignals } from "@/features/compliance/lib/rosterCompliance";

type Input = {
  supabase: SupabaseClient;
  companySlug: string;
  companyId: string;
  rosterId: string;
};

export async function loadRosterAuthoritativeDto({
  supabase,
  companySlug,
  companyId,
  rosterId,
}: Input) {
  const [
    rosterResult,
    operationsResult,
    personalResult,
    licenseResult,
    assetValues,
  ] = await Promise.all([
    supabase
      .from("company_roster_view")
      .select(
        "roster_member_id, company_id, profile_id, person_id, full_name, email, phone, worker_type, job_title, employment_status, market_code, reports_to_name, hire_date, separation_date, reports_to_roster_id, invite_status, notes, fx_id, dswid",
      )
      .eq("company_id", companyId)
      .eq("roster_member_id", rosterId)
      .maybeSingle(),

    supabase
      .from("company_roster_operations_fact_v")
      .select(
        "roster_id, scanner_serial, dot_exp, qual_cert_exp, daily_pay_effective_date, daily_pay_rate, fuel_card, pin_id_no",
      )
      .eq("roster_id", rosterId)
      .maybeSingle(),

    supabase
      .from("company_roster_personal_fact_v")
      .select(
        "roster_id, company_id, date_of_birth, address_line_1, address_line_2, city, state_region, postal_code",
      )
      .eq("company_id", companyId)
      .eq("roster_id", rosterId)
      .maybeSingle(),

    supabase
      .from("company_roster_license_fact_v")
      .select(
        "roster_id, company_id, license_number, issuing_state, issue_date, expiration_date",
      )
      .eq("company_id", companyId)
      .eq("roster_id", rosterId)
      .maybeSingle(),

    loadRosterAssetValues(supabase, companySlug, [rosterId]),
  ]);

  if (rosterResult.error) {
    throw new Error(
      `Failed to load roster record: ${rosterResult.error.message}`,
    );
  }

  if (!rosterResult.data) return null;

  if (operationsResult.error) {
    throw new Error(
      `Failed to load roster operations: ${operationsResult.error.message}`,
    );
  }

  if (personalResult.error) {
    throw new Error(
      `Failed to load roster personal facts: ${personalResult.error.message}`,
    );
  }

  if (licenseResult.error) {
    throw new Error(
      `Failed to load roster license facts: ${licenseResult.error.message}`,
    );
  }

  const roster = rosterResult.data;
  const operations = operationsResult.data;
  const personal = personalResult.data;
  const license = licenseResult.data;

  const assets = assetValues.get(rosterId) ?? {
    scanner_serial: null,
    fuel_card: null,
    pin_id_no: null,
  };

  return {
    roster_member_id: roster.roster_member_id,
    company_id: roster.company_id,
    profile_id: roster.profile_id,
    person_id: roster.person_id,
    full_name: roster.full_name,
    email: roster.email,
    phone: roster.phone,
    worker_type: roster.worker_type,
    job_title: roster.job_title,
    employment_status: roster.employment_status,
    market_code: roster.market_code,
    reports_to_name: roster.reports_to_name,
    reports_to_roster_id: roster.reports_to_roster_id,
    hire_date: roster.hire_date,
    separation_date: roster.separation_date,
    invite_status: roster.invite_status,
    compliance_signals: deriveRosterComplianceSignals({
      licenseExpirationDate: license?.expiration_date ?? null,
      dotExpirationDate: operations?.dot_exp ?? null,
      qualificationExpirationDate: operations?.qual_cert_exp ?? null,
    }),
    notes: roster.notes ?? null,

    scanner_serial:
      assets.scanner_serial ?? operations?.scanner_serial ?? null,
    fuel_card: assets.fuel_card ?? operations?.fuel_card ?? null,
    pin_id_no: assets.pin_id_no ?? operations?.pin_id_no ?? null,

    // Identifiers live in company_roster_identifier and are exposed by the
    // roster view. The legacy operations columns are compatibility mirrors.
    fx_id: roster.fx_id ?? null,
    dswid: roster.dswid ?? null,
    dot_expiration_date: operations?.dot_exp ?? null,
    qual_cert_expiration_date: operations?.qual_cert_exp ?? null,
    daily_pay_effective_date:
      operations?.daily_pay_effective_date ?? null,
    daily_pay_rate: operations?.daily_pay_rate ?? null,

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
  };
}
