import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SORT_KEYS = new Set(["route_name", "current_wa_num"]);
const SORT_DIRECTIONS = new Set(["asc", "desc"]);

function cleanSortKey(value: unknown) {
  return typeof value === "string" && SORT_KEYS.has(value) ? value : "route_name";
}

function cleanSortDirection(value: unknown) {
  return typeof value === "string" && SORT_DIRECTIONS.has(value) ? value : "asc";
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase.rpc("get_company_operations_config", {
      p_company_slug: slug,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load operations config.";

    return NextResponse.json({ error: message }, { status: 500 });
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

    const { data, error } = await supabase.rpc("update_company_operations_config", {
      p_company_slug: slug,
      p_route_sort_key: cleanSortKey(body.route_sort_key),
      p_route_sort_direction: cleanSortDirection(body.route_sort_direction),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update operations config.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
