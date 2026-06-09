"use client";

import { useState } from "react";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";

const deliveryRows = [
  {
    route: "426 · BPV 03",
    area: "McCormick · In Town",
    driver: "Serrenzo Hill",
    status: "On Pace",
    signals: [],
  },
  {
    route: "430 · BPV 01",
    area: "Aiken Overflow",
    driver: "OPEN DRIVER",
    status: "Coverage Risk",
    signals: ["Coverage"],
  },
  {
    route: "434 · BPV 04",
    area: "Aiken Rural",
    driver: "David West",
    status: "Active",
    signals: ["Task"],
  },
  {
    route: "438 · BPV 20",
    area: "North Augusta",
    driver: "Latrice Battle",
    status: "Watching",
    signals: ["Late"],
  },
];

function statusColor(status: string) {
  if (status === "Coverage Risk") return "#b42318";
  if (status === "Watching") return "#b54708";
  if (status === "On Pace") return "#166534";
  return "#334155";
}

export default function DeliveryWindowPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(new Date().toISOString());

  function refreshWorkspace() {
    setRefreshKey((current) => current + 1);
    setLastUpdatedAt(new Date().toISOString());
  }

  return (
    <main className="workspace-shell">
      <section key={refreshKey} className="workspace-main"
        style={{
          paddingTop: 12,
        }}>
        

        <OperationsWorkspaceToolbar
          lastUpdatedAt={lastUpdatedAt}
          onRefresh={refreshWorkspace}
          onUpload={() => setUploadOverlayOpen(true)}
        />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 12,
            alignItems: "start",
            marginTop: 12,
          }}
        >
          <section className="panel" style={{ overflow: "hidden" }}>
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e6edf5",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <p className="eyebrow">Route Board</p>
                <strong>Delivery posture</strong>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1.2fr) minmax(160px, 0.8fr) minmax(120px, 0.6fr) minmax(150px, 0.7fr) 90px",
                padding: "8px 12px",
                borderBottom: "1px solid #eef2f7",
                color: "#64748b",
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <span>Route / Area</span>
              <span>Driver</span>
              <span>Status</span>
              <span>Signals</span>
              <span>Action</span>
            </div>

            {deliveryRows.map((row) => (
              <div
                key={row.route}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1.2fr) minmax(160px, 0.8fr) minmax(120px, 0.6fr) minmax(150px, 0.7fr) 90px",
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderBottom: "1px solid #eef2f7",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <strong>{row.route}</strong>
                  <span style={{ color: "#64748b", fontSize: 12 }}>{row.area}</span>
                </div>

                <strong style={{ color: row.driver === "OPEN DRIVER" ? "#b42318" : "#0f172a" }}>
                  {row.driver}
                </strong>

                <span style={{ color: statusColor(row.status), fontWeight: 900 }}>
                  {row.status}
                </span>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {row.signals.length ? (
                    row.signals.map((signal) => (
                      <span
                        key={signal}
                        style={{
                          border: "1px solid #d6dfeb",
                          borderRadius: 999,
                          padding: "3px 7px",
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#334155",
                          background: "#f8fafc",
                        }}
                      >
                        {signal}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                  )}
                </div>

                <button type="button" className="button" style={{ minHeight: 30, padding: "0 10px" }}>
                  View
                </button>
              </div>
            ))}
          </section>

          <aside className="panel">
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e6edf5",
              }}
            >
              <p className="eyebrow">Delivery Toolkit</p>
              <strong>Active oversight</strong>
            </div>

            <div style={{ padding: 10, display: "grid", gap: 10 }}>
              <button type="button" className="button button-primary">
                Delivery Action
              </button>

              <section style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10 }}>
                <p className="eyebrow">Signals</p>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <strong>Coverage Risk · 1</strong>
                  <strong>Vehicle Issue · 0</strong>
                  <strong>Open Tasks · 2</strong>
                  <strong>Escalations · 0</strong>
                </div>
              </section>

              <section style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10 }}>
                <p className="eyebrow">Activity</p>
                <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.45 }}>
                  Delivery actions and route notes will appear here as the window matures.
                </p>
              </section>
            </div>
          </aside>
        </section>
      </section>
      <OperationsReportUploadOverlay
        open={uploadOverlayOpen}
        onClose={(shouldRefresh) => {
          setUploadOverlayOpen(false);
          if (shouldRefresh) refreshWorkspace();
        }}
      />
    </main>
  );
}
