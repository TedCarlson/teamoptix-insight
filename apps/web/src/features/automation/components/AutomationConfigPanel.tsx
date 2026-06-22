"use client";

import { useCallback, useEffect, useState } from "react";

type AutomationConfigPanelProps = {
  slug: string;
  canEdit: boolean;
};

type AutomationStatusValue =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "HEALTHY"
  | "WARNING"
  | "ACTION_REQUIRED"
  | "DISABLED";

type AutomationStatusResponse = {
  provider_key: "FEDEX";
  status: AutomationStatusValue;
  profile_id: string;
  updated_at: string;
};

type CredentialResponse = {
  username: string;
  has_secret: boolean;
  last_verified_at: string | null;
  last_verification_result: string | null;
};

function SectionCard(props: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="app-card" style={{ padding: 14 }}>
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h3 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h3>
      <div style={{ marginTop: 10 }}>{props.children}</div>
    </article>
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div className="context-stat" style={{ padding: "9px 10px" }}>
      <span className="context-stat__label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function formatStatus(value: AutomationStatusValue | null) {
  if (!value) return "Loading...";
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export default function AutomationConfigPanel(props: AutomationConfigPanelProps) {
  const [status, setStatus] = useState<AutomationStatusResponse | null>(null);
  const [credential, setCredential] = useState<CredentialResponse | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/status`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load status.");
    }

    setStatus(data);
  }, [props.slug]);

  const loadCredential = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/credentials`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load credentials.");
    }

    setCredential(data);
    setUsername(data?.username ?? "");
  }, [props.slug]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setStatusError(null);

        await Promise.all([loadStatus(), loadCredential()]);
      } catch (error) {
        if (!active) return;

        setStatusError(
          error instanceof Error ? error.message : "Failed to load automation."
        );
      }
    }

    if (props.slug) void load();

    return () => {
      active = false;
    };
  }, [props.slug, loadStatus, loadCredential]);

  async function saveCredential() {
    try {
      setSaving(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save credentials.");
      }

      setPassword("");

      await Promise.all([loadCredential(), loadStatus()]);

      setMessage("Credentials saved.");
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to save credentials."
      );
    } finally {
      setSaving(false);
    }
  }

  async function verifyCredential() {
    try {
      setVerifying(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/verify`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      await Promise.all([loadCredential(), loadStatus()]);

      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? "Verification failed.");
      }

      setMessage(data?.message ?? "Credentials verified.");
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Verification failed."
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Automation status" title="Data acquisition health">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Status" value={statusError ? "Warning" : formatStatus(status?.status ?? null)} />
          <MiniStat label="Last DSW" value="No run yet" />
          <MiniStat label="Last FCC" value="No run yet" />
          <MiniStat label="Next run" value="Not scheduled" />
        </div>
      </SectionCard>

      <SectionCard eyebrow="Credential vault" title="FedEx credentials">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="FedEx username"
            disabled={!props.canEdit}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="FedEx password"
            disabled={!props.canEdit}
          />
        </div>

        <div className="cta-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="button button-primary"
            disabled={!props.canEdit || saving || !username.trim() || !password.trim()}
            onClick={saveCredential}
          >
            {saving ? "Saving..." : "Save Credentials"}
          </button>

          <button
            type="button"
            className="button"
            disabled={!props.canEdit || verifying || !credential?.has_secret}
            onClick={verifyCredential}
          >
            {verifying ? "Verifying..." : "Test Connection"}
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Credential Status" value={credential?.has_secret ? "Configured" : "Not Configured"} />
          <MiniStat
            label="Last Verified"
            value={credential?.last_verified_at ? new Date(credential.last_verified_at).toLocaleString() : "Never"}
          />
          <MiniStat label="Access Scope" value="DSW / FCC Required" />
        </div>

        {message ? <p style={{ color: "#0f9f6e" }}>{message}</p> : null}
        {statusError ? <p style={{ color: "#c62828" }}>{statusError}</p> : null}
      </SectionCard>

      <SectionCard eyebrow="Historical hydration" title="DSW historical sweep">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Mode" value="DSW only" />
          <MiniStat label="Range" value="Target / historical" />
          <MiniStat label="Queue" value="Pending build" />
        </div>
      </SectionCard>

      <SectionCard eyebrow="Run history" title="Automation audit trail">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Runs" value="0" />
          <MiniStat label="Success" value="0" />
          <MiniStat label="Warnings" value="0" />
          <MiniStat label="Disabled events" value="0" />
        </div>
      </SectionCard>
    </section>
  );
}
