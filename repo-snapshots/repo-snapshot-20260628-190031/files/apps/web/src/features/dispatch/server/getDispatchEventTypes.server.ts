import { NextResponse } from "next/server";
import { getDispatchRequestContext } from "./resolveDispatchCompany.server";

export async function getDispatchEventTypes(slug: string) {
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.supabase.rpc("dispatch_event_types", {
    p_company_id: ctx.company.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message, event_types: [] }, { status: 500 });
  }

  return NextResponse.json({
    company_id: ctx.company.id,
    event_types: Array.isArray(data) ? data : [],
  });
}
