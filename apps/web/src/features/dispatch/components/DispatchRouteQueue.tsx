import { useEffect, useRef, useState } from "react";
import type {
  AssignmentIntent,
  DispatchRoute,
  Seat,
} from "../lib/dispatchSupport";
import { timeCriticalColor, type DispatchPlanSignal, type DroPlanTotals } from "../lib/droPlanSignals";
import type { DswDispatchSignal, DswDispatchTotals } from "../lib/dswDispatchSignals";
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
  planSignalsByRouteKey?: Record<string, DispatchPlanSignal>;
  dswSignalsByRouteKey?: Record<string, DswDispatchSignal>;
  planTotals?: DroPlanTotals;
  dswTotals?: DswDispatchTotals;
  planSourceLabel?: string | null;
};


function PlanTotalLine(props: { label: string; children: React.ReactNode }) {
  return (
    <span title={`${props.label} total`} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: "#475569", paddingRight: 4 }}>{props.label}</span>
      {props.children}
    </span>
  );
}

function DroSignalLine(props: { label: string; signal: DispatchPlanSignal }) {
  return (
    <span title={`${props.label} · ${props.signal.title}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 22, whiteSpace: "nowrap" }}>
      <strong style={{ color: "#475569", fontSize: 10, minWidth: 26 }}>{props.label}</strong>
      <span>📍 {props.signal.stops}</span>
      <span>📦 {props.signal.packages}</span>
      <span style={{ color: timeCriticalColor(props.signal.timeCritical) }}>🕒 {props.signal.timeCritical}</span>
      <span style={{ color: "#4d148c" }}>🚚 {props.signal.milesLabel}</span>
    </span>
  );
}

function DswSignalLine(props: { signal: DswDispatchSignal }) {
  return (
    <span title={`DSW · ${props.signal.title}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 22, whiteSpace: "nowrap" }}>
      <strong style={{ color: "#475569", fontSize: 10, minWidth: 26 }}>DSW</strong>
      <span>📍 {props.signal.deliveryStops}</span>
      <span>📦 {props.signal.packages}</span>
      <span style={{ color: timeCriticalColor(props.signal.timeCritical) }}>🕒 {props.signal.timeCritical}</span>
      <span>📥 {props.signal.pickupStops}</span>
    </span>
  );
}

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
    planSignalsByRouteKey = {},
    dswSignalsByRouteKey = {},
    planTotals,
    dswTotals,
    planSourceLabel = null,
  } = props;

  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!legendOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!legendRef.current) return;
      if (legendRef.current.contains(event.target as Node)) return;
      setLegendOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [legendOpen]);

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
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <strong>{totalRoutes} routes</strong>
          <div
            style={{
              display: "inline-grid",
              gap: 2,
              marginTop: 4,
              color: "#64748b",
              fontSize: 11,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {planTotals && planTotals.matchedRoutes > 0 ? (
              <PlanTotalLine label={planSourceLabel ?? "DRO"}>
                <span>📍 {planTotals.stops}</span>
                <span>📦 {planTotals.packages}</span>
                <span style={{ color: timeCriticalColor(planTotals.timeCritical) }}>🕒 {planTotals.timeCritical}</span>
              </PlanTotalLine>
            ) : null}
            {dswTotals && dswTotals.matchedRoutes > 0 ? (
              <PlanTotalLine label="DSW">
                <span>📍 {dswTotals.deliveryStops}</span>
                <span>📦 {dswTotals.packages}</span>
                <span style={{ color: timeCriticalColor(dswTotals.timeCritical) }}>🕒 {dswTotals.timeCritical}</span>
                <span>📥 {dswTotals.pickupStops}</span>
              </PlanTotalLine>
            ) : null}
          </div>
          </div>
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
        <div ref={legendRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <span>Plan</span>
          <button
            type="button"
            onClick={() => setLegendOpen((current) => !current)}
            style={{
              minHeight: 22,
              padding: "0 8px",
              borderRadius: 999,
              border: "1px solid #d6dfeb",
              background: legendOpen ? "#eff6ff" : "#fff",
              color: legendOpen ? "#1d4ed8" : "#64748b",
              fontSize: 10,
              fontWeight: 900,
              cursor: "pointer",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            Legend
          </button>

          {legendOpen ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 28,
                zIndex: 20,
                width: 260,
                border: "1px solid #d6dfeb",
                borderRadius: 14,
                background: "#fff",
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
                padding: 12,
                display: "grid",
                gap: 8,
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              <strong style={{ color: "#0f172a", fontSize: 13 }}>Route Signals</strong>

              <div style={{ display: "grid", gap: 6, color: "#334155", fontSize: 12 }}>
                <div><strong>Workload</strong></div>
                <div>📍 Stops</div>
                <div>📦 Packages</div>
                <div>🕒 Time critical</div>

                <div style={{ height: 1, background: "#e6edf5", margin: "4px 0" }} />

                <div><strong>Route shape</strong></div>
                <div>🚚 Route miles</div>
                <div>⚡ Miles per stop</div>
                <div>⏱ Minutes per stop</div>
              </div>
            </div>
          ) : null}
        </div>
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
                  title={
                    planSignalsByRouteKey[route.route_key]?.title ??
                    dswSignalsByRouteKey[route.route_key]?.title ??
                    "No DRO plan signal matched."
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 8,
                    minWidth: 0,
                    color: planSignalsByRouteKey[route.route_key] || dswSignalsByRouteKey[route.route_key] ? "#334155" : "#94a3b8",
                    fontSize: 12,
                    fontWeight: 900,
                    lineHeight: 1.2,
                  }}
                >
                  {planSignalsByRouteKey[route.route_key] || dswSignalsByRouteKey[route.route_key] ? (
                    <span
                      style={{
                        display: "inline-grid",
                        gap: 2,
                        minHeight: 34,
                        padding: "3px 10px",
                        borderRadius: 12,
                        border: "1px solid #dbe4ef",
                        background: "#fff",
                        boxShadow: "0 1px 0 rgba(15, 23, 42, 0.03)",
                        whiteSpace: "nowrap",
                        color: "#334155",
                        overflow: "hidden",
                      }}
                    >
                      {planSignalsByRouteKey[route.route_key] ? (
                        <DroSignalLine
                          label="DRO"
                          signal={planSignalsByRouteKey[route.route_key]}
                        />
                      ) : null}
                      {dswSignalsByRouteKey[route.route_key] ? (
                        <DswSignalLine signal={dswSignalsByRouteKey[route.route_key]} />
                      ) : null}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
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
