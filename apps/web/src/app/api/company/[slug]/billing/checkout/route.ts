import { NextRequest, NextResponse } from "next/server";

import { getStripeServerClient } from "@/lib/stripe/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type OperatorTierStripeMapping = {
  tier_key: string;
  stripe_setup_price_id: string | null;
  stripe_subscription_price_id: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const sessionClient = await getSupabaseServerClient();
    const admin = createSupabaseServiceRoleClient();
    const stripe = getStripeServerClient();

    const {
      data: { session },
    } = await sessionClient.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: access, error: accessError } =
      await sessionClient.rpc("access_context");

    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 500 });
    }

    const membership =
      Array.isArray(access?.memberships)
        ? access.memberships.find(
            (item: any) => item.company_slug === slug
          ) ?? null
        : null;

    const canManageBilling =
      Boolean(access?.is_platform_owner) ||
      (
        membership?.relationship_type === "admin" &&
        membership?.membership_status === "active"
      );

    if (!canManageBilling) {
      return NextResponse.json(
        { error: "You do not have permission to manage billing for this company." },
        { status: 403 }
      );
    }

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, company_name, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message ?? "Company not found." },
        { status: 404 }
      );
    }

    const { data: profile, error: profileError } = await admin
      .schema("commercial")
      .from("profile")
      .select("operator_tier_key, commercial_status")
      .eq("company_id", company.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile?.operator_tier_key) {
      return NextResponse.json(
        { error: "A saved operator tier is required." },
        { status: 400 }
      );
    }

    if (profile.commercial_status !== "stripe_customer_created") {
      return NextResponse.json(
        { error: "The commercial profile is not ready for Checkout." },
        { status: 400 }
      );
    }

    const { data: billingCustomer, error: customerError } = await admin
      .schema("billing")
      .from("customer")
      .select("id, provider_customer_id")
      .eq("company_id", company.id)
      .eq("provider", "stripe")
      .maybeSingle();

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 });
    }

    if (!billingCustomer?.provider_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer has not been created." },
        { status: 400 }
      );
    }

    const { data: tierData, error: tierError } = await admin
      .schema("commercial")
      .from("operator_tier")
      .select(
        "tier_key, stripe_setup_price_id, stripe_subscription_price_id"
      )
      .eq("tier_key", profile.operator_tier_key)
      .eq("active", true)
      .maybeSingle();

    if (tierError) {
      return NextResponse.json({ error: tierError.message }, { status: 500 });
    }

    const tier = tierData as OperatorTierStripeMapping | null;

    if (!tier?.stripe_setup_price_id || !tier?.stripe_subscription_price_id) {
      return NextResponse.json(
        { error: "The selected operator tier is not mapped to Stripe Checkout prices." },
        { status: 400 }
      );
    }

    const origin = request.nextUrl.origin;
    const billingUrl = `${origin}/company/${slug}/billing`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: billingCustomer.provider_customer_id,
      line_items: [
        {
          price: tier.stripe_setup_price_id,
          quantity: 1,
        },
      ],
      client_reference_id: company.id,
      success_url:
        `${billingUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${billingUrl}?checkout=cancelled`,
      metadata: {
        company_id: company.id,
        company_slug: company.company_slug,
        operator_tier_key: tier.tier_key,
        source: "insight",
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Stripe did not return a Checkout URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      checkout_session_id: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Stripe Checkout Session.",
      },
      { status: 500 }
    );
  }
}
