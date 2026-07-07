"use client";

type Props = {
  onUpload: () => void;
};

export default function OperationsUploadCard({ onUpload }: Props) {
  return (
    <section style={card}>
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>Upload Reports</p>
        <p style={helperText}>Add DSW, DRO, or FCC files.</p>
      </div>

      <button type="button" className="button" style={button} onClick={onUpload}>
        Upload
      </button>
    </section>
  );
}

const card: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  border: "1px solid #e6edf5",
  borderRadius: 14,
  background: "#ffffff",
  padding: "10px 12px",
};

const helperText: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 750,
};

const button: React.CSSProperties = {
  minHeight: 30,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
