"use client";

import { useMemo, useState } from "react";
import type {
  DispatchEventTypeRow,
  DispatchPerson,
  DispatchRoute,
} from "../lib/dispatchSupport";
import { cleanRouteKey, compactButton, selectedButton } from "../lib/dispatchSupport";

type DispatchActionKind = "event" | "add_driver" | "add_walk_on" | "add_route";

type DispatchActionOption = {
  kind: DispatchActionKind;
  event_code: string;
  event_label: string;
  event_category: string;
  requiresNote: boolean;
  targetMode: "none" | "scheduled_person" | "unscheduled_driver" | "walk_on_name" | "route" | "active_route";
};

type DispatchEventOverlayProps = {
  open: boolean;
  saving: boolean;
  eventTypes: DispatchEventTypeRow[];
  scheduledWorkforce: DispatchPerson[];
  unscheduledDrivers: DispatchPerson[];
  availableRoutes: DispatchRoute[];
  activeRoutes: DispatchRoute[];
  phase?: "dispatch" | "delivery";
  handoffSaving?: boolean;
  onHandoffToDelivery?: () => Promise<void> | void;
  onReturnToDispatch?: () => Promise<void> | void;
  onPrepareCorrectiveAction?: () => void;
  onClose: () => void;
  onSubmit: (payload: {
    event_code: string;
    event_label: string;
    event_category: string;
    note: string;
    person_roster_member_id: string | null;
    person_name: string | null;
    route_key?: string | null;
    route_label?: string | null;
    from_route_key?: string | null;
    from_route_label?: string | null;
    to_route_key?: string | null;
    to_route_label?: string | null;
    event_payload?: Record<string, unknown>;
    walk_on_full_name?: string | null;
  }) => Promise<void>;
};

const addDriverAction: DispatchActionOption = {
  kind: "add_driver",
  event_code: "ADD_DRIVER",
  event_label: "Add driver",
  event_category: "WORKFORCE",
  requiresNote: false,
  targetMode: "unscheduled_driver",
};

const addWalkOnAction: DispatchActionOption = {
  kind: "add_walk_on",
  event_code: "ADD_WALK_ON_DRIVER",
  event_label: "Walk-On",
  event_category: "WORKFORCE",
  requiresNote: false,
  targetMode: "walk_on_name",
};

const addRouteAction: DispatchActionOption = {
  kind: "add_route",
  event_code: "ADD_ROUTE",
  event_label: "Add route",
  event_category: "OPERATIONS",
  requiresNote: false,
  targetMode: "route",
};

const removeRouteAction: DispatchActionOption = {
  kind: "event",
  event_code: "REMOVE_ROUTE",
  event_label: "Remove route",
  event_category: "OPERATIONS",
  requiresNote: false,
  targetMode: "active_route",
};

function categoryLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function manualEventToAction(event: DispatchEventTypeRow): DispatchActionOption {
  return {
    kind: "event",
    event_code: event.event_code,
    event_label: event.event_label,
    event_category: event.event_category,
    requiresNote: event.requires_note,
    targetMode: event.requires_person ? "scheduled_person" : "none",
  };
}

function routeDropdownLabel(route: DispatchRoute) {
  return [route.current_wa_num, route.route_name].filter(Boolean).join(" · ");
}

export function DispatchEventOverlay(props: DispatchEventOverlayProps) {
  const {
    open,
    saving,
    eventTypes,
    scheduledWorkforce,
    unscheduledDrivers,
    availableRoutes,
    activeRoutes,
    phase = "dispatch",
    handoffSaving = false,
    onHandoffToDelivery,
    onReturnToDispatch,
    onPrepareCorrectiveAction,
    onClose,
    onSubmit,
  } = props;

  const manualEventActions = useMemo(
    () =>
      eventTypes
        .filter((event) => event.entry_mode === "manual" || event.entry_mode === "both")
        .map(manualEventToAction),
    [eventTypes]
  );

  const workforceActions = useMemo(
    () =>
      phase === "dispatch"
        ? [
            addDriverAction,
            addWalkOnAction,
            ...manualEventActions.filter(
              (action) => action.event_category === "WORKFORCE"
            ),
          ]
        : manualEventActions.filter(
            (action) =>
              action.event_category === "PERFORMANCE" ||
              action.event_category === "EXCEPTION"
          ),
    [manualEventActions, phase]
  );

  const operationsActions = useMemo(
    () =>
      phase === "dispatch"
        ? [
            addRouteAction,
            removeRouteAction,
            ...manualEventActions.filter(
              (action) =>
                action.event_category === "OPERATIONS" ||
                action.event_category === "COVERAGE" ||
                action.event_category === "PERFORMANCE"
            ),
          ]
        : manualEventActions.filter(
            (action) =>
              action.event_category === "OPERATIONS" ||
              action.event_category === "COVERAGE" ||
              action.event_category === "PERFORMANCE"
          ),
    [manualEventActions, phase]
  );

  const generalActions = useMemo(
    () =>
      manualEventActions.filter(
        (action) =>
          action.event_category !== "DELIVERY" &&
          action.event_category !== "WORKFORCE" &&
          action.event_category !== "OPERATIONS" &&
          action.event_category !== "COVERAGE" &&
          action.event_category !== "PERFORMANCE"
      ),
    [manualEventActions]
  );

  const allActions = useMemo(
    () => [...workforceActions, ...operationsActions, ...generalActions],
    [generalActions, operationsActions, workforceActions]
  );

  const [eventCode, setEventCode] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [walkOnName, setWalkOnName] = useState("");
  const [note, setNote] = useState("");
  const [deliveryActionCode, setDeliveryActionCode] = useState("DELIVERY_NOTE");
  const [assistingRouteId, setAssistingRouteId] = useState("");
  const [receivingRouteId, setReceivingRouteId] = useState("");
  const [assistStopCount, setAssistStopCount] = useState("");

  const selected = useMemo(() => {
    return allActions.find((option) => option.event_code === eventCode) ?? allActions[0] ?? null;
  }, [allActions, eventCode]);

  const targetOptions = useMemo(() => {
    if (!selected) return [];

    if (selected.targetMode === "scheduled_person") return scheduledWorkforce;
    if (selected.targetMode === "unscheduled_driver") return unscheduledDrivers;
    if (selected.targetMode === "route") return availableRoutes;
    if (selected.targetMode === "active_route") return activeRoutes;

    return [];
  }, [activeRoutes, availableRoutes, scheduledWorkforce, selected, unscheduledDrivers]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    const needsTarget =
      selected.targetMode !== "none" && selected.targetMode !== "walk_on_name";
    if (needsTarget && !selectedTargetId) return;
    if (selected.targetMode === "walk_on_name" && !walkOnName.trim()) return;
    if (selected.requiresNote && !note.trim()) return;

    const selectedPerson =
      selected.targetMode === "scheduled_person" || selected.targetMode === "unscheduled_driver"
        ? (targetOptions as DispatchPerson[]).find(
            (person) => person.roster_member_id === selectedTargetId
          ) ?? null
        : null;

    const selectedRoute =
      selected.targetMode === "route" || selected.targetMode === "active_route"
        ? (targetOptions as DispatchRoute[]).find(
            (route) => route.route_key === selectedTargetId
          ) ?? null
        : null;

    await onSubmit({
      event_code: selected.event_code,
      event_label: selected.event_label,
      event_category: selected.event_category,
      note,
      person_roster_member_id: selectedPerson?.roster_member_id ?? null,
      person_name: selectedPerson?.full_name ?? null,
      route_key: selectedRoute?.route_key ?? null,
      route_label: selectedRoute ? routeDropdownLabel(selectedRoute) : null,
      walk_on_full_name:
        selected.targetMode === "walk_on_name" ? walkOnName.trim() : null,
      event_payload:
        selected.kind === "add_walk_on"
          ? {
              source: "dispatch_action_overlay",
              assignment_source: "WALK_ON",
            }
          : selected.kind === "add_route" && selectedRoute
          ? {
              route_name: selectedRoute.route_name,
              current_wa_num: selectedRoute.current_wa_num,
              route_location: selectedRoute.route_location,
              route_type: selectedRoute.route_type ?? "ADDED",
              source: "dispatch_action_overlay",
            }
          : selected.event_code === "REMOVE_ROUTE" && selectedRoute
            ? {
                route_name: selectedRoute.route_name,
                current_wa_num: selectedRoute.current_wa_num,
                route_location: selectedRoute.route_location,
                route_type: selectedRoute.route_type,
                removed_driver_name: selectedRoute.driver?.full_name ?? null,
                removed_helpers: selectedRoute.helpers.map((person) => person.full_name),
                source: "dispatch_action_overlay",
              }
            : selected.kind === "add_driver" && selectedPerson
            ? {
                worker_type: selectedPerson.worker_type,
                source: "dispatch_action_overlay",
              }
            : {
                source: "dispatch_action_overlay",
              },
    });

    setEventCode("");
    setSelectedTargetId("");
    setWalkOnName("");
    setNote("");
  }

  async function handleDeliverySubmit(e: React.FormEvent) {
    e.preventDefault();

    if (deliveryActionCode === "DELIVERY_NOTE") {
      if (!note.trim()) return;

      await onSubmit({
        event_code: "DELIVERY_NOTE",
        event_label: "Delivery note",
        event_category: "DELIVERY",
        note: note.trim(),
        person_roster_member_id: null,
        person_name: null,
        event_payload: {
          phase: "delivery",
          source: "delivery_action_overlay",
        },
      });
      setNote("");
      return;
    }

    const assistingRoute = activeRoutes.find(
      (route) => route.route_key === assistingRouteId
    );
    const receivingRoute = activeRoutes.find(
      (route) => route.route_key === receivingRouteId
    );
    const stopCount = Number(assistStopCount);

    if (
      !assistingRoute ||
      !receivingRoute ||
      assistingRoute.route_key === receivingRoute.route_key ||
      !Number.isInteger(stopCount) ||
      stopCount < 1
    ) {
      return;
    }

    await onSubmit({
      event_code: "DRIVER_ASSIST",
      event_label: "Driver assist",
      event_category: "DELIVERY",
      note: "",
      person_roster_member_id: null,
      person_name: null,
      from_route_key: assistingRoute.route_key,
      from_route_label: routeDropdownLabel(assistingRoute),
      to_route_key: receivingRoute.route_key,
      to_route_label: routeDropdownLabel(receivingRoute),
      event_payload: {
        phase: "delivery",
        source: "delivery_action_overlay",
        stop_count: stopCount,
      },
    });
    setAssistingRouteId("");
    setReceivingRouteId("");
    setAssistStopCount("");
  }

  function renderActionColumn(title: string, actions: DispatchActionOption[]) {
    return (
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <p className="eyebrow" style={{ marginBottom: 0 }}>
          {title}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions.map((option) => (
            <button
              key={option.event_code}
              type="button"
              style={option.event_code === selected?.event_code ? selectedButton : compactButton}
              onClick={() => {
                setEventCode(option.event_code);
                setSelectedTargetId("");
                setWalkOnName("");
              }}
            >
              {option.event_label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <section
        style={{
          width: "min(920px, 100%)",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
          padding: 18,
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="eyebrow">{phase === "dispatch" ? "Dispatch action" : "Delivery action"}</p>
            <h2 className="app-card__title">
              {phase === "dispatch" ? "Manage the sort and handoff" : "Manage delivery context"}
            </h2>
            <p className="app-card__body">
              {phase === "dispatch"
                ? "Choose an action, link the right person or route when needed, or hand the operation to Delivery."
                : "Choose a delivery-relevant action, link the right person or route, then add context."}
            </p>
          </div>

          <button type="button" style={compactButton} onClick={onClose}>
            Close
          </button>
        </div>

        {phase === "dispatch" ? (
        <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 16 }}>
          <section style={{ display: "grid", gap: 10 }}>
            <p className="eyebrow">Step 1 · Choose action type</p>

            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              {renderActionColumn("Workforce actions", workforceActions)}
              {renderActionColumn("Operations actions", operationsActions)}
              {renderActionColumn("General actions", generalActions)}
            </div>
          </section>

          <section style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>
              Step 2 · Link item{" "}
              {selected?.targetMode === "none" ? "(not required)" : "(required)"}
            </label>

            {selected?.targetMode === "walk_on_name" ? (
              <input
                value={walkOnName}
                onChange={(e) => setWalkOnName(e.target.value)}
                required
                placeholder="Enter walk-on driver full name"
                style={{
                  height: 42,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid #d6dfeb",
                  background: "#fff",
                }}
              />
            ) : selected?.targetMode === "none" ? (
              <div
                style={{
                  minHeight: 42,
                  display: "grid",
                  alignItems: "center",
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid #d6dfeb",
                  color: "#64748b",
                }}
              >
                No linked person or route required for this action.
              </div>
            ) : (
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                required
                style={{
                  height: 42,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid #d6dfeb",
                  background: "#fff",
                }}
              >
                <option value="">
                  {selected?.targetMode === "route"
                    ? "Select available route"
                    : selected?.targetMode === "active_route"
                      ? "Select route to remove"
                      : selected?.targetMode === "unscheduled_driver"
                      ? "Select unscheduled driver"
                      : "Select scheduled worker"}
                </option>

                {selected?.targetMode === "route" || selected?.targetMode === "active_route"
                  ? (targetOptions as DispatchRoute[]).map((route, index) => (
                      <option
                        key={`${route.route_key}:${route.current_wa_num ?? ""}:${route.route_name ?? ""}:${index}`}
                        value={route.route_key}
                      >
                        {routeDropdownLabel(route) || cleanRouteKey(route.route_name)}
                      </option>
                    ))
                  : (targetOptions as DispatchPerson[]).map((person) => (
                      <option key={person.roster_member_id} value={person.roster_member_id}>
                        {person.full_name} · {person.worker_type || "Worker"}
                      </option>
                    ))}
              </select>
            )}
          </section>

          {selected ? (
            <p className="app-card__body">
              {selected.targetMode === "scheduled_person"
                ? "This action links to scheduled workforce. "
                : selected.targetMode === "walk_on_name"
                  ? "This action creates a Candidate roster record for a walk-on driver verified by the operator. "
                : selected.targetMode === "unscheduled_driver"
                  ? "This action adds a non-scheduled driver into today's dispatch pool. "
                  : selected.targetMode === "route"
                    ? "This action adds an available route into today's dispatch board. "
                    : selected.targetMode === "active_route"
                      ? "This action removes a route from today's dispatch board. "
                      : "This action does not require a linked item. "}
              {selected.requiresNote ? "A note is required. " : "Note is optional. "}
              Category: {categoryLabel(selected.event_category)}
            </p>
          ) : null}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={selected?.requiresNote ? "Required note" : "Optional note or dispatch context"}
            required={Boolean(selected?.requiresNote)}
            rows={5}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 14,
              border: "1px solid #d6dfeb",
              font: "inherit",
              resize: "vertical",
            }}
          />

          <div className="cta-row" style={{ marginTop: 0 }}>
            <button type="submit" className="button button-primary" disabled={saving || !selected}>
              {saving ? "Saving..." : "Save action"}
            </button>

            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
        ) : (
          <section style={{ marginTop: 18, display: "grid", gap: 14 }}>
            {onReturnToDispatch ? (
              <div
                style={{
                  border: "1px solid #d6dfeb",
                  borderRadius: 14,
                  background: "#f8fafc",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>Return to Dispatch</strong>
                  <p className="app-card__body" style={{ marginBottom: 0 }}>
                    Change the working frame back to Dispatch. Existing events and adjustments remain intact.
                  </p>
                </div>
                <button
                  type="button"
                  className="button"
                  disabled={handoffSaving || saving}
                  onClick={() => void onReturnToDispatch()}
                >
                  {handoffSaving ? "Returning…" : "Return to dispatch"}
                </button>
              </div>
            ) : null}

            <form
              onSubmit={handleDeliverySubmit}
              style={{ display: "grid", gap: 16 }}
            >
              <section style={{ display: "grid", gap: 10 }}>
                <p className="eyebrow">Step 1 · Choose action type</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    ["DELIVERY_NOTE", "Delivery note"],
                    ["DRIVER_ASSIST", "Driver assist"],
                  ].map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      style={
                        deliveryActionCode === code
                          ? selectedButton
                          : compactButton
                      }
                      onClick={() => {
                        setDeliveryActionCode(code);
                        setNote("");
                        setAssistingRouteId("");
                        setReceivingRouteId("");
                        setAssistStopCount("");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {deliveryActionCode === "DELIVERY_NOTE" ? (
                <section style={{ display: "grid", gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>
                    Delivery note
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter delivery context"
                    required
                    rows={5}
                    style={{
                      width: "100%",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid #d6dfeb",
                      font: "inherit",
                      resize: "vertical",
                    }}
                  />
                </section>
              ) : (
                <section
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#64748b" }}>
                    Route assisting
                    <select
                      value={assistingRouteId}
                      onChange={(e) => setAssistingRouteId(e.target.value)}
                      required
                      style={{ height: 42, padding: "0 12px", borderRadius: 12, border: "1px solid #d6dfeb", background: "#fff" }}
                    >
                      <option value="">Select assisting route</option>
                      {activeRoutes.map((route, index) => (
                        <option key={`assist:${route.route_key}:${index}`} value={route.route_key}>
                          {routeDropdownLabel(route) || route.route_key}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#64748b" }}>
                    Route receiving assistance
                    <select
                      value={receivingRouteId}
                      onChange={(e) => setReceivingRouteId(e.target.value)}
                      required
                      style={{ height: 42, padding: "0 12px", borderRadius: 12, border: "1px solid #d6dfeb", background: "#fff" }}
                    >
                      <option value="">Select receiving route</option>
                      {activeRoutes.map((route, index) => (
                        <option key={`receive:${route.route_key}:${index}`} value={route.route_key}>
                          {routeDropdownLabel(route) || route.route_key}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#64748b" }}>
                    Stop count
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={assistStopCount}
                      onChange={(e) => setAssistStopCount(e.target.value)}
                      required
                      placeholder="Stops transferred"
                      style={{ height: 42, padding: "0 12px", borderRadius: 12, border: "1px solid #d6dfeb", background: "#fff" }}
                    />
                  </label>

                  {assistingRouteId && assistingRouteId === receivingRouteId ? (
                    <p style={{ margin: 0, color: "#b45309", fontSize: 12 }}>
                      Assisting and receiving routes must be different.
                    </p>
                  ) : null}
                </section>
              )}

              <div className="cta-row" style={{ marginTop: 0 }}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={
                    saving ||
                    (deliveryActionCode === "DELIVERY_NOTE"
                      ? !note.trim()
                      : !assistingRouteId ||
                        !receivingRouteId ||
                        assistingRouteId === receivingRouteId ||
                        !Number.isInteger(Number(assistStopCount)) ||
                        Number(assistStopCount) < 1)
                  }
                >
                  {saving ? "Saving..." : "Save delivery action"}
                </button>
                <button type="button" className="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {phase === "dispatch" && onHandoffToDelivery ? (
          <section
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid #e6edf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <p className="eyebrow" style={{ marginBottom: 4 }}>Operational handoff</p>
              <strong>Move today’s operation into Delivery</strong>
              <p className="app-card__body" style={{ marginBottom: 0 }}>
                Sets the operation’s working phase to Delivery while preserving the event history.
              </p>
            </div>
            <button
              type="button"
              className="button"
              onClick={() => void onHandoffToDelivery()}
              disabled={handoffSaving || saving}
            >
              {handoffSaving ? "Handing off…" : "Handoff to delivery"}
            </button>
          </section>
        ) : null}

        {onPrepareCorrectiveAction ? (
          <section style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e6edf5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: 4 }}>People follow-up</p>
              <strong>Prepare Corrective Action Notice</strong>
              <p className="app-card__body" style={{ marginBottom: 0 }}>Open a separate evidence-ready record without blocking dispatch or delivery adjustments.</p>
            </div>
            <button type="button" className="button" onClick={onPrepareCorrectiveAction}>Prepare CAN</button>
          </section>
        ) : null}
      </section>
    </div>
  );
}
