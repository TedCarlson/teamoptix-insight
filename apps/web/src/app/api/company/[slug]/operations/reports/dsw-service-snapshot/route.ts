import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const url = new URL(req.url);
    const serviceDate = cellText(url.searchParams.get("date"));

    if (!serviceDate) {
      return NextResponse.json({ error: "Service date is required.", rows: [] }, { status: 400 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found.", rows: [] }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("get_operations_dsw_service_snapshot", {
      p_company_id: company.id,
      p_service_date: serviceDate,
    });

    if (error) {
      return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
    }

    const terminalIdentity = data?.[0]?.terminal_code ?? null;
    const terminalParts = String(terminalIdentity ?? "").split("/").filter(Boolean);
    const stationCode = terminalParts[0] ?? null;
    const terminalNumber = terminalParts[1] ?? null;

    return NextResponse.json({
      source: "DSW",
      company: {
        name: company.company_name ?? null,
        station_code: stationCode,
        terminal_number: terminalNumber,
        terminal_identity: terminalIdentity,
      },
      rows: data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load service snapshot.";
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
