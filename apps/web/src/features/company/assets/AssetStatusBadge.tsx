type Props = {
  label: string;
};

export default function AssetStatusBadge({ label }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
        borderRadius: 999,
        border: "1px solid #d6dfeb",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}
