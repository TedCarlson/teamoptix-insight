import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { loadExpressEvidence } from "@/features/operations/express/loadExpressEvidence";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function todayNyIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type DispatchActionRow = {
  id: string;
  event_code: string;
  event_payload?: Record<string, unknown> | null;
};

function currentDispatchActions(value: unknown) {
  const actions = Array.isArray(value) ? value as DispatchActionRow[] : [];
  const reversedIds = new Set(
    actions
      .map((action) => text(action.event_payload?.reverses_event_id))
      .filter(Boolean)
  );

  return actions.filter((action) =>
    !action.event_code.startsWith("UNDO_") &&
    !text(action.event_payload?.reverses_event_id) &&
    !reversedIds.has(action.id)
  );
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const serviceRole = createSupabaseServiceRoleClient();
  const url = new URL(req.url);
  const serviceDate = text(url.searchParams.get("date")) || addDaysIso(todayNyIso(), -1);

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("get_daily_operations_summary", {
    p_company_id: company.id,
    p_service_date: serviceDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = data?.[0] ?? null;
  const normalized = (summary?.normalized_row_json ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  let expressSnapshot;
  try {
    expressSnapshot = await loadExpressEvidence({
      companyId: company.id,
      serviceDate,
      manifestClient: serviceRole,
      statusClient: serviceRole,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Unable to load Express evidence: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
  const express = expressSnapshot.totals;

  const signals: Array<{
    key: string;
    type: string;
    title: string;
    detail: string;
    source: string;
    severity: "WATCH" | "RISK" | "CRITICAL";
    value: number;
    route?: string;
  }> = [];

  const earlyLate = number(normalized.early_late_pickups);
  const missedPickups = number(normalized.potential_missed_pickups);
  const ilsPercent = number(normalized.ils_percent);

  if (earlyLate > 0) signals.push({
    key: "DSW_EARLY_LATE_PICKUPS",
    type: "EARLY_LATE_PICKUPS",
    title: "Early/Late pickup exposure",
    detail: `${earlyLate} pickup${earlyLate === 1 ? "" : "s"} recorded as early or late in the FINAL DSW.`,
    source: "DSW",
    severity: "WATCH",
    value: earlyLate,
  });
  if (missedPickups > 0) signals.push({
    key: "DSW_POTENTIAL_MISSED_PICKUPS",
    type: "POTENTIAL_MISSED_PICKUPS",
    title: "Potential missed pickups",
    detail: `${missedPickups} potential missed pickup${missedPickups === 1 ? "" : "s"} require management review.`,
    source: "DSW",
    severity: "CRITICAL",
    value: missedPickups,
  });
  if (summary && ilsPercent < 99.5) signals.push({
    key: "DSW_ILS_TARGET_MISS",
    type: "ILS_TARGET_MISS",
    title: "ILS below operating target",
    detail: `ILS closed at ${ilsPercent.toFixed(3)}% against the 99.500% operating target.`,
    source: "DSW",
    severity: "RISK",
    value: ilsPercent,
  });

  for (const row of expressSnapshot.routes) {
    const routeKey = text(row.route_key) || "UNASSIGNED";
    const open = number(row.open_package_count);
    const attempted = number(row.attempted_package_count);
    const identityMissing = number(row.tracking_identity_missing_count);
    const stopLinkMissing = number(row.stop_link_missing_count);
    const stopLinkAmbiguous = number(row.stop_link_ambiguous_count);
    const dataQualityCount = identityMissing + stopLinkMissing + stopLinkAmbiguous;
    if (open > 0) signals.push({
      key: `EXPRESS_OPEN:${routeKey}`,
      type: "EXPRESS_OPEN",
      title: `Open Express · ${routeKey}`,
      detail: `${open} Express package${open === 1 ? " has" : "s have"} no completion or current attempt evidence.`,
      source: "MANIFEST",
      severity: "CRITICAL",
      value: open,
      route: routeKey,
    });
    if (attempted > 0) signals.push({
      key: `EXPRESS_ATTEMPTED:${routeKey}`,
      type: "EXPRESS_ATTEMPTED",
      title: `Attempted Express · ${routeKey}`,
      detail: `${attempted} Express package${attempted === 1 ? " has" : "s have"} current All Codes attempt evidence and remain incomplete.`,
      source: "ALL_CODES",
      severity: "WATCH",
      value: attempted,
      route: routeKey,
    });
    if (dataQualityCount > 0) signals.push({
      key: `EXPRESS_DATA_QUALITY:${routeKey}`,
      type: "EXPRESS_DATA_QUALITY",
      title: `Express data quality · ${routeKey}`,
      detail: `${identityMissing} missing tracking identities · ${stopLinkMissing} missing stop links · ${stopLinkAmbiguous} ambiguous stop links.`,
      source: "MANIFEST",
      severity: "RISK",
      value: dataQualityCount,
      route: routeKey,
    });
  }
  if (!express.reference_match_available) signals.push({
    key: "EXPRESS_EVIDENCE_UNAVAILABLE",
    type: "EXPRESS_EVIDENCE_UNAVAILABLE",
    title: "Express All Codes status matching unavailable",
    detail: "Manifest volume remains authoritative and visible, but All Codes cannot currently separate incomplete packages into Attempted and Open.",
    source: "SYSTEM",
    severity: "RISK",
    value: express.package_count,
  });

  // Materialize stable operational signals for company administrators. Read-only
  // users still receive the report even when the governed write is not allowed.
  await Promise.all(signals.map((signal) =>
    supabase.rpc("upsert_company_operations_watchlist_signal", {
      p_company_slug: slug,
      p_service_date: serviceDate,
      p_signal_key: signal.key,
      p_signal_type: signal.type,
      p_title: signal.title,
      p_detail: signal.detail,
      p_source_family: signal.source,
      p_severity: signal.severity,
      p_signal_value: signal.value,
      p_route_key: signal.route ?? null,
      p_source_reference: summary?.batch_id ?? null,
    })
  ));

  const { data: contractRows } = await supabase
    .from("company_contract_config")
    .select("contract_number, terminal_identity, service_area, status, effective_start_date, effective_end_date")
    .eq("company_id", company.id)
    .order("effective_start_date", { ascending: false });

  const contractConfig =
    (contractRows ?? []).find((row) => {
      const status = String(row.status ?? "").toLowerCase();
      const start = String(row.effective_start_date ?? "");
      const end = String(row.effective_end_date ?? "");

      return (
        status === "active" &&
        (!start || start <= serviceDate) &&
        (!end || end >= serviceDate)
      );
    }) ?? null;

  const { data: dispatchActionRows, error: dispatchActionError } = await supabase.rpc(
    "get_daily_operations_dispatch_actions",
    {
      p_company_id: company.id,
      p_service_date: serviceDate,
    }
  );

  if (dispatchActionError) {
    return NextResponse.json(
      { error: `Unable to load Dispatch actions: ${dispatchActionError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    company_name: company.company_name,
    service_date: serviceDate,
    company_identity: contractConfig ?? null,
    summary,
    time_critical: {
      early_late_pickups: earlyLate,
      potential_missed_pickups: missedPickups,
      express,
    },
    dispatch_actions: currentDispatchActions(dispatchActionRows),
  });
}
