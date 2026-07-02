import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyError } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", rows: [] },
        { status: 404 }
      );
    }

    const url = new URL(req.url);

    const dates =
      url.searchParams
        .getAll("date")
        .map(text)
        .filter(Boolean);

    if (!dates.length) {
      return NextResponse.json(
        { error: "At least one date is required.", rows: [] },
        { status: 400 }
      );
    }

    const { data, error } =
      await sb.rpc(
        "get_operations_intelligence_route_history",
        {
          p_company_id: company.id,
          p_service_dates: dates,
        }
      );

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rows: data ?? [],
    });

  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load route history.",
        rows: [],
      },
      { status: 500 }
    );
  }
}
