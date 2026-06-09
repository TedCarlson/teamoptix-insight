"use client";

import { useMemo, useState } from "react";
import type {
  DispatchEventTypeRow,
  DispatchPerson,
  DispatchRoute,
} from "../lib/dispatchSupport";
import { cleanRouteKey, compactButton, selectedButton } from "../lib/dispatchSupport";

type DispatchActionKind = "event" | "add_driver" | "add_route";

type DispatchActionOption = {
  kind: DispatchActionKind;
  event_code: string;
  event_label: string;
  event_category: string;
  requiresNote: boolean;
  targetMode: "none" | "scheduled_person" | "unscheduled_driver" | "route";
};

type DispatchEventOverlayProps = {
  open: boolean;
  saving: boolean;
  eventTypes: DispatchEventTypeRow[];
  scheduledWorkforce: DispatchPerson[];
  unscheduledDrivers: DispatchPerson[];
  availableRoutes: DispatchRoute[];
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
    event_payload?: Record<string, unknown>;
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

const addRouteAction: DispatchActionOption = {
  kind: "add_route",
  event_code: "ADD_ROUTE",
  event_label: "Add route",
  event_category: "OPERATIONS",
  requiresNote: false,
  targetMode: "route",
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
    () => [
      addDriverAction,
      ...manualEventActions.filter((action) => action.event_category === "WORKFORCE"),
    ],
    [manualEventActions]
  );

  const operationsActions = useMemo(
    () => [
      addRouteAction,
      ...manualEventActions.filter(
        (action) =>
          action.event_category === "OPERATIONS" ||
          action.event_category === "COVERAGE" ||
          action.event_category === "PERFORMANCE"
      ),
    ],
    [manualEventActions]
  );

  const generalActions = useMemo(
    () =>
      manualEventActions.filter(
        (action) =>
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
  const [note, setNote] = useState("");

  const selected = useMemo(() => {
    return allActions.find((option) => option.event_code === eventCode) ?? allActions[0] ?? null;
  }, [allActions, eventCode]);

  const targetOptions = useMemo(() => {
    if (!selected) return [];

    if (selected.targetMode === "scheduled_person") return scheduledWorkforce;
    if (selected.targetMode === "unscheduled_driver") return unscheduledDrivers;
    if (selected.targetMode === "route") return availableRoutes;

    return [];
  }, [availableRoutes, scheduledWorkforce, selected, unscheduledDrivers]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    const needsTarget = selected.targetMode !== "none";
    if (needsTarget && !selectedTargetId) return;
    if (selected.requiresNote && !note.trim()) return;

    const selectedPerson =
      selected.targetMode === "scheduled_person" || selected.targetMode === "unscheduled_driver"
        ? (targetOptions as DispatchPerson[]).find(
            (person) => person.roster_member_id === selectedTargetId
          ) ?? null
        : null;

    const selectedRoute =
      selected.targetMode === "route"
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
      event_payload:
        selected.kind === "add_route" && selectedRoute
          ? {
              route_name: selectedRoute.route_name,
              current_wa_num: selectedRoute.current_wa_num,
              route_location: selectedRoute.route_location,
              route_type: selectedRoute.route_type ?? "ADDED",
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
    setNote("");
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
            <p className="eyebrow">Dispatch action</p>
            <h2 className="app-card__title">Add dispatch context</h2>
            <p className="app-card__body">
              Choose an action, link the right person or route when needed, then add context.
            </p>
          </div>

          <button type="button" style={compactButton} onClick={onClose}>
            Close
          </button>
        </div>

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

            {selected?.targetMode === "none" ? (
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
                    : selected?.targetMode === "unscheduled_driver"
                      ? "Select unscheduled driver"
                      : "Select scheduled worker"}
                </option>

                {selected?.targetMode === "route"
                  ? (targetOptions as DispatchRoute[]).map((route) => (
                      <option key={route.route_key} value={route.route_key}>
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
                : selected.targetMode === "unscheduled_driver"
                  ? "This action adds a non-scheduled driver into today's dispatch pool. "
                  : selected.targetMode === "route"
                    ? "This action adds an available route into today's dispatch board. "
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
      </section>
    </div>
  );
}
