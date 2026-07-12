import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function integer(value: string | null) {
  if (!value || !/^\d{4}$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;
    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    const year = integer(yearParam);

    if (
      yearParam !== null &&
      (!year || year < 2020 || year > 2100)
    ) {
      return NextResponse.json(
        {
          error: "A valid analytics year is required.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        {
          error: "Company not found.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 404 }
      );
    }

    if (year === null) {
      const { data, error } = await supabase.rpc(
        "get_company_operations_history_years",
        {
          p_company_id: company.id,
        }
      );

      if (error) {
        const status =
          error.code === "42501"
            ? 403
            : error.code === "22023"
              ? 400
              : 500;

        return NextResponse.json(
          {
            error: error.message,
            available_years: [],
            metadata: null,
            rows: [],
          },
          { status }
        );
      }

      return NextResponse.json(
        {
          available_years: Array.isArray(data) ? data : [],
          metadata: null,
          rows: [],
        },
        { status: 200 }
      );
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data, error } = await supabase.rpc(
      "get_company_operations_history",
      {
        p_company_id: company.id,
        p_start_date: startDate,
        p_end_date: endDate,
      }
    );

    if (error) {
      const status =
        error.code === "42501"
          ? 403
          : error.code === "22023"
            ? 400
            : 500;

      return NextResponse.json(
        {
          error: error.message,
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status }
      );
    }

    const rows = Array.isArray(data) ? data : [];
    const throughServiceDate =
      rows.length > 0
        ? String(rows.at(-1)?.service_date ?? "") || null
        : null;

    return NextResponse.json(
      {
        available_years: [],
        metadata: {
          requested_year: year,
          start_date: startDate,
          end_date: endDate,
          generated_at: new Date().toISOString(),
          through_service_date: throughServiceDate,
          source_family: "DSW",
          finalized_operating_day_count: rows.length,
        },
        rows,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load analytics history.",
        available_years: [],
        metadata: null,
        rows: [],
      },
      { status: 500 }
    );
  }
}
