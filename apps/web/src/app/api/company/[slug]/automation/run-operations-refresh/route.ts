import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAutomationAccess } from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

async function runStep(
  origin: string,
  slug: string,
  path: string,
  cookie: string | null
) {
  const startedAt = Date.now();

  const res = await fetch(`${origin}/api/company/${slug}/automation/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  const body = await res.json().catch(() => ({}));

  return {
    ok: res.ok && body?.ok !== false,
    status: res.status,
    duration_ms: Date.now() - startedAt,
    result: body,
  };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await context.params;
  const origin = req.nextUrl.origin;
  const supabase = await getSupabaseServerClient();
  const access = await resolveAutomationAccess(supabase, slug);

  if (!access.canAdmin) {
    return NextResponse.json(
      { error: access.error ?? "Forbidden." },
      { status: access.allowed ? 403 : access.status }
    );
  }

  const cookie = req.headers.get("cookie");
  const dsw = await runStep(origin, slug, "discover", cookie);
  const fcc = await runStep(origin, slug, "run-fcc", cookie);

  const ok = dsw.ok && fcc.ok;

  return NextResponse.json(
    {
      ok,
      automation_type: "OPERATIONS_REFRESH",
      duration_ms: Date.now() - startedAt,
      steps: {
        dsw,
        fcc,
      },
    },
    { status: ok ? 200 : 207 }
  );
}
