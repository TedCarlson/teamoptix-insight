export type RosterTab = "active" | "candidates" | "former" | "all";

type Props = {
  tab: RosterTab;
  setTab: (tab: RosterTab) => void;
  search: string;
  setSearch: (value: string) => void;
};

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

export default function RosterControlsBar(props: Props) {
  const { tab, setTab, search, setSearch } = props;

  return (
    <>
      <p className="value-card__eyebrow">Roster controls</p>
      <h3 className="value-card__title">Filter the workforce view</h3>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 14,
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className="button"
          aria-pressed={tab === "active"}
          onClick={() => setTab("active")}
        >
          Active
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={tab === "candidates"}
          onClick={() => setTab("candidates")}
        >
          Candidates
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={tab === "former"}
          onClick={() => setTab("former")}
        >
          Former
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={tab === "all"}
          onClick={() => setTab("all")}
        >
          All
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, worker type, market, supervisor..."
          style={inputStyle}
        />
        <button type="button" className="button">
          Filters
        </button>
      </div>
    </>
  );
}