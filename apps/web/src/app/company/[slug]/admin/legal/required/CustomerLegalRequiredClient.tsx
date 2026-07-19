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
  const acceptedTasks = rows.filter((task) => text(task, "status") === "CUSTOMER_ACCEPTED");

  return (
    <>
      <main className="workspace-shell teamoptix-domain-overview customer-legal-workspace">
        <section className="workspace-main">
          <header className="customer-legal-heading">
            <div>
              <p className="eyebrow">Admin · Legal</p>
              <h1>Contract review</h1>
              <p>Review immutable contract versions released to your organization and record authorized acceptance.</p>
            </div>
            <Link className="secondary-action" href={`/company/${slug}`}>
              Back to Admin
            </Link>
          </header>

          <section className="operating-pulse customer-legal-pulse" aria-label="Legal review pulse">
            <article><span>Released</span><strong>{rows.length}</strong><small>Locked contract versions</small></article>
            <article><span>Customer Action</span><strong>{openTasks.length}</strong><small>{openTasks.length ? "Review and acceptance required" : "Customer queue clear"}</small></article>
            <article><span>Accepted</span><strong>{acceptedTasks.length}</strong><small>{acceptedTasks.length ? "Team Optix finalization pending" : "No pending finalization"}</small></article>
          </section>

          <section className="command-panel customer-legal-panel">
            <div className="command-panel__header">
              <div><p className="value-card__eyebrow">Legal Review</p><h2>Released contracts</h2></div>
              <span>Locked versions only</span>
            </div>
            <div className="domain-row-list">
              {rows.length ? (
                rows.map((task) => {
                  const status = text(task, "status");
                  const canAccept = status === "READY_FOR_CUSTOMER_REVIEW";
                  const version = versionsById.get(text(task, "document_version_id"));
                  return (
                    <div className="customer-legal-row" key={text(task, "id")}>
                      <span>
                        <strong>{text(task, "document_title") || "Client document"}</strong>
                        <small>
                          Version {text(task, "version_label") || "—"} · {text(task, "blocking_reason") || statusLabel(status)}
                        </small>
                      </span>
                      <em className={`signal-pill${canAccept ? " signal-pill--degraded" : " signal-pill--healthy"}`}>{statusLabel(status)}</em>
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
                <div className="command-empty">
                  <strong>No released contracts require action</strong>
                  <span>Locked customer versions will appear here when Team Optix releases them.</span>
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
