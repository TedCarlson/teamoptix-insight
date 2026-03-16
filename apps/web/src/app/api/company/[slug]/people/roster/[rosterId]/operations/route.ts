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
      dswid,
      dot_expiration_date,
      qual_cert_expiration_date,
      daily_pay,
      scanner_serial
    } = body;

    const supabase = await getSupabaseServerClient();

    /**
     * Resolve company
     */
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

    /**
     * Update workforce fields
     */
    const { error: updateError } = await supabase
      .schema("core")
      .from("company_roster")
      .update({
        dswid,
        dot_expiration_date,
        qual_cert_expiration_date,
        daily_pay,
        scanner_serial
      })
      .eq("id", rosterId)
      .eq("company_id", company.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}