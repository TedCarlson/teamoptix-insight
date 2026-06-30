"use client";

import { useMemo } from "react";

export type DriverIntentAction = "CLOCK_IN" | "CLOCK_OUT";

type IntentShape = "circle" | "square" | "triangle";

type IntentOption = {
  code: string;
  shape: IntentShape;
};

type IntentChallenge = {
  code: string;
  shape: IntentShape;
  options: IntentOption[];
};

type DriverIntentVerificationDrawerProps = {
  action: DriverIntentAction;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const shapes: IntentShape[] = ["circle", "square", "triangle"];

function actionLabel(action: DriverIntentAction) {
  return action === "CLOCK_OUT" ? "Clock Out" : "Clock In";
}

function shapeLabel(shape: IntentShape) {
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

function twoDigitCode() {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function makeChallenge(): IntentChallenge {
  const usedCodes = new Set<string>();
  const options = shuffle(shapes).map((shape) => {
    let code = twoDigitCode();

    while (usedCodes.has(code)) {
      code = twoDigitCode();
    }

    usedCodes.add(code);
    return { shape, code };
  });

  const correctOption = options[Math.floor(Math.random() * options.length)];

  return {
    code: correctOption.code,
    shape: correctOption.shape,
    options: shuffle(options),
  };
}

function ShapeToken({
  shape,
  code,
  small = false,
}: {
  shape: IntentShape;
  code: string;
  small?: boolean;
}) {
  return (
    <span
      className={`driver-intent-shape-token ${
        small ? "driver-intent-shape-token--small" : ""
      }`}
      aria-label={`${shapeLabel(shape)} ${code}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {shape === "circle" ? (
          <circle className="driver-intent-shape-mark" cx="50" cy="50" r="34" />
        ) : null}

        {shape === "square" ? (
          <rect
            className="driver-intent-shape-mark"
            x="18"
            y="18"
            width="64"
            height="64"
            rx="10"
          />
        ) : null}

        {shape === "triangle" ? (
          <polygon
            className="driver-intent-shape-mark"
            points="50,18 84,80 16,80"
          />
        ) : null}

        <text
          className="driver-intent-shape-number"
          x="50"
          y={shape === "triangle" ? "61" : "52"}
          textAnchor="middle"
        >
          {code}
        </text>
      </svg>
    </span>
  );
}

export function DriverIntentVerificationDrawer({
  action,
  busy = false,
  onCancel,
  onConfirm,
}: DriverIntentVerificationDrawerProps) {
  const challenge = useMemo(() => makeChallenge(), []);
  const label = actionLabel(action);

  return (
    <div className="driver-intent-backdrop" role="presentation">
      <section className="driver-intent-drawer" aria-label={`Confirm ${label}`}>
        <div className="driver-intent-handle" />

        <p className="value-card__eyebrow">Confirm {label}</p>
        <h2>Select the corresponding match to continue.</h2>

        <div className="driver-intent-clue" aria-label="Passphrase">
          <span>Passphrase</span>
          <strong>
            <ShapeToken shape={challenge.shape} code={challenge.code} small />
            <span>
              {shapeLabel(challenge.shape)} • {challenge.code}
            </span>
          </strong>
        </div>

        <div className="driver-intent-options" aria-label="Options">
          {challenge.options.map((option) => {
            const isCorrect =
              option.code === challenge.code && option.shape === challenge.shape;

            return (
              <button
                key={`${option.shape}-${option.code}`}
                type="button"
                className="driver-intent-option"
                onClick={() => {
                  if (isCorrect) onConfirm();
                  else onCancel();
                }}
                disabled={busy}
              >
                <ShapeToken shape={option.shape} code={option.code} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="driver-intent-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </section>
    </div>
  );
}
