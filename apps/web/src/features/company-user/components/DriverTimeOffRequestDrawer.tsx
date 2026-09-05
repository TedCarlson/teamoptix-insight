"use client";

import {
  evaluateDriverTimeOffRequestEligibility,
  rangeDatesForSelection,
  resolveTimeOffRequestedDates,
  selectedDatesLabel,
  selectionHasRangeGap,
  type DriverTimeOffSelectionMode,
  type DriverTimeOffBlackout,
} from "@/features/company-user/lib/driverTimeOffRequests";

type DriverTimeOffRequestDrawerProps = {
  selectedDates: string[];
  note: string;
  busy?: boolean;
  error?: string | null;
  blackouts?: DriverTimeOffBlackout[];
  selectionMode: DriverTimeOffSelectionMode;
  onSelectionModeChange: (value: DriverTimeOffSelectionMode) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function DriverTimeOffRequestDrawer({
  selectedDates,
  note,
  busy = false,
  error = null,
  blackouts = [],
  selectionMode,
  onSelectionModeChange,
  onNoteChange,
  onCancel,
  onSubmit,
}: DriverTimeOffRequestDrawerProps) {
  const resolvedDates = resolveTimeOffRequestedDates(selectedDates, selectionMode);
  const rangeDates = rangeDatesForSelection(selectedDates);
  const hasRangeGap = selectionHasRangeGap(selectedDates);
  const eligibility = evaluateDriverTimeOffRequestEligibility(
    resolvedDates,
    blackouts
  );

  return (
    <div className="driver-timeoff-drawer" role="region" aria-label="Time off request">
      <div>
        <p className="value-card__eyebrow">Time Off Request</p>
        <h3>{selectedDatesLabel(selectedDates)}</h3>
        <p className="company-user-muted">
          Select up to 15 eligible days. Requests inside 10 days or longer than 15 days should be discussed directly with leadership.
        </p>
      </div>

      {hasRangeGap ? (
        <div className="driver-timeoff-range-helper">
          <strong>You selected {selectedDates.length} dates across a {rangeDates.length}-day span.</strong>
          <label>
            <input
              type="radio"
              name="time-off-selection-mode"
              checked={selectionMode === "RANGE"}
              onChange={() => onSelectionModeChange("RANGE")}
            />
            Request all dates in range ({rangeDates.length} days)
          </label>
          <label>
            <input
              type="radio"
              name="time-off-selection-mode"
              checked={selectionMode === "SELECTED_ONLY"}
              onChange={() => onSelectionModeChange("SELECTED_ONLY")}
            />
            Request only selected dates ({selectedDates.length} days)
          </label>
        </div>
      ) : null}

      {error ? <p className="driver-timeoff-error">{error}</p> : null}
      {eligibility.reason ? <p className="driver-timeoff-error">{eligibility.reason}</p> : null}

      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Optional note to leadership"
        className="driver-timeoff-note"
        maxLength={500}
      />

      <div className="driver-timeoff-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={busy || !eligibility.canSubmit}
          onClick={onSubmit}
        >
          Submit Request
        </button>
      </div>
    </div>
  );
}
