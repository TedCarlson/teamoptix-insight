import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type Step = {
  ok: boolean;
  status: number;
  duration_ms: number;
  result: unknown;
};

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const startedAt = Date.now();
  const { slug } = await context.params;
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") ?? "";

  async function run(path: string): Promise<Step> {
    const stepStartedAt = Date.now();
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    const result = await readJsonSafe(res);

    return {
      ok: res.ok && Boolean((result as { ok?: unknown })?.ok),
      status: res.status,
      duration_ms: Date.now() - stepStartedAt,
      result,
    };
  }

  const dsw = await run(`/api/company/${slug}/automation/discover`);

  return NextResponse.json({
    ok: dsw.ok,
    automation_type: "OPERATIONS_REFRESH",
    duration_ms: Date.now() - startedAt,
    steps: {
      dsw,
      fcc: {
        ok: false,
        status: 503,
        duration_ms: 0,
        result: {
          ok: false,
          status: "DISABLED",
          message: "FCC automation is temporarily disabled while DSW is being ported.",
        },
      },
    },
  }, { status: dsw.ok ? 200 : 500 });
}
