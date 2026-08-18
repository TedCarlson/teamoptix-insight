import { describe, expect, it } from "vitest";
import { companyProductHref, productKeyFromPathname } from "./productWorkspace";

describe("product workspace routing", () => {
  it("preselects the product from a Team Optix product surface", () => {
    expect(productKeyFromPathname("/teamoptix/products/itg")).toBe(
      "insight-telecom-fulfillment"
    );
    expect(productKeyFromPathname("/teamoptix/products/insight")).toBe(
      "insight-pd-last-mile"
    );
    expect(productKeyFromPathname("/teamoptix/products/uls")).toBe(
      "utility-locate-service"
    );
  });

  it("requires a product choice outside a product surface", () => {
    expect(productKeyFromPathname("/teamoptix/home")).toBeNull();
  });

  it("keeps company selection inside the active ITF product shell", () => {
    expect(
      productKeyFromPathname(
        "/insight/telecom-fulfillment/integrated-tech-group/metrics"
      )
    ).toBe("insight-telecom-fulfillment");
  });

  it("opens ITF inside its product workspace without changing PDLM routes", () => {
    expect(
      companyProductHref("insight-telecom-fulfillment", "integrated-tech-group")
    ).toBe("/insight/telecom-fulfillment/integrated-tech-group");
    expect(companyProductHref("insight-pd-last-mile", "beacon-point-ventures")).toBe(
      "/company/beacon-point-ventures"
    );
  });
});
