import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SORT_KEYS = new Set(["route_name", "current_wa_num"]);
const SORT_DIRECTIONS = new Set(["asc", "desc"]);
const TIMEKEEPING_OVERSIGHT_MODES = new Set(["off", "signal_only", "driver_correction", "blocking"]);

function cleanSortKey(value: unknown) {
  return typeof value === "string" && SORT_KEYS.has(value) ? value : "route_name";
}

function cleanSortDirection(value: unknown) {
  return typeof value === "string" && SORT_DIRECTIONS.has(value) ? value : "asc";
}

function cleanTimekeepingOversightMode(value: unknown) {
  return typeof value === "string" && TIMEKEEPING_OVERSIGHT_MODES.has(value) ? value : "off";
}

function cleanDriverFullTimeDayThreshold(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : null;
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

    const updatesTimekeepingOnly =
      body.timekeeping_oversight_mode !== undefined &&
      body.driver_full_time_day_threshold === undefined &&
      body.route_sort_key === undefined &&
      body.route_sort_direction === undefined;

    const updatesDriverUtilizationOnly =
      body.driver_full_time_day_threshold !== undefined &&
      body.timekeeping_oversight_mode === undefined &&
      body.route_sort_key === undefined &&
      body.route_sort_direction === undefined;

    if (updatesDriverUtilizationOnly) {
      const threshold = cleanDriverFullTimeDayThreshold(
        body.driver_full_time_day_threshold
      );
      if (threshold == null) {
        return NextResponse.json(
          { error: "Full-time driver threshold must be between 1 and 7 days." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase.rpc(
        "update_company_driver_utilization_config",
        {
          p_company_slug: slug,
          p_driver_full_time_day_threshold: threshold,
        }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ config: data }, { status: 200 });
    }

    if (updatesTimekeepingOnly) {
      const { data, error } = await supabase.rpc("update_company_timekeeping_config", {
        p_company_slug: slug,
        p_timekeeping_oversight_mode: cleanTimekeepingOversightMode(
          body.timekeeping_oversight_mode
        ),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ config: data }, { status: 200 });
    }

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
