import { useEffect, useRef, useState } from "react";
import type {
  AssignmentIntent,
  DispatchPerson,
  DispatchRoute,
  Seat,
} from "../lib/dispatchSupport";
import { timeCriticalColor, type DispatchPlanSignal, type DroPlanTotals } from "../lib/droPlanSignals";
import type { DswDispatchSignal, DswDispatchTotals } from "../lib/dswDispatchSignals";
import { ExpressProgressSignal } from "@/features/operations/express/ExpressProgressSignal";
import type { ExpressDataHealth, ExpressProgress } from "@/features/operations/express/expressProgress";
import { DispatchAttendanceToggle } from "./DispatchAttendanceToggle";
import {
  compactButton,
  eyebrow,
  panel,
  panelHeader,
  routeLabel,
  routeRowBase,
  seatButtonBase,
} from "../lib/dispatchSupport";

type DispatchRouteQueueProps = {
  routeLabelForDisplay?: (route: DispatchRoute) => string;
  routes: DispatchRoute[];
  totalRoutes: number;
  loading: boolean;
  intent: AssignmentIntent;
  editingRouteKey: string | null;
  editingSeat: Seat;
  onOpenRouteEditor: (route: DispatchRoute, seat: Seat) => void;
  onCloseRouteEditor: () => void;
  onEditSeat: (seat: Seat) => void;
  onClearSeat: (routeKey: string, seat: Seat) => void;
  onSelectRoute: (route: DispatchRoute) => void;
  onSelectSeat: (seat: Seat) => void;
  arrivedPersonIds: Set<string>;
  onToggleArrived: (person: DispatchPerson) => void;
  planSignalsByRouteKey?: Record<string, DispatchPlanSignal>;
  dswSignalsByRouteKey?: Record<string, DswDispatchSignal>;
  planTotals?: DroPlanTotals;
  dswTotals?: DswDispatchTotals;
  planSourceLabel?: string | null;
  expressSignalsByRouteKey?: Record<string, ExpressProgress & { dataHealth?: Partial<ExpressDataHealth> }>;
  expressTotals?: ExpressProgress & { dataHealth?: Partial<ExpressDataHealth> };
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

function SeatButton(props: {
  value: string;
  empty?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const { value, empty, active, onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      style={{
        ...seatButtonBase,
        display: "block",
        borderColor: active ? "#2563eb" : "#dbe4ef",
        background: active ? "#eff6ff" : empty ? "#f8fafc" : "#fff",
        color: empty ? "#64748b" : "#0f172a",
      }}
    >
      {value}
    </button>
  );
}

function SeatAssignmentSummary(props: {
  label: "H" | "T";
  people: DispatchPerson[];
  arrivedPersonIds: Set<string>;
}) {
  const { label, people, arrivedPersonIds } = props;
  if (people.length === 0) return null;

  const detail = people
    .map((person) =>
      arrivedPersonIds.has(person.roster_member_id)
        ? `${person.full_name} · present`
        : person.full_name
    )
    .join(", ");

  return (
    <span className="dispatch-route-row__support-assignment">
      <span
        className={`dispatch-route-row__support-pill is-${label === "H" ? "helper" : "trainee"}`}
      >
        {label} {people.length}
      </span>
      <small title={detail}>{detail}</small>
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
    editingRouteKey,
    editingSeat,
    onOpenRouteEditor,
    onCloseRouteEditor,
    onEditSeat,
    onClearSeat,
    onSelectRoute,
    onSelectSeat,
    arrivedPersonIds,
    onToggleArrived,
    planSignalsByRouteKey = {},
    dswSignalsByRouteKey = {},
    planTotals,
    dswTotals,
    planSourceLabel = null,
    expressSignalsByRouteKey = {},
    expressTotals,
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

  return (
    <section className="dispatch-route-queue" style={panel}>
      <div className="dispatch-route-queue__chrome">
      <div className="dispatch-route-queue__header" style={panelHeader}>
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
        {expressTotals ? (
          <ExpressProgressSignal
            className="dispatch-route-queue__express-summary"
            progress={expressTotals}
            dataHealth={expressTotals.dataHealth}
            compact
            hideZeroSegments
            style={{ minWidth: 170 }}
          />
        ) : null}
        {intent || editingRouteKey ? (
          <span
            className={intent ? "dispatch-route-queue__assignment-prompt is-active" : "dispatch-route-queue__assignment-prompt"}
            aria-live="polite"
          >
            {intent
              ? intent.route_label
                ? `Choose a seat for ${intent.person.full_name}`
                : `Choose a route for ${intent.person.full_name}`
              : "Choose a seat, then choose a person from the workforce rail."}
          </span>
        ) : null}
      </div>

      <div
        className="dispatch-route-row dispatch-route-row--labels"
        style={{
          ...routeRowBase,
          background: "#f8fafc",
          fontSize: 11,
          fontWeight: 900,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <div>Arr</div>
        <div>Route</div>
        <div>Driver</div>
        <div ref={legendRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <span>Plan / Express performance</span>
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
      </div>

      <div className="dispatch-route-queue__scroll">
        {loading ? (
          <div style={{ padding: 14 }}>Loading dispatch...</div>
        ) : routes.length === 0 ? (
          <div style={{ padding: 14 }}>No routes hydrated for today.</div>
        ) : (
          routes.map((route) => {
            const needsDriver = !route.driver;
            const assignmentTarget = intent?.route_key === route.route_key;
            const editorOpen = editingRouteKey === route.route_key;
            const driverArrived = route.driver
              ? arrivedPersonIds.has(route.driver.roster_member_id)
              : false;
            const expressSignal = expressSignalsByRouteKey[route.route_key];

            return (
              <div
                key={route.route_key}
                className={`dispatch-route-row${assignmentTarget ? " is-assignment-target" : ""}${editorOpen ? " is-editor-open" : ""}`}
                style={{ ...routeRowBase, position: "relative" }}
              >
                {intent && !assignmentTarget ? (
                  <button
                    type="button"
                    className="dispatch-route-row__assignment-hit-area"
                    aria-label={`Choose ${routeLabelForDisplay ? routeLabelForDisplay(route) : routeLabel(route)} for ${intent.person.full_name}`}
                    onClick={() => onSelectRoute(route)}
                  />
                ) : null}
                <div className="dispatch-route-row__arrival" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {route.driver ? (
                    <DispatchAttendanceToggle
                      person={route.driver}
                      present={driverArrived}
                      onToggle={onToggleArrived}
                      placement="table"
                    />
                  ) : (
                    <span style={{ color: "#cbd5e1", fontWeight: 900 }}>—</span>
                  )}
                </div>

                <div className="dispatch-route-row__identity" style={{ minWidth: 0 }}>
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
                      className="dispatch-route-row__plan-card"
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

                <div className="dispatch-route-row__driver" style={{ display: "grid", gap: 4 }}>
                  <SeatButton
                    value={route.driver?.full_name ?? "Open driver seat"}
                    empty={!route.driver}
                    active={editorOpen}
                    onClick={() => onOpenRouteEditor(route, "driver")}
                  />

                  {route.helpers.length > 0 || route.trainees.length > 0 ? (
                    <div className="dispatch-route-row__support-assignments">
                      <SeatAssignmentSummary
                        label="H"
                        people={route.helpers}
                        arrivedPersonIds={arrivedPersonIds}
                      />
                      <SeatAssignmentSummary
                        label="T"
                        people={route.trainees}
                        arrivedPersonIds={arrivedPersonIds}
                      />
                    </div>
                  ) : null}
                </div>

                <div
                  className="dispatch-route-row__signals"
                  title={
                    planSignalsByRouteKey[route.route_key]?.title ??
                    dswSignalsByRouteKey[route.route_key]?.title ??
                    "No DRO plan signal matched."
                  }
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(250px, 1.35fr) minmax(210px, 0.85fr)",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    color: planSignalsByRouteKey[route.route_key] || dswSignalsByRouteKey[route.route_key] ? "#334155" : "#94a3b8",
                    fontSize: 12,
                    fontWeight: 900,
                    lineHeight: 1.2,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
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
                  <ExpressProgressSignal
                    progress={expressSignal ?? { total: 0, complete: 0, attempted: 0, open: 0 }}
                    dataHealth={expressSignal?.dataHealth}
                    compact
                    hideZeroSegments
                  />
                </div>

                {assignmentTarget ? (
                  <div
                    className="dispatch-route-row__seat-picker"
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      paddingTop: 2,
                    }}
                  >
                    <span>
                      Assign <strong>{intent.person.full_name}</strong> as
                    </span>
                    <button
                      type="button"
                      style={compactButton}
                      onClick={() => onSelectSeat("driver")}
                    >
                      Driver
                    </button>
                    <button
                      type="button"
                      style={compactButton}
                      onClick={() => onSelectSeat("helper")}
                    >
                      Helper
                    </button>
                    <button
                      type="button"
                      style={compactButton}
                      onClick={() => onSelectSeat("trainee")}
                    >
                      Trainee
                    </button>
                  </div>
                ) : editorOpen ? (
                  <div
                    className="dispatch-route-row__seat-picker dispatch-route-row__seat-editor"
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      paddingTop: 2,
                    }}
                  >
                    <span>
                      Edit <strong>{routeLabelForDisplay ? routeLabelForDisplay(route) : routeLabel(route)}</strong>
                    </span>
                    {(["driver", "helper", "trainee"] as const).map((seat) => (
                      <button
                        key={seat}
                        type="button"
                        style={editingSeat === seat ? { ...compactButton, borderColor: "#2563eb", background: "#eff6ff", color: "#1d4ed8" } : compactButton}
                        aria-pressed={editingSeat === seat}
                        onClick={() => onEditSeat(seat)}
                      >
                        {seat === "driver" ? "Driver" : seat === "helper" ? "Helper" : "Trainee"}
                      </button>
                    ))}
                    <span className="dispatch-route-row__seat-editor-hint">
                      Choose a person from the workforce rail
                    </span>
                    {(editingSeat === "driver"
                      ? Boolean(route.driver)
                      : editingSeat === "helper"
                        ? route.helpers.length > 0
                        : route.trainees.length > 0) ? (
                      <button
                        type="button"
                        className="dispatch-route-row__clear-seat"
                        style={compactButton}
                        onClick={() => onClearSeat(route.route_key, editingSeat)}
                      >
                        Clear {editingSeat}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      style={compactButton}
                      onClick={onCloseRouteEditor}
                    >
                      Close
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
