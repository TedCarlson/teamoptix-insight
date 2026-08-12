"use client";

import { useEffect, useMemo, useState } from "react";
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

type ActionGroupKey =
  | "route_staffing"
  | "workforce"
  | "route_operations"
  | "delivery_support"
  | "notes_context";

const actionGroupCopy: Record<ActionGroupKey, { label: string; detail: string }> = {
  route_staffing: { label: "Route staffing", detail: "Assign or clear route seats" },
  workforce: { label: "Workforce", detail: "Arrival, call-out, no-show, and staffing-pool events" },
  route_operations: { label: "Route operations", detail: "Add, remove, transfer, or flag a route" },
  delivery_support: { label: "Delivery support", detail: "Record assistance between active routes" },
  notes_context: { label: "Notes and context", detail: "Record operational or delivery context" },
};

const routeStaffingCodes = new Set([
  "ASSIGN_DRIVER",
  "UNASSIGN_DRIVER",
  "ASSIGN_HELPER",
  "UNASSIGN_HELPER",
  "ASSIGN_TRAINEE",
  "UNASSIGN_TRAINEE",
]);

function dispatchActionGroup(action: DispatchActionOption): ActionGroupKey {
  const category = action.event_category.toUpperCase();
  if (routeStaffingCodes.has(action.event_code) || category === "ASSIGNMENT") return "route_staffing";
  if (action.kind === "add_driver" || action.kind === "add_walk_on" || category === "WORKFORCE") return "workforce";
  if (["OPERATIONS", "COVERAGE", "PERFORMANCE"].includes(category)) return "route_operations";
  return "notes_context";
}

const dispatchGroupOrder: ActionGroupKey[] = [
  "route_staffing",
  "workforce",
  "route_operations",
  "notes_context",
];

const deliveryActionOptions = [
  { code: "DRIVER_ASSIST", label: "Driver assist", group: "delivery_support" as const },
  { code: "DELIVERY_NOTE", label: "Delivery note", group: "notes_context" as const },
];

type DispatchEventOverlayProps = {
  slug: string;
  serviceDate: string;
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
  onPrepareCorrectiveAction?: (phase: "dispatch" | "delivery") => void;
  supplementalCollectionAction?: {
    label: string;
    saving: boolean;
    error?: string | null;
    onAction: () => Promise<void> | void;
  };
  onClose: () => void;
  onSubmit: (payload: {
    action_phase: "dispatch" | "delivery";
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
    walk_on_record_mode?: "CANDIDATE" | "WALK_ON";
    walk_on_roster_member_id?: string | null;
    walk_on_dswid?: string | null;
    walk_on_workforce_unit_id?: string | null;
    walk_on_new_workforce_unit_name?: string | null;
    walk_on_service_date?: string | null;
  }) => Promise<void>;
};

type WalkOnRosterOption = {
  roster_member_id: string;
  full_name: string;
  dswid: string | null;
  workforce_unit_id: string | null;
  workforce_unit_name: string | null;
};

type WalkOnWorkforceUnitOption = {
  workforce_unit_id: string;
  unit_name: string;
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
    targetMode: event.requires_route
      ? "active_route"
      : event.requires_person
        ? "scheduled_person"
        : "none",
  };
}

function routeDropdownLabel(route: DispatchRoute) {
  return [route.current_wa_num, route.route_name].filter(Boolean).join(" · ");
}

export function DispatchEventOverlay(props: DispatchEventOverlayProps) {
  const {
    slug,
    serviceDate,
    open,
    saving,
    eventTypes,
    scheduledWorkforce,
    unscheduledDrivers,
    availableRoutes,
    activeRoutes,
    phase: defaultPhase = "dispatch",
    handoffSaving = false,
    onHandoffToDelivery,
    onReturnToDispatch,
    onPrepareCorrectiveAction,
    supplementalCollectionAction,
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

  const [selectedPhase, setSelectedPhase] = useState<"dispatch" | "delivery">(defaultPhase);

  const workforceActions = useMemo(
    () =>
      selectedPhase === "dispatch"
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
    [manualEventActions, selectedPhase]
  );

  const operationsActions = useMemo(
    () =>
      selectedPhase === "dispatch"
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
    [manualEventActions, selectedPhase]
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

  const [actionGroup, setActionGroup] = useState<ActionGroupKey | "">("");
  const [eventCode, setEventCode] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [walkOnName, setWalkOnName] = useState("");
  const [walkOnDswid, setWalkOnDswid] = useState("");
  const [walkOnRecordChoice, setWalkOnRecordChoice] = useState<
    "EXISTING" | "NEW" | "CANDIDATE"
  >("EXISTING");
  const [walkOnRosterId, setWalkOnRosterId] = useState("");
  const [walkOnWorkforceUnitId, setWalkOnWorkforceUnitId] = useState("");
  const [newWalkOnWorkforceUnit, setNewWalkOnWorkforceUnit] = useState("");
  const [walkOnServiceDate, setWalkOnServiceDate] = useState(serviceDate);
  const [walkOnRoster, setWalkOnRoster] = useState<WalkOnRosterOption[]>([]);
  const [walkOnWorkforceUnits, setWalkOnWorkforceUnits] = useState<
    WalkOnWorkforceUnitOption[]
  >([]);
  const [walkOnLookupError, setWalkOnLookupError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [deliveryActionCode, setDeliveryActionCode] = useState("");
  const [assistingRouteId, setAssistingRouteId] = useState("");
  const [receivingRouteId, setReceivingRouteId] = useState("");
  const [assistStopCount, setAssistStopCount] = useState("");
  const [receivingCsa, setReceivingCsa] = useState("");

  function choosePhase(nextPhase: "dispatch" | "delivery") {
    setSelectedPhase(nextPhase);
    setActionGroup("");
    setEventCode("");
    setSelectedTargetId("");
    setNote("");
    setDeliveryActionCode("");
    setAssistingRouteId("");
    setReceivingRouteId("");
    setAssistStopCount("");
  }

  const selected = useMemo(() => {
    return allActions.find((option) => option.event_code === eventCode) ?? null;
  }, [allActions, eventCode]);

  const actionGroups = useMemo(
    () => dispatchGroupOrder
      .filter((group) => allActions.some((action) => dispatchActionGroup(action) === group))
      .map((group) => ({ group, ...actionGroupCopy[group] })),
    [allActions]
  );

  const filteredActions = useMemo(
    () => actionGroup
      ? allActions.filter((action) => dispatchActionGroup(action) === actionGroup)
      : [],
    [actionGroup, allActions]
  );

  const deliveryGroups = useMemo(
    () => (["delivery_support", "notes_context"] as ActionGroupKey[])
      .filter((group) => deliveryActionOptions.some((action) => action.group === group))
      .map((group) => ({ group, ...actionGroupCopy[group] })),
    []
  );

  const filteredDeliveryActions = actionGroup
    ? deliveryActionOptions.filter((action) => action.group === actionGroup)
    : [];

  useEffect(() => {
    setWalkOnServiceDate(serviceDate);
  }, [serviceDate]);

  useEffect(() => {
    if (!open || !slug) return;

    let active = true;
    setWalkOnLookupError(null);

    void fetch(`/api/company/${slug}/dispatch/walk-on`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load walk-on roster.");
        }
        if (!active) return;

        const nextRoster = Array.isArray(payload?.walk_ons)
          ? (payload.walk_ons as WalkOnRosterOption[])
          : [];
        const nextUnits = Array.isArray(payload?.workforce_units)
          ? (payload.workforce_units as WalkOnWorkforceUnitOption[])
          : [];

        setWalkOnRoster(nextRoster);
        setWalkOnWorkforceUnits(nextUnits);
        setWalkOnRecordChoice(nextRoster.length > 0 ? "EXISTING" : "NEW");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setWalkOnLookupError(
          error instanceof Error ? error.message : "Failed to load walk-on roster."
        );
      });

    return () => {
      active = false;
    };
  }, [open, slug]);

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
    if (selected.targetMode === "walk_on_name") {
      if (!walkOnServiceDate) return;
      if (walkOnRecordChoice === "EXISTING" && !walkOnRosterId) return;
      if (walkOnRecordChoice === "CANDIDATE" && !walkOnName.trim()) return;
      if (
        walkOnRecordChoice === "NEW" &&
        (!walkOnName.trim() || !walkOnDswid.trim())
      ) return;
      if (
        walkOnRecordChoice !== "CANDIDATE" &&
        !walkOnWorkforceUnitId &&
        !newWalkOnWorkforceUnit.trim()
      ) return;
    }
    if (selected.requiresNote && !note.trim()) return;
    if (selected.event_code === "PASS_ROUTE_TO_CSA" && !receivingCsa.trim()) {
      return;
    }

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

    const selectedWalkOn = walkOnRoster.find(
      (person) => person.roster_member_id === walkOnRosterId
    );

    await onSubmit({
      action_phase: "dispatch",
      event_code: selected.event_code,
      event_label: selected.event_label,
      event_category: selected.event_category,
      note:
        selected.event_code === "PASS_ROUTE_TO_CSA" && !note.trim()
          ? `Passed to ${receivingCsa.trim()}.`
          : note,
      person_roster_member_id: selectedPerson?.roster_member_id ?? null,
      person_name: selectedPerson?.full_name ?? null,
      route_key: selectedRoute?.route_key ?? null,
      route_label: selectedRoute ? routeDropdownLabel(selectedRoute) : null,
      walk_on_full_name:
        selected.targetMode === "walk_on_name"
          ? selectedWalkOn?.full_name ?? walkOnName.trim()
          : null,
      walk_on_record_mode:
        selected.targetMode === "walk_on_name"
          ? walkOnRecordChoice === "CANDIDATE" ? "CANDIDATE" : "WALK_ON"
          : undefined,
      walk_on_roster_member_id:
        selected.targetMode === "walk_on_name" && walkOnRecordChoice === "EXISTING"
          ? walkOnRosterId
          : null,
      walk_on_dswid:
        selected.targetMode === "walk_on_name" && walkOnRecordChoice === "NEW"
          ? walkOnDswid.trim()
          : null,
      walk_on_workforce_unit_id:
        selected.targetMode === "walk_on_name" && walkOnRecordChoice !== "CANDIDATE"
          ? walkOnWorkforceUnitId || selectedWalkOn?.workforce_unit_id || null
          : null,
      walk_on_new_workforce_unit_name:
        selected.targetMode === "walk_on_name" && walkOnRecordChoice !== "CANDIDATE"
          ? newWalkOnWorkforceUnit.trim() || null
          : null,
      walk_on_service_date:
        selected.targetMode === "walk_on_name" ? walkOnServiceDate : null,
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
          : (selected.event_code === "REMOVE_ROUTE" ||
              selected.event_code === "PASS_ROUTE_TO_CSA") && selectedRoute
            ? {
                route_name: selectedRoute.route_name,
                current_wa_num: selectedRoute.current_wa_num,
                route_location: selectedRoute.route_location,
                route_type: selectedRoute.route_type,
                removed_driver_name: selectedRoute.driver?.full_name ?? null,
                removed_helpers: selectedRoute.helpers.map((person) => person.full_name),
                receiving_csa:
                  selected.event_code === "PASS_ROUTE_TO_CSA"
                    ? receivingCsa.trim()
                    : null,
                planning_ownership:
                  selected.event_code === "PASS_ROUTE_TO_CSA"
                    ? "ORIGINATING_CSA"
                    : null,
                dsw_tracking:
                  selected.event_code === "PASS_ROUTE_TO_CSA"
                    ? "RECEIVING_CSA"
                    : null,
                resource_relief:
                  selected.event_code === "PASS_ROUTE_TO_CSA" ? true : null,
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
    setWalkOnDswid("");
    setWalkOnRosterId("");
    setWalkOnWorkforceUnitId("");
    setNewWalkOnWorkforceUnit("");
    setWalkOnServiceDate(serviceDate);
    setReceivingCsa("");
    setNote("");
  }

  async function handleDeliverySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deliveryActionCode) return;

    if (deliveryActionCode === "DELIVERY_NOTE") {
      if (!note.trim()) return;

      await onSubmit({
        action_phase: "delivery",
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
      action_phase: "delivery",
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

  function renderSupplementalCollectionButton() {
    if (!supplementalCollectionAction) return null;

    return (
      <span style={{ display: "grid", gap: 5 }}>
        <button
          type="button"
          disabled={supplementalCollectionAction.saving}
          style={{
            ...compactButton,
            borderColor: "#059669",
            background: "#ecfdf5",
            color: "#047857",
          }}
          onClick={() => void supplementalCollectionAction.onAction()}
        >
          {supplementalCollectionAction.saving
            ? "Saving…"
            : supplementalCollectionAction.label}
        </button>
        {supplementalCollectionAction.error ? (
          <small role="alert" style={{ color: "#b91c1c", fontWeight: 800 }}>
            {supplementalCollectionAction.error}
          </small>
        ) : null}
      </span>
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
            <p className="eyebrow">Manager action</p>
            <h2 className="app-card__title">
              Manage today&apos;s operation
            </h2>
            <p className="app-card__body">
              {selectedPhase === "dispatch"
                ? "Choose a Dispatch action, then link only the person or route it needs."
                : "Choose a delivery-relevant action, link the right person or route, then add context."}
            </p>
          </div>

          <button type="button" style={compactButton} onClick={onClose}>
            Close
          </button>
        </div>

        <section style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <p className="eyebrow" style={{ marginBottom: 0 }}>Choose action phase</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 5, borderRadius: 14, background: "#f1f5f9" }}>
            {(["dispatch", "delivery"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                style={candidate === selectedPhase ? selectedButton : compactButton}
                onClick={() => choosePhase(candidate)}
              >
                {candidate === "dispatch" ? "Dispatch · Sort + handoff" : "Delivery · On-road work"}
              </button>
            ))}
          </div>
        </section>

        {selectedPhase === "dispatch" ? (
        <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 16 }}>
          <section style={{ display: "grid", gap: 10 }}>
            <p className="eyebrow">Step 1 · Choose action group</p>
            <select
              value={actionGroup}
              onChange={(event) => {
                setActionGroup(event.target.value as ActionGroupKey | "");
                setEventCode("");
                setSelectedTargetId("");
                setWalkOnName("");
                setNote("");
              }}
              className="workspace-select"
            >
              <option value="">Choose a primary group</option>
              {actionGroups.map((option) => (
                <option key={option.group} value={option.group}>
                  {option.label} · {option.detail}
                </option>
              ))}
            </select>
            {actionGroup ? (
              <>
                <p className="eyebrow" style={{ marginTop: 6 }}>Step 2 · Choose action</p>
                <select
                  value={eventCode}
                  onChange={(event) => {
                    setEventCode(event.target.value);
                    setSelectedTargetId("");
                    setWalkOnName("");
                    setNote("");
                  }}
                  className="workspace-select"
                >
                  <option value="">Choose an action</option>
                  {filteredActions.map((option) => (
                    <option key={option.event_code} value={option.event_code}>{option.event_label}</option>
                  ))}
                </select>
              </>
            ) : null}
            {supplementalCollectionAction ? <div>{renderSupplementalCollectionButton()}</div> : null}
          </section>

          {selected ? <section style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>
              Step 3 · Link item{" "}
              {selected?.targetMode === "none" ? "(not required)" : "(required)"}
            </label>

            {selected?.targetMode === "walk_on_name" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <select
                  value={walkOnRecordChoice}
                  onChange={(event) => {
                    setWalkOnRecordChoice(
                      event.target.value as "EXISTING" | "NEW" | "CANDIDATE"
                    );
                    setWalkOnRosterId("");
                  }}
                  className="workspace-select"
                >
                  <option value="EXISTING" disabled={walkOnRoster.length === 0}>
                    Choose existing walk-on
                  </option>
                  <option value="NEW">Add reusable walk-on</option>
                  <option value="CANDIDATE">Create candidate instead</option>
                </select>

                {walkOnRecordChoice === "EXISTING" ? (
                  <select
                    value={walkOnRosterId}
                    onChange={(event) => {
                      const rosterId = event.target.value;
                      const person = walkOnRoster.find(
                        (item) => item.roster_member_id === rosterId
                      );
                      setWalkOnRosterId(rosterId);
                      setWalkOnWorkforceUnitId(person?.workforce_unit_id ?? "");
                    }}
                    required
                    className="workspace-select"
                  >
                    <option value="">Select known walk-on</option>
                    {walkOnRoster.map((person) => (
                      <option key={person.roster_member_id} value={person.roster_member_id}>
                        {person.full_name} · {person.dswid || "DSWID missing"} · {person.workforce_unit_name || "Unit missing"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={walkOnName}
                    onChange={(event) => setWalkOnName(event.target.value)}
                    required
                    placeholder={
                      walkOnRecordChoice === "CANDIDATE"
                        ? "Candidate full name"
                        : "Walk-on driver full name"
                    }
                    className="workspace-input"
                  />
                )}

                {walkOnRecordChoice === "NEW" ? (
                  <input
                    value={walkOnDswid}
                    onChange={(event) => setWalkOnDswid(event.target.value)}
                    required
                    placeholder="Foreign DSWID, e.g. HEARNS,JAYLEN VIRGIL"
                    className="workspace-input"
                  />
                ) : null}

                {walkOnRecordChoice !== "CANDIDATE" ? (
                  <>
                    <select
                      value={walkOnWorkforceUnitId}
                      onChange={(event) => setWalkOnWorkforceUnitId(event.target.value)}
                      className="workspace-select"
                    >
                      <option value="">Choose known lending workforce unit</option>
                      {walkOnWorkforceUnits.map((unit) => (
                        <option key={unit.workforce_unit_id} value={unit.workforce_unit_id}>
                          {unit.unit_name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={newWalkOnWorkforceUnit}
                      onChange={(event) => setNewWalkOnWorkforceUnit(event.target.value)}
                      placeholder="Or add a new workforce unit, e.g. Derwood"
                      className="workspace-input"
                    />
                  </>
                ) : null}

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>Service date</span>
                  <input
                    type="date"
                    value={walkOnServiceDate}
                    max={serviceDate > new Date().toISOString().slice(0, 10) ? serviceDate : new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setWalkOnServiceDate(event.target.value)}
                    required
                    className="workspace-input"
                  />
                </label>

                {walkOnLookupError ? (
                  <span style={{ color: "#991b1b", fontWeight: 800 }}>
                    {walkOnLookupError}
                  </span>
                ) : null}
              </div>
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
                      ? selected.event_code === "PASS_ROUTE_TO_CSA"
                        ? "Select route to pass"
                        : "Select active route"
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

            {selected?.event_code === "PASS_ROUTE_TO_CSA" ? (
              <input
                value={receivingCsa}
                onChange={(event) => setReceivingCsa(event.target.value)}
                required
                maxLength={160}
                placeholder="Receiving CSA / company"
                className="workspace-input"
              />
            ) : null}
          </section> : null}

          {selected ? (
            <p className="app-card__body">
              {selected.targetMode === "scheduled_person"
                ? "This action links to scheduled workforce. "
                : selected.targetMode === "walk_on_name"
                  ? "Choose a reusable walk-on identity or explicitly create a candidate. Walk-ons stay outside the employee and hiring populations. "
                : selected.targetMode === "unscheduled_driver"
                  ? "This action adds a non-scheduled driver into today's dispatch pool. "
                  : selected.targetMode === "route"
                    ? "This action adds an available route into today's dispatch board. "
                    : selected.targetMode === "active_route"
                      ? selected.event_code === "PASS_ROUTE_TO_CSA"
                        ? "The route stays in our DRO plan, transfers to the receiving CSA for DSW, and no longer consumes our dispatch resources. "
                        : "This action updates an active route on today's dispatch board. "
                      : "This action does not require a linked item. "}
              {selected.requiresNote ? "A note is required. " : "Note is optional. "}
              Category: {categoryLabel(selected.event_category)}
            </p>
          ) : null}

          {selected ? <><label style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>
            Step {selected.targetMode === "none" ? 3 : 4} · Add context
          </label><textarea
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
          /></> : null}

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
            {supplementalCollectionAction ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p className="eyebrow" style={{ marginBottom: 0 }}>
                  General actions
                </p>
                <div>{renderSupplementalCollectionButton()}</div>
              </div>
            ) : null}
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
                <p className="eyebrow">Step 1 · Choose action group</p>
                <select
                  value={actionGroup}
                  onChange={(event) => {
                    setActionGroup(event.target.value as ActionGroupKey | "");
                    setDeliveryActionCode("");
                    setNote("");
                    setAssistingRouteId("");
                    setReceivingRouteId("");
                    setAssistStopCount("");
                  }}
                  className="workspace-select"
                >
                  <option value="">Choose a primary group</option>
                  {deliveryGroups.map((option) => (
                    <option key={option.group} value={option.group}>
                      {option.label} · {option.detail}
                    </option>
                  ))}
                </select>
                {actionGroup ? (
                  <>
                    <p className="eyebrow" style={{ marginTop: 6 }}>Step 2 · Choose action</p>
                    <select
                      value={deliveryActionCode}
                      onChange={(event) => {
                        setDeliveryActionCode(event.target.value);
                        setNote("");
                        setAssistingRouteId("");
                        setReceivingRouteId("");
                        setAssistStopCount("");
                      }}
                      className="workspace-select"
                    >
                      <option value="">Choose an action</option>
                      {filteredDeliveryActions.map((option) => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                  </>
                ) : null}
              </section>

              {deliveryActionCode === "DELIVERY_NOTE" ? (
                <section style={{ display: "grid", gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>
                    Step 3 · Add delivery context
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
              ) : deliveryActionCode === "DRIVER_ASSIST" ? (
                <section
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#64748b" }}>
                    Step 3 · Route assisting
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
                    Step 4 · Route receiving assistance
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
                    Step 5 · Stop count
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
              ) : null}

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

        {defaultPhase === "dispatch" && onHandoffToDelivery ? (
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
            <button type="button" className="button" onClick={() => onPrepareCorrectiveAction(selectedPhase)}>Prepare CAN</button>
          </section>
        ) : null}
      </section>
    </div>
  );
}
