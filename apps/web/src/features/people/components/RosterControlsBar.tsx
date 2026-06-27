"use client";

export type RosterTab = "active" | "trainee" | "candidates" | "former" | "all";

type Props = {
  tab: RosterTab;
  setTab: (tab: RosterTab) => void;
  search: string;
  setSearch: (value: string) => void;
  counts?: {
    active: number;
    trainee: number;
    candidates: number;
    former: number;
    all: number;
    complianceAlerts: number;
  };
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid #d6dfeb",
  background: "#fff",
  font: "inherit",
};

export default function RosterControlsBar(props: Props) {
  const { tab, setTab, search, setSearch, counts } = props;
  const dirty = search.trim().length > 0;

  return (
    <>
      <p className="value-card__eyebrow">Roster controls</p>
      <h3 className="value-card__title">Filter the workforce view</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto minmax(260px, 1fr) auto",
          gap: 12,
          alignItems: "center",
          marginTop: 14,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="button"
            aria-pressed={tab === "active"}
            onClick={() => setTab("active")}
          >
            Active {counts ? `(${counts.active})` : ""}
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={tab === "trainee"}
            onClick={() => setTab("trainee")}
          >
            Trainee {counts ? `(${counts.trainee})` : ""}
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={tab === "candidates"}
            onClick={() => setTab("candidates")}
          >
            Candidates {counts ? `(${counts.candidates})` : ""}
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={tab === "former"}
            onClick={() => setTab("former")}
          >
            Former {counts ? `(${counts.former})` : ""}
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={tab === "all"}
            onClick={() => setTab("all")}
          >
            All {counts ? `(${counts.all})` : ""}
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, worker type, market, supervisor..."
          style={inputStyle}
        />

        <button
          type="button"
          className={dirty ? "button button-primary" : "button"}
          onClick={() => {
            if (dirty) setSearch("");
          }}
        >
          {dirty ? "Clear" : "Filters"}
        </button>
      </div>
    </>
  );
}
