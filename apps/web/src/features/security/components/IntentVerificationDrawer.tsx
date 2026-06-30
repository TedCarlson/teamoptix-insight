"use client";

import { useMemo } from "react";

export type IntentVerificationAction = "CLOCK_IN" | "CLOCK_OUT";

type IntentChallenge = {
  correctCode: string;
  options: string[];
};

type IntentVerificationDrawerProps = {
  action: IntentVerificationAction;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function actionLabel(action: IntentVerificationAction) {
  return action === "CLOCK_OUT" ? "Clock Out" : "Clock In";
}

function generateChallenge(): IntentChallenge {
  const correctNumber = Math.floor(100 + Math.random() * 900);
  const optionSet = new Set<number>([correctNumber]);

  while (optionSet.size < 3) {
    optionSet.add(Math.floor(100 + Math.random() * 900));
  }

  return {
    correctCode: String(correctNumber),
    options: Array.from(optionSet)
      .map(String)
      .sort(() => Math.random() - 0.5),
  };
}

export function IntentVerificationDrawer({
  action,
  busy = false,
  onCancel,
  onConfirm,
}: IntentVerificationDrawerProps) {
  const challenge = useMemo(() => generateChallenge(), []);
  const label = actionLabel(action);

  return (
    <div className="company-user-confirm-backdrop" role="presentation">
      <section
        className="company-user-confirm-drawer"
        aria-label={`Confirm ${label}`}
      >
        <p className="value-card__eyebrow">Confirm {label}</p>
        <h2>Select {challenge.correctCode}</h2>
        <p className="company-user-muted">Select the match to continue.</p>

        <div className="company-user-confirm-options">
          {challenge.options.map((option) => (
            <button
              key={option}
              type="button"
              className="button button-secondary"
              onClick={() => {
                if (option === challenge.correctCode) onConfirm();
                else onCancel();
              }}
              disabled={busy}
            >
              {option}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="company-user-confirm-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </section>
    </div>
  );
}
