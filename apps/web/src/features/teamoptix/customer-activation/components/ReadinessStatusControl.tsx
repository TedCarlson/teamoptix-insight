"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ActivationReadinessKey,
  ActivationReadinessStatus,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

type ReadinessStatusControlProps = {
  slug: string;
  readinessKey: ActivationReadinessKey;
  status: ActivationReadinessStatus;
  editable: boolean;
};

export default function ReadinessStatusControl({
  slug,
  readinessKey,
  status,
  editable,
}: ReadinessStatusControlProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(
    nextStatus: ActivationReadinessStatus
  ) {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch(
        `/api/teamoptix/customers/${slug}/activation/readiness`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            readiness_key: readinessKey,
            status: nextStatus,
          }),
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
            `Readiness endpoint returned ${response.status} ${response.statusText}.`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to update readiness."
        );
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update readiness."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return (
      <span>
        {status === "ready"
          ? "✓ Ready"
          : status === "not_applicable"
            ? "— Not applicable"
            : "○ Incomplete"}
      </span>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <select
        className="workspace-select"
        value={status}
        disabled={saving}
        aria-label={`Update ${readinessKey} readiness`}
        onChange={(event) =>
          updateStatus(
            event.target.value as ActivationReadinessStatus
          )
        }
      >
        <option value="incomplete">Incomplete</option>
        <option value="ready">Ready</option>
        <option value="not_applicable">
          Not applicable
        </option>
      </select>

      {error ? (
        <span
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--danger, #b91c1c)",
          }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
