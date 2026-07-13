"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./legal-workspace.module.css";

type LegalDocumentVersion = {
  id: string;
  version_label?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type Props = {
  templateDocumentId: string;
  versions: LegalDocumentVersion[];
};

function dateValue() {
  return new Date().toISOString().slice(0, 10);
}

export function CreateClientDocumentPanel({ templateDocumentId, versions }: Props) {
  const lockedVersions = versions.filter((version) => version.status === "LOCKED");
  const [templateVersionId, setTemplateVersionId] = useState(lockedVersions[0]?.id ?? "");
  const [customerLegalName, setCustomerLegalName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(dateValue());
  const [customerProjectLead, setCustomerProjectLead] = useState("");
  const [teamOptixProjectLead, setTeamOptixProjectLead] = useState("");
  const [providerName, setProviderName] = useState("Team Optix, LLC");
  const [createState, setCreateState] = useState<"idle" | "creating" | "created" | "error">("idle");
  const [createdHref, setCreatedHref] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function createClientDocument() {
    if (!templateVersionId || !customerLegalName.trim()) {
      setErrorMessage("Select a locked template version and enter a customer legal name.");
      setCreateState("error");
      return;
    }

    try {
      setCreateState("creating");
      setErrorMessage("");

      const res = await fetch("/api/legal/document/client/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateDocumentId,
          templateVersionId,
          customerLegalName,
          effectiveDate,
          customerProjectLead,
          teamOptixProjectLead,
          providerName,
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        setCreateState("error");
        setErrorMessage(json?.error ?? "Client document creation failed.");
        return;
      }

      setCreatedHref(json.href ?? "");
      setCreateState("created");
    } catch {
      setCreateState("error");
      setErrorMessage("Client document creation failed.");
    }
  }

  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorHeadingRow}>
        <p className={styles.panelLabel}>Create Client Document</p>
        <span className={createState === "error" ? styles.saveError : styles.saveStatus}>
          {createState}
        </span>
      </div>

      <p className={styles.emptyHelper}>
        Generate a customer-owned draft from a locked template version. The generated document can then be edited, locked, accepted, and vaulted.
      </p>

      {lockedVersions.length ? (
        <div className={styles.metadataGrid}>
          <label className={styles.metadataFieldLabel}>
            <span>Template version</span>
            <select
              className={styles.metadataInput}
              value={templateVersionId}
              onChange={(event) => setTemplateVersionId(event.target.value)}
            >
              {lockedVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.version_label ?? "—"}
                </option>
              ))}
            </select>
          </label>

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
      ) : (
        <p className={styles.emptyHelper}>Lock a template version before creating a client document.</p>
      )}

      {errorMessage ? <p className={styles.saveError}>{errorMessage}</p> : null}

      <div className={styles.inlineActions}>
        <button
          className={[styles.primaryButton, lockedVersions.length ? styles.actionButtonGo : styles.actionButtonBlocked].join(" ")}
          type="button"
          onClick={createClientDocument}
          disabled={!lockedVersions.length || createState === "creating"}
        >
          {createState === "creating" ? "Creating..." : "Create Client Document"}
        </button>

        {createdHref ? (
          <Link className={styles.secondaryButton} href={createdHref}>
            Open Client Draft
          </Link>
        ) : null}
      </div>
    </section>
  );
}
