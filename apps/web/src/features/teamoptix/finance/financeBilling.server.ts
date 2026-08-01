import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type Company = {
  id: string;
  company_name: string;
  company_slug: string;
};

export type FinanceCustomer = {
  id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  provider_customer_id: string | null;
  provider_livemode: boolean | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_status: string;
  updated_at: string;
};

export type FinanceInvoice = {
  id: string;
  company_id: string;
  company_name: string;
  provider_invoice_id: string;
  invoice_number: string | null;
  invoice_status: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  provider_livemode: boolean;
};

export type FinancePayment = {
  id: string;
  company_id: string;
  company_name: string;
  payment_purpose: string;
  payment_status: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  paid_at: string | null;
  provider_invoice_id: string | null;
  provider_payment_intent_id: string | null;
  provider_charge_id: string | null;
  receipt_url: string | null;
  provider_livemode: boolean | null;
  failure_message: string | null;
};

export type FinanceSubscription = {
  id: string;
  company_id: string;
  company_name: string;
  provider_subscription_id: string | null;
  provider_price_id: string | null;
  subscription_status: string;
  billing_interval: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider_livemode: boolean | null;
};

export type FinanceProviderEvent = {
  id: string;
  provider_event_id: string;
  event_type: string;
  object_id: string | null;
  company_id: string | null;
  company_name: string | null;
  processing_status: string;
  provider_livemode: boolean;
  occurred_at: string;
  processing_attempts: number;
  last_error: string | null;
};

export type FinanceBillingSnapshot = {
  customers: FinanceCustomer[];
  invoices: FinanceInvoice[];
  payments: FinancePayment[];
  subscriptions: FinanceSubscription[];
  events: FinanceProviderEvent[];
  metrics: {
    liveCustomers: number;
    activeSubscriptions: number;
    paidInvoices: number;
    openInvoices: number;
    collected: number;
    outstanding: number;
    failedEvents: number;
  };
};

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function getFinanceBillingSnapshot(): Promise<FinanceBillingSnapshot> {
  const db = createSupabaseServiceRoleClient();

  const [customersResult, invoicesResult, paymentsResult, subscriptionsResult, eventsResult] =
    await Promise.all([
      db
        .schema("billing")
        .from("customer")
        .select(
          "id, company_id, provider_customer_id, provider_livemode, billing_name, billing_email, billing_status, updated_at"
        )
        .order("updated_at", { ascending: false }),
      db
        .schema("billing")
        .from("invoice")
        .select(
          "id, company_id, provider_invoice_id, invoice_number, invoice_status, amount_due, amount_paid, amount_remaining, currency, issued_at, due_at, paid_at, hosted_invoice_url, invoice_pdf_url, provider_livemode"
        )
        .order("issued_at", { ascending: false })
        .limit(250),
      db
        .schema("billing")
        .from("payment")
        .select(
          "id, company_id, payment_purpose, payment_status, amount, amount_refunded, currency, paid_at, provider_invoice_id, provider_payment_intent_id, provider_charge_id, receipt_url, provider_livemode, failure_message"
        )
        .order("created_at", { ascending: false })
        .limit(250),
      db
        .schema("billing")
        .from("subscription")
        .select(
          "id, company_id, provider_subscription_id, provider_price_id, subscription_status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, provider_livemode"
        )
        .order("updated_at", { ascending: false })
        .limit(250),
      db
        .schema("billing")
        .from("provider_event")
        .select(
          "id, provider_event_id, event_type, object_id, company_id, processing_status, provider_livemode, occurred_at, processing_attempts, last_error"
        )
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

  for (const result of [
    customersResult,
    invoicesResult,
    paymentsResult,
    subscriptionsResult,
    eventsResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const companyIds = Array.from(
    new Set(
      [
        ...(customersResult.data ?? []),
        ...(invoicesResult.data ?? []),
        ...(paymentsResult.data ?? []),
        ...(subscriptionsResult.data ?? []),
        ...(eventsResult.data ?? []),
      ]
        .map((row) => row.company_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: companies, error: companiesError } = companyIds.length
    ? await db
        .from("companies")
        .select("id, company_name, company_slug")
        .in("id", companyIds)
    : { data: [] as Company[], error: null };

  if (companiesError) throw new Error(companiesError.message);

  const companyById = new Map(
    ((companies ?? []) as Company[]).map((company) => [company.id, company])
  );
  const companyName = (companyId: string | null) =>
    (companyId && companyById.get(companyId)?.company_name) || "Unmapped";

  const customers: FinanceCustomer[] = (customersResult.data ?? []).map((row) => ({
    ...row,
    company_name: companyName(row.company_id),
    company_slug: companyById.get(row.company_id)?.company_slug ?? "",
  }));

  const invoices: FinanceInvoice[] = (invoicesResult.data ?? []).map((row) => ({
    ...row,
    company_name: companyName(row.company_id),
    amount_due: numberValue(row.amount_due),
    amount_paid: numberValue(row.amount_paid),
    amount_remaining: numberValue(row.amount_remaining),
  }));

  const payments: FinancePayment[] = (paymentsResult.data ?? []).map((row) => ({
    ...row,
    company_name: companyName(row.company_id),
    amount: numberValue(row.amount),
    amount_refunded: numberValue(row.amount_refunded),
  }));

  const subscriptions: FinanceSubscription[] = (subscriptionsResult.data ?? []).map(
    (row) => ({ ...row, company_name: companyName(row.company_id) })
  );

  const events: FinanceProviderEvent[] = (eventsResult.data ?? []).map((row) => ({
    ...row,
    company_name: row.company_id ? companyName(row.company_id) : null,
  }));

  return {
    customers,
    invoices,
    payments,
    subscriptions,
    events,
    metrics: {
      liveCustomers: customers.filter(
        (customer) => customer.provider_customer_id && customer.provider_livemode === true
      ).length,
      activeSubscriptions: subscriptions.filter(
        (subscription) => subscription.subscription_status === "active"
      ).length,
      paidInvoices: invoices.filter((invoice) => invoice.invoice_status === "paid").length,
      openInvoices: invoices.filter((invoice) => invoice.invoice_status === "open").length,
      collected: payments
        .filter((payment) =>
          ["paid", "partially_refunded", "refunded"].includes(payment.payment_status)
        )
        .reduce(
          (total, payment) => total + payment.amount - payment.amount_refunded,
          0
        ),
      outstanding: invoices.reduce(
        (total, invoice) => total + invoice.amount_remaining,
        0
      ),
      failedEvents: events.filter((event) => event.processing_status === "failed").length,
    },
  };
}
