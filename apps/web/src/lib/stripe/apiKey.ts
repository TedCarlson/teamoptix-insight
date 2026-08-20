export type StripeApiKeyMode = "Live" | "Sandbox" | "Unknown";
export type StripeApiKeyKind = "Restricted" | "Secret" | "Unknown";

export type StripeApiKeyDescriptor = {
  mode: StripeApiKeyMode;
  kind: StripeApiKeyKind;
  maskedLabel: string;
};

export type StripeConnectionError = {
  code: string;
  message: string;
};

export function describeStripeApiKey(value: string | null | undefined): StripeApiKeyDescriptor {
  const key = value?.trim() ?? "";
  const mode: StripeApiKeyMode = key.startsWith("sk_live_") || key.startsWith("rk_live_")
    ? "Live"
    : key.startsWith("sk_test_") || key.startsWith("rk_test_")
      ? "Sandbox"
      : "Unknown";
  const kind: StripeApiKeyKind = key.startsWith("rk_")
    ? "Restricted"
    : key.startsWith("sk_")
      ? "Secret"
      : "Unknown";
  const suffix = key.length >= 6 ? key.slice(-6) : "";

  return {
    mode,
    kind,
    maskedLabel:
      mode === "Unknown" || kind === "Unknown" || !suffix
        ? "Not configured"
        : `${mode} ${kind.toLowerCase()} key ••••${suffix}`,
  };
}

export function validateProductionStripeApiKey(value: string) {
  const key = value.trim();

  if (!key) return "Enter the replacement Stripe API key.";
  if (!key.startsWith("rk_live_") && !key.startsWith("sk_live_")) {
    return "Use a live restricted key beginning with rk_live_ or a live secret key beginning with sk_live_.";
  }
  if (key.length < 24) return "The Stripe API key is incomplete.";

  return null;
}

export function describeStripeConnectionError(error: unknown): StripeConnectionError {
  const code = stripeErrorCode(error);

  if (code === "api_key_expired") {
    return {
      code,
      message: "Stripe rejected the configured API credential because it has expired.",
    };
  }

  if (code === "invalid_api_key") {
    return {
      code,
      message: "Stripe rejected the configured API credential.",
    };
  }

  if (code === "permission_denied") {
    return {
      code,
      message: "The Stripe credential does not have permission to read the required billing resources.",
    };
  }

  return {
    code: code || "stripe_connection_failed",
    message: "Stripe connectivity could not be verified.",
  };
}

function stripeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";

  const candidate = error as {
    code?: unknown;
    raw?: { code?: unknown };
  };

  if (typeof candidate.code === "string") return candidate.code;
  if (typeof candidate.raw?.code === "string") return candidate.raw.code;

  return "";
}
