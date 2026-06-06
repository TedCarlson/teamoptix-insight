export function FactRow(props: {
  label: string;
  value: string | boolean | null | undefined;
}) {
  const { label, value } = props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "128px minmax(0, 1fr)",
        gap: 10,
        alignItems: "baseline",
        minHeight: 24,
      }}
    >
      <span className="hero-stat__label">{label}</span>
      <strong style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {value === true ? "Yes" : value === false ? "No" : value || "—"}
      </strong>
    </div>
  );
}

export function DrawerSection(props: {
  eyebrow: string;
  title: string;
  editing?: boolean;
  saving?: boolean;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderTop: "1px solid #e6edf5",
        padding: "14px 0 0",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div>
          <p className="workspace-eyebrow">{props.eyebrow}</p>
          <h3 className="workspace-card-title">{props.title}</h3>
        </div>

        {props.onEdit ? (
          <button
            className="button"
            type="button"
            disabled={props.saving}
            onClick={props.onEdit}
            style={{ minHeight: 34, padding: "0 12px" }}
          >
            {props.editing ? "Cancel" : "Edit"}
          </button>
        ) : null}
      </div>

      {props.children}
    </section>
  );
}

export const compactInput: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  font: "inherit",
};

export const compactTextarea: React.CSSProperties = {
  width: "100%",
  minHeight: 72,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  font: "inherit",
  resize: "vertical",
};
