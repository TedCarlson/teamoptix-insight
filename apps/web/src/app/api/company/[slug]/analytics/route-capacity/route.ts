import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { summarizeRouteCapacityByDay } from "@/features/company/analytics/routeCapacity.helpers";
import { deriveRouteCapacityFromHistory } from "@/features/company/analytics/routes/routeIntelligence";
import type {
  RouteCapacityPayload,
  RouteCapacityRow,
  ScopedRouteFact,
} from "@/features/company/analytics/routeCapacity.types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function dateText(value: string | null): string | null {
  const normalized = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function uuidText(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyError } =
      await sb
        .from("companies")
        .select("id")
        .eq("company_slug", slug)
        .single();

    if (companyError || !company) {
      return NextResponse.json(
        {
          error: "Company not found.",
          rows: [],
          days: [],
        },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const startDate = dateText(
      url.searchParams.get("startDate")
    );
    const endDate = dateText(
      url.searchParams.get("endDate")
    );
    const routeId = uuidText(
      url.searchParams.get("routeId")
    );

    if (!startDate || !endDate || !routeId) {
      return NextResponse.json(
        {
          error:
            "routeId, startDate, and endDate are required.",
          rows: [],
          days: [],
        },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          error:
            "startDate must be on or before endDate.",
          rows: [],
          days: [],
        },
        { status: 400 }
      );
    }

    const { data, error } = await sb.rpc(
      "get_company_route_intelligence_detail",
      {
        p_company_id: company.id,
        p_route_baseline_id: routeId,
        p_start_date: startDate,
        p_end_date: endDate,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [], days: [] },
        { status: 500 }
      );
    }

    const rows = deriveRouteCapacityFromHistory(
      Array.isArray(data) ? (data as ScopedRouteFact[]) : []
    ).filter((row: RouteCapacityRow) => row.service_date >= startDate);

    const payload: RouteCapacityPayload = {
      range: {
        start_date: startDate,
        end_date: endDate,
      },
      rows,
      days: summarizeRouteCapacityByDay(rows),
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load route-capacity analytics.",
        rows: [],
        days: [],
      },
      { status: 500 }
    );
  }
}
