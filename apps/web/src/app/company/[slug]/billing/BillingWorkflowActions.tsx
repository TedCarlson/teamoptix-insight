"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import InsightSignal from "@/features/brand/components/InsightSignal";

type Props = {
  slug: string;
  commercialStatus: string;
  stripeCustomerId: string | null;
};

export default function BillingWorkflowActions(props: Props) {
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [showImplementationInfo, setShowImplementationInfo] = useState(false);
  const [showGoLiveAuthorization, setShowGoLiveAuthorization] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [authorizingGoLive, setAuthorizingGoLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerExists = Boolean(props.stripeCustomerId);

  const canCreateCustomer =
    !customerExists &&
    (
      props.commercialStatus === "profile_complete" ||
      props.commercialStatus === "ready_for_stripe"
    );

  const canLaunchCheckout =
    customerExists &&
    props.commercialStatus === "stripe_customer_created";

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

  async function launchStripeCheckout() {
    try {
      setLaunching(true);
      setError(null);

      const response = await fetch(
        `/api/company/${props.slug}/billing/checkout`,
        {
          method: "POST",
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to launch Stripe Checkout."
        );
      }

      if (!payload.url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      window.location.assign(payload.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to launch Stripe Checkout."
      );
      setLaunching(false);
    }
  }

  async function authorizeGoLive() {
    try {
      setAuthorizingGoLive(true);
      setError(null);

      const response = await fetch(
        `/api/company/${props.slug}/activation/customer-approval`,
        {
          method: "POST",
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to record Go Live authorization."
        );
      }

      setShowGoLiveAuthorization(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to record Go Live authorization."
      );
    } finally {
      setAuthorizingGoLive(false);
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
          disabled={!canLaunchCheckout || launching}
          onClick={launchStripeCheckout}
          style={
            canLaunchCheckout && !launching
              ? primaryButton
              : disabledButton
          }
        >
          {launching
            ? "Opening Stripe Checkout..."
            : "Launch Stripe Checkout"}
        </button>

        <button
          type="button"
          disabled={authorizingGoLive}
          onClick={() => setShowGoLiveAuthorization(true)}
          style={primaryButton}
        >
          {authorizingGoLive
            ? "Recording Authorization..."
            : "Authorize Go Live"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowImplementationInfo(true)}
        style={infoButton}
      >
        ⓘ When does my subscription begin?
      </button>

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

      {showGoLiveAuthorization && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalBrandHeader}>
              <InsightSignal
                phase="implementation"
                size="lg"
                showWordmark
              />
            </div>

            <h3 style={modalTitle}>Authorize Go Live</h3>

            <p>
              This action records your approval for Team Optix to move your
              Insight workspace from implementation toward <strong>Go Live</strong>.
            </p>

            <p>
              <strong>This does not mean your Stripe subscription is launched immediately.</strong>
              {" "}It authorizes Team Optix to proceed with the subscription,
              billing, payment, and operational activation lifecycle according
              to the commercial terms already agreed for this account.
            </p>

            <p>
              After authorization, Team Optix will use this approval as Go Live
              readiness evidence and may complete the remaining activation steps
              needed to start live service.
            </p>

            <div style={{ marginTop: 18 }}>
              <strong>By continuing, you confirm:</strong>

              <ul style={{ marginTop: 8 }}>
                <li>You are authorized to approve Go Live for this company.</li>
                <li>You understand Team Optix may advance the account toward subscription activation.</li>
                <li>You understand recurring billing follows the agreed commercial terms and billing schedule.</li>
                <li>You understand this approval is recorded as customer Go Live authorization.</li>
              </ul>
            </div>

            <div style={modalActions}>
              <button
                type="button"
                style={secondaryButton}
                disabled={authorizingGoLive}
                onClick={() => setShowGoLiveAuthorization(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                style={primaryButton}
                disabled={authorizingGoLive}
                onClick={authorizeGoLive}
              >
                {authorizingGoLive
                  ? "Recording Authorization..."
                  : "Authorize Team Optix to Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImplementationInfo && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalBrandHeader}>
              <InsightSignal
                phase="implementation"
                size="lg"
                showWordmark
              />
            </div>

            <h3 style={modalTitle}>Implementation &amp; Go Live</h3>

            <p>
              <strong>Implementation is a one-time onboarding phase.</strong>
            </p>

            <p>
              Your recurring subscription does not begin until Team Optix marks
              your workspace as <strong>Go Live</strong>.
            </p>

            <p>
              Most implementations are completed within <strong>two weeks</strong>.
            </p>

            <p>
              If Go Live isn&apos;t reached during that period, we&apos;ll schedule
              a follow-up implementation session before subscription billing begins.
            </p>

            <div style={{marginTop:18}}>
              <strong>Implementation includes</strong>

              <ul style={{marginTop:8}}>
                <li>Workspace configuration</li>
                <li>Operational discovery</li>
                <li>Team onboarding</li>
                <li>Service configuration</li>
                <li>Launch readiness review</li>
              </ul>
            </div>

            <div style={{marginTop:22}}>
              <strong>What happens next?</strong>

              <ul style={{marginTop:8}}>
                <li>Pay your implementation fee.</li>
                <li>Complete guided onboarding and workspace configuration.</li>
                <li>Attend implementation sessions with a Team Optix implementation specialist.</li>
                <li>When your workspace is production-ready, we&apos;ll mark it <strong>Go Live</strong>.</li>
                <li>Your recurring subscription begins on your first Friday following your Go Live date and continues each Friday thereafter.</li>
              </ul>
            </div>

            <p
              style={{
                marginTop:22,
                color:"#64748b",
                fontSize:14,
                lineHeight:1.5,
              }}
            >
              Our goal is to make your transition into Insight smooth and
              successful. Your implementation period is designed to ensure your
              team is fully prepared before recurring service begins.
            </p>

<button
              type="button"
              style={primaryButton}
              onClick={() => setShowImplementationInfo(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
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



const modalBrandHeader = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 12,
};

const modalActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 22,
  flexWrap: "wrap" as const,
};

const secondaryButton = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 12px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const modalTitle = {
  margin: "0 0 22px",
  color: "#0f172a",
  fontSize: 28,
  letterSpacing: "-0.035em",
};

const infoButton = {
  border: "none",
  background: "transparent",
  color: "#2563eb",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content",
  padding: 0,
};

const overlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(15,23,42,.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modal = {
  width: 560,
  maxWidth: "90%",
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 18px 60px rgba(0,0,0,.25)",
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
