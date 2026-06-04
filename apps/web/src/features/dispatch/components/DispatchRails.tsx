import type {
  AssignmentIntent,
  DispatchPerson,
  DispatchRoute,
} from "../lib/dispatchSupport";
import {
  eyebrow,
  personTypeLabel,
  routeLabel,
} from "../lib/dispatchSupport";

export function WorkforceGroup(props: {
  title: string;
  people: DispatchPerson[];
  intent: AssignmentIntent;
  onSelect: (person: DispatchPerson) => void;
}) {
  const { title, people, intent, onSelect } = props;

  return (
    <section style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <p style={eyebrow}>{title}</p>
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 900 }}>
          {people.length}
        </span>
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        {people.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>None</div>
        ) : (
          people.map((person) => (
            <button
              key={`${title}-${person.roster_member_id}`}
              type="button"
              onClick={() => onSelect(person)}
              disabled={!intent}
              style={{
                minHeight: 34,
                padding: "6px 8px",
                borderRadius: 10,
                border: "1px solid #d6dfeb",
                background: intent ? "#fff" : "#f8fafc",
                color: intent ? "#0f172a" : "#64748b",
                textAlign: "left",
                cursor: intent ? "pointer" : "default",
                fontWeight: 800,
              }}
              title={personTypeLabel(person)}
            >
              <span
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {person.full_name}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>
                {personTypeLabel(person)}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

export function AssignmentRailSection(props: {
  title: string;
  emptyText: string;
  routes: DispatchRoute[];
  seat: "helper" | "trainee";
}) {
  const { title, emptyText, routes, seat } = props;

  const rows = routes.flatMap((route) => {
    const people = seat === "helper" ? route.helpers : route.trainees;

    return people.map((person) => ({
      route,
      person,
    }));
  });

  return (
    <section
      style={{
        border: "1px solid #e6edf5",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #e6edf5",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>
          {title}
        </span>
        <strong>{rows.length}</strong>
      </div>

      <div style={{ padding: 8, display: "grid", gap: 6 }}>
        {rows.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>{emptyText}</div>
        ) : (
          rows.map(({ route, person }) => (
            <div
              key={`${seat}-${route.route_key}-${person.roster_member_id}`}
              style={{
                border: "1px solid #edf2f7",
                borderRadius: 10,
                padding: 8,
                display: "grid",
                gap: 2,
              }}
            >
              <strong
                style={{
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {person.full_name}
              </strong>
              <span
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {routeLabel(route)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function Stat(props: { label: string; value: number; warn?: boolean }) {
  const { label, value, warn } = props;

  return (
    <div
      style={{
        border: "1px solid #e6edf5",
        borderRadius: 12,
        padding: 10,
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>
        {label}
      </span>
      <strong style={{ color: warn ? "#c2410c" : "#0f172a" }}>{value}</strong>
    </div>
  );
}
