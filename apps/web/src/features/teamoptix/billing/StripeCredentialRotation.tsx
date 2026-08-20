"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { rotateStripeProductionCredential } from "@/app/teamoptix/(internal)/business/finance/billing-stripe/actions";
import { INITIAL_STRIPE_CREDENTIAL_ROTATION_STATE } from "./stripeCredentialRotation.types";

type Props = {
  automationReady: boolean;
  connected: boolean;
  credentialLabel: string;
};

export default function StripeCredentialRotation({
  automationReady,
  connected,
  credentialLabel,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        marginTop: 18,
        borderTop: "1px solid #dbe3ef",
        paddingTop: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <p style={{ margin: 0, color: "#0f172a", fontWeight: 900 }}>Production credential</p>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
          {credentialLabel}. The value is never displayed or stored by Insight.
        </p>
      </div>

      <button className="button button-primary" type="button" onClick={() => setOpen(true)}>
        {connected ? "Rotate credential" : "Repair connection"}
      </button>

      {open ? (
        <StripeCredentialRotationDialog
          automationReady={automationReady}
          credentialLabel={credentialLabel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function StripeCredentialRotationDialog({
  automationReady,
  credentialLabel,
  onClose,
}: {
  automationReady: boolean;
  credentialLabel: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    rotateStripeProductionCredential,
    INITIAL_STRIPE_CREDENTIAL_ROTATION_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, pending]);

  useEffect(() => {
    if (state.status === "success" || state.status === "partial") {
      formRef.current?.reset();
    }
  }, [state.status]);

  const complete = state.status === "success" || state.status === "partial";

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(15, 23, 42, 0.48)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="stripe-credential-rotation-title"
        aria-describedby="stripe-credential-rotation-description"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "min(820px, 94vh)",
          overflowY: "auto",
          background: "#fff",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          boxShadow: "0 28px 80px rgba(15, 23, 42, 0.28)",
          padding: 22,
          display: "grid",
          gap: 18,
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p className="workspace-eyebrow">Stripe · Production</p>
            <h2 id="stripe-credential-rotation-title" style={{ margin: 0, fontSize: 24 }}>
              Rotate API credential
            </h2>
            <p
              id="stripe-credential-rotation-description"
              className="workspace-card-body"
              style={{ marginTop: 6 }}
            >
              Validate a replacement with Stripe, save it directly to Vercel as a Sensitive
              variable, and rebuild Production.
            </p>
          </div>
          <button className="button" type="button" disabled={pending} onClick={onClose}>
            Close
          </button>
        </header>

        <div
          style={{
            border: "1px solid #dbe3ef",
            borderRadius: 16,
            padding: 14,
            background: "#f8fafc",
          }}
        >
          <p style={{ margin: 0, color: "#475569", fontSize: 12, fontWeight: 800 }}>
            CURRENT CONFIGURATION
          </p>
          <p style={{ margin: "6px 0 0", color: "#0f172a", fontWeight: 800 }}>
            {credentialLabel}
          </p>
        </div>

        {!automationReady ? (
          <p
            role="alert"
            style={{
              margin: 0,
              border: "1px solid #fecaca",
              borderRadius: 14,
              padding: 12,
              background: "#fef2f2",
              color: "#991b1b",
              fontWeight: 700,
            }}
          >
            Vercel credential automation is not configured for this deployment. Configure the
            platform&apos;s Vercel access token and project ID before submitting a Stripe key.
          </p>
        ) : null}

        <form ref={formRef} action={formAction} style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 7 }}>
            <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 900 }}>
              Replacement live API key
            </span>
            <input
              autoFocus
              autoComplete="new-password"
              spellCheck={false}
              type="password"
              name="stripeApiKey"
              required
              disabled={pending || complete || !automationReady}
              placeholder="rk_live_…"
              style={{
                width: "100%",
                height: 46,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                padding: "0 12px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            />
            <small style={{ color: "#64748b", lineHeight: 1.5 }}>
              Prefer a restricted live key. Insight sends it directly to Stripe for validation
              and then to Vercel; it is never written to TeamOptix data storage.
            </small>
          </label>

          <details
            style={{
              border: "1px solid #dbe3ef",
              borderRadius: 14,
              padding: "11px 13px",
              color: "#475569",
            }}
          >
            <summary style={{ cursor: "pointer", color: "#0f172a", fontWeight: 800 }}>
              Restricted-key permissions
            </summary>
            <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.55 }}>
              Allow read access to Customers, Products, Prices, Subscriptions, Invoices, Payment
              Intents, and Tax settings. Allow write access to Customers, Checkout Sessions,
              Subscriptions, and Invoices for Insight&apos;s billing workflows.
            </p>
          </details>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              border: "1px solid #fde68a",
              borderRadius: 14,
              padding: 12,
              background: "#fffbeb",
              color: "#78350f",
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            <input
              type="checkbox"
              name="confirmProductionRotation"
              value="ROTATE"
              required
              disabled={pending || complete || !automationReady}
              style={{ marginTop: 2 }}
            />
            I understand this replaces the Production Stripe credential and queues a new
            Production deployment.
          </label>

          {state.message ? (
            <div
              role={state.status === "error" ? "alert" : "status"}
              style={{
                border: `1px solid ${
                  state.status === "error"
                    ? "#fecaca"
                    : state.status === "partial"
                      ? "#fde68a"
                      : "#a7f3d0"
                }`,
                borderRadius: 14,
                padding: 12,
                background:
                  state.status === "error"
                    ? "#fef2f2"
                    : state.status === "partial"
                      ? "#fffbeb"
                      : "#ecfdf5",
                color:
                  state.status === "error"
                    ? "#991b1b"
                    : state.status === "partial"
                      ? "#78350f"
                      : "#065f46",
                fontWeight: 700,
              }}
            >
              <p style={{ margin: 0 }}>{state.message}</p>
              {state.credentialLabel ? (
                <p style={{ margin: "6px 0 0", fontSize: 13 }}>{state.credentialLabel}</p>
              ) : null}
              {state.deploymentUrl ? (
                <a
                  href={state.deploymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8 }}
                >
                  Open queued deployment
                </a>
              ) : null}
            </div>
          ) : null}

          <footer
            style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
          >
            <a
              className="button"
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noreferrer"
            >
              Open Stripe API keys
            </a>

            {complete ? (
              <button className="button button-primary" type="button" onClick={onClose}>
                Done
              </button>
            ) : (
              <button
                className="button button-primary"
                type="submit"
                disabled={pending || !automationReady}
              >
                {pending ? "Validating and rotating…" : "Validate and rotate"}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}
