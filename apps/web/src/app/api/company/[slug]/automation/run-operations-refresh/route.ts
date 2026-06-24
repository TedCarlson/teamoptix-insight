import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function runStep(origin: string, slug: string, path: string) {
  const startedAt = Date.now();

  const res = await fetch(`${origin}/api/company/${slug}/automation/${path}`, {
    method: "POST",
    cache: "no-store",
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

  const dsw = await runStep(origin, slug, "discover");
  const fcc = await runStep(origin, slug, "run-fcc");

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
