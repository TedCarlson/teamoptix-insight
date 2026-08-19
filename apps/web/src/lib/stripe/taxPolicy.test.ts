import { describe, expect, it } from "vitest";

import {
  resolveStripeTaxPolicy,
  stripeAutomaticTaxMetadata,
} from "./taxPolicy";

describe("Stripe automatic tax policy", () => {
  it("treats the account USD default as tax-exclusive", () => {
    const policy = resolveStripeTaxPolicy({
      settings: {
        status: "active",
        defaults: {
          tax_behavior: "inferred_by_currency",
          tax_code: "txcd_10000000",
        },
      },
      price: {
        currency: "usd",
        tax_behavior: "unspecified",
      },
      product: {
        tax_code: null,
      },
    });

    expect(policy).toEqual({
      taxBehavior: "exclusive",
      taxCode: "txcd_10000000",
      taxCodeSource: "account_default",
    });
    expect(stripeAutomaticTaxMetadata(policy)).toEqual({
      tax_calculation: "automatic",
      tax_behavior: "exclusive",
      tax_code: "txcd_10000000",
      tax_code_source: "account_default",
    });
  });

  it("prefers the product-specific tax code", () => {
    const policy = resolveStripeTaxPolicy({
      settings: {
        status: "active",
        defaults: {
          tax_behavior: "exclusive",
          tax_code: "txcd_10000000",
        },
      },
      price: {
        currency: "usd",
        tax_behavior: "exclusive",
      },
      product: {
        tax_code: "txcd_10103001",
      },
    });

    expect(policy).toEqual({
      taxBehavior: "exclusive",
      taxCode: "txcd_10103001",
      taxCodeSource: "product",
    });
  });

  it("rejects inclusive tax behavior", () => {
    expect(() =>
      resolveStripeTaxPolicy({
        settings: {
          status: "active",
          defaults: {
            tax_behavior: "inclusive",
            tax_code: "txcd_10000000",
          },
        },
        price: {
          currency: "usd",
          tax_behavior: "unspecified",
        },
        product: {
          tax_code: null,
        },
      })
    ).toThrow("tax-exclusive");
  });

  it("rejects a nontaxable effective code", () => {
    expect(() =>
      resolveStripeTaxPolicy({
        settings: {
          status: "active",
          defaults: {
            tax_behavior: "exclusive",
            tax_code: "txcd_10000000",
          },
        },
        price: {
          currency: "usd",
          tax_behavior: "exclusive",
        },
        product: {
          tax_code: "txcd_00000000",
        },
      })
    ).toThrow("Nontaxable");
  });
});
