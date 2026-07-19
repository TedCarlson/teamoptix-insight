"use client";

import { useState } from "react";
import { runnerGoalForRequestType } from "@/features/automation/contracts/runnerGoal";
import type { CollectionOrderDraft, CollectionProfile } from "./automation.types";
import { COLLECTION_TARGETS, defaultCollectionTargetKeys, requestedReportsFromTargets, selectedCollectionTargets, todayIso, yesterdayIso } from "./automationCollectionConfig";
import { checkRow, drawerBackdrop, drawerPanel, fieldLabel, mutedCopy, orderSummaryBox, policyStrip, sourceBox, sourceTitle, summaryLabel, summaryLine, timeInputBox, twoCol } from "./automationStyles";

export function CollectionOrderDrawer(props: {
  profile: CollectionProfile | null;
  canEdit: boolean;
  queueing: boolean;
  onClose: () => void;
  onSubmit: (draft: CollectionOrderDraft) => Promise<void>;
}) {
  const profile = props.profile;
  const [serviceDate, setServiceDate] = useState(() =>
    profile?.type === "LAST_LOOK" || profile?.type === "TARGETED_RECOVERY" ? todayIso() : yesterdayIso()
  );
  const [startDate, setStartDate] = useState(yesterdayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [includeDsw, setIncludeDsw] = useState(true);
  const [includeFcc, setIncludeFcc] = useState(false);
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<string[]>(() => defaultCollectionTargetKeys(profile?.type));
  const [timeMachinePriorityMode, setTimeMachinePriorityMode] = useState<"standard" | "onboarding">("standard");

  if (!profile) return null;

  const selectedTargets = selectedCollectionTargets(selectedTargetKeys);
  const requestedReports =
    profile.type === "TARGETED_RECOVERY" || profile.type === "LAST_LOOK"
      ? requestedReportsFromTargets(selectedTargets)
      : profile.type === "HISTORICAL_BACKFILL"
        ? ["DSW"]
        : ([includeDsw ? "DSW" : null, includeFcc ? "FCC" : null].filter(Boolean) as string[]);

  const isDateRange = profile.type === "HISTORICAL_BACKFILL";
  const isPlatformManaged = profile.type === "PREVIOUS_DAY_CLOSE" || profile.type === "LAST_LOOK";
  const effectivePriority =
    profile.type === "HISTORICAL_BACKFILL" && timeMachinePriorityMode === "onboarding"
      ? 10
      : profile.priority;
  const hasValidDateRange =
    Boolean(startDate && endDate) &&
    startDate <= endDate;

  const canPrepare =
    props.canEdit &&
    !isPlatformManaged &&
    (profile.type === "TARGETED_RECOVERY" ? selectedTargets.length > 0 : requestedReports.length > 0) &&
    (isDateRange ? hasValidDateRange : Boolean(serviceDate));

  async function prepareOrder() {
    if (!profile) return;

    await props.onSubmit({
      request_type: profile.type,
      service_date: isDateRange ? null : serviceDate,
      service_date_start: isDateRange ? startDate : null,
      service_date_end: isDateRange ? endDate : null,
      requested_reports: requestedReports,
      priority: effectivePriority,
      request_payload: {
        source: "collection_center",
        request_origin: "manual_collection_order",
        request_type: profile.type,
        date_mode: isDateRange ? "SELECTED_RANGE" : "SELECTED_DATE",
        customer_language: profile.title,
        intent: profile.type.toLowerCase(),
        collect_scope:
          profile.type === "TARGETED_RECOVERY"
            ? "targeted_file_groups"
            : profile.type === "HISTORICAL_BACKFILL"
              ? "dsw_only"
              : "selected_reports",
        targets: selectedTargets.map((target) => ({
          key: target.key,
          label: target.label,
          report_family_key: target.report_family_key,
          artifact_key: target.artifact_key,
          runner_section: target.runner_section,
          vps_target: target.vps_target,
          expected_filename_match: target.expected_filename_match,
        })),
        runner_goal: runnerGoalForRequestType(profile.type),
        runner_goal_label: profile.title,
        resolved_service_date: isDateRange ? null : serviceDate,
        resolved_service_date_start: isDateRange ? startDate : null,
        resolved_service_date_end: isDateRange ? endDate : null,
        date_selection_contract: isDateRange
          ? {
              authority: "ticket_service_date_range",
              exact_start: startDate,
              exact_end: endDate,
              instruction: "Collect one unchanged source workbook for every service date in this exact inclusive range.",
            }
          : {
              authority: "ticket_service_date",
              exact_date: serviceDate,
              instruction: "Collect the unchanged source artifact for this exact service date.",
            },
        priority_mode:
          profile.type === "HISTORICAL_BACKFILL"
            ? timeMachinePriorityMode
            : null,
        preferred_window:
          profile.type === "HISTORICAL_BACKFILL" && timeMachinePriorityMode === "standard"
            ? "20:00-03:00"
            : null,
        control_level: "customer_requested",
      },
    });
  }

  return (
    <div role="presentation" style={drawerBackdrop} onClick={props.onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.title} collection order`}
        style={drawerPanel}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <p className="value-card__eyebrow" style={{ margin: 0 }}>Prepare Collection Order</p>
            <h3 className="app-card__title" style={{ fontSize: 20, margin: "4px 0 0" }}>{profile.title}</h3>
            <p style={{ ...mutedCopy, margin: "8px 0 0" }}>{profile.description}</p>
          </div>

          <button type="button" className="button" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div style={policyStrip}>
          <span style={{ fontWeight: 950, color: "#166534" }}>✓ Handoff:</span>
          <span>
            {isPlatformManaged
              ? "This collection is protected by platform policy and is not manually queued here."
              : "Insight stores this order for the VPS runner. Vercel does not collect the report."}
          </span>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {isPlatformManaged ? (
            <div style={sourceBox}>
              <strong style={sourceTitle}>Protected Rule</strong>
              <div style={summaryLine}>
                <span style={summaryLabel}>Schedule</span>
                <strong>{profile.type === "PREVIOUS_DAY_CLOSE" ? "Daily at 3:00 AM" : "Daily at 8:00 PM"}</strong>
              </div>
              <div style={summaryLine}>
                <span style={summaryLabel}>User Control</span>
                <strong>Read only</strong>
              </div>
              <div style={summaryLine}>
                <span style={summaryLabel}>Purpose</span>
                <strong>{profile.type === "PREVIOUS_DAY_CLOSE" ? "Protect historical reporting" : "Final same-day sign-off"}</strong>
              </div>
            </div>
          ) : isDateRange ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={twoCol}>
                <label style={fieldLabel}>
                  Start Date
                  <input style={timeInputBox} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
                <label style={fieldLabel}>
                  End Date
                  <input style={timeInputBox} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              </div>

              <div style={sourceBox}>
                <strong style={sourceTitle}>Reports</strong>
                <div style={summaryLine}>
                  <span style={summaryLabel}>Time Machine</span>
                  <strong>DSW only</strong>
                </div>
              </div>

              <div style={sourceBox}>
                <strong style={sourceTitle}>Run Priority</strong>
                <label style={checkRow}>
                  <input
                    type="radio"
                    name="time-machine-priority"
                    checked={timeMachinePriorityMode === "standard"}
                    onChange={() => setTimeMachinePriorityMode("standard")}
                  />
                  Standard historical run — preferred outside business hours
                </label>
                <label style={checkRow}>
                  <input
                    type="radio"
                    name="time-machine-priority"
                    checked={timeMachinePriorityMode === "onboarding"}
                    onChange={() => setTimeMachinePriorityMode("onboarding")}
                  />
                  Onboarding priority — build the historical foundation first
                </label>
              </div>
            </div>
          ) : (
            <label style={fieldLabel}>
              Service Date
              <input style={timeInputBox} type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
            </label>
          )}

          {!isPlatformManaged && !isDateRange && profile.type !== "TARGETED_RECOVERY" ? (
            <div style={sourceBox}>
              <strong style={sourceTitle}>Reports</strong>
              <label style={checkRow}>
                <input type="checkbox" checked={includeDsw} onChange={(event) => setIncludeDsw(event.target.checked)} />
                DSW
              </label>
              <label style={checkRow}>
                <input type="checkbox" checked={includeFcc} onChange={(event) => setIncludeFcc(event.target.checked)} />
                FCC
              </label>
            </div>
          ) : null}

          {profile.type === "TARGETED_RECOVERY" ? (
            <div style={sourceBox}>
              <strong style={sourceTitle}>File Groups</strong>
              <p style={{ ...mutedCopy, margin: 0 }}>
                Choose the report groups the VPS runner should attempt. SCH Pickup Management is intentionally excluded.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {COLLECTION_TARGETS.map((target) => (
                  <label key={target.key} style={checkRow}>
                    <input
                      type="checkbox"
                      checked={selectedTargetKeys.includes(target.key)}
                      onChange={(event) => {
                        setSelectedTargetKeys((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, target.key]))
                            : current.filter((key) => key !== target.key)
                        );
                      }}
                    />
                    <span>
                      <strong>{target.label}</strong>
                      <span style={{ display: "block", color: "#64748b", fontSize: 12, fontWeight: 750 }}>
                        {target.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div style={orderSummaryBox}>
            <strong style={sourceTitle}>Order Summary</strong>
            <p style={{ ...mutedCopy, margin: 0 }}>
              {isPlatformManaged
                ? "This protected collection is scheduled by Insight and cannot be manually minimized."
                : profile.type === "TARGETED_RECOVERY"
                  ? `The runner will attempt ${selectedTargets.length} selected file group${selectedTargets.length === 1 ? "" : "s"} for the selected service date.`
                  : profile.type === "HISTORICAL_BACKFILL"
                    ? `Time Machine will collect DSW only for the selected date range. ${
                        timeMachinePriorityMode === "onboarding"
                          ? "This order will be advanced as an onboarding foundation run."
                          : "This order is preferred outside the business workday."
                      }`
                    : `This order will collect ${requestedReports.join(" + ")}.`}
            </p>
          </div>
        </div>

        <div className="cta-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="button" onClick={props.onClose}>
            Cancel
          </button>
          {!isPlatformManaged ? (
            <button
              type="button"
              className="button button-primary"
              disabled={!canPrepare || props.queueing}
              onClick={() => {
                void prepareOrder();
              }}
            >
              {props.queueing ? "Preparing..." : "Prepare Order"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
