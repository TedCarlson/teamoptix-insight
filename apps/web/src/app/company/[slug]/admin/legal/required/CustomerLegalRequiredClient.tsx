"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LegalAcceptanceOverlay } from "@/features/legal/components/LegalAcceptanceOverlay";

type RecordRow = Record<string, unknown>;

type LockedVersionForAcceptance = {
  id: string;
  version_label?: string | null;
  title?: string | null;
  content_snapshot?: {
    document?: { title?: string | null; version_label?: string | null };
    sections?: Array<{
      section_number?: number | null;
      title?: string | null;
      body_markdown?: string | null;
    }>;
  } | null;
};

function text(row: RecordRow | null | undefined, key: string) {
  const value = row?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function statusLabel(status: string) {
  if (status === "READY_FOR_CUSTOMER_REVIEW") return "Signature Required";
  if (status === "CUSTOMER_ACCEPTED") return "Accepted";
  if (status === "TEAMOPTIX_EXECUTED") return "Team Optix Finalized";
  if (status === "EXECUTED_AND_VAULTED") return "Complete";
  return status.replaceAll("_", " ");
}

export default function CustomerLegalRequiredClient({
  slug,
  tasks,
  versions,
}: {
  slug: string;
  tasks: RecordRow[];
  versions: RecordRow[];
}) {
  const [rows, setRows] = useState(tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const versionsById = useMemo(() => {
    const map = new Map<string, RecordRow>();
    for (const version of versions) {
      map.set(text(version, "id"), version);
    }
    return map;
  }, [versions]);

  const selectedTask = rows.find((task) => text(task, "id") === selectedTaskId) ?? null;
  const selectedVersion = selectedTask
    ? (versionsById.get(text(selectedTask, "document_version_id")) as LockedVersionForAcceptance | undefined) ?? null
    : null;

  const openTasks = rows.filter((task) => {
    const status = text(task, "status");
    return status === "READY_FOR_CUSTOMER_REVIEW";
  });

  return (
    <>
      <main className="workspace-shell">
        <section className="workspace-main">
          <div className="workspace-header">
            <div>
              <p className="workspace-eyebrow">Customer Admin · Legal</p>
              <h1 className="workspace-title">Signature Required</h1>
              <p className="workspace-description">
                Review locked Team Optix implementation documents and accept them electronically on behalf of your organization.
              </p>
            </div>

            <Link className="secondary-action" href={`/company/${slug}`}>
              Back to Admin
            </Link>
          </div>

          <section className="summary-grid">
            <article className="workspace-section">
              <p className="workspace-eyebrow">Open</p>
              <h2>{openTasks.length}</h2>
              <p>Documents waiting for customer review.</p>
            </article>
            <article className="workspace-section">
              <p className="workspace-eyebrow">Accepted</p>
              <h2>{rows.filter((task) => text(task, "status") === "CUSTOMER_ACCEPTED").length}</h2>
              <p>Accepted by customer; Team Optix finalization pending.</p>
            </article>
          </section>

          <section className="workspace-section">
            <p className="workspace-eyebrow">Legal Review</p>
            <h2>Documents awaiting action</h2>
            <p>Only locked document versions are shown here. Draft edits do not appear in this review lane.</p>

            <div className="signal-list">
              {rows.length ? (
                rows.map((task) => {
                  const status = text(task, "status");
                  const canAccept = status === "READY_FOR_CUSTOMER_REVIEW";
                  const version = versionsById.get(text(task, "document_version_id"));
                  return (
                    <div className="signal-list__row" key={text(task, "id")}>
                      <div>
                        <strong>{text(task, "document_title") || "Client document"}</strong>
                        <span>
                          Version {text(task, "version_label") || "—"} · {text(task, "blocking_reason") || statusLabel(status)}
                        </span>
                      </div>
                      <button
                        className={canAccept ? "primary-action" : "secondary-action"}
                        type="button"
                        disabled={!canAccept || !version}
                        onClick={() => setSelectedTaskId(text(task, "id"))}
                      >
                        {canAccept ? "Review & Accept" : statusLabel(status)}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="signal-list__row">
                  <div>
                    <strong>No legal documents are waiting</strong>
                    <span>Team Optix has not released any locked documents for customer acceptance.</span>
                  </div>
                  <em>Clear</em>
                </div>
              )}
            </div>
          </section>
        </section>
      </main>

      {selectedTask && selectedVersion ? (
        <LegalAcceptanceOverlay
          version={selectedVersion}
          companyId={text(selectedTask, "company_id")}
          defaultAcceptedByCompany={
            text(selectedTask, "company_name") ||
            text(selectedTask, "customer_legal_name") ||
            text(selectedTask, "document_customer_legal_name")
          }
          onClose={() => setSelectedTaskId(null)}
          onAccepted={() => {
            setRows((current) =>
              current.map((task) =>
                text(task, "id") === text(selectedTask, "id")
                  ? {
                      ...task,
                      status: "CUSTOMER_ACCEPTED",
                      blocking_reason: "Team Optix final execution is pending.",
                    }
                  : task
              )
            );
            setSelectedTaskId(null);
          }}
        />
      ) : null}
    </>
  );
}
