import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

async function resolveCompany(
  slug: string,
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
) {
  const { data: company, error } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (error || !company) return null;
  return company;
}

async function fetchDroRows(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  companyId: string,
  serviceDate: string,
  frame: "AM" | "PM"
) {
  return supabase.rpc("get_operations_dro_plan_rows", {
    p_company_id: companyId,
    p_service_date: serviceDate,
    p_report_frame: frame,
  });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const company = await resolveCompany(slug, supabase);
    if (!company) {
      return NextResponse.json(
        { error: "Company not found.", rows: [] },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const serviceDate = cellText(url.searchParams.get("date"));

    if (!serviceDate) {
      return NextResponse.json(
        { error: "Service date is required.", rows: [] },
        { status: 400 }
      );
    }

    const requestedFrame = cellText(url.searchParams.get("frame")).toUpperCase();

    if (requestedFrame === "AM" || requestedFrame === "PM") {
      const { data, error } = await fetchDroRows(
        supabase,
        company.id,
        serviceDate,
        requestedFrame
      );

      if (error) {
        return NextResponse.json(
          { error: error.message, rows: [] },
          { status: 500 }
        );
      }

      return NextResponse.json({
        source_frame: requestedFrame,
        fallback_used: false,
        rows: data ?? [],
      });
    }

    const am = await fetchDroRows(supabase, company.id, serviceDate, "AM");

    if (am.error) {
      return NextResponse.json(
        { error: am.error.message, rows: [] },
        { status: 500 }
      );
    }

    if ((am.data ?? []).length > 0) {
      return NextResponse.json({
        source_frame: "AM",
        fallback_used: false,
        rows: am.data ?? [],
      });
    }

    const pm = await fetchDroRows(supabase, company.id, serviceDate, "PM");

    if (pm.error) {
      return NextResponse.json(
        { error: pm.error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source_frame: "PM",
      fallback_used: true,
      rows: pm.data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load DRO plan rows.";

    return NextResponse.json(
      { error: message, rows: [] },
      { status: 500 }
    );
  }
}
