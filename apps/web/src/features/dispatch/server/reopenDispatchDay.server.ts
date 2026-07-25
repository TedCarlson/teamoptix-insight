import { NextResponse } from "next/server";
import { getDispatchRequestContext } from "./resolveDispatchCompany.server";

export async function reopenDispatchDay(
  slug: string,
  body: Record<string, unknown>
) {
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const dispatchDate =
    typeof body.dispatch_date === "string"
      ? body.dispatch_date
      : new Date().toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.rpc("dispatch_reopen_day", {
    p_company_id: ctx.company.id,
    p_dispatch_date: dispatchDate,
    p_note: null,
    p_reopened_by_profile_id: ctx.access?.profile_id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data ?? {}) });
}
