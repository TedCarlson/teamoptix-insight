import { describe, expect, it } from "vitest";
import {
  isDswPayrollSource,
  isFallbackWorkEventSource,
  isPayrollSource,
} from "@/features/payroll/lib/payroll.sources";

describe("payroll source contract", () => {
  it("recognizes DSW and fallback work-event facts as payroll evidence", () => {
    expect(isDswPayrollSource("DSW_OWNERSHIP")).toBe(true);
    expect(isFallbackWorkEventSource("MANUAL_TRAINING")).toBe(true);
    expect(isFallbackWorkEventSource("DISPATCH_HELPER")).toBe(true);
    expect(isPayrollSource("MANUAL_HELPER")).toBe(true);
    expect(isPayrollSource("MANUAL_WALK_ON")).toBe(true);
    expect(isPayrollSource("DISPATCH_TRAINING")).toBe(true);
  });

  it("does not promote unrelated attendance signals into payroll", () => {
    expect(isPayrollSource("ATTENDANCE_ONLY")).toBe(false);
    expect(isPayrollSource(null)).toBe(false);
  });
});
