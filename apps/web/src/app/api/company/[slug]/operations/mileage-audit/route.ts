import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest, context: RouteContext) {
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
        { error: "Company not found.", rows: [], count: 0 },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const threshold = numberParam(url.searchParams.get("threshold"), 500);
    const beforeDate = text(url.searchParams.get("beforeDate")) || new Date().toISOString().slice(0, 10);

    const { data, error } = await sb.rpc("get_operations_mileage_audit", {
      p_company_id: company.id,
      p_max_reasonable_miles: threshold,
      p_before_date: beforeDate,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [], count: 0 },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : [];

    return NextResponse.json({
      count: rows.length,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load mileage audit.",
        rows: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
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
        { error: "Company not found.", corrected_count: 0 },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const threshold = numberParam(body?.threshold ? String(body.threshold) : null, 500);
    const beforeDate = text(body?.beforeDate) || new Date().toISOString().slice(0, 10);

    const { data, error } = await sb.rpc("apply_operations_mileage_heal", {
      p_company_id: company.id,
      p_max_reasonable_miles: threshold,
      p_before_date: beforeDate,
      p_corrected_by_profile_id: null,
      p_min_sample_size: Number(body?.minSampleSize ?? 1),
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, corrected_count: 0 },
        { status: 500 }
      );
    }

    return NextResponse.json({
      corrected_count: data?.[0]?.corrected_count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to apply mileage heal.",
        corrected_count: 0,
      },
      { status: 500 }
    );
  }
}
