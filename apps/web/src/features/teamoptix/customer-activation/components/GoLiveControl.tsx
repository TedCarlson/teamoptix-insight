"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type GoLiveControlProps = {
  slug: string;
  disabled: boolean;
  blockingCount: number;
  lifecycleStatus: string;
};

export default function GoLiveControl({
  slug,
  disabled,
  blockingCount,
  lifecycleStatus,
}: GoLiveControlProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoLive() {
    const confirmed = window.confirm(
      "Begin Go Live for this customer? This creates the durable activation run and executes all currently implemented activation steps."
    );

    if (!confirmed) {
      return;
    }

    try {
      setRunning(true);
      setError(null);

      const response = await fetch(
        `/api/teamoptix/customers/${slug}/activation/go-live`,
        {
          method: "POST",
        }
      );

      const responseText = await response.text();

      let payload: {
        error?: string;
      } = {};

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            error?: string;
          };
        } catch {
          throw new Error(
            `Go Live endpoint returned ${response.status} ${response.statusText}.`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to begin Go Live."
        );
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to begin Go Live."
      );
    } finally {
      setRunning(false);
    }
  }

  const alreadyStarted =
    lifecycleStatus === "activation_in_progress" ||
    lifecycleStatus === "active";

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        justifyItems: "end",
      }}
    >
      <button
        type="button"
        className="button button-primary"
        disabled={disabled || running || alreadyStarted}
        onClick={handleGoLive}
      >
        {running
          ? "Starting Go Live…"
          : alreadyStarted
            ? "Go Live started"
            : "Begin Go Live"}
      </button>

      {disabled && !alreadyStarted ? (
        <span className="app-card__body">
          {blockingCount} readiness item
          {blockingCount === 1 ? "" : "s"} blocking
        </span>
      ) : null}

      {error ? (
        <span
          role="alert"
          style={{
            maxWidth: 360,
            fontSize: 12,
            textAlign: "right",
            color: "var(--danger, #b91c1c)",
          }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
