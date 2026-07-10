import type Stripe from "stripe";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type CheckoutCompletedResult =
  | {
      handled: false;
      duplicate: false;
      companyId: null;
      checkoutSessionId: string;
    }
  | {
      handled: true;
      duplicate: boolean;
      companyId: string;
      checkoutSessionId: string;
    };

function resolvePaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null
) {
  if (typeof paymentIntent === "string") return paymentIntent;
  return paymentIntent?.id ?? null;
}

export async function processCheckoutSessionCompleted(
  event: Stripe.CheckoutSessionCompletedEvent
): Promise<CheckoutCompletedResult> {
  const session = event.data.object;
  const admin = createSupabaseServiceRoleClient();

  if (session.metadata?.source !== "insight") {
    return {
      handled: false,
      duplicate: false,
      companyId: null,
      checkoutSessionId: session.id,
    };
  }

  const companyId =
    session.metadata.company_id?.trim() ||
    session.client_reference_id?.trim() ||
    null;

  if (!companyId) {
    throw new Error(
      `Checkout Session ${session.id} is missing its company identifier.`
    );
  }

  if (session.payment_status !== "paid") {
    throw new Error(
      `Checkout Session ${session.id} completed without a paid payment status.`
    );
  }

  if (session.amount_total == null) {
    throw new Error(
      `Checkout Session ${session.id} is missing its total amount.`
    );
  }

  if (!session.currency) {
    throw new Error(
      `Checkout Session ${session.id} is missing its currency.`
    );
  }

  const { data: billingCustomer, error: customerError } = await admin
    .schema("billing")
    .from("customer")
    .select("id")
    .eq("company_id", companyId)
    .eq("provider", "stripe")
    .maybeSingle();

  if (customerError) {
    throw new Error(customerError.message);
  }

  if (!billingCustomer) {
    throw new Error(
      `No Stripe billing customer exists for company ${companyId}.`
    );
  }

  const paymentIntentId = resolvePaymentIntentId(session.payment_intent);

  const { error: paymentError } = await admin
    .schema("billing")
    .from("payment")
    .insert({
      customer_id: billingCustomer.id,
      company_id: companyId,
      provider: "stripe",
      payment_purpose: "implementation",
      provider_checkout_session_id: session.id,
      provider_payment_intent_id: paymentIntentId,
      provider_event_id: event.id,
      amount: session.amount_total / 100,
      currency: session.currency.toLowerCase(),
      payment_status: "paid",
      paid_at: new Date(event.created * 1000).toISOString(),
      provider_metadata: {
        company_slug: session.metadata.company_slug ?? null,
        operator_tier_key: session.metadata.operator_tier_key ?? null,
        checkout_mode: session.mode,
        payment_status: session.payment_status,
      },
    });

  const duplicate = paymentError?.code === "23505";

  if (paymentError && !duplicate) {
    throw new Error(paymentError.message);
  }

  /*
   * Only advance the implementation lifecycle from its expected prior state.
   * This deliberately avoids overwriting subscription_active or any later state
   * when Stripe retries an older implementation-payment event.
   */
  const { error: profileError } = await admin
    .schema("commercial")
    .from("profile")
    .update({
      commercial_status: "implementation_paid",
    })
    .eq("company_id", companyId)
    .eq("commercial_status", "stripe_customer_created");

  if (profileError) {
    throw new Error(profileError.message);
  }

  return {
    handled: true,
    duplicate,
    companyId,
    checkoutSessionId: session.id,
  };
}
