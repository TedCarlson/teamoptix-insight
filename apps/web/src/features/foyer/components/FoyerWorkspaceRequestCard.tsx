"use client";

import { useState } from "react";

export default function FoyerWorkspaceRequestCard() {
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [requestError, setRequestError] = useState("");

  async function handleWorkspaceRequestSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRequestStatus("sending");
    setRequestError("");

    const formData = new FormData(e.currentTarget);

    const response = await fetch("/api/foyer/workspace-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        companyName: String(formData.get("companyName") ?? ""),
        ownerName: String(formData.get("ownerName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        terminal: String(formData.get("terminal") ?? ""),
        routeCount: String(formData.get("routeCount") ?? ""),
        employeeCount: String(formData.get("employeeCount") ?? ""),
        currentSystems: String(formData.get("currentSystems") ?? ""),
        operation: String(formData.get("operation") ?? ""),
        priorities: String(formData.get("priorities") ?? ""),
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setRequestStatus("error");
      setRequestError(result?.error ?? "Unable to send workspace request.");
      return;
    }

    setRequestStatus("sent");
  }

  return (
    <section className="foyer-workspace-request-card foyer-workspace-request-card--standalone">
      <p className="foyer-kicker">Start when you are ready</p>
      <h3>Let&apos;s build your workspace.</h3>
      <p>
        Tell us a little about your operation. We&apos;ll use what you share to prepare
        a focused introduction around your business.
      </p>
      <div className="cta-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setRequestOpen(true)}
        >
          Start My Workspace
        </button>
      </div>

      {requestOpen ? (
        <div className="foyer-request-overlay" role="dialog" aria-modal="true">
          <button
            type="button"
            className="foyer-request-overlay__backdrop"
            aria-label="Close workspace request"
            onClick={() => setRequestOpen(false)}
          />

          <section className="foyer-request-overlay__panel">
            <div className="foyer-request-overlay__header">
              <div>
                <p className="foyer-kicker">Workspace request</p>
                <h2>Let&apos;s build your workspace.</h2>
              </div>
              <button type="button" className="button" onClick={() => setRequestOpen(false)}>
                Close
              </button>
            </div>

            <form className="foyer-request-form" onSubmit={handleWorkspaceRequestSubmit}>
              <label>
                Company name
                <input name="companyName" placeholder="Company name" />
              </label>

              <label>
                Owner contact
                <input name="ownerName" placeholder="Your name" />
              </label>

              <label>
                Email
                <input name="email" type="email" placeholder="you@company.com" />
              </label>

              <label>
                Phone
                <input name="phone" placeholder="Best phone number" />
              </label>

              <label>
                Terminal / operation location
                <input name="terminal" placeholder="Terminal, station, or primary location" />
              </label>

              <label>
                Routes
                <input name="routeCount" placeholder="How many routes?" />
              </label>

              <label>
                Employees
                <input name="employeeCount" placeholder="How many employees?" />
              </label>

              <label>
                Current systems
                <input name="currentSystems" placeholder="Spreadsheets, GroundCloud, payroll tools..." />
              </label>

              <label className="foyer-request-form__wide">
                Operation notes
                <textarea
                  name="operation"
                  rows={3}
                  placeholder="Tell us about your operation."
                />
              </label>

              <label className="foyer-request-form__wide">
                First priorities
                <textarea
                  name="priorities"
                  rows={3}
                  placeholder="What are you hoping Insight helps improve first?"
                />
              </label>

              <div className="foyer-request-overlay__footer">
                <p>
                  We&apos;ll use this to prepare a focused introduction around your
                  operation. No obligation.
                </p>

                {requestStatus === "sent" ? (
                  <strong>Workspace request sent. We&apos;ll review it and reach out.</strong>
                ) : (
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={requestStatus === "sending"}
                  >
                    {requestStatus === "sending" ? "Sending..." : "Send Workspace Request"}
                  </button>
                )}

                {requestStatus === "error" ? (
                  <p role="alert" style={{ color: "#b91c1c", fontWeight: 800 }}>
                    {requestError}
                  </p>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
