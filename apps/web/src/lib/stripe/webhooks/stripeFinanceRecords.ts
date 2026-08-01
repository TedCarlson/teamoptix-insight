import type Stripe from "stripe";

type StripeReference = string | { id: string } | null | undefined;

export function resolveStripeId(reference: StripeReference): string | null {
  if (typeof reference === "string") return reference;
  return reference?.id ?? null;
}

export function stripeTimestamp(value: number | null | undefined): string | null {
  return value == null ? null : new Date(value * 1000).toISOString();
}

export function stripeAmount(value: number | null | undefined): number {
  return (value ?? 0) / 100;
}

export function resolveInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & {
    payment_intent?: StripeReference;
  };

  const legacyId = resolveStripeId(legacy.payment_intent);
  if (legacyId) return legacyId;

  for (const invoicePayment of invoice.payments?.data ?? []) {
    const payment = invoicePayment.payment;
    if (payment?.type === "payment_intent") {
      return resolveStripeId(payment.payment_intent);
    }
  }

  return null;
}

export function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return resolveStripeId(subscription);
}

export function resolveInvoicePurpose(
  invoice: Stripe.Invoice
): "implementation" | "subscription" | null {
  const purpose = invoice.metadata?.payment_purpose;
  if (purpose === "implementation" || purpose === "subscription") {
    return purpose;
  }

  return resolveInvoiceSubscriptionId(invoice) ? "subscription" : null;
}

export function stripeInvoiceRecord(
  invoice: Stripe.Invoice,
  eventId: string
) {
  const paidAt = stripeTimestamp(invoice.status_transitions.paid_at);

  return {
    provider: "stripe",
    provider_invoice_id: invoice.id,
    provider_customer_id: resolveStripeId(invoice.customer),
    provider_subscription_id: resolveInvoiceSubscriptionId(invoice),
    provider_payment_intent_id: resolveInvoicePaymentIntentId(invoice),
    provider_event_id: eventId,
    provider_livemode: invoice.livemode,
    invoice_number: invoice.number,
    billing_reason: invoice.billing_reason,
    collection_method: invoice.collection_method,
    currency: invoice.currency.toLowerCase(),
    amount_due: stripeAmount(invoice.amount_due),
    amount_paid: stripeAmount(invoice.amount_paid),
    amount_remaining: stripeAmount(invoice.amount_remaining),
    invoice_status: invoice.status ?? "draft",
    hosted_invoice_url: invoice.hosted_invoice_url,
    invoice_pdf_url: invoice.invoice_pdf,
    issued_at: stripeTimestamp(invoice.created),
    due_at: stripeTimestamp(invoice.due_date),
    paid_at: paidAt,
    period_start: stripeTimestamp(invoice.period_start),
    period_end: stripeTimestamp(invoice.period_end),
    provider_metadata: invoice.metadata ?? {},
  };
}

export function stripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): "incomplete" | "trialing" | "active" | "past_due" | "unpaid" | "paused" | "cancelled" {
  if (status === "canceled") return "cancelled";
  if (status === "incomplete_expired") return "cancelled";
  return status;
}

export function stripeSubscriptionRecord(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0] ?? null;
  const price = firstItem?.price ?? null;
  const operatorTierKey = subscription.metadata?.operator_tier_key?.trim() || null;

  return {
    provider: "stripe",
    provider_subscription_id: subscription.id,
    provider_price_id: price?.id ?? null,
    price_key: operatorTierKey ?? price?.id ?? "unmapped",
    billing_interval: price?.recurring?.interval ?? "week",
    subscription_status: stripeSubscriptionStatus(subscription.status),
    current_period_start: stripeTimestamp(firstItem?.current_period_start),
    current_period_end: stripeTimestamp(firstItem?.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    provider_livemode: subscription.livemode,
    provider_metadata: subscription.metadata ?? {},
  };
}

export function resolveEventObjectId(event: Stripe.Event): string | null {
  const object = event.data.object as { id?: string };
  return object.id ?? null;
}

export function resolveEventCompanyId(event: Stripe.Event): string | null {
  const object = event.data.object as {
    metadata?: Record<string, string> | null;
    client_reference_id?: string | null;
  };

  return (
    object.metadata?.company_id?.trim() ||
    object.client_reference_id?.trim() ||
    null
  );
}
