import { describe, expect, it } from "vitest";
import { findPersistenceMismatches } from "./rosterPersistenceVerification";

describe("roster persistence verification", () => {
  it("accepts the normalized values returned by authoritative storage", () => {
    expect(
      findPersistenceMismatches({
        submitted: {
          full_name: "  Driver One  ",
          email: "DRIVER@EXAMPLE.COM",
          address_line_2: "",
          hire_date: "2026-08-25",
          daily_pay_rate: "130.00",
        },
        persisted: {
          full_name: "Driver One",
          email: "driver@example.com",
          address_line_2: null,
          hire_date: "2026-08-25T00:00:00.000Z",
          daily_pay_rate: 130,
        },
        fields: {
          full_name: "text",
          email: "email",
          address_line_2: "text",
          hire_date: "date",
          daily_pay_rate: "number",
        },
      }),
    ).toEqual([]);
  });

  it("checks only submitted fields", () => {
    expect(
      findPersistenceMismatches({
        submitted: { city: "Aiken" },
        persisted: { city: "Aiken", postal_code: null },
        fields: { city: "text", postal_code: "text" },
      }),
    ).toEqual([]);
  });

  it("reports every field that failed to round-trip", () => {
    expect(
      findPersistenceMismatches({
        submitted: {
          city: "Aiken",
          license_expiration_date: "2027-08-25",
        },
        persisted: {
          city: "Augusta",
          license_expiration_date: null,
        },
        fields: {
          city: "text",
          license_expiration_date: "date",
        },
      }),
    ).toEqual(["city", "license_expiration_date"]);
  });
});

