"use client";

import { useState } from "react";
import styles from "./legal-workspace.module.css";

type LegalDocumentMetadata = {
  id?: string | null;
  customer_legal_name?: string | null;
  effective_at?: string | null;
  customer_project_lead?: string | null;
  teamoptix_project_lead?: string | null;
  provider_name?: string | null;
};

type Props = {
  document: LegalDocumentMetadata;
  onSaved: (document: LegalDocumentMetadata) => void;
};

function dateValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function LegalDocumentMetadataPanel({ document, onSaved }: Props) {
  const [customerLegalName, setCustomerLegalName] = useState(document.customer_legal_name ?? "");
  const [effectiveDate, setEffectiveDate] = useState(dateValue(document.effective_at));
  const [customerProjectLead, setCustomerProjectLead] = useState(document.customer_project_lead ?? "");
  const [teamOptixProjectLead, setTeamOptixProjectLead] = useState(document.teamoptix_project_lead ?? "");
  const [providerName, setProviderName] = useState(document.provider_name ?? "Team Optix, LLC");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function saveMetadata() {
    if (!document.id) return;

    try {
      setSaveState("saving");
      const res = await fetch("/api/legal/document/metadata/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          customerLegalName,
          effectiveDate,
          customerProjectLead,
          teamOptixProjectLead,
          providerName,
        }),
      });
      const json = await res.json();

      if (!json?.ok) {
        setSaveState("error");
        return;
      }

      onSaved(json.document);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1400);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorHeadingRow}>
        <p className={styles.panelLabel}>Document Fields</p>
        <span className={saveState === "error" ? styles.saveError : styles.saveStatus}>
          {saveState}
        </span>
      </div>

      <p className={styles.emptyHelper}>
        These fields resolve placeholders before a version is locked.
      </p>

      <div className={styles.metadataGrid}>
        <label className={styles.metadataFieldLabel}>
          <span>Customer legal name</span>
          <input
            className={styles.metadataInput}
            value={customerLegalName}
            onChange={(event) => setCustomerLegalName(event.target.value)}
            placeholder="Customer legal name"
          />
        </label>

        <label className={styles.metadataFieldLabel}>
          <span>Effective date</span>
          <input
            className={styles.metadataInput}
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </label>

        <label className={styles.metadataFieldLabel}>
          <span>Customer lead</span>
          <input
            className={styles.metadataInput}
            value={customerProjectLead}
            onChange={(event) => setCustomerProjectLead(event.target.value)}
            placeholder="Customer project lead"
          />
        </label>

        <label className={styles.metadataFieldLabel}>
          <span>Team Optix lead</span>
          <input
            className={styles.metadataInput}
            value={teamOptixProjectLead}
            onChange={(event) => setTeamOptixProjectLead(event.target.value)}
            placeholder="Team Optix project lead"
          />
        </label>

        <label className={styles.metadataFieldLabel}>
          <span>Provider</span>
          <input
            className={styles.metadataInput}
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
          />
        </label>
      </div>

      <button className={styles.primaryButton} type="button" onClick={saveMetadata}>
        Save Fields
      </button>
    </section>
  );
}
