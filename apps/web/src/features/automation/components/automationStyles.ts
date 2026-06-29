import type { CSSProperties } from "react";

export const orderSummaryBox: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 14,
  padding: "10px 12px",
  background: "#f8fafc",
  display: "grid",
  gap: 6,
};

export const drawerBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  background: "rgba(15, 23, 42, 0.36)",
  display: "flex",
  justifyContent: "flex-end",
  padding: 12,
};

export const drawerPanel: CSSProperties = {
  width: "min(560px, 100%)",
  height: "100%",
  overflowY: "auto",
  borderRadius: 22,
  background: "#fff",
  border: "1px solid #dbe7f3",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
  padding: 16,
  display: "grid",
  gap: 14,
  alignContent: "start",
};

export const timeInputBox: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 12,
  padding: "9px 10px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 850,
  minHeight: 38,
};

export const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#334155",
  fontSize: 13,
  fontWeight: 850,
};

export const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

export const executiveSignalGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "0.8fr 1.4fr 0.8fr",
  gap: 10,
  marginTop: 12,
};

export const credentialSignalButton: CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 16,
  padding: "9px 10px",
  background: "#fff",
  display: "grid",
  gap: 3,
  textAlign: "left",
  cursor: "pointer",
  minHeight: 58,
  boxShadow: "0 12px 30px rgba(37, 99, 235, 0.06)",
};

export const policyStrip: CSSProperties = {
  marginTop: 10,
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  padding: "7px 10px",
  background: "#f0fdf4",
  color: "#166534",
  display: "flex",
  gap: 6,
  alignItems: "center",
  fontSize: 12,
  fontWeight: 850,
};

export const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 0.8fr",
  gap: 12,
  alignItems: "stretch",
  marginBottom: 12,
};

export const leadText: CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 750,
};

export const mutedCopy: CSSProperties = {
  margin: "0 0 12px",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 750,
};

export const capacityBox: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: 12,
  background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
  display: "grid",
  gap: 6,
};

export const connectionStripButton: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: 12,
  background: "#fff",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginTop: 12,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
};

export const credentialEditorBox: CSSProperties = {
  border: "1px dashed #bfdbfe",
  borderRadius: 16,
  padding: 12,
  background: "#f8fbff",
  display: "grid",
  gap: 10,
  marginTop: 12,
};

export const credentialNotice: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 14,
  padding: "10px 12px",
  background: "#fff",
  color: "#334155",
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.45,
};

export const credentialField: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: "9px 12px",
  background: "#fff",
  display: "grid",
  gap: 5,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const credentialInput: CSSProperties = {
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 900,
  minHeight: 28,
};

export const profileGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

export const profileCard: CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 16,
  padding: 10,
  background: "#fff",
  display: "grid",
  gap: 9,
  alignContent: "start",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)",
};

export const workdayRefreshCard: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: 12,
  background: "#fff",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 12,
  alignItems: "center",
};

export const reportChip: CSSProperties = {
  border: "1px solid #e6edf5",
  background: "#f8fafc",
  color: "#334155",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 900,
};

export const twoCol: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

export const sourceBox: CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
  display: "grid",
  gap: 8,
};

export const sourceTitle: CSSProperties = {
  color: "#0f172a",
  fontSize: 13,
  letterSpacing: "0.06em",
};

export const summaryLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#334155",
  fontSize: 12,
  fontWeight: 850,
};

export const summaryLabel: CSSProperties = {
  color: "#64748b",
  fontWeight: 800,
};

export const fieldLabel: CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 850,
};


export const timeBox: CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 12,
  padding: "8px 10px",
  background: "#fff",
  display: "grid",
  gap: 6,
};

export const timeInput: CSSProperties = {
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 950,
};

export const th: CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #e6edf5",
};

export const td: CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #eef3f8",
  color: "#334155",
  fontWeight: 800,
};
