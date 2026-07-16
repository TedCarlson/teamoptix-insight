import type { SupabaseClient } from "@supabase/supabase-js";

export type RosterImportDecisionType =
  | "NEW"
  | "UPDATE_DRAFT"
  | "UNCHANGED"
  | "CONFLICT"
  | "INVALID";

type RosterPersonalFact = {
  roster_id?: string | null;
  date_of_birth?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
};

type RosterLicenseFact = {
  roster_id?: string | null;
  license_number?: string | null;
  issuing_state?: string | null;
  issue_date?: string | null;
  expiration_date?: string | null;
};

type RosterOperationsFact = {
  roster_id?: string | null;
  fx_id?: string | null;
  dswid?: string | null;
  scanner_serial?: string | null;
  fuel_card?: string | null;
  pin_id_no?: string | null;
  dot_exp?: string | null;
  qual_cert_exp?: string | null;
  daily_pay_rate?: number | string | null;
  daily_pay_effective_date?: string | null;
};

export type RosterImportRow = Record<string, unknown> & {
  row_number?: number;
  roster_member_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  fx_id?: string;
  dswid?: string;
  license_number?: string;
  issues?: string[];
};

export type RosterImportDecision = {
  row_number: number;
  decision: RosterImportDecisionType;
  roster_member_id: string | null;
  row: RosterImportRow;
  matched_fields: string[];
  conflicting_fields: string[];
  changed_fields: string[];
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  issues: string[];
};

const value = (input: unknown) => String(input ?? "").trim();
const lower = (input: unknown) => value(input).toLowerCase();
const compactPhone = (input: unknown) => value(input).replace(/\D/g, "");
const compactName = (input: unknown) => lower(input).replace(/\s+/g, " ");

const IMPORT_FIELDS = [
  "full_name", "email", "phone", "date_of_birth", "fx_id", "worker_type",
  "job_title", "license_number", "issuing_state", "license_issue_date",
  "license_expiration_date", "address_line_1", "address_line_2", "city",
  "state_region", "postal_code", "hire_date", "separation_date",
  "dot_expiration_date", "qual_cert_expiration_date", "daily_pay_rate",
  "daily_pay_effective_date", "dswid", "scanner_serial", "fuel_card",
  "pin_id_no", "employment_status", "market_code", "notes",
] as const;

function proposedValues(row: RosterImportRow, current: Record<string, unknown> | null) {
  const proposed: Record<string, unknown> = { ...(current ?? {}) };
  for (const field of IMPORT_FIELDS) {
    const incoming = value(row[field]);
    if (incoming) proposed[field] = incoming;
  }
  return proposed;
}

function changedFields(current: Record<string, unknown>, proposed: Record<string, unknown>) {
  return IMPORT_FIELDS.filter((field) => value(current[field]) !== value(proposed[field]));
}

const UNIQUE_IMPORT_FIELDS = [
  "email",
  "phone",
  "fx_id",
  "dswid",
  "license_number",
] as const;

function normalizedUniqueValue(field: typeof UNIQUE_IMPORT_FIELDS[number], input: unknown) {
  if (field === "email" || field === "dswid" || field === "license_number") {
    return lower(input);
  }
  if (field === "phone") {
    return compactPhone(input);
  }
  return value(input);
}

function duplicateFieldsWithinUpload(rows: RosterImportRow[], rowIndex: number) {
  const row = rows[rowIndex];
  const duplicates: string[] = [];

  for (const field of UNIQUE_IMPORT_FIELDS) {
    const candidate = normalizedUniqueValue(field, row[field]);
    if (!candidate) continue;

    const duplicated = rows.some((other, otherIndex) => {
      if (otherIndex === rowIndex) return false;
      return normalizedUniqueValue(field, other[field]) === candidate;
    });

    if (duplicated) duplicates.push(field);
  }

  return duplicates;
}

export async function reconcileRosterImport(
  supabase: SupabaseClient,
  companySlug: string,
  rows: RosterImportRow[]
): Promise<RosterImportDecision[]> {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", companySlug)
    .single();

  if (companyError) {
    throw new Error(
      `Roster analysis failed loading company: ${companyError.message}`,
    );
  }

  if (!company) {
    throw new Error("Roster analysis failed loading company: company not found.");
  }

  const { data: rosterRows, error: rosterError } = await supabase
    .from("company_roster_view")
    .select(
      "roster_member_id, profile_id, full_name, email, phone, worker_type, job_title, employment_status, market_code, hire_date, separation_date, notes",
    )
    .eq("company_id", company.id);

  const roster = (rosterRows ?? []).map((row) => ({
    ...row,
    id: row.roster_member_id,
  }));
  if (rosterError) {
    throw new Error(
      `Roster analysis failed loading company roster: ${rosterError.message}`,
    );
  }

  const rosterIds = (roster ?? []).map((item) => item.id);
  const [
    { data: ops, error: opsError },
    { data: privateFacts, error: privateError },
    { data: licenses, error: licenseError },
  ] = await Promise.all([
    rosterIds.length
      ? supabase
          .from("company_roster_operations_fact_v")
          .select(
            "roster_id, scanner_serial, dot_exp, qual_cert_exp, fuel_card, pin_id_no, daily_pay_effective_date, daily_pay_rate, fx_id, dswid",
          )
          .in("roster_id", rosterIds)
      : Promise.resolve({ data: [], error: null }),
    rosterIds.length
      ? supabase
          .from("company_roster_personal_fact_v")
          .select(
            "roster_id, date_of_birth, address_line_1, address_line_2, city, state_region, postal_code",
          )
          .eq("company_id", company.id)
          .in("roster_id", rosterIds)
      : Promise.resolve({ data: [], error: null }),
    rosterIds.length
      ? supabase
          .from("company_roster_license_fact_v")
          .select(
            "roster_id, license_number, issuing_state, issue_date, expiration_date",
          )
          .eq("company_id", company.id)
          .in("roster_id", rosterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (opsError) {
    throw new Error(
      `Roster analysis failed loading operations facts: ${opsError.message}`,
    );
  }

  if (privateError) {
    throw new Error(
      `Roster analysis failed loading personal facts: ${privateError.message}`,
    );
  }

  if (licenseError) {
    throw new Error(
      `Roster analysis failed loading license facts: ${licenseError.message}`,
    );
  }

  const opsByRoster = new Map((ops ?? []).map((item) => [item.roster_id, item]));
  const privateByRoster = new Map((privateFacts ?? []).map((item) => [item.roster_id, item]));
  const licenseByRoster = new Map((licenses ?? []).map((item) => [item.roster_id, item]));

  const records = (roster ?? []).map((member) => {
    const operation = (opsByRoster.get(member.id) ?? {}) as RosterOperationsFact;
    const privateFact = (privateByRoster.get(member.id) ?? {}) as RosterPersonalFact;
    const license = (licenseByRoster.get(member.id) ?? {}) as RosterLicenseFact;
    return {
      roster_member_id: member.id,
      profile_id: member.profile_id,
      full_name: member.full_name,
      email: member.email,
      phone: member.phone,
      worker_type: member.worker_type,
      job_title: member.job_title,
      employment_status: member.employment_status,
      market_code: member.market_code,
      hire_date: member.hire_date,
      separation_date: member.separation_date,
      notes: member.notes,
      date_of_birth: privateFact.date_of_birth,
      address_line_1: privateFact.address_line_1,
      address_line_2: privateFact.address_line_2,
      city: privateFact.city,
      state_region: privateFact.state_region,
      postal_code: privateFact.postal_code,
      license_number: license.license_number,
      issuing_state: license.issuing_state,
      license_issue_date: license.issue_date,
      license_expiration_date: license.expiration_date,
      fx_id: operation.fx_id,
      dswid: operation.dswid,
      scanner_serial: operation.scanner_serial,
      fuel_card: operation.fuel_card,
      pin_id_no: operation.pin_id_no,
      dot_expiration_date: operation.dot_exp,
      qual_cert_expiration_date: operation.qual_cert_exp,
      daily_pay_rate: operation.daily_pay_rate,
      daily_pay_effective_date: operation.daily_pay_effective_date,
    } as Record<string, unknown>;
  });

  const byId = new Map(records.map((record) => [String(record.roster_member_id), record]));

  function collisionsFor(row: RosterImportRow, targetRosterId: string | null) {
    const collisions: string[] = [];
    const checks: Array<[string, (record: Record<string, unknown>) => boolean]> = [
      ["email", (record) => Boolean(lower(row.email)) && lower(record.email) === lower(row.email)],
      ["phone", (record) => Boolean(compactPhone(row.phone)) && compactPhone(record.phone) === compactPhone(row.phone)],
      ["fx_id", (record) => Boolean(value(row.fx_id)) && value(record.fx_id) === value(row.fx_id)],
      ["dswid", (record) => Boolean(lower(row.dswid)) && lower(record.dswid) === lower(row.dswid)],
      ["license_number", (record) => Boolean(lower(row.license_number)) && lower(record.license_number) === lower(row.license_number)],
    ];
    for (const [field, matcher] of checks) {
      if (records.some((record) => String(record.roster_member_id) !== targetRosterId && matcher(record))) collisions.push(field);
    }
    return [...new Set(collisions)];
  }

  return rows.map((row, index) => {
    const issues = Array.isArray(row.issues) ? [...row.issues] : [];
    const rowNumber = Number(row.row_number ?? index + 2);

    const uploadDuplicates = duplicateFieldsWithinUpload(rows, index);
    if (uploadDuplicates.length) {
      return {
        row_number: rowNumber,
        decision: "CONFLICT",
        roster_member_id: value(row.roster_member_id) || null,
        row,
        matched_fields: [],
        conflicting_fields: uploadDuplicates,
        changed_fields: [],
        current: null,
        proposed: null,
        issues: ["One or more unique identity fields are duplicated within the uploaded file."],
      };
    }

    if (issues.length) return { row_number: rowNumber, decision: "INVALID", roster_member_id: null, row, matched_fields: [], conflicting_fields: [], changed_fields: [], current: null, proposed: null, issues };

    const explicitId = value(row.roster_member_id);
    if (explicitId) {
      const current = byId.get(explicitId);
      if (!current) return { row_number: rowNumber, decision: "INVALID", roster_member_id: null, row, matched_fields: [], conflicting_fields: ["roster_member_id"], changed_fields: [], current: null, proposed: null, issues: ["Roster Member ID is invalid for this company."] };
      const conflicts = collisionsFor(row, explicitId);
      if (conflicts.length) return { row_number: rowNumber, decision: "CONFLICT", roster_member_id: explicitId, row, matched_fields: ["roster_member_id"], conflicting_fields: conflicts, changed_fields: [], current, proposed: null, issues: ["One or more unique identity fields already belong to another roster member."] };
      const proposed = proposedValues(row, current);
      const changed = changedFields(current, proposed);
      return { row_number: rowNumber, decision: changed.length ? "UPDATE_DRAFT" : "UNCHANGED", roster_member_id: explicitId, row, matched_fields: ["roster_member_id"], conflicting_fields: [], changed_fields: changed, current, proposed, issues: [] };
    }

    const evidence: Array<[string, (record: Record<string, unknown>) => boolean]> = [
      ["email", (record) => Boolean(lower(row.email)) && lower(record.email) === lower(row.email)],
      ["phone", (record) => Boolean(compactPhone(row.phone)) && compactPhone(record.phone) === compactPhone(row.phone)],
      ["fx_id", (record) => Boolean(value(row.fx_id)) && value(record.fx_id) === value(row.fx_id)],
      ["dswid", (record) => Boolean(lower(row.dswid)) && lower(record.dswid) === lower(row.dswid)],
      ["license_number", (record) => Boolean(lower(row.license_number)) && lower(record.license_number) === lower(row.license_number)],
    ];

    const candidates = new Map<string, { record: Record<string, unknown>; fields: string[] }>();
    for (const [field, matcher] of evidence) {
      for (const record of records.filter(matcher)) {
        const id = String(record.roster_member_id);
        const existing = candidates.get(id) ?? { record, fields: [] };
        existing.fields.push(field);
        candidates.set(id, existing);
      }
    }

    if (candidates.size > 1) return { row_number: rowNumber, decision: "CONFLICT", roster_member_id: null, row, matched_fields: [], conflicting_fields: [...new Set([...candidates.values()].flatMap((candidate) => candidate.fields))], changed_fields: [], current: null, proposed: null, issues: ["Duplicate fields identify more than one roster member."] };

    if (candidates.size === 0) {
      const sameName = records.filter((record) => compactName(record.full_name) === compactName(row.full_name));
      if (sameName.length) return { row_number: rowNumber, decision: "CONFLICT", roster_member_id: null, row, matched_fields: [], conflicting_fields: ["full_name"], changed_fields: [], current: null, proposed: null, issues: ["Name matches an existing roster member but no unique identity field confirms the match."] };
      return { row_number: rowNumber, decision: "NEW", roster_member_id: null, row, matched_fields: [], conflicting_fields: [], changed_fields: IMPORT_FIELDS.filter((field) => value(row[field])), current: null, proposed: proposedValues(row, null), issues: [] };
    }

    const candidate = [...candidates.values()][0];
    const proposed = proposedValues(row, candidate.record);
    const changed = changedFields(candidate.record, proposed);
    return { row_number: rowNumber, decision: changed.length ? "UPDATE_DRAFT" : "UNCHANGED", roster_member_id: String(candidate.record.roster_member_id), row, matched_fields: candidate.fields, conflicting_fields: [], changed_fields: changed, current: candidate.record, proposed, issues: [] };
  });
}
