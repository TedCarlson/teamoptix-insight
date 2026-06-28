"use client";

type Props = {
  ownerType: "profile" | "roster";
  ownerId: string;
  documentType: string;
  readOnly?: boolean;
};

export default function ComplianceUploadClient({
  ownerType,
  ownerId,
  documentType,
}: Props) {
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: 10,
        border: "1px solid #e6edf5",
        borderRadius: 12,
      }}
    >
      <div>
        <strong>{documentType}</strong>
      </div>

      <input type="file" />

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button className="button" type="button">
          Upload
        </button>

        <button className="button" type="button">
          View
        </button>

        <button className="button" type="button">
          Replace
        </button>
      </div>

      <small>
        owner={ownerType} / {ownerId}
      </small>
    </div>
  );
}
