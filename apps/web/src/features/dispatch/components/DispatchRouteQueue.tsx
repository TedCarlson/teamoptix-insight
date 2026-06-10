import type {
  AssignmentIntent,
  DispatchRoute,
  Seat,
} from "../lib/dispatchSupport";
import {
  compactButton,
  eyebrow,
  panel,
  panelHeader,
  routeLabel,
  routeRowBase,
  seatButtonBase,
  selectedButton,
} from "../lib/dispatchSupport";

type DispatchRouteQueueProps = {
  routeLabelForDisplay?: (route: DispatchRoute) => string;
  routes: DispatchRoute[];
  totalRoutes: number;
  loading: boolean;
  intent: AssignmentIntent;
  onOpenSeat: (route: DispatchRoute, seat: Seat) => void;
  onClearSeat: (routeKey: string, seat: Seat) => void;
  onCancelIntent: () => void;
};

export function DispatchRouteQueue(props: DispatchRouteQueueProps) {
  const {
    routeLabelForDisplay,
    routes,
    totalRoutes,
    loading,
    intent,
    onOpenSeat,
    onClearSeat,
    onCancelIntent,
  } = props;

  function SeatButton(props: {
    route: DispatchRoute;
    seat: Seat;
    label: string;
    value: string;
    empty?: boolean;
  }) {
    const { route, seat, label, value, empty } = props;
    const isActive =
      intent?.route_key === route.route_key && intent.seat === seat;

    return (
      <button
        type="button"
        onClick={() => onOpenSeat(route, seat)}
        style={{
          ...seatButtonBase,
          borderColor: isActive ? "#2563eb" : "#dbe4ef",
          background: isActive ? "#eff6ff" : empty ? "#f8fafc" : "#fff",
          color: empty ? "#64748b" : "#0f172a",
        }}
        title={`Assign ${label}`}
      >
        {value}
      </button>
    );
  }

  return (
    <section style={panel}>
      <div style={panelHeader}>
        <div>
          <p style={eyebrow}>Route Queue</p>
          <strong>{totalRoutes} routes</strong>
        </div>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>
          Tap driver seat. Helper / trainee actions live in right rail.
        </span>
      </div>

      <div
        style={{
          ...routeRowBase,
          position: "sticky",
          top: 0,
          zIndex: 1,
          background: "#f8fafc",
          fontSize: 11,
          fontWeight: 900,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <div>Route</div>
        <div>Driver</div>
        <div>Plan</div>
      </div>

      <div style={{ maxHeight: "calc(100vh - 236px)", overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 14 }}>Loading dispatch...</div>
        ) : routes.length === 0 ? (
          <div style={{ padding: 14 }}>No routes hydrated for today.</div>
        ) : (
          routes.map((route) => {
            const needsDriver = !route.driver;

            return (
              <div key={route.route_key} style={routeRowBase}>
                <div style={{ minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 15,
                      color: "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <span
                        data-dispatch-signal="route-status"
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          flex: "0 0 auto",
                          background:
                            route.trainees.length > 0
                              ? "#7c3aed"
                              : needsDriver
                                ? "#f97316"
                                : "#22c55e",
                          boxShadow: "0 0 0 3px rgba(15, 23, 42, 0.04)",
                        }}
                      />
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {routeLabelForDisplay ? routeLabelForDisplay(route) : routeLabel(route)}
                      </span>
                    </span>
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: 2,
                      color: "#64748b",
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {route.route_location ?? "No location"}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <SeatButton
                    route={route}
                    seat="driver"
                    label="driver"
                    value={route.driver?.full_name ?? "Open driver seat"}
                    empty={!route.driver}
                  />

                  {route.helpers.length > 0 || route.trainees.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {route.helpers.length > 0 ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            borderRadius: 999,
                            padding: "2px 8px",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                          }}
                        >
                          H {route.helpers.length}
                        </span>
                      ) : null}

                      {route.trainees.length > 0 ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            borderRadius: 999,
                            padding: "2px 8px",
                            background: "#f3e8ff",
                            color: "#7c3aed",
                          }}
                        >
                          T {route.trainees.length}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    color: "#94a3b8",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  —
                </div>

                {intent?.route_key === route.route_key ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      paddingTop: 2,
                    }}
                  >
                    <button
                      type="button"
                      style={
                        intent.seat === "driver" ? selectedButton : compactButton
                      }
                      onClick={() => onOpenSeat(route, "driver")}
                    >
                      Driver
                    </button>
                    <button
                      type="button"
                      style={
                        intent.seat === "helper" ? selectedButton : compactButton
                      }
                      onClick={() => onOpenSeat(route, "helper")}
                    >
                      Add Helper
                    </button>
                    <button
                      type="button"
                      style={
                        intent.seat === "trainee"
                          ? selectedButton
                          : compactButton
                      }
                      onClick={() => onOpenSeat(route, "trainee")}
                    >
                      Add Trainee
                    </button>
                    <button
                      type="button"
                      style={compactButton}
                      onClick={() => onClearSeat(route.route_key, intent.seat)}
                    >
                      Clear {intent.seat}
                    </button>
                    <button
                      type="button"
                      style={compactButton}
                      onClick={onCancelIntent}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
