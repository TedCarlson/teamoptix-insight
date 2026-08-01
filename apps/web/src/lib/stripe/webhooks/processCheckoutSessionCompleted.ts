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

function resolveInvoiceId(
  invoice: string | Stripe.Invoice | null
) {
  if (typeof invoice === "string") return invoice;
  return invoice?.id ?? null;
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

  const configuredLivemode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;

  if (event.livemode !== configuredLivemode || session.livemode !== configuredLivemode) {
    throw new Error(
      `Checkout Session ${session.id} does not match the configured Stripe environment.`
    );
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
  const invoiceId = resolveInvoiceId(session.invoice);
  const paidAt = new Date(event.created * 1000).toISOString();

  const { data: storedInvoice, error: storedInvoiceError } = invoiceId
    ? await admin
        .schema("billing")
        .from("invoice")
        .select("id")
        .eq("provider", "stripe")
        .eq("provider_invoice_id", invoiceId)
        .maybeSingle<{ id: string }>()
    : { data: null, error: null };

  if (storedInvoiceError) throw new Error(storedInvoiceError.message);

  let existingPaymentQuery = admin
    .schema("billing")
    .from("payment")
    .select("id")
    .eq("provider", "stripe");

  if (paymentIntentId) {
    existingPaymentQuery = existingPaymentQuery.eq(
      "provider_payment_intent_id",
      paymentIntentId
    );
  } else {
    existingPaymentQuery = existingPaymentQuery.eq(
      "provider_checkout_session_id",
      session.id
    );
  }

  const { data: existingPayment, error: existingPaymentError } =
    await existingPaymentQuery.maybeSingle<{ id: string }>();

  if (existingPaymentError) throw new Error(existingPaymentError.message);

  const paymentPayload = {
    customer_id: billingCustomer.id,
    company_id: companyId,
    invoice_id: storedInvoice?.id ?? null,
    provider: "stripe",
    payment_purpose: "implementation",
    provider_checkout_session_id: session.id,
    provider_payment_intent_id: paymentIntentId,
    provider_invoice_id: invoiceId,
    provider_livemode: event.livemode,
    amount: session.amount_total / 100,
    currency: session.currency.toLowerCase(),
    payment_status: "paid",
    paid_at: paidAt,
    failure_code: null,
    failure_message: null,
    provider_metadata: {
      company_slug: session.metadata.company_slug ?? null,
      operator_tier_key: session.metadata.operator_tier_key ?? null,
      checkout_mode: session.mode,
      payment_status: session.payment_status,
      livemode: event.livemode,
      invoice_id: invoiceId,
    },
  };

  const duplicate = Boolean(existingPayment);
  const { error: paymentError } = existingPayment
    ? await admin
        .schema("billing")
        .from("payment")
        .update(paymentPayload)
        .eq("id", existingPayment.id)
    : await admin
        .schema("billing")
        .from("payment")
        .insert({ ...paymentPayload, provider_event_id: event.id });

  if (paymentError) throw new Error(paymentError.message);

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

  const { error: readinessError } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .update({
      status: "ready",
      source_type: "provider",
      source_basis: "Verified from a paid live-mode Stripe implementation payment.",
      completed_at: paidAt,
      completed_by: null,
      blocking_reason: null,
      metadata: {
        provider_event_id: event.id,
        provider_checkout_session_id: session.id,
        provider_payment_intent_id: paymentIntentId,
        provider_invoice_id: invoiceId,
        provider_livemode: event.livemode,
        paid_at: paidAt,
      },
    })
    .eq("company_id", companyId)
    .eq("readiness_key", "implementation_payment_ready");

  if (readinessError) throw new Error(readinessError.message);

  const { data: blockingReadiness, error: blockingError } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_blocking", true)
    .eq("status", "incomplete")
    .limit(1);

  if (blockingError) throw new Error(blockingError.message);

  const readyForGoLive = (blockingReadiness?.length ?? 0) === 0;
  const { error: activationError } = await admin
    .schema("commercial")
    .from("company_activation")
    .update({
      implementation_payment_received_at: paidAt,
      lifecycle_status: readyForGoLive ? "ready_for_go_live" : "implementation",
      ready_for_go_live_at: readyForGoLive ? paidAt : null,
      last_transition: "live_implementation_payment_recorded",
      last_transition_at: paidAt,
      last_transition_by: null,
    })
    .eq("company_id", companyId)
    .in("lifecycle_status", ["implementation", "ready_for_go_live"]);

  if (activationError) throw new Error(activationError.message);

  return {
    handled: true,
    duplicate,
    companyId,
    checkoutSessionId: session.id,
  };
}
