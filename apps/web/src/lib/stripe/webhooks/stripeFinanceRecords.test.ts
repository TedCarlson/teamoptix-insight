import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  resolveInvoicePaymentIntentId,
  resolveInvoiceMetadata,
  resolveInvoicePurpose,
  stripeAmount,
  stripeInvoiceRecord,
  stripeSubscriptionStatus,
  stripeTimestamp,
} from "./stripeFinanceRecords";

describe("Stripe finance record mapping", () => {
  it("converts Stripe integer amounts and timestamps without rounding guesses", () => {
    expect(stripeAmount(39800)).toBe(398);
    expect(stripeTimestamp(1785594283)).toBe("2026-08-01T14:24:43.000Z");
  });

  it("maps the verified implementation invoice into the Insight ledger shape", () => {
    const invoice = {
      id: "in_live_1",
      customer: "cus_live_1",
      livemode: true,
      number: "WNBGLHVU-0001",
      billing_reason: "manual",
      collection_method: "send_invoice",
      currency: "usd",
      amount_due: 39800,
      amount_paid: 39800,
      amount_remaining: 0,
      subtotal: 39800,
      total: 39800,
      total_discount_amounts: [],
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/example",
      invoice_pdf: "https://pay.stripe.com/invoice/example/pdf",
      created: 1785594283,
      due_date: 1785594283,
      period_start: 1785594283,
      period_end: 1785594283,
      status_transitions: {
        finalized_at: 1785594283,
        marked_uncollectible_at: null,
        paid_at: 1785594283,
        voided_at: null,
      },
      metadata: {
        company_id: "company-1",
        payment_purpose: "implementation",
        source: "insight",
      },
      payments: {
        data: [
          {
            payment: {
              type: "payment_intent",
              payment_intent: "pi_live_1",
            },
          },
        ],
      },
      parent: null,
    } as unknown as Stripe.Invoice;

    expect(resolveInvoicePaymentIntentId(invoice)).toBe("pi_live_1");
    expect(resolveInvoicePurpose(invoice)).toBe("implementation");
    expect(stripeInvoiceRecord(invoice, "evt_live_1")).toMatchObject({
      provider_invoice_id: "in_live_1",
      provider_customer_id: "cus_live_1",
      provider_payment_intent_id: "pi_live_1",
      provider_livemode: true,
      invoice_number: "WNBGLHVU-0001",
      amount_due: 398,
      amount_paid: 398,
      amount_remaining: 0,
      invoice_type: "implementation",
      subtotal_amount: 398,
      total_amount: 398,
      invoice_status: "paid",
      paid_at: "2026-08-01T14:24:43.000Z",
    });
  });

  it("normalizes Stripe cancellation statuses to the database vocabulary", () => {
    expect(stripeSubscriptionStatus("canceled")).toBe("cancelled");
    expect(stripeSubscriptionStatus("incomplete_expired")).toBe("cancelled");
    expect(stripeSubscriptionStatus("past_due")).toBe("past_due");
  });

  it("uses the subscription snapshot metadata carried by recurring invoices", () => {
    const invoice = {
      metadata: {},
      parent: {
        type: "subscription_details",
        subscription_details: {
          subscription: "sub_live_1",
          metadata: {
            source: "insight",
            company_id: "company-1",
            operator_tier_key: "operator_3",
            payment_purpose: "subscription",
          },
        },
      },
    } as unknown as Stripe.Invoice;

    expect(resolveInvoiceMetadata(invoice)).toMatchObject({
      source: "insight",
      company_id: "company-1",
      operator_tier_key: "operator_3",
      payment_purpose: "subscription",
    });
    expect(resolveInvoicePurpose(invoice)).toBe("subscription");
  });
});
