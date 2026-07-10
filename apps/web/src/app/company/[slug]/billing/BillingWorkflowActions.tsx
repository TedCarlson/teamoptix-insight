"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  slug: string;
  commercialStatus: string;
  stripeCustomerId: string | null;
};

export default function BillingWorkflowActions(props: Props) {
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerExists = Boolean(props.stripeCustomerId);

  const canCreateCustomer =
    !customerExists &&
    (
      props.commercialStatus === "profile_complete" ||
      props.commercialStatus === "ready_for_stripe"
    );

  async function createStripeCustomer() {
    try {
      setCreating(true);
      setError(null);

      const response = await fetch(
        `/api/company/${props.slug}/billing/customer`,
        {
          method: "POST",
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to create Stripe customer."
        );
      }

      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create Stripe customer."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={workflowShell}>
      <div style={actionRow}>
        <button
          type="button"
          disabled={!canCreateCustomer || creating}
          onClick={createStripeCustomer}
          style={
            canCreateCustomer && !creating
              ? primaryButton
              : disabledButton
          }
        >
          {creating
            ? "Creating Stripe Customer..."
            : customerExists
              ? "Stripe Customer Connected"
              : "Create Stripe Customer"}
        </button>

        <button
          type="button"
          disabled
          style={disabledButton}
        >
          Launch Stripe Checkout
        </button>
      </div>

      {props.stripeCustomerId ? (
        <p style={successText}>
          Stripe customer: {props.stripeCustomerId}
        </p>
      ) : null}

      {error ? (
        <p role="alert" style={errorText}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const workflowShell = {
  display: "grid",
  gap: 10,
  padding: 18,
};

const actionRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap" as const,
};

const primaryButton = {
  border: "1px solid #0f172a",
  borderRadius: 8,
  padding: "9px 12px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const disabledButton = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 12px",
  background: "#e2e8f0",
  color: "#64748b",
  fontWeight: 900,
  cursor: "not-allowed",
};

const successText = {
  margin: 0,
  color: "#047857",
  fontSize: 13,
  fontWeight: 800,
};

const errorText = {
  margin: 0,
  color: "#b91c1c",
  fontSize: 13,
  fontWeight: 800,
};
