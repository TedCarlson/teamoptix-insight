import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function key(value: unknown) {
  const raw = String(value ?? "").toUpperCase().trim();
  if (!raw) return "";
  if (raw.includes(",")) {
    const [lastRaw, restRaw = ""] = raw.split(",");
    const last = lastRaw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
    const first = restRaw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
    return last && first ? `${last}|${first}` : "";
  }
  const parts = raw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? `${parts[parts.length - 1]}|${parts[0]}` : "";
}

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const weekEnd = req.nextUrl.searchParams.get("weekEnd");

  if (!weekEnd) {
    return NextResponse.json({ error: "weekEnd is required." }, { status: 400 });
  }

  const weekStart = addDays(weekEnd, -6);
  const supabase = await getSupabaseServerClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data: facts, error: factsError } = await supabase.rpc(
    "list_payroll_dsw_unmatched",
    {
      p_company_id: company.id,
      p_start_date: weekStart,
      p_end_date: weekEnd,
    }
  );

  if (factsError) return NextResponse.json({ error: factsError.message }, { status: 500 });

  const { data: rosterRows, error: rosterError } = await supabase
    .from("company_roster_view")
    .select("roster_member_id, full_name, dswid, employment_status, worker_type")
    .eq("company_id", company.id);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });

  const resolved = new Set<string>();
  for (const r of rosterRows ?? []) if (r.dswid) resolved.add(key(r.dswid));

  const grouped = new Map<string, any>();

  for (const row of facts ?? []) {
    const name = String(row.person_name ?? "").trim();
    if (!name) continue;
    if (resolved.has(key(name))) continue;

    const item = grouped.get(name) ?? {
      person_name: name,
      rows: 0,
      service_dates: new Set<string>(),
      total_stops: 0,
      examples: [],
    };

    item.rows += 1;
    item.service_dates.add(row.service_date);
    item.total_stops += Number(row.actual_delivery_stops ?? 0) + Number(row.actual_pickup_stops ?? 0);
    if (item.examples.length < 5) {
      item.examples.push({ service_date: row.service_date, route_name: row.route_name, wa_number: row.wa_number });
    }
    grouped.set(name, item);
  }

  const unmatched = Array.from(grouped.values()).map((item) => {
    const suggestions = (rosterRows ?? [])
      .map((r: any) => {
        let score = 0;
        if (key(item.person_name) && key(item.person_name) === key(r.dswid)) score += 100;
        if (key(item.person_name) && key(item.person_name) === key(r.full_name)) score += 80;
        return { ...r, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return { ...item, service_dates: Array.from(item.service_dates).sort(), suggestions };
  });

  return NextResponse.json({ unmatched });
}
