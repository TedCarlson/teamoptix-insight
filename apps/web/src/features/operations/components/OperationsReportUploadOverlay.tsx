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

export default function OperationsReportUploadOverlay(props: OperationsReportUploadOverlayProps) {
  const { open, onClose } = props;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    setServiceDate(new Date().toISOString().slice(0, 10));
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
          width: "min(760px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
          padding: 18,
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
              padding: 18,
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
              <div>
                <p className="eyebrow">Inspection result</p>
                <strong>{familyLabel(detectedFamily)}</strong>
              </div>

              <div style={{ display: "grid", gap: 6, color: "#334155", fontSize: 13 }}>
                <span>File: {fileName}</span>
                <span>Size: {fileSize ? `${Math.round(fileSize / 1024)} KB` : "Unknown"}</span>
                <span>
                  Family key:{" "}
                  <strong style={{ color: detectedFamily === "UNKNOWN" ? "#b42318" : "#166534" }}>
                    {detectedFamily}
                  </strong>
                </span>
                <span>Shape: {inspection?.detected?.report_shape_key ?? "Pending"}</span>
                <span>
                  Confidence:{" "}
                  {inspection?.detected?.confidence
                    ? `${Math.round(inspection.detected.confidence * 100)}%`
                    : "Pending"}
                </span>
                <span>Sheet: {inspection?.sheet_name ?? "Pending"}</span>
                <span>Header row: {inspection?.detected?.detected_header_row ?? "Not found"}</span>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Report date</span>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    style={{
                      height: 38,
                      border: "1px solid #d6dfeb",
                      borderRadius: 10,
                      padding: "0 10px",
                      maxWidth: 180,
                    }}
                  />
                </label>
                <span>Terminal: {inspection?.detected?.terminal_code ?? "Not detected"}</span>
                <span>Contract: {inspection?.detected?.contract_filter ?? "Not detected"}</span>
                <span>Generated: {inspection?.detected?.generated_at_text ?? "Not detected"}</span>
                <span>Scanned Routes: {inspection?.detected?.route_row_count ?? 0}</span>
                <span>Drivers / Helpers: {inspection?.detected?.participant_row_count ?? 0}</span>
                <span>Summary Totals: {inspection?.detected?.summary_row_count ?? 0}</span>
                {inspectError ? <span style={{ color: "#b42318" }}>{inspectError}</span> : null}
                {inspecting ? <span>Inspecting workbook...</span> : null}
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

              {detectedFamily === "DSW" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <p className="eyebrow">DSW import mode</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={snapshotKind === "IN_DAY" ? "button button-primary" : "button"}
                      onClick={() => setSnapshotKind("IN_DAY")}
                    >
                      In-Day Snapshot
                    </button>
                    <button
                      type="button"
                      className={snapshotKind === "FINAL" ? "button button-primary" : "button"}
                      onClick={() => setSnapshotKind("FINAL")}
                    >
                      Final Day Record
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="app-card__body">
                Stage writes the batch and route rows into the existing operations report tables.
              </p>

              {stageError ? <p style={{ color: "#b42318", margin: 0 }}>{stageError}</p> : null}
              {stageResult ? (
                <p style={{ color: "#166534", margin: 0 }}>
                  Staged batch {stageResult.batch_id}. Inserted {stageResult.inserted_row_count} rows.
                </p>
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
