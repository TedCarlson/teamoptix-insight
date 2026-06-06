import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await req.json();

    const {
      fx_id,
      dswid,
      dot_expiration_date,
      qual_cert_expiration_date,
      daily_pay,
      scanner_serial,
    } = body;

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const { data: beforeRow } = await supabase
      .schema("core")
      .from("company_roster")
      .select("*")
      .eq("id", rosterId)
      .single();

    const { error: updateError } = await supabase
      .schema("core")
      .from("company_roster")
      .update({
        fx_id,
        dswid,
        dot_expiration_date,
        qual_cert_expiration_date,
        daily_pay,
        scanner_serial,
      })
      .eq("id", rosterId)
      .eq("company_id", company.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    const { data: afterRow } = await supabase
      .schema("core")
      .from("company_roster")
      .select("*")
      .eq("id", rosterId)
      .single();

    await supabase
      .schema("core")
      .from("company_roster_event")
      .insert({
        company_id: company.id,
        roster_id: rosterId,
        event_category: "OPERATIONS",
        event_type: "operations_updated",
        event_detail: "Operations fields updated",
        event_metadata: {
          before: beforeRow,
          after: afterRow,
        },
      });

    return NextResponse.json({
      success: true,
      roster: afterRow,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update operations.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
