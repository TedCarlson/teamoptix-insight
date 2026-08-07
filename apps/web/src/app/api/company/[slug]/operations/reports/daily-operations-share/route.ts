import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { loadExpressEvidence } from "@/features/operations/express/loadExpressEvidence";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ slug: string }> };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type DispatchAction = {
  id: string;
  event_code: string;
  event_label: string;
  event_category: string;
  route_key?: string | null;
  route_label?: string | null;
  person_name?: string | null;
  note?: string | null;
  event_payload?: Record<string, unknown> | null;
  created_at: string;
  created_by_name?: string | null;
};

function currentDispatchActions(value: unknown) {
  const actions = Array.isArray(value) ? value as DispatchAction[] : [];
  const reversedIds = new Set(actions.map((action) => String(action.event_payload?.reverses_event_id ?? "").trim()).filter(Boolean));
  return actions.filter((action) =>
    !action.event_code.startsWith("UNDO_") &&
    !String(action.event_payload?.reverses_event_id ?? "").trim() &&
    !reversedIds.has(action.id)
  );
}

function dispatchContext(action: DispatchAction) {
  return [action.route_label || action.route_key, action.person_name].filter(Boolean).join(" · ");
}

function rollupDispatchActions(actions: DispatchAction[]) {
  const groups = new Map<string, { label: string; category: string; actions: DispatchAction[]; contexts: string[]; notes: string[] }>();
  for (const action of actions) {
    const key = `${action.event_category}:${action.event_code}`;
    const group = groups.get(key) ?? { label: action.event_label, category: action.event_category, actions: [], contexts: [], notes: [] };
    const context = dispatchContext(action);
    group.actions.push(action);
    if (context && !group.contexts.includes(context)) group.contexts.push(context);
    if (action.note && !group.notes.includes(action.note)) group.notes.push(action.note);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function actionTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const serviceDate = String(body.service_date ?? "").trim();
    const recipients = String(body.recipients ?? "").split(/[;,\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !recipients.length || recipients.some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
      return NextResponse.json({ error: "A service date and valid recipient email address are required." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const serviceRole = createSupabaseServiceRoleClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { data: company } = await supabase.from("companies").select("id, company_name").eq("company_slug", slug).single();
    if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    const { data: summaryRows, error: summaryError } = await supabase.rpc("get_daily_operations_summary", { p_company_id: company.id, p_service_date: serviceDate });
    if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });
    const summary = summaryRows?.[0] ?? null;
    if (!summary) return NextResponse.json({ error: "A FINAL Daily Service Worksheet is required before sharing." }, { status: 409 });
    const row = (summary.normalized_row_json ?? {}) as Record<string, unknown>;

    const expressEvidence = await loadExpressEvidence({
      companyId: company.id,
      serviceDate,
      manifestClient: serviceRole,
      statusClient: serviceRole,
    });
    const express = {
      total: expressEvidence.totals.package_count,
      complete: expressEvidence.totals.complete_package_count,
      attempted: expressEvidence.totals.attempted_package_count,
      open: expressEvidence.totals.open_package_count,
      data_health: {
        tracking_identity_missing: expressEvidence.totals.tracking_identity_missing_count,
        stop_link_missing: expressEvidence.totals.stop_link_missing_count,
        stop_link_ambiguous: expressEvidence.totals.stop_link_ambiguous_count,
        reference_match_available: expressEvidence.totals.reference_match_available,
      },
    };
    const { data: watchlist } = await supabase.from("operations_watchlist_item_v").select("title, detail, status, severity").eq("company_id", company.id).eq("service_date", serviceDate).eq("client_visible", true).not("status", "in", "(RESOLVED,DISMISSED)");
    const { data: dispatchRows, error: dispatchError } = await supabase.rpc("get_daily_operations_dispatch_actions", { p_company_id: company.id, p_service_date: serviceDate });
    if (dispatchError) return NextResponse.json({ error: `Unable to load Dispatch actions: ${dispatchError.message}` }, { status: 500 });
    const dispatchActions = currentDispatchActions(dispatchRows);

    const snapshot = {
      company_name: company.company_name, service_date: serviceDate, report_batch_id: summary.batch_id,
      routes: number(summary.route_count), delivery_stops: { actual: number(row.actual_delivery_stops), planned: number(row.planned_delivery_stops) },
      delivery_packages: { actual: number(row.actual_delivery_packages), tendered: number(row.vscan_packages) },
      pickups: { actual: number(row.actual_pickup_stops), planned: number(row.planned_pickup_stops), early_late: number(row.early_late_pickups), potential_missed: number(row.potential_missed_pickups) },
      ils_percent: number(row.ils_percent), express, watchlist: watchlist ?? [], dispatch_actions: dispatchActions, generated_at: new Date().toISOString(),
    };
    const subject = String(body.subject ?? "").trim() || `${company.company_name} · Daily Operations · ${serviceDate}`;
    const message = String(body.message ?? "").trim();
    const watchlistHtml = (watchlist ?? []).length
      ? `<h2 style="font-size:18px;margin:24px 0 8px">Actionable watchlist</h2>${(watchlist ?? []).map((item) => `<div style="border:1px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:10px;padding:10px;margin:8px 0"><strong>${escapeHtml(item.title)}</strong><div style="color:#475569">${escapeHtml(item.detail)}</div><small>${escapeHtml(item.status)}</small></div>`).join("")}`
      : `<p style="color:#166534;font-weight:700">No open client-visible watchlist items.</p>`;
    const dispatchHtml = dispatchActions.length
      ? `<h2 style="font-size:18px;margin:24px 0 8px">Dispatch actions</h2>${rollupDispatchActions(dispatchActions).map((group) => {
        const first = actionTime(group.actions[0].created_at);
        const last = actionTime(group.actions[group.actions.length - 1].created_at);
        const authors = Array.from(new Set(group.actions.map((action) => action.created_by_name || "Dispatch"))).join(", ");
        return `<div style="border:1px solid #d7e2f2;border-left:4px solid #2563eb;border-radius:10px;padding:12px;margin:8px 0"><small style="color:#64748b;text-transform:uppercase">${escapeHtml(group.category)}</small><strong style="display:block;font-size:16px;margin-top:4px">${escapeHtml(group.label)} · ${group.actions.length}</strong><div style="color:#475569;margin-top:6px">${escapeHtml(group.contexts.join(" · ") || "Operational event")}</div>${group.notes.length ? `<div style="color:#334155;margin-top:6px">${escapeHtml(group.notes.join(" · "))}</div>` : ""}<small style="display:block;color:#64748b;margin-top:8px">${escapeHtml(first === last ? first : `${first}–${last}`)} · ${escapeHtml(authors)}</small></div>`;
      }).join("")}`
      : `<h2 style="font-size:18px;margin:24px 0 8px">Dispatch actions</h2><p style="color:#64748b">No dispatch actions were recorded for this service date.</p>`;
    const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px;margin:auto"><p style="color:#059669;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Daily operations brief</p><h1 style="margin:0">${escapeHtml(company.company_name)}</h1><p style="color:#64748b">Service date ${escapeHtml(serviceDate)}</p>${message ? `<p>${escapeHtml(message)}</p>` : ""}<table style="width:100%;border-collapse:collapse;margin-top:20px"><tr>${[
      ["Routes", snapshot.routes], ["Delivery stops", `${snapshot.delivery_stops.actual} / ${snapshot.delivery_stops.planned}`], ["Pickups", `${snapshot.pickups.actual} / ${snapshot.pickups.planned}`], ["ILS", `${snapshot.ils_percent.toFixed(1)}%`], ["Express", `${express.complete} Complete · ${express.attempted} Attempted · ${express.open} Open`],
    ].map(([label, value]) => `<td style="border:1px solid #d7e2f2;padding:12px"><small style="color:#64748b;text-transform:uppercase">${label}</small><strong style="display:block;font-size:18px;margin-top:5px">${value}</strong></td>`).join("")}</tr></table>${watchlistHtml}${dispatchHtml}<p style="color:#94a3b8;font-size:11px;margin-top:28px">This is a governed snapshot of the FINAL report and its action state at send time.</p></div>`;

    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${process.env.RESEND_FROM_NAME?.trim() || "Insight"} <${requireEnv("RESEND_FROM_EMAIL")}>`, to: recipients, subject, html }) });
    const provider = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json({ error: provider?.message ?? "Failed to share the report." }, { status: 502 });
    const { error: recordError } = await supabase.rpc("record_company_daily_report_share", { p_company_slug: slug, p_service_date: serviceDate, p_report_batch_id: summary.batch_id, p_recipients: recipients, p_subject: subject, p_message: message || null, p_snapshot_json: snapshot, p_provider_message_id: provider?.id ?? null });
    if (recordError) return NextResponse.json({ error: `Email sent, but the share record failed: ${recordError.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, recipients });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to share the report." }, { status: 500 });
  }
}
