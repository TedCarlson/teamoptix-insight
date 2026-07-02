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

    const body = await req.json().catch(() => ({}));
    const action = text(body?.action).toUpperCase();
    const reviewItems = Array.isArray(body?.reviewItems)
      ? body.reviewItems
          .map((item: { rawRowId?: unknown; miles?: unknown }) => ({
            rawRowId: text(item?.rawRowId),
            miles: item?.miles == null ? null : Number(item.miles),
          }))
          .filter((item: { rawRowId: string; miles: number | null }) => item.rawRowId)
      : [];

    const rawRowIds = reviewItems.map((item: { rawRowId: string }) => item.rawRowId);

    if (!["APPLY", "IGNORE"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be APPLY or IGNORE.", reviewed_count: 0, corrected_count: 0 },
        { status: 400 }
      );
    }

    if (!rawRowIds.length) {
      return NextResponse.json(
        { error: "At least one mileage row is required.", reviewed_count: 0, corrected_count: 0 },
        { status: 400 }
      );
    }

    const { data: company, error: companyError } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", reviewed_count: 0, corrected_count: 0 },
        { status: 404 }
      );
    }

    const { data: auth } = await sb.auth.getUser();
    const { data: profile } = auth?.user
      ? await sb
          .from("user_profile")
          .select("profile_id")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle()
      : { data: null };

    const threshold = numberParam(body?.threshold ? String(body.threshold) : null, 500);
    const beforeDate = text(body?.beforeDate) || new Date().toISOString().slice(0, 10);

    const { data, error } = await sb.rpc("review_operations_mileage_audit", {
      p_company_id: company.id,
      p_action: action,
      p_review_items: reviewItems,
      p_reviewed_by_profile_id: profile?.profile_id ?? null,
      p_max_reasonable_miles: threshold,
      p_before_date: beforeDate,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, reviewed_count: 0, corrected_count: 0 },
        { status: 500 }
      );
    }

    const result = data?.[0] ?? {};

    return NextResponse.json({
      reviewed_count: result.reviewed_count ?? 0,
      corrected_count: result.corrected_count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to review mileage audit.",
        reviewed_count: 0,
        corrected_count: 0,
      },
      { status: 500 }
    );
  }
}
