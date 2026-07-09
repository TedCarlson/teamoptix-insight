import { NextRequest, NextResponse } from "next/server";

import { getStripeServerClient } from "@/lib/stripe/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const stripe = getStripeServerClient();

    const { data: company, error: companyError } = await supabase
      .schema("core")
      .from("companies")
      .select("id, company_name, company_slug, contact_email")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: existingBillingCustomer } = await supabase
      .schema("billing")
      .from("customer")
      .select("id, provider_customer_id")
      .eq("company_id", company.id)
      .eq("provider", "stripe")
      .maybeSingle();

    if (existingBillingCustomer?.provider_customer_id) {
      return NextResponse.json({
        ok: true,
        reused: true,
        stripe_customer_id: existingBillingCustomer.provider_customer_id,
      });
    }

    const stripeCustomer = await stripe.customers.create({
      name: company.company_name,
      email: company.contact_email ?? undefined,
      metadata: {
        company_id: company.id,
        company_slug: company.company_slug,
        source: "insight",
      },
    });

    const { error: upsertError } = await supabase
      .schema("billing")
      .from("customer")
      .upsert(
        {
          company_id: company.id,
          provider: "stripe",
          provider_customer_id: stripeCustomer.id,
          billing_email: company.contact_email,
          billing_name: company.company_name,
          billing_status: "ready",
        },
        { onConflict: "company_id,provider" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      stripe_customer_id: stripeCustomer.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Stripe customer." },
      { status: 500 }
    );
  }
}
