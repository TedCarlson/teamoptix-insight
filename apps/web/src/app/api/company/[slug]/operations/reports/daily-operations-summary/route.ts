import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: expressRows } = await supabase
    .from("operations_manifest_express_route_signal_v")
    .select("route_key, package_count, completed_package_count, open_package_count, tracking_gap_package_count")
    .eq("company_id", company.id)
    .eq("service_date", serviceDate);

  const express = (expressRows ?? []).reduce(
    (total, row) => ({
      package_count: total.package_count + number(row.package_count),
      completed_package_count: total.completed_package_count + number(row.completed_package_count),
      open_package_count: total.open_package_count + number(row.open_package_count),
      tracking_gap_package_count: total.tracking_gap_package_count + number(row.tracking_gap_package_count),
    }),
    { package_count: 0, completed_package_count: 0, open_package_count: 0, tracking_gap_package_count: 0 }
  );

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

  for (const row of expressRows ?? []) {
    const routeKey = text(row.route_key) || "UNASSIGNED";
    const open = number(row.open_package_count);
    const gaps = number(row.tracking_gap_package_count);
    if (open > 0) signals.push({
      key: `EXPRESS_OPEN:${routeKey}`,
      type: "EXPRESS_OPEN",
      title: `Open Express · ${routeKey}`,
      detail: `${open} Express package${open === 1 ? " is" : "s are"} linked to a manifest stop whose completion status is not complete.`,
      source: "MANIFEST",
      severity: "CRITICAL",
      value: open,
      route: routeKey,
    });
    if (gaps > 0) signals.push({
      key: `EXPRESS_TRACKING_GAP:${routeKey}`,
      type: "EXPRESS_TRACKING_GAP",
      title: `Express tracking gap · ${routeKey}`,
      detail: `${gaps} Express package${gaps === 1 ? " lacks" : "s lack"} an independently verifiable completion link.`,
      source: "MANIFEST",
      severity: "RISK",
      value: gaps,
      route: routeKey,
    });
  }

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
