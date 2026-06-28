import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase.rpc(
      "get_operations_automation_schedule_config",
      { p_company_slug: slug }
    );

    if (error) {
      return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load schedule.", rows: [] },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const { data, error } = await supabase.rpc(
      "save_operations_automation_schedule_config_with_window",
      {
        p_company_slug: slug,
        p_automation_type: body.automation_type,
        p_is_enabled: Boolean(body.is_enabled),
        p_cadence_minutes: Number(body.cadence_minutes),
        p_window_preset: body.window_preset,
        p_start_time: body.start_time,
        p_end_time: body.end_time,
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save schedule." },
      { status: 500 }
    );
  }
}
