import { describe, expect, it } from "vitest";
import {
  parseRunnerCommandRequest,
  runnerCommandIsPending,
  runnerCommandLabel,
} from "./runnerFleetControl";

const validRequest = {
  company_slug: "beacon-point-ventures",
  runner_id: "11111111-1111-4111-8111-111111111111",
  assignment_id: "22222222-2222-4222-8222-222222222222",
  command_type: "PAUSE",
  expected_assignment_version: 1,
  expected_config_version: 2,
};

describe("runner fleet control contract", () => {
  it("normalizes a company-scoped command", () => {
    expect(parseRunnerCommandRequest(validRequest)).toEqual({
      ok: true,
      value: {
        companySlug: "beacon-point-ventures",
        runnerId: validRequest.runner_id,
        assignmentId: validRequest.assignment_id,
        commandType: "PAUSE",
        expectedAssignmentVersion: 1,
        expectedConfigVersion: 2,
        reason: null,
        idempotencyKey: null,
      },
    });
  });

  it("rejects a command without a governed assignment", () => {
    const result = parseRunnerCommandRequest({
      ...validRequest,
      assignment_id: "",
    });
    expect(result.ok).toBe(false);
  });

  it("requires a reason for emergency stop", () => {
    const result = parseRunnerCommandRequest({
      ...validRequest,
      command_type: "EMERGENCY_STOP",
    });
    expect(result).toEqual({
      ok: false,
      error: "Emergency stop requires a short reason.",
    });
  });

  it("rejects stale or missing versions", () => {
    const result = parseRunnerCommandRequest({
      ...validRequest,
      expected_assignment_version: 0,
    });
    expect(result).toEqual({
      ok: false,
      error: "Refresh the runner before sending a command.",
    });
  });

  it("labels control states for the operator", () => {
    expect(runnerCommandLabel("DRAIN_STOP")).toBe("Drain and stop");
    expect(runnerCommandIsPending("DELIVERED")).toBe(true);
    expect(runnerCommandIsPending("SUCCEEDED")).toBe(false);
  });
});
