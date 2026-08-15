import { describe, expect, it } from "vitest";
import {
  composePayrollReportRecipients,
  isPayrollRecipientEmail,
  splitPayrollRecipientInput,
} from "@/features/payroll/lib/payrollReportRecipients";

describe("payroll report recipients", () => {
  it("always places the company-profile AO first", () => {
    expect(
      composePayrollReportRecipients("AO@Example.com", ["bc@example.com"])
    ).toEqual(["ao@example.com", "bc@example.com"]);
  });

  it("deduplicates optional recipients without dropping the AO", () => {
    expect(
      composePayrollReportRecipients("ao@example.com", [
        "BC@example.com",
        "ao@example.com",
        "bc@example.com",
      ])
    ).toEqual(["ao@example.com", "bc@example.com"]);
  });

  it("splits fallback input and identifies invalid addresses", () => {
    const recipients = splitPayrollRecipientInput(
      "one@example.com; two@example.com\nnot-an-email"
    );

    expect(recipients).toEqual([
      "one@example.com",
      "two@example.com",
      "not-an-email",
    ]);
    expect(recipients.filter((email) => !isPayrollRecipientEmail(email))).toEqual([
      "not-an-email",
    ]);
  });
});
