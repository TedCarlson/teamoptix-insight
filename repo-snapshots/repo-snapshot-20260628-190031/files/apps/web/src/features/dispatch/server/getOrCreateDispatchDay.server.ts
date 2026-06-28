import { NextResponse } from "next/server";
import { getDispatchRequestContext } from "./resolveDispatchCompany.server";

export async function getOrCreateDispatchDay(slug: string, dispatchDate: string) {
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.supabase.rpc("dispatch_get_or_create_day", {
    p_company_id: ctx.company.id,
    p_dispatch_date: dispatchDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    company_id: ctx.company.id,
    ...(data ?? {}),
  });
}
