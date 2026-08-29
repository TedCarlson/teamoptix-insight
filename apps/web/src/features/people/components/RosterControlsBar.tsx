"use client";

export type RosterTab = "active" | "trainee" | "candidates" | "walk_ons" | "former" | "all";
export type DriverRosterSlice =
  | "all_roles"
  | "drivers"
  | "full_time"
  | "part_time"
  | "avp"
  | "unscheduled";

type Props = {
  tab: RosterTab;
  setTab: (tab: RosterTab) => void;
  search: string;
  setSearch: (value: string) => void;
  driverSlice: DriverRosterSlice;
  setDriverSlice: (value: DriverRosterSlice) => void;
  driverCounts: {
    drivers: number;
    full_time: number;
    part_time: number;
    avp: number;
    unscheduled: number;
  };
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
  const { tab, setTab, search, setSearch, driverSlice, setDriverSlice, driverCounts, counts } = props;
  const dirty = search.trim().length > 0 || driverSlice !== "all_roles";
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
          className="people-control"
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
              setDriverSlice("all_roles");
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
          aria-pressed={driverSlice === "all_roles"}
          onClick={() => setDriverSlice("all_roles")}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          All roles
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={driverSlice === "drivers"}
          onClick={() => setDriverSlice("drivers")}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          All drivers ({driverCounts.drivers})
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={driverSlice === "full_time"}
          onClick={() => setDriverSlice("full_time")}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          Full-time ({driverCounts.full_time})
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={driverSlice === "part_time"}
          onClick={() => setDriverSlice("part_time")}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          Part-time ({driverCounts.part_time})
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={driverSlice === "avp"}
          onClick={() => setDriverSlice("avp")}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          AVP drivers ({driverCounts.avp})
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={driverSlice === "unscheduled"}
          onClick={() => setDriverSlice("unscheduled")}
          style={{ minHeight: 32, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
        >
          Schedule needed ({driverCounts.unscheduled})
        </button>
      </div>
    </>
  );
}
