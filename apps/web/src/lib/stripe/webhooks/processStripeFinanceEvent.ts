import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getStripeServerClient } from "@/lib/stripe/server";
import { processCheckoutSessionCompleted } from "./processCheckoutSessionCompleted";
import {
  resolveInvoicePurpose,
  resolveInvoiceMetadata,
  resolveInvoicePaymentsPaymentIntentId,
  resolveStripeId,
  stripeAmount,
  stripeInvoiceLineRecord,
  stripeInvoiceRecord,
  stripeSubscriptionRecord,
  stripeTimestamp,
} from "./stripeFinanceRecords";

export type StripeFinanceEventResult = {
  handled: boolean;
  companyId: string | null;
  customerId: string | null;
  objectId: string | null;
};

type BillingCustomer = {
  id: string;
  company_id: string;
  billing_status: string;
};

async function findBillingCustomer(
  admin: SupabaseClient,
  providerCustomerId: string | null,
  companyId: string | null = null
): Promise<BillingCustomer | null> {
  let query = admin
    .schema("billing")
    .from("customer")
    .select("id, company_id, billing_status")
    .eq("provider", "stripe");

  if (providerCustomerId) {
    query = query.eq("provider_customer_id", providerCustomerId);
  } else if (companyId) {
    query = query.eq("company_id", companyId);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle<BillingCustomer>();
  if (error) throw new Error(error.message);
  return data;
}

function unhandled(objectId: string | null = null): StripeFinanceEventResult {
  return { handled: false, companyId: null, customerId: null, objectId };
}

async function processCustomerEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
  customer: Stripe.Customer | Stripe.DeletedCustomer
): Promise<StripeFinanceEventResult> {
  const existing = await findBillingCustomer(admin, customer.id);

  if (customer.deleted) {
    if (!existing) return unhandled(customer.id);

    const { error } = await admin
      .schema("billing")
      .from("customer")
      .update({ billing_status: "cancelled" })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    return {
      handled: true,
      companyId: existing.company_id,
      customerId: existing.id,
      objectId: customer.id,
    };
  }

  const companyId = customer.metadata?.company_id?.trim() || existing?.company_id || null;
  if (!companyId) return unhandled(customer.id);

  const payload = {
    company_id: companyId,
    provider: "stripe",
    provider_customer_id: customer.id,
    provider_livemode: event.livemode,
    billing_email: customer.email,
    billing_name: customer.name,
    billing_status:
      existing?.billing_status === "not_started" || !existing
        ? "ready"
        : existing.billing_status,
  };

  const { data, error } = await admin
    .schema("billing")
    .from("customer")
    .upsert(payload, { onConflict: "company_id,provider" })
    .select("id, company_id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Unable to sync Stripe customer.");

  return {
    handled: true,
    companyId: data.company_id,
    customerId: data.id,
    objectId: customer.id,
  };
}

async function processInvoiceEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
  invoice: Stripe.Invoice
): Promise<StripeFinanceEventResult> {
  const providerCustomerId = resolveStripeId(invoice.customer);
  const invoiceMetadata = resolveInvoiceMetadata(invoice);
  const customer = await findBillingCustomer(
    admin,
    providerCustomerId,
    invoiceMetadata.company_id?.trim() || null
  );

  if (!customer || !providerCustomerId) return unhandled(invoice.id);

  const purpose = resolveInvoicePurpose(invoice);
  const mapped = stripeInvoiceRecord(invoice, event.id);

  if (purpose && !mapped.provider_payment_intent_id) {
    const stripe = getStripeServerClient();
    const invoicePayments = await stripe.invoicePayments.list({
      invoice: invoice.id,
      limit: 10,
    });
    mapped.provider_payment_intent_id =
      resolveInvoicePaymentsPaymentIntentId(invoicePayments.data);
  }

  const providerSubscriptionId = mapped.provider_subscription_id;
  let subscriptionId: string | null = null;

  if (providerSubscriptionId) {
    const { data, error } = await admin
      .schema("billing")
      .from("subscription")
      .select("id")
      .eq("provider", "stripe")
      .eq("provider_subscription_id", providerSubscriptionId)
      .maybeSingle<{ id: string }>();

    if (error) throw new Error(error.message);
    subscriptionId = data?.id ?? null;
  }

  const { data: savedInvoice, error: invoiceError } = await admin
    .schema("billing")
    .from("invoice")
    .upsert(
      {
        ...mapped,
        customer_id: customer.id,
        company_id: customer.company_id,
        subscription_id: subscriptionId,
      },
      { onConflict: "provider,provider_invoice_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (invoiceError || !savedInvoice) {
    throw new Error(invoiceError?.message ?? "Unable to sync Stripe invoice.");
  }

  if (invoice.lines.data.length > 0) {
    const lineRows = invoice.lines.data.map((line) =>
      stripeInvoiceLineRecord(line, invoice, savedInvoice.id, customer.company_id)
    );
    const { error: lineError } = await admin
      .schema("billing")
      .from("invoice_line")
      .upsert(lineRows, { onConflict: "provider,provider_line_item_id" });

    if (lineError) throw new Error(lineError.message);
  }

  const isPaid = event.type === "invoice.paid" || invoice.status === "paid";
  const isFailed = event.type === "invoice.payment_failed";

  if (purpose && (isPaid || isFailed)) {
    let paymentIntent: Stripe.PaymentIntent | null = null;
    let charge: Stripe.Charge | null = null;

    if (mapped.provider_payment_intent_id) {
      const stripe = getStripeServerClient();
      paymentIntent = await stripe.paymentIntents.retrieve(
        mapped.provider_payment_intent_id
      );
      const chargeId = resolveStripeId(paymentIntent.latest_charge);
      charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
    }

    let existingPaymentQuery = admin
      .schema("billing")
      .from("payment")
      .select("id")
      .eq("provider", "stripe");

    if (mapped.provider_payment_intent_id) {
      existingPaymentQuery = existingPaymentQuery.eq(
        "provider_payment_intent_id",
        mapped.provider_payment_intent_id
      );
    } else {
      existingPaymentQuery = existingPaymentQuery.eq(
        "provider_invoice_id",
        invoice.id
      );
    }

    const { data: existingPayment, error: existingPaymentError } =
      await existingPaymentQuery.maybeSingle<{ id: string }>();

    if (existingPaymentError) throw new Error(existingPaymentError.message);

    const paymentPayload = {
      customer_id: customer.id,
      company_id: customer.company_id,
      invoice_id: savedInvoice.id,
      provider: "stripe",
      payment_purpose: purpose,
      provider_payment_intent_id: mapped.provider_payment_intent_id,
      provider_charge_id: charge?.id ?? null,
      provider_invoice_id: invoice.id,
      provider_livemode: invoice.livemode,
      amount: stripeAmount(isPaid ? invoice.amount_paid : invoice.amount_due),
      currency: invoice.currency.toLowerCase(),
      payment_status: isPaid ? "paid" : "failed",
      paid_at: isPaid
        ? stripeTimestamp(invoice.status_transitions.paid_at) ??
          stripeTimestamp(event.created)
        : null,
      receipt_url: charge?.receipt_url ?? null,
      amount_refunded: stripeAmount(charge?.amount_refunded),
      failure_code:
        paymentIntent?.last_payment_error?.code ?? charge?.failure_code ?? null,
      failure_message: isFailed
        ? paymentIntent?.last_payment_error?.message ??
          charge?.failure_message ??
          "Stripe reported invoice payment failure."
        : null,
      provider_metadata: {
        ...invoiceMetadata,
        invoice_number: invoice.number,
        billing_reason: invoice.billing_reason,
      },
    };

    if (existingPayment) {
      const { error } = await admin
        .schema("billing")
        .from("payment")
        .update(paymentPayload)
        .eq("id", existingPayment.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .schema("billing")
        .from("payment")
        .insert({ ...paymentPayload, provider_event_id: event.id });
      if (error?.code === "23505") {
        // Stripe does not guarantee webhook ordering. A concurrent invoice
        // event may have inserted the same payment after our lookup, so reload
        // the winning row and apply this event's latest provider state.
        let concurrentPaymentQuery = admin
          .schema("billing")
          .from("payment")
          .select("id")
          .eq("provider", "stripe");

        if (mapped.provider_payment_intent_id) {
          concurrentPaymentQuery = concurrentPaymentQuery.eq(
            "provider_payment_intent_id",
            mapped.provider_payment_intent_id
          );
        } else {
          concurrentPaymentQuery = concurrentPaymentQuery.eq(
            "provider_invoice_id",
            invoice.id
          );
        }

        const { data: concurrentPayment, error: concurrentPaymentError } =
          await concurrentPaymentQuery.maybeSingle<{ id: string }>();

        if (concurrentPaymentError || !concurrentPayment) {
          throw new Error(concurrentPaymentError?.message ?? error.message);
        }

        const { error: updateError } = await admin
          .schema("billing")
          .from("payment")
          .update(paymentPayload)
          .eq("id", concurrentPayment.id);

        if (updateError) throw new Error(updateError.message);
      } else if (error) {
        throw new Error(error.message);
      }
    }
  }

  return {
    handled: true,
    companyId: customer.company_id,
    customerId: customer.id,
    objectId: invoice.id,
  };
}

async function processSubscriptionEvent(
  admin: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<StripeFinanceEventResult> {
  const providerCustomerId = resolveStripeId(subscription.customer);
  const customer = await findBillingCustomer(
    admin,
    providerCustomerId,
    subscription.metadata?.company_id?.trim() || null
  );

  if (!customer) return unhandled(subscription.id);

  const mapped = stripeSubscriptionRecord(subscription);
  const { data: savedSubscription, error } = await admin
    .schema("billing")
    .from("subscription")
    .upsert(
      {
        ...mapped,
        customer_id: customer.id,
        company_id: customer.company_id,
      },
      { onConflict: "provider,provider_subscription_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (error || !savedSubscription) {
    throw new Error(error?.message ?? "Unable to sync Stripe subscription.");
  }

  const { error: invoiceLinkError } = await admin
    .schema("billing")
    .from("invoice")
    .update({ subscription_id: savedSubscription.id })
    .eq("provider", "stripe")
    .eq("provider_subscription_id", subscription.id)
    .is("subscription_id", null);

  if (invoiceLinkError) throw new Error(invoiceLinkError.message);

  const billingStatus =
    mapped.subscription_status === "active" || mapped.subscription_status === "trialing"
      ? "active"
      : mapped.subscription_status === "past_due" || mapped.subscription_status === "unpaid"
        ? "past_due"
        : mapped.subscription_status === "cancelled"
          ? "cancelled"
          : customer.billing_status;

  const { error: customerError } = await admin
    .schema("billing")
    .from("customer")
    .update({ billing_status: billingStatus })
    .eq("id", customer.id);

  if (customerError) throw new Error(customerError.message);

  return {
    handled: true,
    companyId: customer.company_id,
    customerId: customer.id,
    objectId: subscription.id,
  };
}

async function processPaymentIntentEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
): Promise<StripeFinanceEventResult> {
  const companyId = paymentIntent.metadata?.company_id?.trim() || null;
  const customer = await findBillingCustomer(
    admin,
    resolveStripeId(paymentIntent.customer),
    companyId
  );

  if (!customer) return unhandled(paymentIntent.id);

  const purpose = paymentIntent.metadata?.payment_purpose;
  if (purpose !== "implementation" && purpose !== "subscription") {
    return unhandled(paymentIntent.id);
  }

  const { data: existing, error: existingError } = await admin
    .schema("billing")
    .from("payment")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_payment_intent_id", paymentIntent.id)
    .maybeSingle<{ id: string }>();

  if (existingError) throw new Error(existingError.message);

  const succeeded = paymentIntent.status === "succeeded";
  const failed = event.type === "payment_intent.payment_failed";
  const chargeId = resolveStripeId(paymentIntent.latest_charge);
  const payload = {
    customer_id: customer.id,
    company_id: customer.company_id,
    provider: "stripe",
    payment_purpose: purpose,
    provider_payment_intent_id: paymentIntent.id,
    provider_charge_id: chargeId,
    provider_livemode: paymentIntent.livemode,
    amount: stripeAmount(succeeded ? paymentIntent.amount_received : paymentIntent.amount),
    currency: paymentIntent.currency.toLowerCase(),
    payment_status: succeeded ? "paid" : failed ? "failed" : "pending",
    paid_at: succeeded ? stripeTimestamp(event.created) : null,
    failure_code: paymentIntent.last_payment_error?.code ?? null,
    failure_message: paymentIntent.last_payment_error?.message ?? null,
    provider_metadata: paymentIntent.metadata ?? {},
  };

  if (existing) {
    const { error } = await admin
      .schema("billing")
      .from("payment")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .schema("billing")
      .from("payment")
      .insert({ ...payload, provider_event_id: event.id });
    if (error) throw new Error(error.message);
  }

  return {
    handled: true,
    companyId: customer.company_id,
    customerId: customer.id,
    objectId: paymentIntent.id,
  };
}

async function processChargeEvent(
  admin: SupabaseClient,
  charge: Stripe.Charge
): Promise<StripeFinanceEventResult> {
  const paymentIntentId = resolveStripeId(charge.payment_intent);
  if (!paymentIntentId) return unhandled(charge.id);

  const { data: payment, error: paymentError } = await admin
    .schema("billing")
    .from("payment")
    .select("id, company_id, customer_id, amount")
    .eq("provider", "stripe")
    .eq("provider_payment_intent_id", paymentIntentId)
    .maybeSingle<{
      id: string;
      company_id: string;
      customer_id: string;
      amount: number | string;
    }>();

  if (paymentError) throw new Error(paymentError.message);
  if (!payment) return unhandled(charge.id);

  const amountRefunded = stripeAmount(charge.amount_refunded);
  const paymentAmount = Number(payment.amount);
  const paymentStatus = charge.refunded
    ? "refunded"
    : amountRefunded > 0 && amountRefunded < paymentAmount
      ? "partially_refunded"
      : charge.paid
        ? "paid"
        : "failed";

  const { error } = await admin
    .schema("billing")
    .from("payment")
    .update({
      provider_charge_id: charge.id,
      receipt_url: charge.receipt_url,
      amount_refunded: amountRefunded,
      payment_status: paymentStatus,
      failure_code: charge.failure_code,
      failure_message: charge.failure_message,
    })
    .eq("id", payment.id);

  if (error) throw new Error(error.message);

  return {
    handled: true,
    companyId: payment.company_id,
    customerId: payment.customer_id,
    objectId: charge.id,
  };
}

export async function processStripeFinanceEvent(
  event: Stripe.Event
): Promise<StripeFinanceEventResult> {
  const admin = createSupabaseServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const result = await processCheckoutSessionCompleted(event);
      return {
        handled: result.handled,
        companyId: result.companyId,
        customerId: null,
        objectId: result.checkoutSessionId,
      };
    }

    case "customer.created":
    case "customer.updated":
    case "customer.deleted":
      return processCustomerEvent(admin, event, event.data.object);

    case "invoice.created":
    case "invoice.finalized":
    case "invoice.finalization_failed":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      return processInvoiceEvent(admin, event, event.data.object);

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return processSubscriptionEvent(admin, event.data.object);

    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
      return processPaymentIntentEvent(admin, event, event.data.object);

    case "charge.succeeded":
    case "charge.failed":
    case "charge.refunded":
      return processChargeEvent(admin, event.data.object);

    default:
      return unhandled();
  }
}
