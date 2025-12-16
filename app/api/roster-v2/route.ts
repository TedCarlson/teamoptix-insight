import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side Supabase client (service role).
 * Never use anon for write-capable server routes.
 */
function supabaseServer() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Temporary write-protection until RLS/auth is in place.
 * Set in Vercel/Env: ROSTER_WRITE_TOKEN="some-long-random-string"
 * Client must send header: x-roster-write-token: <token>
 */
function requireWriteToken(req: Request) {
  const expected = process.env.ROSTER_WRITE_TOKEN;
  if (!expected) {
    // Fail closed. You can relax this if needed, but safest default is to require it.
    return { ok: false, error: "Server missing ROSTER_WRITE_TOKEN" as const };
  }

  const got = req.headers.get("x-roster-write-token") ?? "";
  if (got !== expected) {
    return { ok: false, error: "Unauthorized" as const };
  }
  return { ok: true as const };
}

// Allowlist fields to prevent unintended writes
const WRITABLE_FIELDS = new Set([
  "division",
  "region",
  "pc",
  "office",
  "director",
  "regional_ops_manager",
  "pc_ops_manager",
  "status",
  "tech_id",
  "full_name",
  "company",
  "c_code",
  "itg_supervisor",
  "supervisor",
  "schedule_name",
  "role",
  "fuse_emp_id",
  "nt_login",
  "csgid",
  "email",
  "mobile_number",
  "preferred_off_days",
  "route_area",
  "preferred_fma",
  "skillset",
  "start_location",
  "start_date",
  "end_date",
  "last_updated",
  "notes",
  "roster_key",
  "insight_person_id",
  // intentionally NOT writable: "imported_at"
]);

function pickWritable(input: any) {
  const out: Record<string, any> = {};
  if (!input || typeof input !== "object") return out;

  for (const [k, v] of Object.entries(input)) {
    if (!WRITABLE_FIELDS.has(k)) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}

/** READ: /api/roster-v2?roster_id=... */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roster_id = (searchParams.get("roster_id") ?? "").trim();

    if (!roster_id) {
      return NextResponse.json({ ok: false, error: "Missing roster_id" }, { status: 400 });
    }

    const { data, error } = await supabaseServer()
      .from("roster_v2")
      .select("*")
      .eq("roster_id", roster_id)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "GET failed" }, { status: 500 });
  }
}

/** CREATE */
export async function POST(req: Request) {
  try {
    const auth = requireWriteToken(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

    const body = await req.json();
    const payload = pickWritable(body);

    // Optional: set last_updated server-side if you want
    // payload.last_updated = new Date().toISOString();

    const { data, error } = await supabaseServer()
      .from("roster_v2")
      .insert(payload)
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "POST failed" }, { status: 500 });
  }
}

/** UPDATE */
export async function PATCH(req: Request) {
  try {
    const auth = requireWriteToken(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

    const body = await req.json();
    const roster_id = (body?.roster_id ?? "").toString().trim();

    if (!roster_id) {
      return NextResponse.json({ ok: false, error: "Missing roster_id" }, { status: 400 });
    }

    const updates = pickWritable(body);

    // Prevent changing primary key through updates (extra safety)
    delete (updates as any).roster_id;

    // Optional: set last_updated server-side if you want
    // updates.last_updated = new Date().toISOString();

    const { data, error } = await supabaseServer()
      .from("roster_v2")
      .update(updates)
      .eq("roster_id", roster_id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "PATCH failed" }, { status: 500 });
  }
}
