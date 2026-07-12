import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function int(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    const family = text(url.searchParams.get("family")) || null;
    const limit = int(url.searchParams.get("limit"), 50);
    const offset = int(url.searchParams.get("offset"), 0);

    const { data, error } = await sb
      .rpc("operations_report_history", {
        p_company_id: company.id,
        p_report_family_key: family,
        p_limit: limit,
        p_offset: offset,
      });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          rows: [],
        },
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
            : "Failed to load report history.",
        rows: [],
      },
      { status: 500 }
    );
  }
}
