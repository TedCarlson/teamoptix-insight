"use client";

export type RosterTab = "active" | "trainee" | "candidates" | "walk_ons" | "former" | "all";

type Props = {
  tab: RosterTab;
  setTab: (tab: RosterTab) => void;
  search: string;
  setSearch: (value: string) => void;
  driversOnly: boolean;
  setDriversOnly: (value: boolean) => void;
  driverCount: number;
  counts?: {
    active: number;
    trainee: number;
    candidates: number;
    walk_ons: number;
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
  const { tab, setTab, search, setSearch, driversOnly, setDriversOnly, driverCount, counts } = props;
  const dirty = search.trim().length > 0 || driversOnly;
  const tabLabel = {
    active: "Active",
    trainee: "Trainee",
    candidates: "Candidates",
    walk_ons: "Walk-ons",
    former: "Former",
    all: "All workforce",
  }[tab];

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
            aria-pressed={tab === "walk_ons"}
            onClick={() => setTab("walk_ons")}
          >
            Walk-ons {counts ? `(${counts.walk_ons})` : ""}
          </button>
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
            if (dirty) {
              setSearch("");
              setDriversOnly(false);
            }
          }}
        >
          {dirty ? "Clear filters" : "Filters"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 7,
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid #e6edf5",
        }}
      >
        <span className="hero-stat__label" style={{ fontSize: 10 }}>Within {tabLabel}</span>
        <button
          type="button"
          className="button"
          aria-pressed={!driversOnly}
          onClick={() => setDriversOnly(false)}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          All roles
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={driversOnly}
          onClick={() => setDriversOnly(true)}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          Drivers only ({driverCount})
        </button>
      </div>
    </>
  );
}
