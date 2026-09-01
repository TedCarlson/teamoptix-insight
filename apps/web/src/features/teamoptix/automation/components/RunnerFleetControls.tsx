"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  runnerCommandIsPending,
  runnerCommandLabel,
  type RunnerControlCommand,
  type RunnerFleetControlRow,
} from "@/features/automation/runnerFleetControl";

type CommandFeedback = {
  tone: "pending" | "error";
  message: string;
};

function assignmentLabel(row: RunnerFleetControlRow) {
  if (!row.assignment_id) return "Unassigned";
  const company = row.company_name || row.company_slug || "Unknown company";
  const worksite = row.terminal_code
    ? `${row.terminal_code}${row.terminal_name ? ` · ${row.terminal_name}` : ""}`
    : "Worksite unavailable";
  return `${company} · ${worksite}`;
}

function commandStatus(row: RunnerFleetControlRow) {
  if (!row.latest_command_type || !row.latest_command_state) return null;
  return `${runnerCommandLabel(row.latest_command_type)} · ${row.latest_command_state.toLowerCase()}`;
}

export default function RunnerFleetControls(props: {
  runners: RunnerFleetControlRow[];
}) {
  const router = useRouter();
  const requestIds = useRef(new Map<string, string>());
  const [sendingRunner, setSendingRunner] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, CommandFeedback>>(
    {}
  );

  async function sendCommand(
    row: RunnerFleetControlRow,
    commandType: RunnerControlCommand
  ) {
    if (
      !row.runner_id ||
      !row.assignment_id ||
      !row.company_slug ||
      !row.assignment_version
    ) {
      setFeedback((current) => ({
        ...current,
        [row.runner_key]: {
          tone: "error",
          message: "This runner does not have a complete governed assignment.",
        },
      }));
      return;
    }

    let reason: string | null = null;
    if (commandType === "EMERGENCY_STOP") {
      reason = window.prompt(
        "Why must this runner stop immediately? This reason is kept in the audit record."
      );
      if (!reason?.trim()) return;
      if (
        !window.confirm(
          `Emergency stop ${row.display_name}? Incomplete work will not be committed.`
        )
      ) {
        return;
      }
    }

    const requestKey = `${row.runner_id}:${commandType}`;
    const idempotencyKey =
      requestIds.current.get(requestKey) ?? crypto.randomUUID();
    requestIds.current.set(requestKey, idempotencyKey);
    setSendingRunner(row.runner_key);
    setFeedback((current) => ({
      ...current,
      [row.runner_key]: {
        tone: "pending",
        message: `${runnerCommandLabel(commandType)} requested. Waiting for the runner to acknowledge it.`,
      },
    }));

    try {
      const response = await fetch(
        "/api/teamoptix/automation/runners/commands",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_slug: row.company_slug,
            runner_id: row.runner_id,
            assignment_id: row.assignment_id,
            command_type: commandType,
            expected_assignment_version: row.assignment_version,
            expected_config_version: row.config_version ?? 0,
            reason,
            idempotency_key: idempotencyKey,
          }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status < 500) requestIds.current.delete(requestKey);
        throw new Error(result?.error ?? "The runner command was rejected.");
      }
      requestIds.current.delete(requestKey);
      setFeedback((current) => ({
        ...current,
        [row.runner_key]: {
          tone: "pending",
          message: `${runnerCommandLabel(commandType)} recorded. Refresh status after the runner responds.`,
        },
      }));
      router.refresh();
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [row.runner_key]: {
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "The runner command could not be recorded.",
        },
      }));
    } finally {
      setSendingRunner(null);
    }
  }

  return (
    <section className="runner-fleet-control" aria-labelledby="runner-fleet-control-title">
      <div className="runner-fleet-control__heading">
        <div>
          <p className="value-card__eyebrow">Company-specific control</p>
          <h2 id="runner-fleet-control-title">Runner controls</h2>
          <p>
            Commands are recorded here and shown as complete only after the
            assigned runner acknowledges them.
          </p>
        </div>
        <button type="button" onClick={() => router.refresh()}>
          Refresh status
        </button>
      </div>

      <div className="runner-fleet-control__grid">
        {props.runners.map((row) => {
          const pending = runnerCommandIsPending(row.latest_command_state);
          const completeAssignment = Boolean(
            row.runner_id &&
              row.assignment_id &&
              row.company_slug &&
              row.assignment_version
          );
          const disabled =
            !completeAssignment ||
            pending ||
            sendingRunner === row.runner_key ||
            row.lifecycle_state === "RETIRED";
          const localFeedback = feedback[row.runner_key];

          return (
            <article className="runner-control-card" key={row.runner_key}>
              <div className="runner-control-card__identity">
                <span>{row.runner_role === "SUPPORT" ? "Support" : "Dedicated"}</span>
                <strong>{row.display_name}</strong>
                <small>{row.runner_key}</small>
              </div>

              <dl className="runner-control-card__facts">
                <div><dt>Assignment</dt><dd>{assignmentLabel(row)}</dd></div>
                <div><dt>Runner</dt><dd>{row.runner_state || row.lifecycle_state}</dd></div>
                <div><dt>Collection</dt><dd>{row.collection_enabled ? "Enabled" : "Paused"}</dd></div>
                <div><dt>Command</dt><dd>{commandStatus(row) || "No pending command"}</dd></div>
              </dl>

              <div className="runner-control-card__actions">
                {row.collection_enabled ? (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void sendCommand(row, "PAUSE")}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void sendCommand(row, "DRAIN_STOP")}
                    >
                      Drain and stop
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void sendCommand(row, "RESUME")}
                  >
                    Resume
                  </button>
                )}
                <button
                  type="button"
                  className="runner-control-card__emergency"
                  disabled={disabled}
                  onClick={() => void sendCommand(row, "EMERGENCY_STOP")}
                >
                  Emergency stop
                </button>
              </div>

              {!completeAssignment ? (
                <p className="runner-control-card__notice">
                  Control becomes available after this runner is enrolled and
                  assigned to a company worksite.
                </p>
              ) : null}
              {localFeedback ? (
                <p
                  className={`runner-control-card__notice runner-control-card__notice--${localFeedback.tone}`}
                  role={localFeedback.tone === "error" ? "alert" : "status"}
                >
                  {localFeedback.message}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
