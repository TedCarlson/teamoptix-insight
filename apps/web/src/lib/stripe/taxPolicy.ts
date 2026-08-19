import type Stripe from "stripe";

export const STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER =
  "insight-implementation-checkout-ntqzmpra";

export const STRIPE_AUTOMATIC_TAX_METADATA = {
  tax_calculation: "automatic",
  tax_behavior: "exclusive",
} as const;

type StripeTaxSettings = {
  status: "active" | "pending";
  defaults: {
    tax_behavior: "exclusive" | "inclusive" | "inferred_by_currency" | null;
    tax_code: string | null;
  };
};

export type StripeTaxPolicy = {
  taxBehavior: "exclusive";
  taxCode: string;
  taxCodeSource: "product" | "account_default";
};

function resolveTaxCodeId(
  taxCode: Stripe.Product["tax_code"]
): string | null {
  if (typeof taxCode === "string") return taxCode;
  return taxCode?.id ?? null;
}

export function resolveStripeTaxPolicy(input: {
  settings: StripeTaxSettings;
  price: Pick<Stripe.Price, "currency" | "tax_behavior">;
  product: Pick<Stripe.Product, "tax_code">;
}): StripeTaxPolicy {
  if (input.settings.status !== "active") {
    throw new Error(
      "Stripe Tax settings are not active. Complete the account tax setup before collecting payment."
    );
  }

  const priceBehavior = input.price.tax_behavior;
  const effectiveBehavior =
    priceBehavior === "exclusive" || priceBehavior === "inclusive"
      ? priceBehavior
      : input.settings.defaults.tax_behavior;
  const currency = input.price.currency.toLowerCase();
  const isExclusive =
    effectiveBehavior === "exclusive" ||
    (effectiveBehavior === "inferred_by_currency" &&
      (currency === "usd" || currency === "cad"));

  if (!isExclusive) {
    throw new Error(
      "Stripe Tax must treat this price as tax-exclusive so tax is added on top of the approved subtotal."
    );
  }

  const productTaxCode = resolveTaxCodeId(input.product.tax_code);
  const taxCode = productTaxCode ?? input.settings.defaults.tax_code;

  if (!taxCode) {
    throw new Error(
      "Stripe Tax requires a product tax code or an account default tax code before collecting payment."
    );
  }

  if (taxCode === "txcd_00000000") {
    throw new Error(
      "The effective Stripe product tax code is Nontaxable, which conflicts with Insight automatic tax collection."
    );
  }

  return {
    taxBehavior: "exclusive",
    taxCode,
    taxCodeSource: productTaxCode ? "product" : "account_default",
  };
}

export function stripeAutomaticTaxMetadata(
  policy: StripeTaxPolicy
): Record<string, string> {
  return {
    ...STRIPE_AUTOMATIC_TAX_METADATA,
    tax_code: policy.taxCode,
    tax_code_source: policy.taxCodeSource,
  };
}

export function assertStripeCustomerTaxLocation(
  customer: Stripe.Customer | Stripe.DeletedCustomer
): asserts customer is Stripe.Customer {
  if (customer.deleted) {
    throw new Error("The Stripe billing customer has been deleted.");
  }

  if (
    customer.tax?.automatic_tax !== "supported" ||
    !customer.tax.location
  ) {
    throw new Error(
      "The Stripe billing customer needs a valid tax location before automatic tax can be enabled."
    );
  }
}

export function hasManualSubscriptionTaxRates(
  subscription: Stripe.Subscription
): boolean {
  return Boolean(
    subscription.default_tax_rates?.length ||
      subscription.items.data.some((item) => item.tax_rates?.length)
  );
}
