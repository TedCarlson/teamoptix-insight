"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

type DetectedReportFamily = "DSW" | "DRO" | "FCC" | "UNKNOWN";

type OperationsReportUploadOverlayProps = {
  open: boolean;
  onClose: (shouldRefresh: boolean) => void;
};

function detectFamilyFromFileName(fileName: string): DetectedReportFamily {
  const normalized = fileName.toLowerCase();

  if (normalized.includes("daily service") || normalized.includes("dsw")) return "DSW";
  if (normalized.includes("dro") || normalized.includes("package detail")) return "DRO";
  if (normalized.includes("fcc")) return "FCC";

  return "UNKNOWN";
}

function familyLabel(family: DetectedReportFamily) {
  if (family === "DSW") return "Daily Service Worksheet";
  if (family === "DRO") return "DRO Route Summary";
  if (family === "FCC") return "FCC Route Health";
  return "Unknown report";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function derivedSnapshotKind(serviceDate: string): "IN_DAY" | "FINAL" {
  return serviceDate < todayIso() ? "FINAL" : "IN_DAY";
}

function snapshotKindLabel(kind: "IN_DAY" | "FINAL") {
  return kind === "FINAL" ? "Final Day Record" : "In-Day Snapshot";
}

function InfoItem(props: { label: string; value: string | number | null | undefined; tone?: string }) {
  return (
    <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
      <span style={{ color: "#64748b", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {props.label}
      </span>
      <strong
        style={{
          color: props.tone ?? "#0f172a",
          fontSize: 13,
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={String(props.value ?? "—")}
      >
        {props.value ?? "—"}
      </strong>
    </div>
  );
}

export default function OperationsReportUploadOverlay(props: OperationsReportUploadOverlayProps) {
  const { open, onClose } = props;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [serviceDate, setServiceDate] = useState(() => todayIso());
  const [staging, setStaging] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageResult, setStageResult] = useState<any | null>(null);
  const [reportFrame, setReportFrame] = useState<"AM" | "PM" | "">("");
  const [snapshotKind, setSnapshotKind] = useState<"IN_DAY" | "FINAL">("IN_DAY");
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [inspected, setInspected] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<any | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const detectedFamily = inspection?.detected?.report_family_key ?? detectFamilyFromFileName(fileName);

  if (!open) return null;

  function reset() {
    setSelectedFile(null);
    setFileName("");
    setFileSize(null);
    setServiceDate(todayIso());
    setStaging(false);
    setStageError(null);
    setStageResult(null);
    setReportFrame("");
    setSnapshotKind("IN_DAY");
    setInspected(false);
    setInspecting(false);
    setInspection(null);
    setInspectError(null);
  }

  function handleClose() {
    const shouldRefresh = inspected;
    reset();
    onClose(shouldRefresh);
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;

    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setStageError(null);
    setStageResult(null);
    setInspecting(true);
    setInspectError(null);
    setInspection(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`/api/company/${slug}/operations/reports/inspect`, {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setInspectError(data?.error ?? "Inspection failed.");
        setInspected(true);
        return;
      }

      setInspection(data);
      if (data?.detected?.service_date) {
        setServiceDate(data.detected.service_date);
        if (data?.detected?.report_family_key === "DSW") {
          setSnapshotKind(derivedSnapshotKind(data.detected.service_date));
        }
      }
      setInspected(true);
    } catch {
      setInspectError("Inspection failed.");
      setInspected(true);
    } finally {
      setInspecting(false);
    }
  }


  async function handleStageReport() {
    if (!selectedFile) {
      setStageError("Select a report file first.");
      return;
    }

    if (!serviceDate) {
      setStageError("Report date is required.");
      return;
    }

    if (detectedFamily === "DRO" && !reportFrame) {
      setStageError("Select AM or PM before staging DRO.");
      return;
    }

    setStaging(true);
    setStageError(null);
    setStageResult(null);

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("service_date", serviceDate);
      form.append("report_frame", reportFrame);
      form.append("snapshot_kind", snapshotKind);

      const familyKey = inspection?.detected?.report_family_key;
      const endpoint =
        familyKey === "DSW"
          ? `/api/company/${slug}/operations/reports/dsw-upload`
          : `/api/company/${slug}/operations/reports/upload`;

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setStageError(data?.error ?? "Upload failed.");
        return;
      }

      setStageResult(data);
    } catch {
      setStageError("Upload failed.");
    } finally {
      setStaging(false);
    }
  }


  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <section
        style={{
          width: "min(720px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="eyebrow">Operations upload</p>
            <h2 className="app-card__title">Upload Report</h2>
            <p className="app-card__body">
              Select a FedEx source file. This first pass verifies the upload workflow and shape scaffold.
            </p>
          </div>

          <button type="button" className="button" onClick={handleClose}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleFileChange(event.dataTransfer.files?.[0] ?? null);
            }}
            style={{
              border: "1px dashed #94a3b8",
              borderRadius: 18,
              padding: 14,
              display: "grid",
              gap: 8,
              cursor: "pointer",
              background: "#f8fafc",
            }}
          >
            <strong>Select or drop report file</strong>
            <span style={{ color: "#64748b", fontSize: 13 }}>
              DSW, DRO, and FCC are the first supported report families.
            </span>
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              style={{ marginTop: 6 }}
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </label>

          {inspected ? (
            <section
              style={{
                border: "1px solid #e6edf5",
                borderRadius: 16,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <p className="eyebrow">Detected report</p>
                  <strong style={{ fontSize: 16 }}>{familyLabel(detectedFamily)}</strong>
                </div>

                <span
                  style={{
                    border: "1px solid #dbe4ef",
                    borderRadius: 999,
                    padding: "5px 9px",
                    background: "#f8fafc",
                    color: detectedFamily === "UNKNOWN" ? "#b42318" : "#166534",
                    fontSize: 11,
                    fontWeight: 950,
                  }}
                >
                  {detectedFamily}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <InfoItem label="Service date" value={serviceDate} />
                <InfoItem
                  label="Report status"
                  value={
                    detectedFamily === "DSW"
                      ? snapshotKindLabel(snapshotKind)
                      : detectedFamily === "DRO"
                        ? reportFrame || "Select AM / PM"
                        : "In-Day Snapshot"
                  }
                  tone={detectedFamily === "DRO" && !reportFrame ? "#92400e" : undefined}
                />
                <InfoItem
                  label={detectedFamily === "FCC" ? "Service area" : "Terminal"}
                  value={
                    detectedFamily === "FCC"
                      ? inspection?.detected?.service_area
                      : inspection?.detected?.terminal_code
                  }
                />
                <InfoItem
                  label={detectedFamily === "FCC" ? "Display work area" : "Contract"}
                  value={
                    detectedFamily === "FCC"
                      ? inspection?.detected?.display_work_area
                      : inspection?.detected?.contract_filter
                  }
                />
                <InfoItem label="Routes" value={inspection?.detected?.route_row_count ?? 0} />
                <InfoItem label="Summary rows" value={inspection?.detected?.summary_row_count ?? 0} />
              </div>

              <div
                style={{
                  border: "1px solid #e6edf5",
                  borderRadius: 14,
                  padding: 10,
                  background: "#f8fafc",
                  display: "grid",
                  gap: 5,
                }}
              >
                <p className="eyebrow">Import action</p>
                <strong>
                  {detectedFamily === "DSW"
                    ? snapshotKind === "FINAL"
                      ? "Replace existing Final Report"
                      : "Create In-Day Snapshot"
                    : detectedFamily === "DRO"
                      ? "Store DRO Planning Snapshot"
                      : detectedFamily === "FCC"
                        ? "Store FCC Route Health Snapshot"
                        : "Review required"}
                </strong>
                <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                  {detectedFamily === "DSW"
                    ? snapshotKind === "FINAL"
                      ? "Prior service dates are loaded as one authoritative final record for that day."
                      : "Today's DSW is retained as an operational in-day snapshot."
                    : "Technical detection details are retained in the warehouse metadata."}
                </span>
              </div>

              {detectedFamily === "DRO" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <p className="eyebrow">DRO frame</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["AM", "PM"] as const).map((frame) => (
                      <button
                        key={frame}
                        type="button"
                        className={reportFrame === frame ? "button button-primary" : "button"}
                        onClick={() => setReportFrame(frame)}
                      >
                        {frame}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  margin: 0,
                  color: "#475569",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>Ready to import.</span>
                <span>
                  {(inspection?.detected?.route_row_count ?? 0) +
                    (inspection?.detected?.summary_row_count ?? 0)} records
                </span>
              </div>

              {stageError ? <p style={{ color: "#b42318", margin: 0 }}>{stageError}</p> : null}
              {stageResult ? (
                <div
                  style={{
                    border: "1px solid #bbf7d0",
                    borderRadius: 12,
                    padding: 10,
                    background: "#f0fdf4",
                    color: "#166534",
                    fontSize: 13,
                    fontWeight: 850,
                    display: "grid",
                    gap: 3,
                  }}
                >
                  <strong>Upload complete</strong>
                  <span>
                    {stageResult.snapshot_kind === "FINAL" ? "Final artifact" : "Snapshot"} {stageResult.batch_id}
                  </span>
                  <span>
                    {stageResult.inserted_row_count} route rows
                    {stageResult.inserted_summary_row_count !== undefined
                      ? ` · ${stageResult.inserted_summary_row_count} summary rows`
                      : ""}
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="cta-row" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="button button-primary"
              disabled={!inspected || staging || !selectedFile || (detectedFamily === "DRO" && !reportFrame)}
              onClick={handleStageReport}
            >
              {staging ? "Staging..." : "Stage Report"}
            </button>
            <button type="button" className="button" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
