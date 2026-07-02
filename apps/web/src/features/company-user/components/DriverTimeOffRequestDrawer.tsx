"use client";

import {
  evaluateDriverTimeOffRequestEligibility,
  selectedDatesLabel,
} from "@/features/company-user/lib/driverTimeOffRequests";

type DriverTimeOffRequestDrawerProps = {
  selectedDates: string[];
  note: string;
  busy?: boolean;
  error?: string | null;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function DriverTimeOffRequestDrawer({
  selectedDates,
  note,
  busy = false,
  error = null,
  onNoteChange,
  onCancel,
  onSubmit,
}: DriverTimeOffRequestDrawerProps) {
  const eligibility = evaluateDriverTimeOffRequestEligibility(selectedDates);

  return (
    <div className="driver-timeoff-drawer" role="region" aria-label="Time off request">
      <div>
        <p className="value-card__eyebrow">Time Off Request</p>
        <h3>{selectedDatesLabel(selectedDates)}</h3>
        <p className="company-user-muted">
          Select up to 15 eligible days. Requests inside 10 days or longer than 15 days should be discussed directly with leadership.
        </p>
      </div>

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
