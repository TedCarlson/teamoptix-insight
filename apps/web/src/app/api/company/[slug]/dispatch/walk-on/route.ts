import { NextRequest, NextResponse } from "next/server";
import { getDispatchRequestContext } from "@/features/dispatch/server/resolveDispatchCompany.server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = await req.json().catch(() => ({}));
  const ctx = await getDispatchRequestContext(slug);

  if ("error" in ctx) return ctx.error;

  const fullName =
    typeof body.full_name === "string" ? body.full_name.trim() : "";

  if (!fullName) {
    return NextResponse.json(
      { error: "Walk-on driver name is required." },
      { status: 400 }
    );
  }

  const seenDate =
    typeof body.seen_date === "string" && body.seen_date.trim()
      ? body.seen_date.trim()
      : new Date().toISOString().slice(0, 10);

  const { data, error } = await ctx.supabase.rpc(
    "create_walk_on_roster_candidate",
    {
      p_company_slug: slug,
      p_full_name: fullName,
      p_seen_date: seenDate,
      p_note: "Walk-on driver added from Dispatch.",
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { ok: true });
}
