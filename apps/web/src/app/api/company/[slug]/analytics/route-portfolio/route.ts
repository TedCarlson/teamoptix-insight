import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildRoutePortfolioPayload } from "@/features/company/analytics/routePortfolio.helpers";
import type { RouteCapacityRow } from "@/features/company/analytics/routeCapacity.types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function dateText(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const url = new URL(req.url);
    const startDate = dateText(url.searchParams.get("startDate"));
    const endDate = dateText(url.searchParams.get("endDate"));

    if (!startDate || !endDate || startDate > endDate) {
      return NextResponse.json(
        { error: "A valid startDate and endDate range is required." },
        { status: 400 }
      );
    }

    const sb = await getSupabaseServerClient();
    const { data: company, error: companyError } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data, error } = await sb.rpc("get_company_route_capacity_analytics", {
      p_company_id: company.id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? (data as RouteCapacityRow[]) : [];
    return NextResponse.json(buildRoutePortfolioPayload(rows, startDate, endDate));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load route portfolio analytics.",
      },
      { status: 500 }
    );
  }
}
