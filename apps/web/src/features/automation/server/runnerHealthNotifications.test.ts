import { describe, expect, it } from "vitest";
import {
  buildRunnerHealthEmail,
  type RunnerHealthNotificationPayload,
} from "./runnerHealthNotifications";

const payload: RunnerHealthNotificationPayload = {
  incident_id: "incident-1",
  notification_kind: "FAILURE",
  issue_type: "RUNNER_ERROR",
  incident_status: "OPEN",
  company_slug: "beacon-point-ventures",
  company_name: "Beacon Point Ventures",
  runner_key: "vps-laravel-runner-001",
  runner_state: "ERROR",
  runner_last_seen_at: "2026-08-11T21:22:27Z",
  runner_last_error: "Collector failed <without credential rejection>.",
  opened_at: "2026-08-12T12:00:00Z",
  last_observed_at: "2026-08-12T12:05:00Z",
  resolved_at: null,
  recipients: ["owner@example.com"],
};

describe("buildRunnerHealthEmail", () => {
  it("builds an actionable, escaped failure report", () => {
    const message = buildRunnerHealthEmail(payload, "https://teamoptix.io/health");
    expect(message.subject).toContain("ACTION REQUIRED");
    expect(message.html).toContain("Collection runner requires attention");
    expect(message.html).toContain("&lt;without credential rejection&gt;");
    expect(message.html).toContain("Open collection health");
  });

  it("builds a recovery report for the same incident", () => {
    const message = buildRunnerHealthEmail(
      { ...payload, notification_kind: "RECOVERY", incident_status: "RESOLVED" },
      null
    );
    expect(message.subject).toContain("RECOVERED");
    expect(message.html).toContain("Collection runner recovered");
  });

  it("describes stale collection evidence as an overdue check-in", () => {
    const message = buildRunnerHealthEmail(
      { ...payload, issue_type: "STALE_HEARTBEAT" },
      null
    );
    expect(message.html).toContain("Collection check-in overdue");
    expect(message.html).toContain("Last collection check-in");
    expect(message.html).not.toContain("Runner heartbeat stopped");
  });
});
