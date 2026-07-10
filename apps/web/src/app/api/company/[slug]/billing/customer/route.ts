import { NextRequest, NextResponse } from "next/server";

import { getStripeServerClient } from "@/lib/stripe/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
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
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { data: access, error: accessError } =
      await sessionClient.rpc("access_context");

    if (accessError) {
      return NextResponse.json(
        { error: accessError.message },
        { status: 500 }
      );
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
      .select("id, company_name, company_slug, contact_email")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message ?? "Company not found." },
        { status: 404 }
      );
    }

    const { data: commercialProfile, error: profileError } = await admin
      .schema("commercial")
      .from("profile")
      .select(
        "id, operator_tier_key, billing_contact_name, billing_email, commercial_status"
      )
      .eq("company_id", company.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    if (!commercialProfile) {
      return NextResponse.json(
        { error: "Commercial profile has not been created." },
        { status: 400 }
      );
    }

    if (!commercialProfile.operator_tier_key) {
      return NextResponse.json(
        { error: "Operator tier is required before creating a Stripe customer." },
        { status: 400 }
      );
    }

    if (!commercialProfile.billing_email) {
      return NextResponse.json(
        { error: "Billing email is required before creating a Stripe customer." },
        { status: 400 }
      );
    }

    const allowedStages = [
      "profile_complete",
      "ready_for_stripe",
      "stripe_customer_created",
    ];

    if (!allowedStages.includes(commercialProfile.commercial_status)) {
      return NextResponse.json(
        { error: "Commercial profile is not ready for Stripe customer creation." },
        { status: 400 }
      );
    }

    const { data: existingBillingCustomer, error: existingError } = await admin
      .schema("billing")
      .from("customer")
      .select("id, provider_customer_id")
      .eq("company_id", company.id)
      .eq("provider", "stripe")
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    if (existingBillingCustomer?.provider_customer_id) {
      if (commercialProfile.commercial_status !== "stripe_customer_created") {
        const { error: stageError } = await admin
          .schema("commercial")
          .from("profile")
          .update({ commercial_status: "stripe_customer_created" })
          .eq("company_id", company.id);

        if (stageError) {
          return NextResponse.json(
            { error: stageError.message },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        ok: true,
        reused: true,
        stripe_customer_id: existingBillingCustomer.provider_customer_id,
      });
    }

    const stripeCustomer = await stripe.customers.create(
      {
        name:
          commercialProfile.billing_contact_name?.trim() ||
          company.company_name,
        email: commercialProfile.billing_email.trim(),
        metadata: {
          company_id: company.id,
          company_slug: company.company_slug,
          operator_tier_key: commercialProfile.operator_tier_key,
          source: "insight",
        },
      },
      {
        idempotencyKey: `insight-company-${company.id}-stripe-customer-v1`,
      }
    );

    const { error: billingError } = await admin
      .schema("billing")
      .from("customer")
      .upsert(
        {
          company_id: company.id,
          provider: "stripe",
          provider_customer_id: stripeCustomer.id,
          billing_email: commercialProfile.billing_email.trim(),
          billing_name:
            commercialProfile.billing_contact_name?.trim() ||
            company.company_name,
          billing_status: "ready",
        },
        {
          onConflict: "company_id,provider",
        }
      );

    if (billingError) {
      return NextResponse.json(
        { error: billingError.message },
        { status: 500 }
      );
    }

    const { error: stageError } = await admin
      .schema("commercial")
      .from("profile")
      .update({
        commercial_status: "stripe_customer_created",
      })
      .eq("company_id", company.id);

    if (stageError) {
      return NextResponse.json(
        { error: stageError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      stripe_customer_id: stripeCustomer.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Stripe customer.",
      },
      { status: 500 }
    );
  }
}
