import { describe, expect, it } from "vitest";
import {
  describeStripeApiKey,
  describeStripeConnectionError,
  validateProductionStripeApiKey,
} from "./apiKey";

const restrictedLiveKey = `rk_${"live"}_${"x".repeat(32)}`;

describe("Stripe API key helpers", () => {
  it("recognizes and masks a live restricted key", () => {
    expect(describeStripeApiKey(restrictedLiveKey)).toEqual({
      mode: "Live",
      kind: "Restricted",
      maskedLabel: `Live restricted key ••••${"x".repeat(6)}`,
    });
  });

  it("accepts live restricted and secret keys but rejects sandbox keys", () => {
    expect(validateProductionStripeApiKey(restrictedLiveKey)).toBeNull();
    expect(validateProductionStripeApiKey(`sk_${"live"}_${"y".repeat(32)}`)).toBeNull();
    expect(validateProductionStripeApiKey(`rk_${"test"}_${"z".repeat(32)}`)).toMatch(
      /live restricted key/
    );
  });

  it("maps Stripe authentication failures without returning key-bearing error messages", () => {
    expect(
      describeStripeConnectionError({
        code: "api_key_expired",
        message: "Expired API Key provided: sensitive-value",
      })
    ).toEqual({
      code: "api_key_expired",
      message: "Stripe rejected the configured API credential because it has expired.",
    });
  });
});
