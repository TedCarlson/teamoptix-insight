import { describe, expect, it } from "vitest";
import { isMissingContinuousRunnerCancellationRpc } from "./continuousRunnerCompatibility";

describe("continuous runner migration compatibility", () => {
  it("recognizes a missing PostgREST cancellation RPC", () => {
    expect(
      isMissingContinuousRunnerCancellationRpc({
        code: "PGRST202",
        message:
          "Could not find the function public.cancel_continuous_runner_legacy_requests in the schema cache",
      })
    ).toBe(true);
  });

  it("recognizes PostgreSQL undefined-function drift for the exact RPC", () => {
    expect(
      isMissingContinuousRunnerCancellationRpc({
        code: "42883",
        message:
          "function public.cancel_continuous_runner_legacy_requests(uuid) does not exist",
      })
    ).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(
      isMissingContinuousRunnerCancellationRpc({
        code: "42501",
        message: "permission denied for table operations_collection_request",
      })
    ).toBe(false);
  });
});
