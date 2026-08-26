import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import type { DriverAccessContext, ManagerAccessContext } from "../domain/access";
import {
  EMPTY_MANAGER_MESSAGE_DRAFT,
  managerMessageAudienceLabel,
  validateManagerMessageDraft,
  type ManagerMessageDraft,
  type ManagerMessagesSnapshot,
} from "../domain/managerMessages";
import {
  MANAGER_DISPATCH_ACTIONS,
  dispatchActionDefinition,
  dispatchActionDefinitions,
  validateDispatchAction,
  type ManagerDispatchActionCode,
  type ManagerDispatchActionDraft,
  type ManagerDispatchSnapshot,
} from "../domain/managerDispatch";
import {
  validateManagerDeliveryAction,
  type ManagerDeliveryActionCode,
  type ManagerDeliveryActionDraft,
  type ManagerRouteEvidenceSnapshot,
} from "../domain/managerOperations";
import type {
  ManagerCandidateStage,
  ManagerPeopleComplianceSignal,
  ManagerPeopleSnapshot,
  ManagerPerson,
} from "../domain/managerPeople";
import type {
  ManagerFleetSnapshot,
  ManagerFleetVehicle,
  ManagerFleetWorkOrderDraft,
} from "../domain/managerFleet";
import {
  MANAGER_ROUTE_DAYS,
  emptyManagerRouteDraft,
  managerRouteDraft,
  validateManagerRouteDraft,
  type ManagerRoute,
  type ManagerRouteDraft,
  type ManagerRoutesSnapshot,
} from "../domain/managerRoutes";
import type {
  ManagerScheduleOverride,
  ManagerSchedulePreset,
  ManagerCapacitySignal,
  ManagerScheduleDay,
  ManagerScheduleRow,
  ManagerScheduleSnapshot,
  ManagerScheduleWorkbenchRow,
  ManagerTimeOffRequest,
} from "../domain/managerSchedule";
import { capacitySignalLabel } from "../domain/managerSchedule";
import type {
  ManagerScheduleBaselineDraft,
  ManagerScheduleOverrideDraft,
  ManagerSchedulePresetDraft,
} from "../data/managerSchedule";
import {
  validateManagerWalkOnAssignment,
  validateManagerWalkOnIdentity,
  type ManagerWalkOnAssignmentDraft,
  type ManagerWalkOnIdentityDraft,
  type ManagerWalkOnPerson,
  type ManagerWalkOnSnapshot,
} from "../domain/managerWalkOns";
import {
  managerWorkspaceSuite,
  managerWorkspaceSuites,
  type ManagerOperationsPhase,
  type ManagerOperationsRoute,
  type ManagerWorkspaceChildKey,
  type ManagerWorkspaceChild,
  type ManagerWorkspaceKey,
  type ManagerWorkspaceSnapshot,
  type ManagerWorkspaceSuite,
  type ManagerWorkspaceTone,
} from "../domain/managerWorkspace";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";
import { IntentVerificationModal } from "../components/IntentVerificationModal";
import { colors } from "../theme";

export type ManagerTabKey = "today" | "schedule" | "workspaces" | "inspect" | "messages";

function formatEventTime(value: string | null, timeZone: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

function AccessTile(props: {
  code: string;
  detail: string;
  label: string;
  attention?: boolean;
  onPress: () => void;
  trailing?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.accessTile,
        props.attention && styles.accessTileAttention,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.accessCode, props.attention && styles.accessCodeAttention]}>
        <Text style={[styles.accessCodeText, props.attention && styles.accessCodeTextAttention]}>{props.code}</Text>
      </View>
      <View style={styles.accessCopy}>
        <Text style={sharedStyles.bodyStrong}>{props.label}</Text>
        <Text style={styles.detail}>{props.detail}</Text>
      </View>
      {props.trailing ? <Text style={styles.trailing}>{props.trailing}</Text> : null}
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

function ManagerPulse(props: { context: ManagerAccessContext }) {
  return (
    <View style={styles.pulse}>
      <View style={styles.pulseHeader}>
        <Text style={styles.pulseLabel}>Manager pulse</Text>
        <View style={styles.successChip}>
          <View style={styles.successDot} />
          <Text style={styles.successText}>Access matched</Text>
        </View>
      </View>
      <View style={styles.pulseStats}>
        <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Workspaces</Text><Text style={styles.pulseStatValue}>{props.context.grants.length}</Text></View>
        <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Company</Text><Text numberOfLines={1} style={styles.pulseStatValue}>1 active</Text></View>
        <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Context</Text><Text style={styles.pulseStatValue}>Manager</Text></View>
      </View>
    </View>
  );
}

export function ManagerHomeScreen(props: {
  context: ManagerAccessContext;
  onOpenSchedule: () => void;
  onOpenWorkspaces: () => void;
  onOpenOperations: () => void;
  onSettings: () => void;
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;
  const hasSchedule = props.context.grants.includes("schedule");
  const hasOperations = props.context.grants.some((grant) =>
    ["dispatch", "planning", "delivery_window", "operations_uploads", "reports"].includes(grant),
  );
  return (
    <Screen>
      <AppHeader
        companyName={props.context.company_name}
        eyebrow="INSIGHT · MANAGER"
        onSettings={props.onSettings}
        title="Today"
      />
      <ManagerPulse context={props.context} />
      <View style={[styles.managerHomeGrid, isTablet && styles.managerHomeGridTablet]}>
        <View style={styles.managerHomeColumn}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Priority work</Text>
            <Text style={styles.sectionMeta}>{props.context.grants.length} TOOLS</Text>
          </View>
          {hasSchedule ? (
            <AccessTile code="SC" detail="Coverage, personal requests, and management tools" label="Schedule" onPress={props.onOpenSchedule} />
          ) : null}
          {hasOperations ? (
            <AccessTile code="OP" detail="Dispatch posture and delivery window" label="Operations" onPress={props.onOpenOperations} />
          ) : null}
        </View>
        <View style={styles.managerHomeColumn}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Your access</Text>
            <Text style={styles.sectionMeta}>GRANT-MATCHED</Text>
          </View>
          <AccessTile
            code={String(props.context.grants.length)}
            detail="People, Fleet, Routes, Admin, and more"
            label="All workspaces"
            onPress={props.onOpenWorkspaces}
          />
        </View>
      </View>
    </Screen>
  );
}

export type ManagerScheduleSurface = "bridge" | "overview" | "calendar" | "workbench" | "overrides" | "presets";

function readableDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", options ?? { month: "short", day: "numeric" })
    .format(new Date(year, month - 1, day, 12));
}

function dayInitial(value: string) {
  return readableDate(value, { weekday: "narrow" });
}

function statusTone(signal: ManagerCapacitySignal) {
  if (signal === "SERVICE_RISK" || signal === "PROFITABILITY_RISK") return styles.statusGap;
  if (signal === "NO_CONTINGENCY" || signal === "LABOR_HIGH") return styles.statusTight;
  if (signal === "NO_OPERATION") return styles.statusNeutral;
  return styles.statusCovered;
}

function WeekNavigator(props: {
  snapshot: ManagerScheduleSnapshot | null;
  onNextWeek: () => void;
  onPreviousWeek: () => void;
  monthly?: boolean;
}) {
  return (
    <View style={styles.weekNavigator}>
      <Pressable accessibilityLabel={props.monthly ? "Previous month" : "Previous week"} onPress={props.onPreviousWeek} style={styles.weekArrow}>
        <Text style={styles.weekArrowText}>‹</Text>
      </Pressable>
      <View style={styles.weekCopy}>
        <Text style={styles.weekEyebrow}>{props.monthly ? "OPERATING MONTH" : "OPERATING WEEK"}</Text>
        <Text style={styles.weekTitle}>
          {props.snapshot
            ? props.monthly
              ? readableDate(props.snapshot.days[15]?.serviceDate ?? props.snapshot.weekStart, { month: "long", year: "numeric" })
              : `${readableDate(props.snapshot.weekStart)} – ${readableDate(props.snapshot.weekEnd)}`
            : "Loading week…"}
        </Text>
      </View>
      <Pressable accessibilityLabel={props.monthly ? "Next month" : "Next week"} onPress={props.onNextWeek} style={styles.weekArrow}>
        <Text style={styles.weekArrowText}>›</Text>
      </Pressable>
    </View>
  );
}

function ScheduleLoading(props: { error: string | null; loading: boolean; onRetry: () => void }) {
  if (props.loading) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color={colors.primary} />
        <Text style={sharedStyles.muted}>Resolving schedule authority and operating facts…</Text>
      </View>
    );
  }
  if (props.error) {
    return (
      <Card tone="danger">
        <Text style={sharedStyles.bodyStrong}>Schedule data needs another try</Text>
        <Text style={sharedStyles.muted}>{props.error}</Text>
        <PrimaryButton compact label="Retry" onPress={props.onRetry} secondary />
      </Card>
    );
  }
  return null;
}

function PostureCard(props: { snapshot: ManagerScheduleSnapshot }) {
  const risks = props.snapshot.days.filter(
    (day) => day.signal === "SERVICE_RISK" || day.signal === "PROFITABILITY_RISK",
  ).length;
  const cautions = props.snapshot.days.filter(
    (day) => day.signal === "NO_CONTINGENCY" || day.signal === "LABOR_HIGH",
  ).length;
  const routes = Math.max(...props.snapshot.days.map((day) => day.routeDemand), 0);
  return (
    <View style={styles.pulse}>
      <View style={styles.pulseHeader}>
        <Text style={styles.pulseLabel}>{props.snapshot.days.length > 7 ? "Calendar posture" : "Week posture"}</Text>
        <View style={[styles.postureChip, risks > 0 ? styles.postureChipDanger : styles.postureChipSuccess]}>
          <View style={[styles.successDot, risks > 0 && styles.dangerDot]} />
          <Text style={[styles.successText, risks > 0 && styles.dangerText]}>
            {risks > 0 ? `${risks} risk day${risks === 1 ? "" : "s"}` : cautions > 0 ? `${cautions} caution day${cautions === 1 ? "" : "s"}` : "Target posture"}
          </Text>
        </View>
      </View>
      <View style={styles.pulseStats}>
        <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Drivers</Text><Text style={styles.pulseStatValue}>{Math.max(...props.snapshot.days.map((day) => day.scheduledDrivers), 0)}</Text></View>
        <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Routes</Text><Text style={styles.pulseStatValue}>{routes}</Text></View>
        <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>PTO</Text><Text style={styles.pulseStatValue}>{props.snapshot.pendingRequests.length} pending</Text></View>
      </View>
    </View>
  );
}

function CoverageRail(props: { days: ManagerScheduleDay[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverageRail}>
      {props.days.map((day) => (
        <View key={day.serviceDate} style={[styles.coverageDay, statusTone(day.signal)]}>
          <Text style={styles.coverageDayLabel}>{dayInitial(day.serviceDate)}</Text>
          <Text style={styles.coverageDayDate}>{readableDate(day.serviceDate, { day: "numeric" })}</Text>
          <Text style={styles.coverageDelta}>{day.capacityDelta > 0 ? `+${day.capacityDelta}` : day.capacityDelta}</Text>
          <Text style={styles.coverageStatus}>{capacitySignalLabel(day.signal)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function localIsoDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function traineeScheduleDetail(row: ManagerScheduleRow) {
  if (row.planned_on) return row.route_name?.trim() || "Scheduled";
  return row.override_type
    ? row.override_type.replaceAll("_", " ").toLowerCase()
    : "Scheduled off";
}

function TabletScheduleCalendar(props: { days: ManagerScheduleDay[] }) {
  const today = localIsoDate();
  const initialDate = props.days.find((day) => day.serviceDate === today)?.serviceDate
    ?? props.days[0]?.serviceDate
    ?? null;
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const selectedDay = props.days.find((day) => day.serviceDate === selectedDate)
    ?? props.days[0]
    ?? null;

  if (!selectedDay) return null;

  return (
    <>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionLabel}>Operating calendar</Text>
        <Text style={styles.sectionMeta}>WEB-ALIGNED · 6 WEEKS</Text>
      </View>
      <View style={styles.tabletCalendarGrid}>
        {props.days.map((day) => {
          const selected = day.serviceDate === selectedDay.serviceDate;
          const isToday = day.serviceDate === today;
          const changes = day.overrideOffRows.length;
          return (
            <Pressable
              accessibilityLabel={`${readableDate(day.serviceDate, { weekday: "long", month: "long", day: "numeric" })}, ${capacitySignalLabel(day.signal)}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={day.serviceDate}
              onPress={() => setSelectedDate(day.serviceDate)}
              style={({ pressed }) => [
                styles.tabletCalendarDay,
                statusTone(day.signal),
                selected && styles.tabletCalendarDaySelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.tabletCalendarDateRow}>
                <View>
                  <Text style={styles.tabletCalendarWeekday}>{readableDate(day.serviceDate, { weekday: "short" }).toUpperCase()}</Text>
                  <Text style={styles.tabletCalendarDate}>{readableDate(day.serviceDate, { day: "numeric" })}</Text>
                </View>
                {isToday ? <Text style={styles.tabletToday}>TODAY</Text> : null}
              </View>
              <View style={styles.tabletCalendarMetrics}>
                <Text style={styles.tabletCalendarMetric}><Text style={styles.tabletCalendarMetricValue}>{day.routeDemand}</Text> routes</Text>
                <Text style={styles.tabletCalendarMetric}><Text style={styles.tabletCalendarMetricValue}>{day.scheduledDrivers}</Text> drivers</Text>
              </View>
              <View style={styles.tabletCalendarCounts}>
                <Text style={styles.tabletCalendarCount}>{day.baselineScheduledOffDrivers.length} Sch Off</Text>
                <Text style={styles.tabletCalendarCount}>{changes} change{changes === 1 ? "" : "s"}</Text>
                <Text style={styles.tabletCalendarCount}>{day.traineeRows.length} trainee{day.traineeRows.length === 1 ? "" : "s"}</Text>
              </View>
              <View style={styles.tabletCalendarSignalRow}>
                <Text style={styles.tabletCalendarDelta}>{day.capacityDelta > 0 ? `+${day.capacityDelta}` : day.capacityDelta}</Text>
                <Text numberOfLines={2} style={styles.tabletCalendarSignal}>{capacitySignalLabel(day.signal)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tabletCalendarDetail}>
        <View style={styles.tabletCalendarDetailTop}>
          <View style={styles.tabletCalendarDetailCopy}>
            <Text style={sharedStyles.eyebrow}>SELECTED DAY</Text>
            <Text style={styles.tabletCalendarDetailTitle}>
              {readableDate(selectedDay.serviceDate, { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            <View style={[styles.statusPill, statusTone(selectedDay.signal), styles.tabletCalendarDetailSignal]}>
              <Text style={styles.statusPillText}>{capacitySignalLabel(selectedDay.signal)}</Text>
            </View>
            <Text style={styles.tabletCalendarDetailLabel}>OPEN ROUTES</Text>
            <View style={styles.tabletRouteChips}>
              {selectedDay.openRoutes.length > 0 ? selectedDay.openRoutes.map((route) => (
                <View key={route.id} style={styles.tabletRouteChip}>
                  <Text style={styles.tabletRouteChipText}>{route.current_wa_num || route.route_name || "Unnamed"}</Text>
                </View>
              )) : (
                <Text style={sharedStyles.muted}>{selectedDay.assignedRoutes} of {selectedDay.routeDemand} demanded routes assigned.</Text>
              )}
            </View>
          </View>
          <View style={styles.tabletCalendarDetailStats}>
            <View style={styles.tabletCalendarDetailStat}>
              <Text style={styles.tabletCalendarDetailStatLabel}>Assigned routes</Text>
              <Text style={styles.tabletCalendarDetailStatValue}>{selectedDay.assignedRoutes}/{selectedDay.routeDemand}</Text>
            </View>
            <View style={styles.tabletCalendarDetailStat}>
              <Text style={styles.tabletCalendarDetailStatLabel}>Standby</Text>
              <Text style={styles.tabletCalendarDetailStatValue}>{selectedDay.standbyDrivers.length}</Text>
            </View>
            <View style={styles.tabletCalendarDetailStat}>
              <Text style={styles.tabletCalendarDetailStatLabel}>Scheduled off</Text>
              <Text style={styles.tabletCalendarDetailStatValue}>{selectedDay.baselineScheduledOffDrivers.length}</Text>
            </View>
            <View style={styles.tabletCalendarDetailStat}>
              <Text style={styles.tabletCalendarDetailStatLabel}>Override off</Text>
              <Text style={styles.tabletCalendarDetailStatValue}>{selectedDay.overrideOffRows.length}</Text>
            </View>
            <View style={styles.tabletCalendarDetailStat}>
              <Text style={styles.tabletCalendarDetailStatLabel}>Trainees</Text>
              <Text style={styles.tabletCalendarDetailStatValue}>{selectedDay.traineeRows.length}</Text>
            </View>
          </View>
        </View>
        <View style={styles.tabletCalendarPeopleGrid}>
          {[
            { label: "Trainees", rows: selectedDay.traineeRows },
            { label: "Standby", rows: selectedDay.standbyDrivers },
            { label: "Scheduled off", rows: selectedDay.baselineScheduledOffDrivers },
            { label: "Override off", rows: selectedDay.overrideOffRows },
          ].map((group) => (
            <View key={group.label} style={styles.tabletCalendarPeopleGroup}>
              <Text style={styles.tabletCalendarPeopleLabel}>{group.label.toUpperCase()} · {group.rows.length}</Text>
              <View style={styles.tabletCalendarPersonChips}>
                {group.rows.length > 0 ? group.rows.slice(0, 12).map((row, index) => (
                  <View key={`${row.roster_member_id}-${index}`} style={styles.tabletCalendarPersonChip}>
                    <Text numberOfLines={1} style={styles.tabletCalendarPersonChipText}>
                      {row.full_name || "Roster member"}{group.label === "Trainees"
                        ? ` · ${traineeScheduleDetail(row)}`
                        : row.override_type
                          ? ` · ${row.override_type.replaceAll("_", " ").toLowerCase()}`
                          : ""}
                    </Text>
                  </View>
                )) : (
                  <Text style={sharedStyles.muted}>None</Text>
                )}
                {group.rows.length > 12 ? (
                  <Text style={styles.tabletCalendarPeopleMore}>+{group.rows.length - 12} more</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function TimeOffReviewModal(props: {
  request: ManagerTimeOffRequest | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (decision: "APPROVED" | "DENIED", note: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState<"APPROVED" | "DENIED" | null>(null);
  const [note, setNote] = useState("");

  function close() {
    if (props.busy) return;
    setDecision(null);
    setNote("");
    props.onClose();
  }

  async function submit() {
    if (!decision) return;
    try {
      await props.onSubmit(decision, note);
      setDecision(null);
      setNote("");
    } catch {
      // The parent keeps the review open and surfaces the governed RPC error.
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={Boolean(props.request)}>
      <ScrollView contentContainerStyle={styles.reviewSheet} keyboardShouldPersistTaps="handled">
        <View style={styles.reviewHeader}>
          <View>
            <Text style={sharedStyles.eyebrow}>SCHEDULE · REVIEW</Text>
            <Text style={sharedStyles.h1}>Time off</Text>
          </View>
          <Pressable disabled={props.busy} onPress={close}><Text style={styles.done}>Cancel</Text></Pressable>
        </View>
        {props.request ? (
          <>
            <Card tone="primary">
              <Text style={sharedStyles.bodyStrong}>{props.request.full_name}</Text>
              <Text style={sharedStyles.muted}>
                {readableDate(props.request.start_date)} – {readableDate(props.request.end_date)} · {props.request.day_count} day{props.request.day_count === 1 ? "" : "s"}
              </Text>
              {props.request.request_note ? <Text style={styles.requestQuote}>“{props.request.request_note}”</Text> : null}
            </Card>
            <Text style={sharedStyles.eyebrow}>DECISION</Text>
            <View style={styles.decisionRow}>
              <Pressable onPress={() => setDecision("APPROVED")} style={[styles.decisionButton, decision === "APPROVED" && styles.decisionApprove]}>
                <Text style={[styles.decisionText, decision === "APPROVED" && styles.decisionTextActive]}>Approve</Text>
              </Pressable>
              <Pressable onPress={() => setDecision("DENIED")} style={[styles.decisionButton, decision === "DENIED" && styles.decisionDeny]}>
                <Text style={[styles.decisionText, decision === "DENIED" && styles.decisionTextActive]}>Deny</Text>
              </Pressable>
            </View>
            <Text style={sharedStyles.eyebrow}>MANAGER NOTE · OPTIONAL</Text>
            <TextInput
              editable={!props.busy}
              maxLength={500}
              multiline
              onChangeText={setNote}
              placeholder="Add context for the employee"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              value={note}
            />
            {props.error ? (
              <Card tone="danger">
                <Text style={sharedStyles.bodyStrong}>This decision was not applied</Text>
                <Text style={sharedStyles.muted}>{props.error}</Text>
              </Card>
            ) : null}
            <Card>
              <Text style={sharedStyles.bodyStrong}>Schedule authority</Text>
              <Text style={sharedStyles.muted}>
                Approval creates the governed time-off override and repaints the affected schedule. Denial records the decision without changing coverage.
              </Text>
            </Card>
            <PrimaryButton
              danger={decision === "DENIED"}
              disabled={!decision || props.busy}
              label={props.busy ? "Updating schedule…" : decision === "APPROVED" ? "Approve and update schedule" : decision === "DENIED" ? "Deny request" : "Choose a decision"}
              onPress={() => void submit()}
            />
          </>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

const SCHEDULE_DAY_FIELDS = [
  { key: "s", label: "Sat" },
  { key: "u", label: "Sun" },
  { key: "m", label: "Mon" },
  { key: "t", label: "Tue" },
  { key: "w", label: "Wed" },
  { key: "h", label: "Thu" },
  { key: "f", label: "Fri" },
] as const;

function ScheduleSheetHeader(props: { eyebrow: string; title: string; busy: boolean; onClose: () => void }) {
  return (
    <View style={styles.reviewHeader}>
      <View><Text style={sharedStyles.eyebrow}>{props.eyebrow}</Text><Text style={sharedStyles.h1}>{props.title}</Text></View>
      <Pressable disabled={props.busy} onPress={props.onClose}><Text style={styles.done}>Cancel</Text></Pressable>
    </View>
  );
}

function ScheduleChoiceRow(props: { choices: Array<{ label: string; value: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.scheduleChoiceRow}>
      {props.choices.map((choice) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: choice.value === props.value }}
          key={choice.value}
          onPress={() => props.onChange(choice.value)}
          style={[styles.scheduleChoice, choice.value === props.value && styles.scheduleChoiceActive]}
        ><Text style={[styles.scheduleChoiceText, choice.value === props.value && styles.scheduleChoiceTextActive]}>{choice.label}</Text></Pressable>
      ))}
    </View>
  );
}

function BaselineEditorModal(props: {
  row: ManagerScheduleWorkbenchRow | null;
  presets: ManagerSchedulePreset[];
  busy: boolean;
  onClose: () => void;
  onRemove: (row: ManagerScheduleWorkbenchRow) => Promise<void>;
  onSave: (draft: ManagerScheduleBaselineDraft) => Promise<void>;
}) {
  const baseline = props.row?.baseline;
  const [presetId, setPresetId] = useState("");
  const [rotationMode, setRotationMode] = useState("NONE");
  const [effectiveStart, setEffectiveStart] = useState(localIsoDate());
  const [anchorDate, setAnchorDate] = useState(localIsoDate());
  const [rotationWorks, setRotationWorks] = useState<ManagerScheduleBaselineDraft["rotationWorks"]>({ s: false, u: false, m: false, t: false, w: false, h: false, f: false });
  const [defaultRoutes, setDefaultRoutes] = useState<ManagerScheduleBaselineDraft["defaultRoutes"]>({ s: "", u: "", m: "", t: "", w: "", h: "", f: "" });

  function initialize() {
    setPresetId(baseline?.preset_id ?? "");
    setRotationMode(baseline?.rotation_mode ?? "NONE");
    setEffectiveStart(baseline?.effective_start ?? localIsoDate());
    setAnchorDate(baseline?.anchor_date ?? baseline?.effective_start ?? localIsoDate());
    setRotationWorks({
      s: Boolean(baseline?.rotation_works_s), u: Boolean(baseline?.rotation_works_u), m: Boolean(baseline?.rotation_works_m),
      t: Boolean(baseline?.rotation_works_t), w: Boolean(baseline?.rotation_works_w), h: Boolean(baseline?.rotation_works_h), f: Boolean(baseline?.rotation_works_f),
    });
    setDefaultRoutes({
      s: baseline?.default_route_s ?? "", u: baseline?.default_route_u ?? "", m: baseline?.default_route_m ?? "",
      t: baseline?.default_route_t ?? "", w: baseline?.default_route_w ?? "", h: baseline?.default_route_h ?? "", f: baseline?.default_route_f ?? "",
    });
  }
  useEffect(initialize, [props.row]);

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible={Boolean(props.row)}>
      <ScrollView contentContainerStyle={styles.reviewSheet} keyboardShouldPersistTaps="handled">
        <ScheduleSheetHeader busy={props.busy} eyebrow="SCHEDULE · WORKBENCH" onClose={props.onClose} title={props.row?.fullName ?? "Baseline"} />
        <Text style={sharedStyles.eyebrow}>SCHEDULE PRESET</Text>
        <ScheduleChoiceRow choices={[{ label: "No preset", value: "" }, ...props.presets.map((preset) => ({ label: preset.preset_code, value: preset.id }))]} onChange={setPresetId} value={presetId} />
        <Text style={sharedStyles.eyebrow}>ROTATION</Text>
        <ScheduleChoiceRow choices={[{ label: "None", value: "NONE" }, { label: "Weekly", value: "WEEKLY" }, { label: "Alternating", value: "ALTERNATING_WEEKS" }]} onChange={setRotationMode} value={rotationMode} />
        <View style={styles.scheduleFieldGrid}>
          <View style={styles.scheduleField}><Text style={styles.scheduleFieldLabel}>Effective start</Text><TextInput onChangeText={setEffectiveStart} placeholder="YYYY-MM-DD" style={styles.drawerSearch} value={effectiveStart} /></View>
          <View style={styles.scheduleField}><Text style={styles.scheduleFieldLabel}>Anchor date</Text><TextInput onChangeText={setAnchorDate} placeholder="YYYY-MM-DD" style={styles.drawerSearch} value={anchorDate} /></View>
        </View>
        <Text style={sharedStyles.eyebrow}>ROTATION DAYS AND DEFAULT ROUTES</Text>
        <View style={styles.scheduleDaysGrid}>
          {SCHEDULE_DAY_FIELDS.map((day) => (
            <View key={day.key} style={styles.scheduleDayEditor}>
              <Pressable onPress={() => setRotationWorks((current) => ({ ...current, [day.key]: !current[day.key] }))} style={[styles.scheduleDayToggle, rotationWorks[day.key] && styles.scheduleDayToggleActive]}>
                <Text style={[styles.scheduleChoiceText, rotationWorks[day.key] && styles.scheduleChoiceTextActive]}>{day.label}</Text>
              </Pressable>
              <TextInput autoCapitalize="characters" onChangeText={(value) => setDefaultRoutes((current) => ({ ...current, [day.key]: value }))} placeholder="Route" style={styles.scheduleRouteInput} value={defaultRoutes[day.key]} />
            </View>
          ))}
        </View>
        <PrimaryButton disabled={props.busy || !props.row || !effectiveStart} label={props.busy ? "Saving baseline…" : "Save baseline and repaint schedule"} onPress={() => props.row && void props.onSave({ rosterMemberId: props.row.rosterMemberId, presetId: presetId || null, rotationMode, effectiveStart, anchorDate, rotationWorks, defaultRoutes })} />
        {props.row?.baselineId ? <PrimaryButton danger disabled={props.busy} label="Remove active baseline" onPress={() => props.row && void props.onRemove(props.row)} /> : null}
      </ScrollView>
    </Modal>
  );
}

function OverrideEditorModal(props: {
  value: ManagerScheduleOverride | "NEW" | null;
  roster: ManagerScheduleWorkbenchRow[];
  busy: boolean;
  onClose: () => void;
  onDeactivate: (value: ManagerScheduleOverride) => Promise<void>;
  onSave: (draft: ManagerScheduleOverrideDraft) => Promise<void>;
}) {
  const existing = props.value && props.value !== "NEW" ? props.value : null;
  const [rosterMemberId, setRosterMemberId] = useState("");
  const [overrideType, setOverrideType] = useState("TIME_OFF");
  const [startDate, setStartDate] = useState(localIsoDate());
  const [endDate, setEndDate] = useState(localIsoDate());
  const [managerNote, setManagerNote] = useState("");
  function initialize() {
    setRosterMemberId(existing?.roster_member_id ?? props.roster[0]?.rosterMemberId ?? "");
    setOverrideType(existing?.override_type ?? "TIME_OFF"); setStartDate(existing?.start_date ?? localIsoDate()); setEndDate(existing?.end_date ?? localIsoDate()); setManagerNote(existing?.manager_note ?? "");
  }
  useEffect(initialize, [props.value]);
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible={Boolean(props.value)}>
      <ScrollView contentContainerStyle={styles.reviewSheet} keyboardShouldPersistTaps="handled">
        <ScheduleSheetHeader busy={props.busy} eyebrow="SCHEDULE · OVERRIDE" onClose={props.onClose} title={existing ? "Edit override" : "New override"} />
        <Text style={sharedStyles.eyebrow}>ROSTER MEMBER</Text>
        <ScheduleChoiceRow choices={props.roster.map((row) => ({ label: row.fullName, value: row.rosterMemberId }))} onChange={setRosterMemberId} value={rosterMemberId} />
        <Text style={sharedStyles.eyebrow}>OVERRIDE TYPE</Text>
        <ScheduleChoiceRow choices={["TIME_OFF", "CALL_OUT", "ADD_IN", "ADMIN_OFF", "RESIGNATION_NOTICE"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} onChange={setOverrideType} value={overrideType} />
        <View style={styles.scheduleFieldGrid}>
          <View style={styles.scheduleField}><Text style={styles.scheduleFieldLabel}>Start date</Text><TextInput onChangeText={setStartDate} placeholder="YYYY-MM-DD" style={styles.drawerSearch} value={startDate} /></View>
          <View style={styles.scheduleField}><Text style={styles.scheduleFieldLabel}>End date</Text><TextInput onChangeText={setEndDate} placeholder="YYYY-MM-DD" style={styles.drawerSearch} value={endDate} /></View>
        </View>
        <Text style={sharedStyles.eyebrow}>MANAGER NOTE</Text><TextInput multiline onChangeText={setManagerNote} placeholder="Reason and operating context" style={styles.noteInput} value={managerNote} />
        <PrimaryButton disabled={props.busy || !rosterMemberId || !startDate || !endDate} label={props.busy ? "Saving override…" : "Save override and repaint schedule"} onPress={() => void props.onSave({ id: existing?.id, rosterMemberId, overrideType, startDate, endDate, managerNote })} />
        {existing ? <PrimaryButton danger disabled={props.busy} label="Deactivate override" onPress={() => void props.onDeactivate(existing)} /> : null}
      </ScrollView>
    </Modal>
  );
}

function PresetEditorModal(props: {
  value: ManagerSchedulePreset | "NEW" | null;
  busy: boolean;
  onClose: () => void;
  onDeactivate: (value: ManagerSchedulePreset) => Promise<void>;
  onSave: (draft: ManagerSchedulePresetDraft) => Promise<void>;
}) {
  const existing = props.value && props.value !== "NEW" ? props.value : null;
  const [presetCode, setPresetCode] = useState("");
  const [usesRotation, setUsesRotation] = useState(false);
  const [works, setWorks] = useState<ManagerSchedulePresetDraft["works"]>({ s: false, u: false, m: false, t: false, w: false, h: false, f: false });
  function initialize() {
    setPresetCode(existing?.preset_code ?? ""); setUsesRotation(Boolean(existing?.uses_rotation));
    setWorks({ s: Boolean(existing?.works_s), u: Boolean(existing?.works_u), m: Boolean(existing?.works_m), t: Boolean(existing?.works_t), w: Boolean(existing?.works_w), h: Boolean(existing?.works_h), f: Boolean(existing?.works_f) });
  }
  useEffect(initialize, [props.value]);
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible={Boolean(props.value)}>
      <ScrollView contentContainerStyle={styles.reviewSheet} keyboardShouldPersistTaps="handled">
        <ScheduleSheetHeader busy={props.busy} eyebrow="SCHEDULE · PRESET" onClose={props.onClose} title={existing ? "Edit pattern" : "New pattern"} />
        <Text style={sharedStyles.eyebrow}>PRESET CODE</Text><TextInput autoCapitalize="characters" onChangeText={setPresetCode} placeholder="Example: SAT-WED" style={styles.drawerSearch} value={presetCode} />
        <Text style={sharedStyles.eyebrow}>WORKING DAYS</Text>
        <View style={styles.scheduleChoiceRow}>{SCHEDULE_DAY_FIELDS.map((day) => <Pressable key={day.key} onPress={() => setWorks((current) => ({ ...current, [day.key]: !current[day.key] }))} style={[styles.scheduleChoice, works[day.key] && styles.scheduleChoiceActive]}><Text style={[styles.scheduleChoiceText, works[day.key] && styles.scheduleChoiceTextActive]}>{day.label}</Text></Pressable>)}</View>
        <Pressable onPress={() => setUsesRotation((current) => !current)} style={[styles.scheduleRotationToggle, usesRotation && styles.scheduleChoiceActive]}><Text style={[styles.scheduleChoiceText, usesRotation && styles.scheduleChoiceTextActive]}>{usesRotation ? "Rotation enabled" : "Weekly pattern"}</Text></Pressable>
        <PrimaryButton disabled={props.busy || !presetCode.trim()} label={props.busy ? "Saving pattern…" : "Save schedule pattern"} onPress={() => void props.onSave({ id: existing?.id, presetCode, works, usesRotation })} />
        {existing ? <PrimaryButton danger disabled={props.busy} label="Deactivate pattern" onPress={() => void props.onDeactivate(existing)} /> : null}
      </ScrollView>
    </Modal>
  );
}

export function ManagerScheduleScreen(props: {
  context: ManagerAccessContext;
  driverContext: DriverAccessContext | null;
  error: string | null;
  loading: boolean;
  reviewBusy: boolean;
  writeBusy: boolean;
  snapshot: ManagerScheduleSnapshot | null;
  surface: ManagerScheduleSurface;
  onBack: () => void;
  onManage: () => void;
  onMySchedule: () => void;
  onNextWeek: () => void;
  onPreviousWeek: () => void;
  onRefresh: () => void;
  onReviewRequest: (request: ManagerTimeOffRequest, decision: "APPROVED" | "DENIED", note: string) => Promise<void>;
  onCommit: () => Promise<void>;
  onDeactivateOverride: (override: ManagerScheduleOverride) => Promise<void>;
  onDeactivatePreset: (preset: ManagerSchedulePreset) => Promise<void>;
  onRemoveBaseline: (row: ManagerScheduleWorkbenchRow) => Promise<void>;
  onSaveBaseline: (draft: ManagerScheduleBaselineDraft) => Promise<void>;
  onSaveOverride: (draft: ManagerScheduleOverrideDraft) => Promise<void>;
  onSavePreset: (draft: ManagerSchedulePresetDraft) => Promise<void>;
  onSettings: () => void;
  onSurface: (surface: ManagerScheduleSurface) => void;
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;
  const [reviewRequest, setReviewRequest] = useState<ManagerTimeOffRequest | null>(null);
  const [baselineRow, setBaselineRow] = useState<ManagerScheduleWorkbenchRow | null>(null);
  const [overrideEditor, setOverrideEditor] = useState<ManagerScheduleOverride | "NEW" | null>(null);
  const [presetEditor, setPresetEditor] = useState<ManagerSchedulePreset | "NEW" | null>(null);
  const [workbenchSearch, setWorkbenchSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  if (props.surface !== "bridge") {
    const title = props.surface === "overview"
      ? "Schedule"
      : props.surface === "calendar"
        ? "Calendar"
        : props.surface === "overrides"
          ? "Overrides"
          : props.surface === "presets"
            ? "Presets"
            : "Workbench";
    return (
      <Screen>
        <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title={title} />
        <Pressable onPress={props.onBack}><Text style={styles.back}>‹ {props.surface === "overview" ? "Personal or management" : "Schedule"}</Text></Pressable>
        <WeekNavigator monthly={isTablet || props.surface === "calendar"} snapshot={props.snapshot} onNextWeek={props.onNextWeek} onPreviousWeek={props.onPreviousWeek} />
        <ScheduleLoading error={props.error} loading={props.loading} onRetry={props.onRefresh} />

        {props.snapshot && props.surface === "overview" ? (
          <>
            <PostureCard snapshot={props.snapshot} />
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Manage schedule</Text>
              <Text style={styles.sectionMeta}>NATIVE TOOLS</Text>
            </View>
            <AccessTile code="CA" detail="Daily workforce, route demand, off rows, and operating signals" label="Calendar" onPress={() => props.onSurface("calendar")} trailing="NATIVE" />
            <AccessTile code="WB" detail={`${props.snapshot.workbenchRows.filter((row) => row.schedulePending).length} people need a schedule baseline`} label="Workbench" onPress={() => props.onSurface("workbench")} trailing="NATIVE" />
            <AccessTile attention={props.snapshot.pendingRequests.length > 0} code="OV" detail={`${props.snapshot.pendingRequests.length} time-off request${props.snapshot.pendingRequests.length === 1 ? "" : "s"} need review`} label="Overrides" onPress={() => props.onSurface("overrides")} trailing="NATIVE" />
            <AccessTile code="PR" detail={`${props.snapshot.presets.length} active schedule pattern${props.snapshot.presets.length === 1 ? "" : "s"}`} label="Presets" onPress={() => props.onSurface("presets")} trailing="NATIVE" />
          </>
        ) : null}

        {props.snapshot && props.surface === "calendar" ? (
          <>
            <PostureCard snapshot={props.snapshot} />
            {isTablet ? (
              <TabletScheduleCalendar days={props.snapshot.days} />
            ) : (
              <>
                <CoverageRail days={props.snapshot.days.slice(0, 7)} />
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionLabel}>Operating days</Text>
                  <Text style={styles.sectionMeta}>WEB-ALIGNED</Text>
                </View>
                {props.snapshot.days.slice(0, 7).map((day) => (
                  <Card key={day.serviceDate} tone={day.signal === "SERVICE_RISK" || day.signal === "PROFITABILITY_RISK" ? "danger" : undefined}>
                    <View style={styles.cardHeaderRow}>
                      <View>
                        <Text style={sharedStyles.bodyStrong}>{readableDate(day.serviceDate, { weekday: "long", month: "short", day: "numeric" })}</Text>
                        <Text style={sharedStyles.muted}>{day.scheduledDrivers} drivers · {day.routeDemand} routes</Text>
                      </View>
                      <View style={[styles.statusPill, statusTone(day.signal)]}><Text style={styles.statusPillText}>{capacitySignalLabel(day.signal)}</Text></View>
                    </View>
                    <Text style={sharedStyles.muted}>
                      {day.openRoutes.length > 0
                        ? `Open: ${day.openRoutes.map((route) => route.current_wa_num || route.route_name || "Unnamed").join(", ")}`
                        : `${day.assignedRoutes} of ${day.routeDemand} demanded routes assigned.`}
                    </Text>
                    <Text style={sharedStyles.muted}>{day.standbyDrivers.length} standby · {day.baselineScheduledOffDrivers.length} scheduled off · {day.overrideOffRows.length} override off · {day.traineeRows.length} trainee{day.traineeRows.length === 1 ? "" : "s"}</Text>
                    {day.traineeRows.length > 0 ? (
                      <View style={styles.mobileScheduleTraineeGroup}>
                        <Text style={styles.mobileScheduleTraineeLabel}>TRAINEES · {day.traineeRows.length}</Text>
                        {day.traineeRows.map((row, index) => (
                          <Text key={`${row.roster_member_id}-${index}`} style={styles.mobileScheduleTraineePerson}>
                            {row.full_name || "Roster member"} · {traineeScheduleDetail(row)}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </Card>
                ))}
              </>
            )}
          </>
        ) : null}

        {props.snapshot && props.surface === "overrides" ? (
          <>
            <View style={styles.scheduleToolbar}>
              <PrimaryButton compact label="New override" onPress={() => setOverrideEditor("NEW")} />
              <PrimaryButton compact disabled={props.writeBusy} label={props.writeBusy ? "Repainting…" : "Repaint 70-day horizon"} onPress={() => void props.onCommit()} secondary />
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Pending time off</Text>
              <Text style={styles.sectionMeta}>{props.snapshot.pendingRequests.length} REVIEW</Text>
            </View>
            {props.snapshot.pendingRequests.map((request) => (
              <Pressable key={request.id} onPress={() => setReviewRequest(request)} style={({ pressed }) => [styles.requestCard, pressed && styles.pressed]}>
                <View style={styles.requestAvatar}><Text style={styles.requestAvatarText}>{request.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</Text></View>
                <View style={styles.accessCopy}>
                  <Text style={sharedStyles.bodyStrong}>{request.full_name}</Text>
                  <Text style={styles.detail}>{readableDate(request.start_date)} – {readableDate(request.end_date)} · {request.day_count} day{request.day_count === 1 ? "" : "s"}</Text>
                </View>
                <Text style={styles.reviewAction}>REVIEW</Text>
              </Pressable>
            ))}
            {props.snapshot.pendingRequests.length === 0 ? (
              <Card><Text style={sharedStyles.bodyStrong}>Queue clear</Text><Text style={sharedStyles.muted}>There are no pending time-off requests.</Text></Card>
            ) : null}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Active this week</Text>
              <Text style={styles.sectionMeta}>{props.snapshot.activeOverrides.length}</Text>
            </View>
            {props.snapshot.activeOverrides.map((override) => (
              <Pressable key={override.id} onPress={() => setOverrideEditor(override)} style={({ pressed }) => pressed && styles.pressed}>
              <Card>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.accessCopy}>
                    <Text style={sharedStyles.bodyStrong}>{override.full_name}</Text>
                    <Text style={sharedStyles.muted}>{readableDate(override.start_date)} – {readableDate(override.end_date)}</Text>
                  </View>
                  <Text style={styles.overrideType}>{override.override_type.replaceAll("_", " ")}</Text>
                </View>
              </Card></Pressable>
            ))}
          </>
        ) : null}

        {props.snapshot && props.surface === "workbench" ? (
          <>
            <View style={styles.scheduleToolbar}>
              <TextInput onChangeText={setWorkbenchSearch} placeholder="Search roster or route" placeholderTextColor={colors.muted} style={[styles.drawerSearch, styles.scheduleSearch]} value={workbenchSearch} />
              <Pressable onPress={() => setPendingOnly((current) => !current)} style={[styles.scheduleFilter, pendingOnly && styles.scheduleChoiceActive]}><Text style={[styles.scheduleChoiceText, pendingOnly && styles.scheduleChoiceTextActive]}>{pendingOnly ? "Pending only" : "All people"}</Text></Pressable>
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>People and baselines</Text>
              <Text style={styles.sectionMeta}>{props.snapshot.workbenchRows.length}</Text>
            </View>
            {props.snapshot.workbenchRows.filter((row) => {
              if (pendingOnly && !row.schedulePending) return false;
              const query = workbenchSearch.trim().toLowerCase();
              return !query || row.fullName.toLowerCase().includes(query) || row.defaultRoutes.some((route) => route.toLowerCase().includes(query));
            }).map((row) => (
              <Pressable accessibilityRole="button" key={row.rosterMemberId} onPress={() => setBaselineRow(row)} style={({ pressed }) => [styles.workbenchRow, pressed && styles.pressed]}>
                <View style={[styles.workbenchDate, row.schedulePending ? styles.statusTight : styles.statusCovered]}>
                  <Text style={styles.workbenchInitials}>{row.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</Text>
                </View>
                <View style={styles.accessCopy}>
                  <Text style={sharedStyles.bodyStrong}>{row.fullName}</Text>
                  <Text style={styles.detail}>{row.presetCode ?? "No preset"} · {row.rotationMode ?? "No rotation"}</Text>
                  <Text style={styles.detail}>{row.defaultRoutes.length > 0 ? `Routes ${row.defaultRoutes.join(", ")}` : "No default routes"}</Text>
                </View>
                <Text style={row.schedulePending ? styles.pendingText : styles.readyText}>{row.schedulePending ? "PENDING" : "READY"}</Text>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            ))}
            <Card>
              <Text style={sharedStyles.bodyStrong}>Authoritative baseline read model</Text>
              <Text style={sharedStyles.muted}>This view uses the same active roster, baseline, preset, rotation, effective-date, and default-route records as the web Schedule workbench.</Text>
            </Card>
          </>
        ) : null}

        {props.snapshot && props.surface === "presets" ? (
          <>
            <View style={styles.scheduleToolbar}><PrimaryButton compact label="New pattern" onPress={() => setPresetEditor("NEW")} /></View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Active patterns</Text>
              <Text style={styles.sectionMeta}>{props.snapshot.presets.length}</Text>
            </View>
            {props.snapshot.presets.map((preset) => {
              const days = [
                preset.works_s && "Sat",
                preset.works_u && "Sun",
                preset.works_m && "Mon",
                preset.works_t && "Tue",
                preset.works_w && "Wed",
                preset.works_h && "Thu",
                preset.works_f && "Fri",
              ].filter(Boolean).join(" · ");
              return (
                <Pressable key={preset.id} onPress={() => setPresetEditor(preset)} style={({ pressed }) => pressed && styles.pressed}><Card>
                  <View style={styles.cardHeaderRow}>
                    <Text style={sharedStyles.bodyStrong}>{preset.preset_code}</Text>
                    <Text style={styles.readyText}>{preset.uses_rotation ? "ROTATION" : "WEEKLY"}</Text>
                  </View>
                  <Text style={sharedStyles.muted}>{days || "No active days"}</Text>
                </Card></Pressable>
              );
            })}
            {props.snapshot.presets.length === 0 ? (
              <Card><Text style={sharedStyles.bodyStrong}>No active presets</Text><Text style={sharedStyles.muted}>The authoritative Schedule preset library is empty.</Text></Card>
            ) : null}
          </>
        ) : null}

        <TimeOffReviewModal
          busy={props.reviewBusy}
          error={props.error}
          onClose={() => setReviewRequest(null)}
          onSubmit={async (decision, note) => {
            if (!reviewRequest) return;
            await props.onReviewRequest(reviewRequest, decision, note);
            setReviewRequest(null);
          }}
          request={reviewRequest}
        />
        <BaselineEditorModal
          busy={props.writeBusy}
          onClose={() => setBaselineRow(null)}
          onRemove={async (row) => { await props.onRemoveBaseline(row); setBaselineRow(null); }}
          onSave={async (draft) => { await props.onSaveBaseline(draft); setBaselineRow(null); }}
          presets={props.snapshot?.presets ?? []}
          row={baselineRow}
        />
        <OverrideEditorModal
          busy={props.writeBusy}
          onClose={() => setOverrideEditor(null)}
          onDeactivate={async (value) => { await props.onDeactivateOverride(value); setOverrideEditor(null); }}
          onSave={async (draft) => { await props.onSaveOverride(draft); setOverrideEditor(null); }}
          roster={props.snapshot?.workbenchRows ?? []}
          value={overrideEditor}
        />
        <PresetEditorModal
          busy={props.writeBusy}
          onClose={() => setPresetEditor(null)}
          onDeactivate={async (value) => { await props.onDeactivatePreset(value); setPresetEditor(null); }}
          onSave={async (draft) => { await props.onSavePreset(draft); setPresetEditor(null); }}
          value={presetEditor}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Schedule" />
      <Text style={sharedStyles.eyebrow}>CHOOSE A VIEW</Text>
      <Text style={sharedStyles.h2}>Personal or management</Text>
      <Text style={sharedStyles.muted}>Choose the workspace that matches the task you need to complete.</Text>
      {props.driverContext ? (
        <AccessTile code="ME" detail="Assignments and personal time-off requests" label="My Schedule" onPress={props.onMySchedule} />
      ) : null}
      <AccessTile attention code="MG" detail="Calendar, workbench, overrides, and presets" label="Manage Schedule" onPress={props.onManage} />
      <View style={styles.snapshot}>
        <Text style={styles.pulseLabel}>Manager snapshot</Text>
        <Text style={styles.snapshotDetail}>Schedule management access is active for this company.</Text>
      </View>
      <Card>
        <Text style={sharedStyles.bodyStrong}>Context stays visible</Text>
        <Text style={sharedStyles.muted}>Account lets you switch role context without changing your grants.</Text>
      </Card>
    </Screen>
  );
}

export function ManagerWorkspacesScreen(props: {
  context: ManagerAccessContext;
  onOpenNativeSchedule: () => void;
  onOpenSuite: (key: ManagerWorkspaceKey) => void;
  onSettings: () => void;
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;
  const suites = managerWorkspaceSuites(props.context);
  return (
    <ScrollView contentContainerStyle={[styles.workspacePage, isTablet && styles.workspacePageTablet]} showsVerticalScrollIndicator={false}>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Workspaces" />
      <View style={[styles.workspaceDirectory, isTablet && styles.workspaceDirectoryTablet]}>
        <View style={[styles.workspaceIntroduction, isTablet && styles.workspaceIntroductionTablet]}>
          <Text style={sharedStyles.muted}>Every destination is grant-matched and arranged for iPad administration. Open a workspace to review, manage, approve, or configure the work in your scope.</Text>
          <View style={styles.nativeBanner}>
            <Text style={styles.nativeBannerLabel}>IPAD MANAGEMENT</Text>
            <Text style={styles.nativeBannerTitle}>Manager workspace suite</Text>
            <Text style={styles.nativeBannerDetail}>{suites.length + (props.context.grants.includes("schedule") ? 1 : 0)} management workspace{(suites.length + (props.context.grants.includes("schedule") ? 1 : 0)) === 1 ? "" : "s"} in your scope</Text>
          </View>
        </View>
        <View style={[styles.workspaceGroup, isTablet && styles.workspaceGroupTablet]}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Management workspaces</Text>
            <Text style={styles.sectionMeta}>GRANT-MATCHED</Text>
          </View>
          {props.context.grants.includes("schedule") ? (
            <AccessTile code="SC" detail="Coverage, overrides, and workbench" label="Schedule" onPress={props.onOpenNativeSchedule} trailing="NATIVE" />
          ) : null}
          {suites.map((suite) => (
            <AccessTile
              code={suite.code}
              detail={suite.detail}
              key={suite.key}
              label={suite.label}
              onPress={() => props.onOpenSuite(suite.key)}
              trailing="NATIVE"
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function metricStyle(tone: ManagerWorkspaceTone | undefined) {
  if (tone === "danger") return styles.metricDanger;
  if (tone === "warning") return styles.metricWarning;
  if (tone === "success") return styles.metricSuccess;
  return styles.metricDefault;
}

function readAccentStyle(tone: ManagerWorkspaceTone | undefined) {
  if (tone === "danger") return styles.readAccentDanger;
  if (tone === "warning") return styles.readAccentWarning;
  if (tone === "success") return styles.readAccentSuccess;
  return styles.readAccentDefault;
}

function WorkspaceSnapshotView(props: {
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  snapshot: ManagerWorkspaceSnapshot | null;
}) {
  const [selectedFilter, setSelectedFilter] = useState("all");
  const filters = props.snapshot?.filters ?? [];
  const effectiveFilter = filters.some((filter) => filter.key === selectedFilter)
    ? selectedFilter
    : filters[0]?.key ?? "all";
  const visibleItems = (props.snapshot?.items ?? []).filter(
    (item) => effectiveFilter === "all" || item.filterKeys?.includes(effectiveFilter),
  );

  if (props.loading) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color={colors.primary} />
        <Text style={sharedStyles.muted}>Loading governed workspace data…</Text>
      </View>
    );
  }
  if (props.error) {
    return (
      <Card tone="danger">
        <Text style={sharedStyles.bodyStrong}>This workspace is temporarily unavailable</Text>
        <Text style={sharedStyles.muted}>{props.error}</Text>
        <PrimaryButton compact label="Retry" onPress={props.onRetry} secondary />
      </Card>
    );
  }
  if (!props.snapshot) return null;
  return (
    <>
      {props.snapshot.description ? <Text style={styles.readDescription}>{props.snapshot.description}</Text> : null}
      {props.snapshot.statusText ? (
        <View style={styles.readStatus}>
          <View style={styles.successDot} />
          <Text style={styles.readStatusText}>{props.snapshot.statusText}</Text>
        </View>
      ) : null}
      <View style={styles.metricBand}>
        {props.snapshot.metrics.map((metric) => (
          <View key={metric.label} style={[styles.metricCard, metricStyle(metric.tone)]}>
            <Text numberOfLines={1} style={styles.metricLabel}>{metric.label}</Text>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>
      {filters.length > 1 ? (
        <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((filter) => {
            const active = filter.key === effectiveFilter;
            const count = filter.key === "all"
              ? props.snapshot?.items.length ?? 0
              : props.snapshot?.items.filter((item) => item.filterKeys?.includes(filter.key)).length ?? 0;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={filter.key}
                onPress={() => setSelectedFilter(filter.key)}
                style={({ pressed }) => [styles.readFilter, active && styles.readFilterActive, pressed && styles.pressed]}
              >
                <Text style={[styles.readFilterText, active && styles.readFilterTextActive]}>{filter.label}</Text>
                <View style={[styles.readFilterCount, active && styles.readFilterCountActive]}>
                  <Text style={[styles.readFilterCountText, active && styles.readFilterCountTextActive]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionLabel}>{props.snapshot.sectionLabel}</Text>
        <Text style={styles.sectionMeta}>{visibleItems.length}</Text>
      </View>
      {visibleItems.length === 0 ? (
        <Card>
          <Text style={sharedStyles.bodyStrong}>Nothing to review</Text>
          <Text style={sharedStyles.muted}>{props.snapshot.items.length === 0 ? props.snapshot.emptyMessage : "No records match this view."}</Text>
        </Card>
      ) : visibleItems.map((item) => (
        <View key={item.id} style={styles.readCard}>
          <View style={[styles.readAccent, readAccentStyle(item.tone)]} />
          <View style={styles.readCardHeader}>
            <Text numberOfLines={1} style={styles.readEyebrow}>{item.eyebrow || "Current"}</Text>
            {item.meta ? <Text numberOfLines={1} style={styles.readMeta}>{item.meta}</Text> : null}
          </View>
          <Text style={styles.readCardTitle}>{item.title}</Text>
          <Text numberOfLines={3} style={styles.readCardDetail}>{item.detail}</Text>
          {item.facts?.length ? (
            <View style={styles.readFacts}>
              {item.facts.map((fact) => (
                <View key={`${item.id}-${fact.label}`} style={styles.readFact}>
                  <Text numberOfLines={1} style={styles.readFactLabel}>{fact.label}</Text>
                  <Text numberOfLines={2} style={styles.readFactValue}>{fact.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {item.chips?.length ? (
            <View style={styles.readChips}>
              {item.chips.map((chip) => (
                <View key={`${item.id}-${chip}`} style={styles.readChip}>
                  <Text style={styles.readChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

const operationsPhaseCopy: Record<ManagerOperationsPhase, { label: string; tone: "active" | "complete" | "attention" }> = {
  unassigned: { label: "Unassigned", tone: "attention" },
  waiting: { label: "Waiting", tone: "attention" },
  arrived: { label: "Arrived", tone: "active" },
  on_job: { label: "On job", tone: "active" },
  end_of_day: { label: "End of day", tone: "complete" },
};

function OperationsControl(props: { disabled?: boolean; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.operationsControl, props.primary && styles.operationsControlPrimary, props.disabled && styles.controlDisabled, pressed && styles.pressed]}
    >
      <Text style={[styles.operationsControlText, props.primary && styles.operationsControlTextPrimary]}>{props.label}</Text>
    </Pressable>
  );
}

function OperationsMetric(props: { label: string; value: string; express?: ManagerOperationsRoute }) {
  return (
    <View style={[styles.operationsMetric, props.express && props.express.expressOpen > 0 && styles.operationsMetricRisk]}>
      {props.express ? (
        <Text numberOfLines={1} style={styles.operationsMetricValue}>
          <Text style={styles.expressComplete}>{props.express.expressComplete}</Text>
          <Text style={styles.expressDivider}> / </Text>
          <Text style={styles.expressAttempted}>{props.express.expressAttempted}</Text>
          <Text style={styles.expressDivider}> / </Text>
          <Text style={styles.expressOpen}>{props.express.expressOpen}</Text>
        </Text>
      ) : <Text numberOfLines={1} style={styles.operationsMetricValue}>{props.value}</Text>}
      <Text style={styles.operationsMetricLabel}>{props.label}</Text>
    </View>
  );
}

function OperationsRouteCard(props: { route: ManagerOperationsRoute; onManage?: () => void }) {
  const presentation = operationsPhaseCopy[props.route.phase];
  const routeIdentity = props.route.workArea && !props.route.routeName.includes(props.route.workArea)
    ? `${props.route.routeName} · ${props.route.workArea}`
    : props.route.routeName;
  const stopsPercent = props.route.plannedStops > 0
    ? Math.min(100, Math.round((props.route.completedStops / props.route.plannedStops) * 100))
    : props.route.progressPercent;
  return (
    <Pressable
      accessibilityHint={props.onManage ? "Opens management actions for this route" : undefined}
      accessibilityRole={props.onManage ? "button" : undefined}
      disabled={!props.onManage}
      onPress={props.onManage}
      style={({ pressed }) => [
      styles.operationsRouteCard,
      presentation.tone === "active" && styles.operationsRouteCardActive,
      presentation.tone === "complete" && styles.operationsRouteCardComplete,
      presentation.tone === "attention" && styles.operationsRouteCardAttention,
      pressed && styles.pressed,
    ]}>
      <View style={styles.operationsRouteHeading}>
        <Text numberOfLines={1} style={styles.operationsRouteIdentity}>{routeIdentity}</Text>
        <View style={styles.operationsPostureBlock}>
          <Text style={[
            styles.operationsPosture,
            presentation.tone === "complete" && styles.operationsPostureComplete,
            presentation.tone === "attention" && styles.operationsPostureAttention,
          ]}>● {presentation.label}</Text>
          {props.route.phase === "end_of_day" ? (
            <Text style={styles.operationsPostureMeta}>{stopsPercent}% stops{props.route.ilsPercent == null ? "" : ` · ${props.route.ilsPercent.toFixed(1).replace(/\.0$/, "")}% ILS`}</Text>
          ) : null}
        </View>
      </View>
      <Text numberOfLines={1} style={styles.operationsDriver}>{props.route.driverName || "Needs driver"}</Text>
      <View style={styles.operationsMetrics}>
        <OperationsMetric label="Stops" value={`${props.route.completedStops}/${props.route.plannedStops || "—"}`} />
        <OperationsMetric label="Packages" value={`${props.route.completedPackages}/${props.route.plannedPackages || "—"}`} />
        <OperationsMetric label="PU" value={`${props.route.completedPickups}/${props.route.plannedPickups}`} />
        <OperationsMetric express={props.route} label="Express" value="" />
      </View>
      <View style={styles.operationsProgress}>
        <View style={[styles.operationsProgressFill, { width: `${props.route.progressPercent}%` }]} />
        <Text style={[styles.operationsProgressTruck, { left: `${Math.min(94, props.route.progressPercent)}%` }]}>▰</Text>
        <Text style={styles.operationsProgressFlag}>🏁</Text>
      </View>
      {props.onManage ? (
        <View style={styles.routeManage}>
          <Text style={styles.routeManageText}>Manage route</Text>
          <Text style={styles.routeManageArrow}>›</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

type OperationsFilter = "all" | "on_job" | "end_of_day" | "attention";

function OperationsReadSurface(props: {
  dispatchBusy: boolean;
  dispatchError: string | null;
  dispatchLoading: boolean;
  dispatchSnapshot: ManagerDispatchSnapshot | null;
  loading: boolean;
  error: string | null;
  snapshot: ManagerWorkspaceSnapshot | null;
  onLoadRouteEvidence: (routeKey: string) => Promise<ManagerRouteEvidenceSnapshot>;
  onLoadWalkOns: () => Promise<ManagerWalkOnSnapshot>;
  onRefresh: () => void;
  onRefreshDispatch: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitDispatch: (draft: ManagerDispatchActionDraft) => Promise<void>;
  onSubmitWalkOn: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;
  const [filter, setFilter] = useState<OperationsFilter>("all");
  const [actionOpen, setActionOpen] = useState(false);
  const [routeDrawerId, setRouteDrawerId] = useState<string | null>(null);
  const [initialActionCode, setInitialActionCode] = useState<ManagerDispatchActionCode>("ASSIGN_DRIVER");
  const [initialRouteId, setInitialRouteId] = useState<string | null>(null);
  const [initialRosterMemberId, setInitialRosterMemberId] = useState<string | null>(null);
  const [summaryView, setSummaryView] = useState<"compliance" | "express" | "attendance" | null>(null);
  if (props.loading || props.error || !props.snapshot?.operations) {
    return <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />;
  }
  const operations = props.snapshot.operations;
  const routes = props.dispatchSnapshot?.routes ?? operations.routes;
  const counts: Record<OperationsFilter, number> = {
    all: routes.length,
    on_job: routes.filter((route) => route.phase === "on_job").length,
    end_of_day: routes.filter((route) => route.phase === "end_of_day").length,
    attention: routes.filter((route) => !["on_job", "end_of_day"].includes(route.phase)).length,
  };
  const visibleRoutes = routes.filter((route) => {
    if (filter === "all") return true;
    if (filter === "attention") return !["on_job", "end_of_day"].includes(route.phase);
    return route.phase === filter;
  });
  const filters: Array<{ key: OperationsFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "on_job", label: "On job" },
    { key: "end_of_day", label: "End of day" },
    { key: "attention", label: "Attention" },
  ];
  function openAction(
    code: ManagerDispatchActionCode = "ASSIGN_DRIVER",
    routeId: string | null = null,
    rosterMemberId: string | null = null,
  ) {
    if (!props.dispatchSnapshot) {
      props.onRefreshDispatch();
      return;
    }
    setInitialActionCode(code);
    setInitialRouteId(routeId);
    setInitialRosterMemberId(rosterMemberId);
    setActionOpen(true);
  }

  const controls = (
    <>
      <OperationsControl
        disabled={!props.dispatchSnapshot}
        label={props.dispatchLoading ? "Preparing actions…" : "Action"}
        onPress={() => openAction()}
        primary
      />
      <OperationsControl label="Compliance Report" onPress={() => setSummaryView("compliance")} />
      <OperationsControl label="Express Report" onPress={() => setSummaryView("express")} />
      <OperationsControl label="Attendance" onPress={() => setSummaryView("attendance")} />
      <OperationsControl label="Refresh" onPress={props.onRefresh} />
    </>
  );

  const routeFilters = filters.filter((item) => item.key === "all" || counts[item.key] > 0).map((item) => (
    <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.operationsFilter, filter === item.key && styles.operationsFilterActive]}>
      <Text style={[styles.operationsFilterText, filter === item.key && styles.operationsFilterTextActive]}>{item.label}</Text>
      <View style={[styles.operationsFilterCount, filter === item.key && styles.operationsFilterCountActive]}><Text style={[styles.operationsFilterCountText, filter === item.key && styles.operationsFilterCountTextActive]}>{counts[item.key]}</Text></View>
    </Pressable>
  ));

  return (
    <>
      {isTablet ? (
        <View style={[styles.operationsControls, styles.operationsControlsTablet]}>{controls}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.operationsControls} horizontal showsHorizontalScrollIndicator={false}>{controls}</ScrollView>
      )}
      {props.dispatchError ? (
        <Card tone="danger">
          <Text style={sharedStyles.bodyStrong}>Management actions are temporarily unavailable</Text>
          <Text style={sharedStyles.muted}>{props.dispatchError}</Text>
          <PrimaryButton compact label="Retry actions" onPress={props.onRefreshDispatch} secondary />
        </Card>
      ) : null}
      {summaryView ? (
        <View style={styles.operationsSummaryPanel}>
          <View style={styles.readCardHeader}>
            <View>
              <Text style={styles.nativeBannerLabel}>OPERATIONS · {summaryView.toUpperCase()}</Text>
              <Text style={styles.nativeBannerTitle}>{summaryView === "compliance" ? "Compliance posture" : summaryView === "express" ? "Express posture" : "Attendance posture"}</Text>
            </View>
            <Pressable accessibilityLabel="Close report summary" onPress={() => setSummaryView(null)}><Text style={styles.done}>Close</Text></Pressable>
          </View>
          <View style={styles.metricBand}>
            {summaryView === "compliance" ? <>
              <View style={[styles.metricCard, styles.metricSuccess]}><Text style={styles.metricLabel}>On route</Text><Text style={styles.metricValue}>{counts.on_job + counts.end_of_day}</Text></View>
              <View style={[styles.metricCard, counts.attention ? styles.metricWarning : styles.metricSuccess]}><Text style={styles.metricLabel}>Needs attention</Text><Text style={styles.metricValue}>{counts.attention}</Text></View>
              <View style={[styles.metricCard, styles.metricDefault]}><Text style={styles.metricLabel}>Complete</Text><Text style={styles.metricValue}>{counts.end_of_day}</Text></View>
            </> : summaryView === "express" ? <>
              <View style={[styles.metricCard, styles.metricSuccess]}><Text style={styles.metricLabel}>Complete</Text><Text style={styles.metricValue}>{routes.reduce((sum, route) => sum + route.expressComplete, 0)}</Text></View>
              <View style={[styles.metricCard, styles.metricWarning]}><Text style={styles.metricLabel}>Attempted</Text><Text style={styles.metricValue}>{routes.reduce((sum, route) => sum + route.expressAttempted, 0)}</Text></View>
              <View style={[styles.metricCard, styles.metricDefault]}><Text style={styles.metricLabel}>Open</Text><Text style={styles.metricValue}>{routes.reduce((sum, route) => sum + route.expressOpen, 0)}</Text></View>
            </> : <>
              <View style={[styles.metricCard, styles.metricSuccess]}><Text style={styles.metricLabel}>On job</Text><Text style={styles.metricValue}>{counts.on_job}</Text></View>
              <View style={[styles.metricCard, styles.metricWarning]}><Text style={styles.metricLabel}>Waiting</Text><Text style={styles.metricValue}>{counts.attention}</Text></View>
              <View style={[styles.metricCard, styles.metricDefault]}><Text style={styles.metricLabel}>End of day</Text><Text style={styles.metricValue}>{counts.end_of_day}</Text></View>
            </>}
          </View>
          <Text style={sharedStyles.muted}>Tap a route below for its governed route detail and available management actions.</Text>
        </View>
      ) : null}
      <View style={styles.operationsStatus}>
        <Text style={styles.operationsStatusTitle}>{routes.length} routes · {props.dispatchSnapshot?.serviceDate ?? operations.serviceDate}</Text>
        <Text style={styles.operationsStatusDetail}>{operations.terminalCode ? `${operations.terminalCode} terminal · ` : ""}{operations.statusText}</Text>
      </View>
      {isTablet ? (
        <View style={[styles.operationsFilters, styles.operationsFiltersTablet]}>{routeFilters}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.operationsFilters} horizontal showsHorizontalScrollIndicator={false}>{routeFilters}</ScrollView>
      )}
      <View style={[styles.operationsRouteStack, isTablet && styles.operationsRouteStackTablet]}>
        {visibleRoutes.length ? visibleRoutes.map((route) => (
          <View key={route.id} style={[styles.operationsRouteCell, isTablet && styles.operationsRouteCellTablet]}>
            <OperationsRouteCard
              onManage={() => setRouteDrawerId(route.id)}
              route={route}
            />
          </View>
        )) : (
          <Card><Text style={sharedStyles.bodyStrong}>No matching routes</Text><Text style={sharedStyles.muted}>Choose another operating filter.</Text></Card>
        )}
      </View>
      {routeDrawerId ? (
        <RouteManagementDrawer
          onAction={props.dispatchSnapshot ? (code, rosterMemberId) => {
            const dispatchRoute = props.dispatchSnapshot?.routes.find((route) => route.id === routeDrawerId);
            if (!dispatchRoute) return;
            setRouteDrawerId(null);
            openAction(code, dispatchRoute.id, rosterMemberId);
          } : undefined}
          onClose={() => setRouteDrawerId(null)}
          onLoadEvidence={() => {
            const route = routes.find((candidate) => candidate.id === routeDrawerId);
            if (!route) throw new Error("This route is no longer on the active board.");
            return props.onLoadRouteEvidence(route.workArea || route.routeName);
          }}
          route={routes.find((route) => route.id === routeDrawerId) ?? null}
          staffingRoute={props.dispatchSnapshot?.routes.find((route) => route.id === routeDrawerId) ?? null}
        />
      ) : null}
      {actionOpen && props.dispatchSnapshot ? (
        <ManagerActionDrawer
          busy={props.dispatchBusy}
          initialActionCode={initialRouteId ? initialActionCode : undefined}
          initialRosterMemberId={initialRosterMemberId}
          initialRouteId={initialRouteId}
          onClose={() => setActionOpen(false)}
          onLoadWalkOns={props.onLoadWalkOns}
          onSubmitDelivery={props.onSubmitDelivery}
          onSubmitEvent={props.onSubmitDispatch}
          onSubmitWalkOn={props.onSubmitWalkOn}
          snapshot={props.dispatchSnapshot}
        />
      ) : null}
    </>
  );
}

type PeopleSurfaceKey = "briefing" | "roster" | "hiring";
type PeopleRosterFilter = "all" | "active" | "trainee" | "candidate" | "former" | "attention";

function peopleInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "—";
}

function peopleStatusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function complianceCopy(signal: ManagerPeopleComplianceSignal) {
  if (signal.status === "missing") return "Missing";
  if (signal.status === "expired") return `Expired${signal.daysRemaining == null ? "" : ` ${Math.abs(signal.daysRemaining)}d ago`}`;
  return `${signal.daysRemaining ?? 0}d remaining`;
}

function PeopleMetric(props: { label: string; value: number; attention?: boolean }) {
  return (
    <View style={[styles.peopleMetric, props.attention && styles.peopleMetricAttention]}>
      <Text style={styles.peopleMetricValue}>{props.value}</Text>
      <Text numberOfLines={1} style={styles.peopleMetricLabel}>{props.label}</Text>
    </View>
  );
}

function PeoplePersonCard(props: { person: ManagerPerson; onPress: () => void }) {
  const candidate = props.person.employmentStatus === "Candidate";
  return (
    <Pressable
      accessibilityHint="Opens this person's governed mobile workspace"
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.peopleCard, props.person.complianceSignals.length > 0 && styles.peopleCardAttention, pressed && styles.pressed]}
    >
      <View style={styles.peopleAvatar}><Text style={styles.peopleAvatarText}>{peopleInitials(props.person.fullName)}</Text></View>
      <View style={styles.accessCopy}>
        <View style={styles.peopleCardHeading}>
          <Text numberOfLines={1} style={styles.peopleCardTitle}>{props.person.fullName}</Text>
          <Text style={styles.peopleCardArrow}>›</Text>
        </View>
        <Text numberOfLines={1} style={styles.detail}>
          {candidate ? props.person.candidateStageLabel || "New candidate" : props.person.jobTitle || props.person.workerType || peopleStatusLabel(props.person.employmentStatus)}
        </Text>
        <View style={styles.peopleChips}>
          <View style={styles.peopleChip}><Text style={styles.peopleChipText}>{peopleStatusLabel(props.person.employmentStatus)}</Text></View>
          {props.person.marketCode ? <View style={styles.peopleChip}><Text style={styles.peopleChipText}>{props.person.marketCode}</Text></View> : null}
          {props.person.complianceSignals.length ? <View style={styles.peopleChipAttention}><Text style={styles.peopleChipAttentionText}>{props.person.complianceSignals.length} compliance</Text></View> : null}
        </View>
        {candidate && props.person.requiredChecklistTotal > 0 ? (
          <View style={styles.peopleProgressTrack}><View style={[styles.peopleProgressFill, { width: `${props.person.candidateProgress}%` }]} /></View>
        ) : null}
      </View>
    </Pressable>
  );
}

function PeoplePersonModal(props: {
  busy: boolean;
  onClose: () => void;
  onSubmitCandidateStage: (rosterMemberId: string, stageKey: string, note: string) => Promise<void>;
  person: ManagerPerson;
  snapshot: ManagerPeopleSnapshot;
}) {
  const [stageKey, setStageKey] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [intentOpen, setIntentOpen] = useState(false);
  const candidate = props.person.employmentStatus === "Candidate";
  const availableStages = props.snapshot.stages.filter((stage) =>
    stage.key !== props.person.candidateStageKey && !["candidate_created", "invited"].includes(stage.key),
  );
  const selectedStage = availableStages.find((stage) => stage.key === stageKey) ?? null;

  async function submitStage() {
    if (!selectedStage || props.busy) {
      setFormError("Choose the next candidate stage.");
      return;
    }
    try {
      setFormError(null);
      await props.onSubmitCandidateStage(props.person.id, selectedStage.key, note);
      setIntentOpen(false);
      props.onClose();
    } catch (caught) {
      setIntentOpen(false);
      setFormError(caught instanceof Error ? caught.message : "The candidate stage could not be updated.");
    }
  }

  const facts = [
    ["Email", props.person.email],
    ["Phone", props.person.phone],
    ["Reports to", props.person.reportsToName],
    ["Hire date", props.person.hireDate ? readableDate(props.person.hireDate, { month: "short", day: "numeric", year: "numeric" }) : null],
    ["Separation", props.person.separationDate ? readableDate(props.person.separationDate, { month: "short", day: "numeric", year: "numeric" }) : null],
    ["Invite", props.person.inviteStatus],
    ["FX ID", props.person.fxId],
    ["DSW ID", props.person.dswid],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.peopleModal} keyboardShouldPersistTaps="handled">
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>PEOPLE · GOVERNED RECORD</Text>
            <Text style={styles.drawerTitle}>{props.person.fullName}</Text>
            <Text style={styles.detail}>{props.person.jobTitle || props.person.workerType || peopleStatusLabel(props.person.employmentStatus)}</Text>
          </View>
          <Pressable disabled={props.busy} onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.peopleFacts}>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.peopleFact}><Text style={styles.peopleFactLabel}>{label}</Text><Text style={styles.peopleFactValue}>{value}</Text></View>
          ))}
        </View>

        <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Compliance posture</Text><Text style={styles.sectionMeta}>{props.person.complianceSignals.length || "CLEAR"}</Text></View>
        {props.person.complianceSignals.length ? props.person.complianceSignals.map((signal) => (
          <View key={signal.key} style={[styles.peopleCompliance, signal.status === "warning" ? styles.peopleComplianceWarning : styles.peopleComplianceUrgent]}>
            <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>{signal.label}</Text><Text style={styles.detail}>{signal.expirationDate ? readableDate(signal.expirationDate, { month: "short", day: "numeric", year: "numeric" }) : "No expiration on file"}</Text></View>
            <Text style={signal.status === "warning" ? styles.peopleWarningText : styles.peopleUrgentText}>{complianceCopy(signal)}</Text>
          </View>
        )) : <Card><Text style={sharedStyles.bodyStrong}>No current compliance alerts</Text><Text style={sharedStyles.muted}>The mobile threshold view matches the authoritative People posture.</Text></Card>}

        {candidate ? (
          <>
            <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Hiring workflow</Text><Text style={styles.sectionMeta}>{props.person.candidateProgress}% READY</Text></View>
            <View style={styles.peopleHiringCard}>
              <Text style={sharedStyles.bodyStrong}>{props.person.candidateStageLabel || "New candidate"}</Text>
              <Text style={styles.detail}>{props.person.requiredChecklistComplete} of {props.person.requiredChecklistTotal} required readiness items complete</Text>
              <View style={styles.peopleProgressTrack}><View style={[styles.peopleProgressFill, { width: `${props.person.candidateProgress}%` }]} /></View>
            </View>
            {props.snapshot.canManageHiring && !props.person.candidateStageTerminal ? (
              <View style={styles.drawerStep}>
                <Text style={styles.drawerStepLabel}>Change candidate stage</Text>
                <View style={styles.drawerActionGroup}>
                  {availableStages.map((stage: ManagerCandidateStage) => (
                    <Pressable key={stage.key} onPress={() => { setStageKey(stage.key); setFormError(null); }} style={[styles.drawerChoice, stageKey === stage.key && styles.drawerChoiceSelected, stage.isTerminal && styles.drawerChoiceDanger]}>
                      <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>{stage.label}</Text><Text style={styles.detail}>{stage.isTerminal ? "This closes the active candidate workflow." : "Moves the existing candidate workflow forward."}</Text></View>
                      {stageKey === stage.key ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
                    </Pressable>
                  ))}
                </View>
                <TextInput multiline onChangeText={setNote} placeholder="Optional manager note" placeholderTextColor={colors.muted} style={styles.noteInput} value={note} />
                {formError ? <Text style={styles.peopleUrgentText}>{formError}</Text> : null}
                <PrimaryButton compact disabled={!selectedStage || props.busy} label={props.busy ? "Updating…" : "Review stage change"} onPress={() => setIntentOpen(true)} />
              </View>
            ) : null}
          </>
        ) : null}

        <Card>
          <Text style={sharedStyles.bodyStrong}>Governed person workspace</Text>
          <Text style={sharedStyles.muted}>Identity, employment, compliance, invitation status, and candidate progression are available here. Bulk imports are intentionally excluded from iPad.</Text>
        </Card>
      </ScrollView>
      {intentOpen && selectedStage ? (
        <IntentVerificationModal
          actionLabel={`${selectedStage.isTerminal ? "terminal " : ""}candidate stage`}
          busy={props.busy}
          onCancel={() => setIntentOpen(false)}
          onConfirm={() => void submitStage()}
          visible
        />
      ) : null}
    </Modal>
  );
}

function PeopleReadSurface(props: {
  busy: boolean;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
  onSubmitCandidateStage: (rosterMemberId: string, stageKey: string, note: string) => Promise<void>;
  snapshot: ManagerWorkspaceSnapshot | null;
}) {
  const peopleSnapshot = props.snapshot?.people ?? null;
  const initialSurface: PeopleSurfaceKey = peopleSnapshot?.canViewRoster ? "briefing" : "hiring";
  const [surface, setSurface] = useState<PeopleSurfaceKey>(initialSurface);
  const [filter, setFilter] = useState<PeopleRosterFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  if (props.loading || props.error || !peopleSnapshot) {
    return <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />;
  }
  const availableSurfaces: Array<{ key: PeopleSurfaceKey; label: string }> = [
    ...(peopleSnapshot.canViewRoster ? [{ key: "briefing" as const, label: "Today" }, { key: "roster" as const, label: "Roster" }] : []),
    ...(peopleSnapshot.canManageHiring ? [{ key: "hiring" as const, label: "Hiring" }] : []),
  ];
  const effectiveSurface = availableSurfaces.some((item) => item.key === surface) ? surface : availableSurfaces[0]?.key ?? "briefing";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPeople = peopleSnapshot.people.filter((person) => {
    if (normalizedQuery && ![person.fullName, person.email, person.jobTitle, person.workerType, person.marketCode].some((value) => value?.toLowerCase().includes(normalizedQuery))) return false;
    if (effectiveSurface === "hiring" && person.employmentStatus !== "Candidate") return false;
    if (effectiveSurface !== "roster") return true;
    if (filter === "all") return true;
    if (filter === "attention") return person.complianceSignals.length > 0;
    if (filter === "candidate") return person.employmentStatus === "Candidate";
    if (filter === "former") return person.employmentStatus === "Former" || Boolean(person.separationDate);
    if (filter === "trainee") return person.employmentStatus === "Trainee" || person.workerType?.toLowerCase().includes("trainee");
    return person.employmentStatus === "Active";
  });
  const selectedPerson = peopleSnapshot.people.find((person) => person.id === selectedPersonId) ?? null;
  const todayInterviews = peopleSnapshot.interviews.filter((interview) => {
    if (!interview.startsAt) return false;
    return new Intl.DateTimeFormat("en-CA", { timeZone: peopleSnapshot.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(interview.startsAt)) === peopleSnapshot.serviceDate;
  });
  const attentionPeople = peopleSnapshot.people.filter((person) => person.complianceSignals.length > 0).slice(0, 5);
  const rosterFilters: Array<{ key: PeopleRosterFilter; label: string }> = [
    { key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "trainee", label: "Trainees" },
    { key: "candidate", label: "Candidates" }, { key: "former", label: "Former" }, { key: "attention", label: "Attention" },
  ];

  return (
    <>
      <View style={styles.peopleHero}>
        <View><Text style={styles.nativeBannerLabel}>PEOPLE AUTHORITY</Text><Text style={styles.peopleHeroDate}>{readableDate(peopleSnapshot.serviceDate, { weekday: "long", month: "long", day: "numeric" })}</Text></View>
        <Text style={styles.peopleHeroMeta}>{peopleSnapshot.people.length} governed records</Text>
      </View>
      <View style={styles.peopleTabs}>
        {availableSurfaces.map((item) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: item.key === effectiveSurface }} key={item.key} onPress={() => setSurface(item.key)} style={[styles.peopleTab, item.key === effectiveSurface && styles.peopleTabActive]}>
            <Text style={[styles.peopleTabText, item.key === effectiveSurface && styles.peopleTabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {effectiveSurface === "briefing" ? (
        <>
          <View style={styles.peopleMetrics}>
            <PeopleMetric label="Scheduled" value={peopleSnapshot.scheduledToday} />
            <PeopleMetric label="Off" value={peopleSnapshot.offToday} />
            <PeopleMetric attention={peopleSnapshot.timeAwayToday > 0} label="Time away" value={peopleSnapshot.timeAwayToday} />
            <PeopleMetric attention={peopleSnapshot.interviewsToday > 0} label="Interviews" value={peopleSnapshot.interviewsToday} />
          </View>
          <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Today’s interviews</Text><Text style={styles.sectionMeta}>{todayInterviews.length}</Text></View>
          {todayInterviews.length ? todayInterviews.map((interview) => (
            <View key={interview.id} style={styles.peopleInterview}>
              <View style={styles.peopleAvatar}><Text style={styles.peopleAvatarText}>{peopleInitials(interview.personName)}</Text></View>
              <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>{interview.personName}</Text><Text style={styles.detail}>{formatEventTime(interview.startsAt, peopleSnapshot.timeZone)} · {peopleStatusLabel(interview.status)}{interview.provider ? ` · ${interview.provider}` : ""}</Text></View>
            </View>
          )) : <Card><Text style={sharedStyles.bodyStrong}>No interviews today</Text><Text style={sharedStyles.muted}>The hiring calendar has no interviews on the active operating date.</Text></Card>}
          <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Compliance attention</Text><Text style={styles.sectionMeta}>{attentionPeople.length}</Text></View>
          {attentionPeople.length ? attentionPeople.map((person) => <PeoplePersonCard key={person.id} onPress={() => setSelectedPersonId(person.id)} person={person} />) : <Card><Text style={sharedStyles.bodyStrong}>No immediate compliance alerts</Text><Text style={sharedStyles.muted}>No missing, expired, or 60-day credentials appear in this mobile briefing.</Text></Card>}
        </>
      ) : (
        <>
          {effectiveSurface === "hiring" ? (
            <View style={styles.peopleMetrics}>
              <PeopleMetric label="Candidates" value={filteredPeople.length} />
              <PeopleMetric label="Ready" value={filteredPeople.filter((person) => person.candidateProgress === 100).length} />
              <PeopleMetric label="Interviews" value={peopleSnapshot.interviews.length} />
            </View>
          ) : null}
          <TextInput onChangeText={setQuery} placeholder={effectiveSurface === "hiring" ? "Search candidates" : "Search name, role, email, or market"} placeholderTextColor={colors.muted} style={styles.drawerSearch} value={query} />
          {effectiveSurface === "roster" ? (
            <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>
              {rosterFilters.map((item) => <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.readFilter, filter === item.key && styles.readFilterActive]}><Text style={[styles.readFilterText, filter === item.key && styles.readFilterTextActive]}>{item.label}</Text></Pressable>)}
            </ScrollView>
          ) : null}
          <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>{effectiveSurface === "hiring" ? "Candidate pipeline" : "Company roster"}</Text><Text style={styles.sectionMeta}>{filteredPeople.length}</Text></View>
          {filteredPeople.length ? filteredPeople.map((person) => <PeoplePersonCard key={person.id} onPress={() => setSelectedPersonId(person.id)} person={person} />) : <Card><Text style={sharedStyles.bodyStrong}>No matching records</Text><Text style={sharedStyles.muted}>Adjust the search or filter without changing the authoritative roster.</Text></Card>}
        </>
      )}

      {selectedPerson ? <PeoplePersonModal busy={props.busy} onClose={() => setSelectedPersonId(null)} onSubmitCandidateStage={props.onSubmitCandidateStage} person={selectedPerson} snapshot={peopleSnapshot} /> : null}
    </>
  );
}

type FleetSurfaceKey = "readiness" | "vehicles" | "defects" | "work" | "inspections" | "assets";

function FleetVehicleModal(props: { onClose: () => void; onStartInspection: () => void; snapshot: ManagerFleetSnapshot; vehicle: ManagerFleetVehicle }) {
  const defects = props.snapshot.defects.filter((row) => row.vehicleId === props.vehicle.id);
  const orders = props.snapshot.workOrders.filter((row) => row.vehicleId === props.vehicle.id);
  const inspections = props.snapshot.inspections.filter((row) => row.vehicleId === props.vehicle.id).slice(0, 5);
  return <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
    <ScrollView contentContainerStyle={styles.peopleModal}>
      <View style={[styles.reviewHeader, styles.modalHeaderClearance]}><View><Text style={styles.nativeBannerLabel}>FLEET · GOVERNED UNIT</Text><Text style={styles.drawerTitle}>Unit {props.vehicle.unitNumber}</Text><Text style={styles.detail}>{props.vehicle.description}</Text></View><Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable></View>
      <View style={styles.peopleFacts}>{[
        ["Status", peopleStatusLabel(props.vehicle.status)], ["Route", props.vehicle.route || "—"], ["Driver", props.vehicle.driverName || "—"],
        ["Odometer", props.vehicle.odometerMiles == null ? "—" : props.vehicle.odometerMiles.toLocaleString()], ["GVWR", props.vehicle.gvwrLbs == null ? "Unverified" : `${props.vehicle.gvwrLbs.toLocaleString()} lb`], ["Weight evidence", peopleStatusLabel(props.vehicle.gvwrStatus)],
      ].map(([label, value]) => <View key={label} style={styles.peopleFact}><Text style={styles.peopleFactLabel}>{label}</Text><Text style={styles.peopleFactValue}>{value}</Text></View>)}</View>
      <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Open maintenance</Text><Text style={styles.sectionMeta}>{defects.length + orders.length}</Text></View>
      {defects.map((row) => <Card key={row.id}><Text style={sharedStyles.bodyStrong}>{row.summary}</Text><Text style={styles.detail}>{peopleStatusLabel(row.severity)} · {peopleStatusLabel(row.status)}</Text></Card>)}
      {orders.filter((row) => !["COMPLETED", "CANCELLED"].includes(row.status)).map((row) => <Card key={row.id}><Text style={sharedStyles.bodyStrong}>WO #{row.number} · {row.title}</Text><Text style={styles.detail}>{peopleStatusLabel(row.priority)} · {peopleStatusLabel(row.status)}</Text></Card>)}
      <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Recent inspections</Text><Text style={styles.sectionMeta}>{inspections.length}</Text></View>
      {inspections.map((row) => <Card key={row.id}><Text style={sharedStyles.bodyStrong}>{peopleStatusLabel(row.inspectionType)}</Text><Text style={styles.detail}>{readableDate(row.startedAt, { month: "short", day: "numeric" })} · {row.driverName || "Leadership"} · {row.defectCount} defects</Text></Card>)}
      <PrimaryButton label={`Inspect unit ${props.vehicle.unitNumber}`} onPress={() => { props.onClose(); props.onStartInspection(); }} />
      <Card><Text style={sharedStyles.bodyStrong}>Shared inspection workflow</Text><Text style={sharedStyles.muted}>VIN identification, the governed checklist, defect capture, and optimized inspection evidence use the same workflow on iPhone and iPad.</Text></Card>
    </ScrollView>
  </Modal>;
}

function FleetWorkOrderModal(props: { busy: boolean; onClose: () => void; onSubmit: (draft: ManagerFleetWorkOrderDraft) => Promise<void>; snapshot: ManagerFleetSnapshot }) {
  const [vehicleId, setVehicleId] = useState(""); const [defectId, setDefectId] = useState<string | null>(null);
  const [title, setTitle] = useState(""); const [scope, setScope] = useState("");
  const [priority, setPriority] = useState<ManagerFleetWorkOrderDraft["priority"]>("ROUTINE"); const [intentOpen, setIntentOpen] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { try { setError(null); await props.onSubmit({ vehicleId, defectId, title, scope, priority }); setIntentOpen(false); props.onClose(); } catch (caught) { setIntentOpen(false); setError(caught instanceof Error ? caught.message : "The work order could not be created."); } }
  return <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible><ScrollView contentContainerStyle={styles.peopleModal} keyboardShouldPersistTaps="handled">
    <View style={[styles.reviewHeader, styles.modalHeaderClearance]}><View><Text style={styles.nativeBannerLabel}>FLEET · WORK CONTROL</Text><Text style={styles.drawerTitle}>Open work order</Text></View><Pressable disabled={props.busy} onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable></View>
    <Text style={styles.drawerStepLabel}>Vehicle</Text><View style={styles.drawerActionGroup}>{props.snapshot.vehicles.map((vehicle) => <Pressable key={vehicle.id} onPress={() => { setVehicleId(vehicle.id); setDefectId(null); }} style={[styles.drawerChoice, vehicleId === vehicle.id && styles.drawerChoiceSelected]}><Text style={styles.drawerChoiceTitle}>Unit {vehicle.unitNumber}</Text><Text style={styles.detail}>{vehicle.description}</Text></Pressable>)}</View>
    {vehicleId ? <><Text style={styles.drawerStepLabel}>Source defect · optional</Text><View style={styles.drawerActionGroup}><Pressable onPress={() => setDefectId(null)} style={[styles.drawerChoice, defectId === null && styles.drawerChoiceSelected]}><Text style={styles.drawerChoiceTitle}>Manual work</Text></Pressable>{props.snapshot.defects.filter((row) => row.vehicleId === vehicleId && ["OPEN", "TRIAGED"].includes(row.status)).map((row) => <Pressable key={row.id} onPress={() => { setDefectId(row.id); if (!title) setTitle(row.summary); }} style={[styles.drawerChoice, defectId === row.id && styles.drawerChoiceSelected]}><Text style={styles.drawerChoiceTitle}>{row.summary}</Text><Text style={styles.detail}>{peopleStatusLabel(row.severity)}</Text></Pressable>)}</View></> : null}
    <TextInput onChangeText={setTitle} placeholder="Scope title" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={title} />
    <TextInput multiline onChangeText={setScope} placeholder="Scope of work" placeholderTextColor={colors.muted} style={styles.noteInput} value={scope} />
    <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>{(["ROUTINE", "DUE_SOON", "URGENT", "OUT_OF_SERVICE", "ROADSIDE"] as const).map((item) => <Pressable key={item} onPress={() => setPriority(item)} style={[styles.readFilter, priority === item && styles.readFilterActive]}><Text style={[styles.readFilterText, priority === item && styles.readFilterTextActive]}>{peopleStatusLabel(item)}</Text></Pressable>)}</ScrollView>
    {error ? <Text style={styles.peopleUrgentText}>{error}</Text> : null}<PrimaryButton compact disabled={!vehicleId || !title.trim() || props.busy} label={props.busy ? "Opening…" : "Review work order"} onPress={() => setIntentOpen(true)} />
  </ScrollView>{intentOpen ? <IntentVerificationModal actionLabel="work order creation" busy={props.busy} onCancel={() => setIntentOpen(false)} onConfirm={() => void submit()} visible /> : null}</Modal>;
}

function FleetReadSurface(props: { busy: boolean; error: string | null; loading: boolean; onRefresh: () => void; onStartInspection: () => void; onSubmitWorkOrder: (draft: ManagerFleetWorkOrderDraft) => Promise<void>; onSubmitWorkOrderStatus: (id: string, status: string) => Promise<void>; onSurface?: (surface: FleetSurfaceKey) => void; snapshot: ManagerWorkspaceSnapshot | null; surface?: FleetSurfaceKey }) {
  const fleet = props.snapshot?.fleet; const [localSurface, setLocalSurface] = useState<FleetSurfaceKey>("readiness"); const surface = props.surface ?? localSurface; const [vehicleId, setVehicleId] = useState<string | null>(null); const [workOpen, setWorkOpen] = useState(false); const [intent, setIntent] = useState<{ id: string; status: string } | null>(null); const [actionError, setActionError] = useState<string | null>(null);
  if (props.loading || props.error || !fleet) return <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />;
  const selectedVehicle = fleet.vehicles.find((row) => row.id === vehicleId) ?? null;
  const surfaces: Array<{ key: FleetSurfaceKey; label: string }> = [{ key: "readiness", label: "Ready" }, { key: "vehicles", label: "Units" }, { key: "defects", label: "Defects" }, { key: "work", label: "Work" }, { key: "inspections", label: "Inspections" }, { key: "assets", label: "Asset audit" }];
  const rows = surface === "defects" ? fleet.defects : surface === "work" ? fleet.workOrders : surface === "inspections" ? fleet.inspections : [];
  async function submitStatus() {
    if (!intent) return;
    try {
      setActionError(null);
      await props.onSubmitWorkOrderStatus(intent.id, intent.status);
      setIntent(null);
    } catch (caught) {
      setIntent(null);
      setActionError(caught instanceof Error ? caught.message : "The work order could not be updated.");
    }
  }
  return <>
    <View style={styles.peopleHero}><View><Text style={styles.nativeBannerLabel}>FLEET AUTHORITY</Text><Text style={styles.peopleHeroDate}>{fleet.dispatchReady} of {fleet.totalVehicles} dispatch ready</Text></View><Text style={styles.peopleHeroMeta}>{fleet.unavailable} unavailable</Text></View>
    <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>{surfaces.map((item) => <Pressable key={item.key} onPress={() => { setLocalSurface(item.key); props.onSurface?.(item.key); }} style={[styles.readFilter, surface === item.key && styles.readFilterActive]}><Text style={[styles.readFilterText, surface === item.key && styles.readFilterTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>
    {actionError ? <Card tone="danger"><Text style={sharedStyles.bodyStrong}>{actionError}</Text></Card> : null}
    {surface === "readiness" ? <><View style={styles.peopleMetrics}><PeopleMetric label="Ready" value={fleet.dispatchReady} /><PeopleMetric label="Spare" value={fleet.spareVehicles} /><PeopleMetric attention={fleet.openDefects > 0} label="Defects" value={fleet.openDefects} /><PeopleMetric attention={fleet.openWorkOrders > 0} label="Work" value={fleet.openWorkOrders} /></View><Card><Text style={sharedStyles.bodyStrong}>Weight evidence</Text><Text style={sharedStyles.muted}>{fleet.verifiedGvwr} verified · {fleet.missingGvwr} missing GVWR records. Classification evidence remains observational until reviewed in Fleet.</Text></Card></> : null}
    {(surface === "readiness" || surface === "vehicles") ? fleet.vehicles.map((vehicle) => <Pressable key={vehicle.id} onPress={() => setVehicleId(vehicle.id)} style={[styles.peopleCard, vehicle.openDefectCount + vehicle.openWorkOrderCount > 0 && styles.peopleCardAttention]}><View style={styles.peopleAvatar}><Text style={styles.peopleAvatarText}>{vehicle.unitNumber.slice(-3)}</Text></View><View style={styles.accessCopy}><Text style={styles.peopleCardTitle}>Unit {vehicle.unitNumber}</Text><Text style={styles.detail}>{vehicle.description} · {peopleStatusLabel(vehicle.status)}</Text><Text style={styles.detail}>{vehicle.route || "No route"} · {vehicle.openDefectCount} defects · {vehicle.openWorkOrderCount} work orders</Text></View><Text style={styles.peopleCardArrow}>›</Text></Pressable>) : null}
    {surface === "defects" ? fleet.defects.map((row) => <Card key={row.id}><Text style={sharedStyles.bodyStrong}>Unit {row.unitNumber} · {row.summary}</Text><Text style={styles.detail}>{peopleStatusLabel(row.severity)} · {peopleStatusLabel(row.status)} · {readableDate(row.reportedAt, { month: "short", day: "numeric" })}</Text></Card>) : null}
    {surface === "work" ? <><PrimaryButton compact label="Open work order" onPress={() => setWorkOpen(true)} />{fleet.workOrders.map((row) => <Card key={row.id}><Text style={sharedStyles.bodyStrong}>WO #{row.number} · Unit {row.unitNumber}</Text><Text style={styles.detail}>{row.title} · {peopleStatusLabel(row.priority)} · {peopleStatusLabel(row.status)}</Text>{!["COMPLETED", "CANCELLED"].includes(row.status) ? <View style={styles.drawerActionGroup}>{row.status !== "IN_PROGRESS" ? <PrimaryButton compact disabled={props.busy} label="Start work" onPress={() => setIntent({ id: row.id, status: "IN_PROGRESS" })} secondary /> : null}<PrimaryButton compact disabled={props.busy} label="Complete & certify" onPress={() => setIntent({ id: row.id, status: "COMPLETED" })} /></View> : null}</Card>)}</> : null}
    {surface === "inspections" ? <><PrimaryButton compact label="Start vehicle inspection" onPress={props.onStartInspection} />{rows.map((item) => { const row = item as ManagerFleetSnapshot["inspections"][number]; return <Card key={row.id}><Text style={sharedStyles.bodyStrong}>Unit {row.unitNumber} · {peopleStatusLabel(row.inspectionType)}</Text><Text style={styles.detail}>{readableDate(row.startedAt, { month: "short", day: "numeric", year: "numeric" })} · {row.driverName || "Leadership"} · {row.defectCount} defects</Text></Card>; })}</> : null}
    {surface === "assets" ? <><Card><Text style={sharedStyles.bodyStrong}>Custody and assignment audit</Text><Text style={sharedStyles.muted}>Review each governed unit against its current route, driver assignment, maintenance posture, and latest inspection.</Text></Card>{fleet.vehicles.map((vehicle) => <Pressable key={vehicle.id} onPress={() => setVehicleId(vehicle.id)} style={[styles.peopleCard, (!vehicle.driverName || !vehicle.route || vehicle.openDefectCount > 0) && styles.peopleCardAttention]}><View style={styles.peopleAvatar}><Text style={styles.peopleAvatarText}>{vehicle.unitNumber.slice(-3)}</Text></View><View style={styles.accessCopy}><Text style={styles.peopleCardTitle}>Unit {vehicle.unitNumber}</Text><Text style={styles.detail}>{vehicle.driverName || "No assigned custodian"} · {vehicle.route || "No assigned route"}</Text><Text style={styles.detail}>{vehicle.openDefectCount + vehicle.openWorkOrderCount > 0 ? `${vehicle.openDefectCount} defects · ${vehicle.openWorkOrderCount} work orders` : "No open maintenance exceptions"}</Text></View><Text style={styles.peopleCardArrow}>›</Text></Pressable>)}</> : null}
    {selectedVehicle ? <FleetVehicleModal onClose={() => setVehicleId(null)} onStartInspection={props.onStartInspection} snapshot={fleet} vehicle={selectedVehicle} /> : null}
    {workOpen ? <FleetWorkOrderModal busy={props.busy} onClose={() => setWorkOpen(false)} onSubmit={props.onSubmitWorkOrder} snapshot={fleet} /> : null}
    {intent ? <IntentVerificationModal actionLabel={intent.status === "COMPLETED" ? "repair certification" : "work-order status"} busy={props.busy} onCancel={() => setIntent(null)} onConfirm={() => void submitStatus()} visible /> : null}
  </>;
}

type RoutesSurfaceKey = "directory" | "pattern" | "thresholds" | "history";

function ManagerRouteCard(props: { onPress: () => void; route: ManagerRoute; showHistory?: boolean }) {
  const activeDays = MANAGER_ROUTE_DAYS.filter((day) => props.route.runs[day.key]).map((day) => day.label.slice(0, 1)).join("  ");
  return <Pressable onPress={props.onPress} style={styles.peopleCard}>
    <View style={styles.peopleAvatar}><Text style={styles.peopleAvatarText}>{props.route.currentWaNumber?.slice(-3) || props.route.routeName.slice(-3)}</Text></View>
    <View style={styles.accessCopy}>
      <Text style={styles.peopleCardTitle}>{props.route.currentWaNumber || props.route.routeName}</Text>
      <Text style={styles.detail}>{props.route.routeName}{props.route.routeLocation ? ` · ${props.route.routeLocation}` : ""} · {peopleStatusLabel(props.route.routeType)}</Text>
      <Text style={styles.detail}>{activeDays || "No run days"} · {props.route.rotationName || "No rotation"}</Text>
      {props.showHistory ? <Text style={styles.detail}>{props.route.effectiveStart} → {props.route.effectiveEnd || "Current"} · {props.route.isActive ? "Active" : "Inactive"}</Text> : null}
    </View>
    <Text style={styles.peopleCardArrow}>›</Text>
  </Pressable>;
}

function ManagerRouteEditor(props: { busy: boolean; initial: ManagerRouteDraft; mode: "create" | "edit" | "clone"; onClose: () => void; onSubmit: (draft: ManagerRouteDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(props.initial); const [intentOpen, setIntentOpen] = useState(false); const [error, setError] = useState<string | null>(null);
  const validation = validateManagerRouteDraft(draft);
  async function submit() { try { setError(null); await props.onSubmit(draft); setIntentOpen(false); props.onClose(); } catch (caught) { setIntentOpen(false); setError(caught instanceof Error ? caught.message : "The route could not be saved."); } }
  return <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible><ScrollView contentContainerStyle={styles.peopleModal} keyboardShouldPersistTaps="handled">
    <View style={[styles.reviewHeader, styles.modalHeaderClearance]}><View><Text style={styles.nativeBannerLabel}>ROUTES · VERSIONED BASELINE</Text><Text style={styles.drawerTitle}>{props.mode === "create" ? "Add route" : props.mode === "clone" ? "Clone prior route" : "Edit route"}</Text><Text style={styles.detail}>Saving preserves the prior baseline row and creates the next effective version.</Text></View><Pressable disabled={props.busy} onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable></View>
    <View style={styles.drawerStep}><Text style={styles.drawerStepLabel}>Route identity</Text><TextInput onChangeText={(value) => setDraft((current) => ({ ...current, routeName: value }))} placeholder="Route name" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={draft.routeName} /><TextInput onChangeText={(value) => setDraft((current) => ({ ...current, currentWaNumber: value }))} placeholder="Current WA# · optional" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={draft.currentWaNumber} /><TextInput onChangeText={(value) => setDraft((current) => ({ ...current, routeLocation: value }))} placeholder="Location · optional" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={draft.routeLocation} /><TextInput onChangeText={(value) => setDraft((current) => ({ ...current, rotationName: value }))} placeholder="Rotation · optional" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={draft.rotationName} /></View>
    <Text style={styles.drawerStepLabel}>Route type</Text><View style={styles.phaseSelector}>{(["CORE", "PEAK", "OVERFLOW"] as const).map((value) => <Pressable key={value} onPress={() => setDraft((current) => ({ ...current, routeType: value }))} style={[styles.phaseOption, draft.routeType === value && styles.phaseOptionActive]}><Text style={[styles.phaseOptionText, draft.routeType === value && styles.phaseOptionTextActive]}>{peopleStatusLabel(value)}</Text></Pressable>)}</View>
    <Text style={styles.drawerStepLabel}>Operating days</Text><View style={styles.drawerActionGroup}>{MANAGER_ROUTE_DAYS.map((day) => <Pressable key={day.key} onPress={() => setDraft((current) => ({ ...current, runs: { ...current.runs, [day.key]: !current.runs[day.key] } }))} style={[styles.readFilter, draft.runs[day.key] && styles.readFilterActive]}><Text style={[styles.readFilterText, draft.runs[day.key] && styles.readFilterTextActive]}>{day.label}</Text></Pressable>)}</View>
    <View style={styles.drawerStep}><Text style={styles.drawerStepLabel}>Thresholds · optional</Text><TextInput keyboardType="number-pad" onChangeText={(value) => setDraft((current) => ({ ...current, thresholdStops: value }))} placeholder="Threshold stops" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={draft.thresholdStops} /><TextInput keyboardType="decimal-pad" onChangeText={(value) => setDraft((current) => ({ ...current, thresholdRate: value }))} placeholder="Threshold rate" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={draft.thresholdRate} /></View>
    {props.mode === "edit" ? <Pressable onPress={() => setDraft((current) => ({ ...current, isActive: !current.isActive }))} style={[styles.drawerChoice, draft.isActive && styles.drawerChoiceSelected]}><Text style={styles.drawerChoiceTitle}>{draft.isActive ? "Active route" : "Deactivate route"}</Text><Text style={styles.detail}>{draft.isActive ? "Included in the current baseline" : "Creates an inactive successor and preserves history"}</Text></Pressable> : null}
    <Card tone={validation || error ? "danger" : "primary"}><Text style={sharedStyles.bodyStrong}>{error || validation || "Route baseline is ready for review."}</Text><Text style={sharedStyles.muted}>The server rechecks the Routes grant, company, terminal, and current version.</Text></Card>
    <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : "Review route change"} onPress={() => setIntentOpen(true)} />
  </ScrollView>{intentOpen ? <IntentVerificationModal actionLabel="route baseline change" busy={props.busy} onCancel={() => setIntentOpen(false)} onConfirm={() => void submit()} visible /> : null}</Modal>;
}

function RoutesReadSurface(props: { busy: boolean; error: string | null; loading: boolean; onRefresh: () => void; onSubmit: (routeId: string | null, draft: ManagerRouteDraft) => Promise<void>; snapshot: ManagerWorkspaceSnapshot | null }) {
  const routes = props.snapshot?.routes; const [surface, setSurface] = useState<RoutesSurfaceKey>("directory"); const [query, setQuery] = useState(""); const [editing, setEditing] = useState<{ routeId: string | null; mode: "create" | "edit" | "clone"; draft: ManagerRouteDraft } | null>(null);
  if (props.loading || props.error || !routes) return <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />;
  const normalized = query.trim().toLowerCase();
  const source = surface === "history" ? routes.history : routes.activeRoutes;
  const visible = source.filter((route) => (!normalized || [route.routeName, route.currentWaNumber, route.routeLocation, route.routeType, route.rotationName].some((value) => value?.toLowerCase().includes(normalized))) && (surface !== "thresholds" || route.thresholdStops != null));
  const surfaces: Array<{ key: RoutesSurfaceKey; label: string }> = [{ key: "directory", label: "Directory" }, { key: "pattern", label: "Run pattern" }, { key: "thresholds", label: "Thresholds" }, { key: "history", label: "History" }];
  return <>
    <View style={styles.peopleHero}><View><Text style={styles.nativeBannerLabel}>ROUTES AUTHORITY</Text><Text style={styles.peopleHeroDate}>{routes.activeRoutes.length} active routes</Text></View><Text style={styles.peopleHeroMeta}>{routes.coreCount} core · {routes.thresholdCount} thresholds</Text></View>
    <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>{surfaces.map((item) => <Pressable key={item.key} onPress={() => setSurface(item.key)} style={[styles.readFilter, surface === item.key && styles.readFilterActive]}><Text style={[styles.readFilterText, surface === item.key && styles.readFilterTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>
    <TextInput onChangeText={setQuery} placeholder="Search route, WA#, location, type" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={query} />
    <PrimaryButton compact label="Add route" onPress={() => setEditing({ routeId: null, mode: "create", draft: emptyManagerRouteDraft() })} />
    <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>{surfaces.find((item) => item.key === surface)?.label}</Text><Text style={styles.sectionMeta}>{visible.length}</Text></View>
    {visible.length ? visible.map((route) => <View key={route.id}><ManagerRouteCard onPress={() => { const draft = managerRouteDraft(route); if (surface === "history") draft.isActive = true; setEditing({ routeId: surface === "history" ? null : route.id, mode: surface === "history" ? "clone" : "edit", draft }); }} route={route} showHistory={surface === "history"} />{surface === "thresholds" ? <Text style={styles.detail}>{route.thresholdStops} stops{route.thresholdRate == null ? "" : ` · $${route.thresholdRate.toFixed(2)}`}</Text> : null}</View>) : <Card><Text style={sharedStyles.bodyStrong}>No matching routes</Text><Text style={sharedStyles.muted}>Adjust the search or active route surface.</Text></Card>}
    {editing ? <ManagerRouteEditor busy={props.busy} initial={editing.draft} mode={editing.mode} onClose={() => setEditing(null)} onSubmit={(draft) => props.onSubmit(editing.routeId, draft)} /> : null}
  </>;
}

type CapabilityDefinition = {
  actions: string[];
  note?: string;
};

const CAPABILITY_DEFINITIONS: Record<string, CapabilityDefinition> = {
  "operations:PU Reconciliation": { actions: ["Review pickup totals by route", "Identify unmatched and exception pickups", "Compare planned and completed pickup posture", "Refresh the current service-date reconciliation"] },
  "people:Roster": { actions: ["Search active, trainee, candidate, and former people", "Open governed person records", "Review employment and reporting context", "Inspect compliance alerts"] },
  "people:Workforce Readiness": { actions: ["Review readiness totals", "Filter missing, expiring, and expired requirements", "Open the affected person", "Track the authoritative compliance posture"] },
  "people:Hiring": { actions: ["Review the candidate pipeline", "Open candidate readiness", "Advance or close candidate stages", "Record an optional manager note"] },
  "people:Interviews": { actions: ["Review upcoming candidate conversations", "See candidate and stage context", "Open the governed candidate record", "Advance the workflow after review"] },
  "people:Invitations": { actions: ["Review invitation and activation status", "Find pending or inactive people", "Open the governed person record", "Track onboarding readiness"] },
  "people:Reports": { actions: ["Review roster composition", "Inspect workforce readiness", "Compare candidate and active populations", "Filter compliance exceptions"] },
  "people:Corrective Actions": { actions: ["Review open actions and ownership", "Inspect due-date posture", "Open the associated person record", "Track resolution context"] },
  "people:Policies": { actions: ["Review published policy posture", "Inspect acknowledgment requirements", "See affected workforce context", "Track outstanding acknowledgments"] },
  "people:Compliance": { actions: ["Review missing and expired requirements", "Inspect expiration windows", "Open affected workforce records", "Filter urgent and warning signals"] },
  "fleet:Fleet Home": { actions: ["Review dispatch readiness", "See unavailable and spare units", "Inspect open defects and work orders", "Open vehicle or maintenance detail"] },
  "fleet:Vehicles": { actions: ["Review unit assignment and status", "Inspect route and driver context", "Open defects, work orders, and inspections", "Review weight classification posture"] },
  "fleet:Defects": { actions: ["Review open defects", "Compare severity and state", "Open the associated vehicle", "Create governed maintenance work"] },
  "fleet:Inspections": { actions: ["Review recent inspection outcomes", "See driver and vehicle context", "Inspect defect counts", "Open the governed vehicle history"] },
  "fleet:Work Orders": { actions: ["Create a work order", "Start scheduled work", "Complete and certify repairs", "Review priority and status"] },
  "fleet:Asset Audit": { actions: ["Review assigned asset custody", "Identify missing assignments", "Inspect unit and person context", "Track audit exceptions"], note: "File and photo evidence uploads are intentionally excluded from this iPad pass." },
  "routes:Directory": { actions: ["Search active routes", "Add a route", "Edit the current route baseline", "Clone a prior version"] },
  "routes:Run Pattern": { actions: ["Review operating days", "Change the weekly run pattern", "Preserve the prior version", "Inspect effective dates"] },
  "routes:Thresholds": { actions: ["Review stop and pay thresholds", "Edit threshold values", "Compare active route posture", "Preserve version history"] },
  "routes:History": { actions: ["Review prior route versions", "Inspect effective date ranges", "Clone a historical version", "Reactivate through a governed successor"] },
  "admin:Profile": { actions: ["Review account identity", "Confirm active company context", "Inspect role and grant posture", "Review device security state"] },
  "admin:Company": { actions: ["Review company identity", "Inspect terminal and market configuration", "Confirm operating preferences", "Review company-scoped status"] },
  "admin:Leadership": { actions: ["Review leadership roster", "Inspect titles and reporting responsibility", "Confirm active administrator posture", "Open access context"] },
  "admin:Access": { actions: ["Review company users", "Inspect roles and workspace grants", "Compare active and administrative access", "Confirm company-scoped authority"] },
  "admin:Operations Config": { actions: ["Review route ordering", "Inspect timekeeping oversight", "Confirm terminal preferences", "Review operating configuration"] },
  "admin:Automation": { actions: ["Review operational rules", "Inspect triggers and delivery state", "Confirm company scope", "Review automation posture"] },
  "admin:Payroll Summary": { actions: ["Review pay-period activity", "Inspect timekeeping posture", "Identify exceptions", "Open payroll compliance context"] },
  "admin:Payroll Compliance": { actions: ["Review missing punches", "Inspect approval state", "Identify compliance exceptions", "Compare current period posture"] },
  "admin:Adjustments": { actions: ["Review adjustment requests", "Inspect status and audit context", "Compare affected time entries", "Track approval posture"] },
  "admin:Productivity": { actions: ["Review labor productivity", "Compare route performance", "Inspect workforce trends", "Filter company-scoped results"] },
  "admin:Time Tracking": { actions: ["Review clock activity", "Inspect exceptions", "Track approvals", "Compare scheduled and recorded time"] },
  "admin:Analytics": { actions: ["Review operational trends", "Inspect workforce posture", "Compare company-scoped metrics", "Use current authoritative summaries"] },
  "admin:Assets": { actions: ["Review scanners and fuel cards", "Inspect custody assignments", "Identify audit exceptions", "Open associated person or vehicle context"], note: "Asset evidence uploads are intentionally excluded from this iPad pass." },
  "admin:Opportunities": { actions: ["Review opportunity analyses", "Compare scenarios", "Inspect assumptions", "Review reference data"] },
};

function ManagerCapabilityModal(props: {
  child: ManagerWorkspaceChild;
  onClose: () => void;
  snapshot: ManagerWorkspaceSnapshot | null;
  suite: ManagerWorkspaceSuite;
}) {
  const definition = CAPABILITY_DEFINITIONS[`${props.suite.key}:${props.child.label}`] ?? {
    actions: ["Review authoritative workspace posture", "Inspect company-scoped details", "Filter the available records", "Return to the workspace directory"],
  };
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.capabilityModal}>
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>{props.suite.label.toUpperCase()} · IPAD</Text>
            <Text style={styles.drawerTitle}>{props.child.label}</Text>
            <Text style={styles.detail}>{props.child.detail}</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Done</Text></Pressable>
        </View>
        {props.snapshot?.metrics.length ? (
          <View style={styles.metricBand}>{props.snapshot.metrics.slice(0, 4).map((metric) => <View key={metric.label} style={[styles.metricCard, metricStyle(metric.tone)]}><Text style={styles.metricLabel}>{metric.label}</Text><Text style={styles.metricValue}>{metric.value}</Text></View>)}</View>
        ) : null}
        <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Available on iPad</Text><Text style={styles.sectionMeta}>{definition.actions.length} CAPABILITIES</Text></View>
        {definition.actions.map((action, index) => (
          <View key={action} style={styles.capabilityRow}>
            <View style={styles.capabilityNumber}><Text style={styles.capabilityNumberText}>{index + 1}</Text></View>
            <Text style={styles.capabilityText}>{action}</Text>
          </View>
        ))}
        {props.snapshot?.items.slice(0, 4).map((item) => (
          <View key={item.id} style={styles.readCard}>
            <View style={[styles.readAccent, readAccentStyle(item.tone)]} />
            <Text style={styles.readEyebrow}>{item.eyebrow || props.child.label}</Text>
            <Text style={styles.readCardTitle}>{item.title}</Text>
            <Text style={styles.readCardDetail}>{item.detail}</Text>
          </View>
        ))}
        {definition.note ? <Card tone="primary"><Text style={sharedStyles.bodyStrong}>Scope boundary</Text><Text style={sharedStyles.muted}>{definition.note}</Text></Card> : null}
      </ScrollView>
    </Modal>
  );
}

export function ManagerWorkspaceDetailScreen(props: {
  context: ManagerAccessContext;
  dispatchBusy: boolean;
  dispatchError: string | null;
  dispatchLoading: boolean;
  dispatchSnapshot: ManagerDispatchSnapshot | null;
  fleetBusy: boolean;
  routesBusy: boolean;
  peopleBusy: boolean;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onOpenChild: (key: ManagerWorkspaceChildKey) => void;
  onLoadRouteEvidence: (routeKey: string) => Promise<ManagerRouteEvidenceSnapshot>;
  onLoadWalkOns: () => Promise<ManagerWalkOnSnapshot>;
  onRefresh: () => void;
  onRefreshDispatch: () => void;
  onSettings: () => void;
  onStartInspection: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitDispatch: (draft: ManagerDispatchActionDraft) => Promise<void>;
  onSubmitWalkOn: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
  onSubmitCandidateStage: (rosterMemberId: string, stageKey: string, note: string) => Promise<void>;
  onSubmitFleetWorkOrder: (draft: ManagerFleetWorkOrderDraft) => Promise<void>;
  onSubmitFleetWorkOrderStatus: (id: string, status: string) => Promise<void>;
  onSubmitRoute: (routeId: string | null, draft: ManagerRouteDraft) => Promise<void>;
  snapshot: ManagerWorkspaceSnapshot | null;
  suite: ManagerWorkspaceSuite;
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;
  const [selectedCapability, setSelectedCapability] = useState<ManagerWorkspaceChild | null>(null);
  const [fleetSurface, setFleetSurface] = useState<FleetSurfaceKey>("readiness");
  function openWorkspaceChild(child: ManagerWorkspaceChild) {
    if (props.suite.key === "fleet") {
      const nextSurface: FleetSurfaceKey = child.path === "/fleet/vehicles" ? "vehicles"
        : child.path === "/fleet/defects" ? "defects"
          : child.path === "/fleet/inspections" ? "inspections"
            : child.path === "/fleet/work-orders" ? "work"
              : child.path === "/fleet/assets" ? "assets"
                : "readiness";
      setFleetSurface(nextSurface);
      return;
    }
    if (child.key) props.onOpenChild(child.key);
    else setSelectedCapability(child);
  }
  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title={props.suite.label} />
      <Pressable onPress={props.onBack}><Text style={styles.back}>‹ Workspaces</Text></Pressable>
      {props.suite.key === "operations" ? (
        <OperationsReadSurface
          dispatchBusy={props.dispatchBusy}
          dispatchError={props.dispatchError}
          dispatchLoading={props.dispatchLoading}
          dispatchSnapshot={props.dispatchSnapshot}
          error={props.error}
          loading={props.loading}
          onLoadRouteEvidence={props.onLoadRouteEvidence}
          onLoadWalkOns={props.onLoadWalkOns}
          onRefresh={props.onRefresh}
          onRefreshDispatch={props.onRefreshDispatch}
          onSubmitDelivery={props.onSubmitDelivery}
          onSubmitDispatch={props.onSubmitDispatch}
          onSubmitWalkOn={props.onSubmitWalkOn}
          snapshot={props.snapshot}
        />
      ) : props.suite.key === "people" ? (
        <PeopleReadSurface
          busy={props.peopleBusy}
          error={props.error}
          loading={props.loading}
          onRefresh={props.onRefresh}
          onSubmitCandidateStage={props.onSubmitCandidateStage}
          snapshot={props.snapshot}
        />
      ) : props.suite.key === "fleet" ? (
        <FleetReadSurface busy={props.fleetBusy} error={props.error} loading={props.loading} onRefresh={props.onRefresh} onStartInspection={props.onStartInspection} onSubmitWorkOrder={props.onSubmitFleetWorkOrder} onSubmitWorkOrderStatus={props.onSubmitFleetWorkOrderStatus} onSurface={setFleetSurface} snapshot={props.snapshot} surface={fleetSurface} />
      ) : props.suite.key === "routes" ? (
        <RoutesReadSurface busy={props.routesBusy} error={props.error} loading={props.loading} onRefresh={props.onRefresh} onSubmit={props.onSubmitRoute} snapshot={props.snapshot} />
      ) : (
        <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />
      )}
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionLabel}>{props.suite.label} surfaces</Text>
        <Text style={styles.sectionMeta}>NATIVE READY</Text>
      </View>
      <View style={[styles.workspaceTileGrid, isTablet && styles.workspaceTileGridTablet]}>
        {props.suite.children.map((child) => (
          <View key={child.label} style={[styles.workspaceTileCell, isTablet && styles.workspaceTileCellTablet]}>
            <AccessTile
              code={child.code}
              detail={child.detail}
              label={child.label}
              onPress={() => openWorkspaceChild(child)}
              trailing="NATIVE"
            />
          </View>
        ))}
      </View>
      {selectedCapability ? (
        <ManagerCapabilityModal
          child={selectedCapability}
          onClose={() => setSelectedCapability(null)}
          snapshot={props.snapshot}
          suite={props.suite}
        />
      ) : null}
    </Screen>
  );
}

function OperationsReportDateNavigator(props: {
  availableDates: string[];
  serviceDate: string;
  onServiceDate: (value: string) => void;
}) {
  const dates = [...props.availableDates].sort();
  const index = dates.indexOf(props.serviceDate);
  const previous = index > 0 ? dates[index - 1] : null;
  const next = index >= 0 && index < dates.length - 1 ? dates[index + 1] : null;
  return (
    <View style={styles.reportDateNavigator}>
      <Pressable
        accessibilityLabel="Previous available report"
        disabled={!previous}
        onPress={() => previous && props.onServiceDate(previous)}
        style={[styles.reportDateArrow, !previous && styles.controlDisabled]}
      >
        <Text style={styles.reportDateArrowText}>‹</Text>
      </Pressable>
      <View style={styles.reportDateCopy}>
        <Text style={styles.reportDateLabel}>SERVICE DATE</Text>
        <Text style={styles.reportDateValue}>{readableDate(props.serviceDate, { month: "short", day: "numeric", year: "numeric" })}</Text>
        <Text style={styles.reportDateMeta}>{dates.length} final report{dates.length === 1 ? "" : "s"} available</Text>
      </View>
      <Pressable
        accessibilityLabel="Next available report"
        disabled={!next}
        onPress={() => next && props.onServiceDate(next)}
        style={[styles.reportDateArrow, !next && styles.controlDisabled]}
      >
        <Text style={styles.reportDateArrowText}>›</Text>
      </Pressable>
    </View>
  );
}

function WalkOnAssignmentModal(props: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
  snapshot: ManagerWalkOnSnapshot;
  title?: string;
}) {
  const activePeople = props.snapshot.people.filter((person) => person.status === "ACTIVE");
  const [mode, setMode] = useState<ManagerWalkOnAssignmentDraft["mode"]>(activePeople.length ? "EXISTING" : "NEW");
  const [rosterMemberId, setRosterMemberId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [dswid, setDswid] = useState("");
  const [workforceUnitId, setWorkforceUnitId] = useState<string | null>(null);
  const [newWorkforceUnitName, setNewWorkforceUnitName] = useState("");
  const [serviceDate, setServiceDate] = useState(props.snapshot.serviceDate);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const selectedPerson = activePeople.find((person) => person.rosterMemberId === rosterMemberId) ?? null;
  const draft: ManagerWalkOnAssignmentDraft = {
    mode,
    rosterMemberId,
    fullName,
    dswid,
    workforceUnitId,
    newWorkforceUnitName,
    serviceDate,
    note,
  };
  const validation = validateManagerWalkOnAssignment(draft);
  const personOptions: ManagerSelectOption[] = activePeople.map((person) => ({
    value: person.rosterMemberId,
    label: person.fullName,
    detail: `${person.dswid || "DSWID missing"} · ${person.workforceUnitName || "Unit missing"}`,
  }));
  const unitOptions: ManagerSelectOption[] = props.snapshot.workforceUnits.map((unit) => ({
    value: unit.id,
    label: unit.name,
  }));

  function chooseMode(next: ManagerWalkOnAssignmentDraft["mode"]) {
    setMode(next);
    setRosterMemberId(null);
    setFullName("");
    setDswid("");
    setWorkforceUnitId(null);
    setNewWorkforceUnitName("");
    setFormError(null);
  }

  async function submit() {
    if (validation || props.busy) return;
    try {
      setFormError(null);
      await props.onSubmit({
        ...draft,
        fullName: mode === "EXISTING" ? selectedPerson?.fullName ?? "" : fullName,
        workforceUnitId: mode === "EXISTING"
          ? workforceUnitId || selectedPerson?.workforceUnitId || null
          : workforceUnitId,
      });
      props.onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "The walk-on assignment could not be saved.");
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer} keyboardShouldPersistTaps="handled">
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>OPERATIONS · WALK ON</Text>
            <Text style={styles.drawerTitle}>{props.title ?? "Add support driver"}</Text>
            <Text style={styles.detail}>Reuse a governed identity, add a reusable walk-on, or deliberately create a hiring candidate.</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>1 · Choose record path</Text>
          <View style={styles.phaseSelector}>
            {([
              ["EXISTING", "Known", "Reuse identity"],
              ["NEW", "New", "Reusable support"],
              ["CANDIDATE", "Candidate", "Hiring pipeline"],
            ] as const).map(([value, label, detail]) => {
              const active = mode === value;
              return (
                <Pressable key={value} onPress={() => chooseMode(value)} style={[styles.walkOnMode, active && styles.phaseOptionActive]}>
                  <Text style={[styles.phaseOptionText, active && styles.phaseOptionTextActive]}>{label}</Text>
                  <Text style={[styles.walkOnModeDetail, active && styles.phaseOptionDetailActive]}>{detail}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {mode === "EXISTING" ? (
          <ManagerSelectField
            label="2 · Choose known walk-on"
            onChange={(value) => {
              const person = activePeople.find((candidate) => candidate.rosterMemberId === value) ?? null;
              setRosterMemberId(value);
              setWorkforceUnitId(person?.workforceUnitId ?? null);
              setFormError(null);
            }}
            options={personOptions}
            placeholder="Select known walk-on"
            searchable
            value={rosterMemberId}
          />
        ) : (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>2 · Identity</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={(value) => { setFullName(value); setFormError(null); }}
              placeholder={mode === "CANDIDATE" ? "Candidate full name" : "Walk-on full name"}
              placeholderTextColor={colors.muted}
              style={styles.drawerSearch}
              value={fullName}
            />
            {mode === "NEW" ? (
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={(value) => { setDswid(value); setFormError(null); }}
                placeholder="Foreign DSWID, e.g. HEARNS,JAYLEN"
                placeholderTextColor={colors.muted}
                style={styles.drawerSearch}
                value={dswid}
              />
            ) : null}
          </View>
        )}

        {mode !== "CANDIDATE" ? (
          <>
            <ManagerSelectField
              label="3 · Lending workforce unit"
              onChange={(value) => { setWorkforceUnitId(value); setNewWorkforceUnitName(""); setFormError(null); }}
              options={unitOptions}
              placeholder={selectedPerson?.workforceUnitName || "Choose known unit"}
              searchable
              value={workforceUnitId}
            />
            {mode === "NEW" ? (
              <View style={styles.drawerStep}>
                <Text style={styles.drawerStepLabel}>Or add a new unit</Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={(value) => { setNewWorkforceUnitName(value); if (value.trim()) setWorkforceUnitId(null); setFormError(null); }}
                  placeholder="Lending company or workforce unit"
                  placeholderTextColor={colors.muted}
                  style={styles.drawerSearch}
                  value={newWorkforceUnitName}
                />
              </View>
            ) : null}
          </>
        ) : (
          <Card tone="primary">
            <Text style={sharedStyles.bodyStrong}>Candidate is a deliberate hiring choice</Text>
            <Text style={sharedStyles.muted}>This creates an internal candidate record instead of a reusable walk-on identity.</Text>
          </Card>
        )}

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>{mode === "CANDIDATE" ? "3" : "4"} · Service date</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            onChangeText={(value) => { setServiceDate(value); setFormError(null); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={styles.drawerSearch}
            value={serviceDate}
          />
          <Text style={styles.detail}>Terminal-authoritative default: {props.snapshot.serviceDate}</Text>
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>{mode === "CANDIDATE" ? "4" : "5"} · Context</Text>
          <TextInput multiline onChangeText={setNote} placeholder="Optional assignment note" placeholderTextColor={colors.muted} style={styles.noteInput} value={note} />
        </View>

        <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{formError || validation || "Walk-on workflow is ready to save."}</Text>
          <Text style={sharedStyles.muted}>The server rechecks company access, identity ownership, workforce unit, and service date.</Text>
        </Card>
        <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : mode === "CANDIDATE" ? "Create candidate" : "Save assignment"} onPress={() => void submit()} />
      </ScrollView>
    </Modal>
  );
}

function WalkOnIdentityModal(props: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: ManagerWalkOnIdentityDraft) => Promise<void>;
  person: ManagerWalkOnPerson;
  snapshot: ManagerWalkOnSnapshot;
}) {
  const [fullName, setFullName] = useState(props.person.fullName);
  const [dswid, setDswid] = useState(props.person.dswid ?? "");
  const [workforceUnitId, setWorkforceUnitId] = useState<string | null>(props.person.workforceUnitId);
  const [status, setStatus] = useState(props.person.status);
  const [formError, setFormError] = useState<string | null>(null);
  const draft: ManagerWalkOnIdentityDraft = { rosterMemberId: props.person.rosterMemberId, fullName, dswid, workforceUnitId, status };
  const validation = validateManagerWalkOnIdentity(draft);
  const unitOptions = props.snapshot.workforceUnits.map((unit) => ({ value: unit.id, label: unit.name }));

  async function submit() {
    if (validation || props.busy) return;
    try {
      setFormError(null);
      await props.onSubmit(draft);
      props.onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "The walk-on identity could not be updated.");
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer} keyboardShouldPersistTaps="handled">
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>WALK-ON IDENTITY</Text>
            <Text style={styles.drawerTitle}>{props.person.fullName}</Text>
            <Text style={styles.detail}>Update the reusable identity without moving it into the employee population.</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>
        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>Identity</Text>
          <TextInput autoCapitalize="words" onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={fullName} />
          <TextInput autoCapitalize="characters" autoCorrect={false} onChangeText={setDswid} placeholder="Foreign DSWID" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={dswid} />
        </View>
        <ManagerSelectField label="Lending workforce unit" onChange={setWorkforceUnitId} options={unitOptions} placeholder="Choose unit" searchable value={workforceUnitId} />
        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>Roster status</Text>
          <View style={styles.phaseSelector}>
            {(["ACTIVE", "ARCHIVED"] as const).map((candidate) => {
              const active = status === candidate;
              return (
                <Pressable key={candidate} onPress={() => setStatus(candidate)} style={[styles.phaseOption, active && styles.phaseOptionActive]}>
                  <Text style={[styles.phaseOptionText, active && styles.phaseOptionTextActive]}>{candidate === "ACTIVE" ? "Active" : "Archived"}</Text>
                  <Text style={[styles.phaseOptionDetail, active && styles.phaseOptionDetailActive]}>{candidate === "ACTIVE" ? "Available to reuse" : "Hidden from new work"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{formError || validation || "Identity changes are ready to save."}</Text>
        </Card>
        <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : "Save identity"} onPress={() => void submit()} />
      </ScrollView>
    </Modal>
  );
}

function ManagerWalkOnsSurface(props: {
  busy: boolean;
  error: string | null;
  loading: boolean;
  onManage: (draft: ManagerWalkOnIdentityDraft) => Promise<void>;
  onRefresh: () => void;
  onSave: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
  snapshot: ManagerWalkOnSnapshot | null;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "payroll" | "archived">("active");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [managePerson, setManagePerson] = useState<ManagerWalkOnPerson | null>(null);
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  if (props.loading && !props.snapshot) {
    return <View style={styles.loadingCard}><ActivityIndicator color={colors.primary} /><Text style={sharedStyles.muted}>Loading walk-on identities…</Text></View>;
  }
  if (props.error && !props.snapshot) {
    return <Card tone="danger"><Text style={sharedStyles.bodyStrong}>Walk Ons is unavailable</Text><Text style={sharedStyles.muted}>{props.error}</Text><PrimaryButton compact label="Retry" onPress={props.onRefresh} secondary /></Card>;
  }
  if (!props.snapshot) return null;
  const normalizedSearch = search.trim().toLowerCase();
  const people = props.snapshot.people.filter((person) => {
    const needsPayroll = person.assignments.some((assignment) => assignment.status === "ACTIVE" && !assignment.payrollEventId);
    if (filter === "active" && person.status !== "ACTIVE") return false;
    if (filter === "archived" && person.status !== "ARCHIVED") return false;
    if (filter === "payroll" && !needsPayroll) return false;
    return !normalizedSearch || `${person.fullName} ${person.dswid ?? ""} ${person.workforceUnitName ?? ""}`.toLowerCase().includes(normalizedSearch);
  });
  const active = props.snapshot.people.filter((person) => person.status === "ACTIVE").length;
  const assignments = props.snapshot.people.flatMap((person) => person.assignments).filter((assignment) => assignment.status === "ACTIVE");
  const payroll = assignments.filter((assignment) => !assignment.payrollEventId).length;

  return (
    <>
      {props.error ? <Card tone="danger"><Text style={sharedStyles.bodyStrong}>The latest walk-on change was not saved</Text><Text style={sharedStyles.muted}>{props.error}</Text></Card> : null}
      <View style={styles.walkOnHero}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>NATIVE WALK-ON WORKSPACE</Text>
            <Text style={styles.nativeBannerTitle}>Support identities</Text>
            <Text style={styles.nativeBannerDetail}>Reusable workers stay separate from employees while assignments and payroll posture remain visible.</Text>
          </View>
          <View style={styles.walkOnDate}><Text style={styles.walkOnDateLabel}>SERVICE</Text><Text style={styles.walkOnDateValue}>{readableDate(props.snapshot.serviceDate)}</Text></View>
        </View>
        <View style={styles.pulseStats}>
          <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Active</Text><Text style={styles.pulseStatValue}>{active}</Text></View>
          <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Assignments</Text><Text style={styles.pulseStatValue}>{assignments.length}</Text></View>
          <View style={styles.pulseStat}><Text style={styles.pulseStatLabel}>Needs pay</Text><Text style={styles.pulseStatValue}>{payroll}</Text></View>
        </View>
      </View>
      <PrimaryButton label="Add walk-on assignment" onPress={() => setAssignmentOpen(true)} />
      <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setSearch} placeholder="Search name, DSWID, or workforce unit" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={search} />
      <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>
        {([[
          "active", "Active", active,
        ], ["payroll", "Needs payroll", payroll], ["archived", "Archived", props.snapshot.people.length - active]] as const).map(([key, label, count]) => {
          const selected = filter === key;
          return (
            <Pressable key={key} onPress={() => setFilter(key)} style={[styles.readFilter, selected && styles.readFilterActive]}>
              <Text style={[styles.readFilterText, selected && styles.readFilterTextActive]}>{label}</Text>
              <View style={[styles.readFilterCount, selected && styles.readFilterCountActive]}><Text style={[styles.readFilterCountText, selected && styles.readFilterCountTextActive]}>{count}</Text></View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>Walk-on roster</Text><Text style={styles.sectionMeta}>{people.length}</Text></View>
      {people.map((person) => {
        const expanded = expandedRosterId === person.rosterMemberId;
        const unresolved = person.assignments.filter((assignment) => assignment.status === "ACTIVE" && !assignment.payrollEventId).length;
        return (
          <View key={person.id} style={[styles.readCard, unresolved > 0 && styles.walkOnCardAttention]}>
            <View style={styles.readCardHeader}>
              <Text style={styles.readEyebrow}>{person.status === "ACTIVE" ? "ACTIVE SUPPORT" : "ARCHIVED"}</Text>
              <Text style={styles.readMeta}>{person.dispatchCount} dispatches</Text>
            </View>
            <Text style={styles.readCardTitle}>{person.fullName}</Text>
            <Text style={styles.readCardDetail}>{person.dswid ? `DSWID ${person.dswid}` : "DSWID missing"} · {person.workforceUnitName || "Unit missing"}</Text>
            <View style={styles.readFacts}>
              <View style={styles.readFact}><Text style={styles.readFactLabel}>Last service</Text><Text style={styles.readFactValue}>{readableDate(person.lastSeenDate)}</Text></View>
              <View style={styles.readFact}><Text style={styles.readFactLabel}>Days</Text><Text style={styles.readFactValue}>{person.assignments.filter((item) => item.status === "ACTIVE").length}</Text></View>
              <View style={styles.readFact}><Text style={styles.readFactLabel}>Payroll</Text><Text style={styles.readFactValue}>{unresolved ? `${unresolved} review` : "Ready"}</Text></View>
            </View>
            <View style={styles.walkOnCardActions}>
              <Pressable onPress={() => setManagePerson(person)} style={styles.walkOnCardAction}><Text style={styles.walkOnCardActionText}>Manage</Text></Pressable>
              <Pressable onPress={() => setExpandedRosterId(expanded ? null : person.rosterMemberId)} style={styles.walkOnCardAction}><Text style={styles.walkOnCardActionText}>{expanded ? "Hide history" : "History"}</Text></Pressable>
            </View>
            {expanded ? (
              <View style={styles.walkOnHistory}>
                {person.assignments.length ? person.assignments.map((assignment) => (
                  <View key={assignment.id} style={styles.walkOnHistoryRow}>
                    <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>{readableDate(assignment.serviceDate, { month: "short", day: "numeric", year: "numeric" })}</Text><Text style={styles.detail}>{assignment.note || person.workforceUnitName || "Walk-on assignment"}</Text></View>
                    <Text style={[styles.walkOnPayStatus, !assignment.payrollEventId && styles.walkOnPayStatusAttention]}>{assignment.status === "REVERSED" ? "REVERSED" : assignment.payrollEventId ? assignment.payTreatment?.replaceAll("_", " ") || "PAY SET" : "PAY REVIEW"}</Text>
                  </View>
                )) : <Text style={sharedStyles.muted}>No dated assignments.</Text>}
              </View>
            ) : null}
          </View>
        );
      })}
      {people.length === 0 ? <Card><Text style={sharedStyles.bodyStrong}>No walk-ons match this view</Text><Text style={sharedStyles.muted}>Change the filter or add the first support assignment.</Text></Card> : null}
      {assignmentOpen ? <WalkOnAssignmentModal busy={props.busy} onClose={() => setAssignmentOpen(false)} onSubmit={props.onSave} snapshot={props.snapshot} /> : null}
      {managePerson ? <WalkOnIdentityModal busy={props.busy} onClose={() => setManagePerson(null)} onSubmit={props.onManage} person={managePerson} snapshot={props.snapshot} /> : null}
    </>
  );
}

export function ManagerOperationsChildScreen(props: {
  busy: boolean;
  childKey: Exclude<ManagerWorkspaceChildKey, "dispatch">;
  context: ManagerAccessContext;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onManageWalkOn: (draft: ManagerWalkOnIdentityDraft) => Promise<void>;
  onSaveWalkOn: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
  onServiceDate: (value: string) => void;
  onSettings: () => void;
  snapshot: ManagerWorkspaceSnapshot | null;
}) {
  const suite = managerWorkspaceSuite("operations", props.context);
  const child = suite?.children.find((candidate) => candidate.key === props.childKey);
  if (!child) return null;
  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · OPERATIONS" onSettings={props.onSettings} title={child.label} />
      <Pressable onPress={props.onBack}><Text style={styles.back}>‹ Operations</Text></Pressable>
      {props.childKey === "reports" && props.snapshot?.serviceDate ? (
        <OperationsReportDateNavigator
          availableDates={props.snapshot.availableDates ?? []}
          onServiceDate={props.onServiceDate}
          serviceDate={props.snapshot.serviceDate}
        />
      ) : null}
      {props.childKey === "walk_ons" ? (
        <ManagerWalkOnsSurface
          busy={props.busy}
          error={props.error}
          loading={props.loading}
          onManage={props.onManageWalkOn}
          onRefresh={props.onRefresh}
          onSave={props.onSaveWalkOn}
          snapshot={props.snapshot?.walkOns ?? null}
        />
      ) : <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />}
      <Card tone="primary">
        <Text style={sharedStyles.bodyStrong}>iPad operations workspace</Text>
        <Text style={sharedStyles.muted}>{props.childKey === "walk_ons" ? "Create, reuse, govern, assign, and review pay treatment for support identities without leaving the app." : "This surface uses company-authoritative operational data and preserves the current service-date context."}</Text>
      </Card>
    </Screen>
  );
}

function OperationsDeliveryActionDrawer(props: {
  busy: boolean;
  initialCode?: ManagerDeliveryActionCode;
  onClose: () => void;
  onSubmit: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  snapshot: ManagerDispatchSnapshot;
}) {
  const [code, setCode] = useState<ManagerDeliveryActionCode>(props.initialCode ?? "DELIVERY_NOTE");
  const [note, setNote] = useState("");
  const [assistingRouteId, setAssistingRouteId] = useState<string | null>(null);
  const [receivingRouteId, setReceivingRouteId] = useState<string | null>(null);
  const [stopCount, setStopCount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const draft: ManagerDeliveryActionDraft = { code, note, assistingRouteId, receivingRouteId, stopCount };
  const validation = validateManagerDeliveryAction(draft);

  async function submit() {
    if (validation || props.busy) return;
    try {
      setFormError(null);
      await props.onSubmit(draft);
      props.onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "The delivery action could not be saved.");
    }
  }

  function routeChoice(label: string, selectedId: string | null, onSelect: (routeId: string) => void) {
    return (
      <View style={styles.drawerStep}>
        <Text style={styles.drawerStepLabel}>{label}</Text>
        <View style={styles.drawerChoiceStack}>
          {props.snapshot.routes.map((route) => {
            const selected = route.id === selectedId;
            return (
              <Pressable key={route.id} onPress={() => onSelect(route.id)} style={[styles.drawerChoice, selected && styles.drawerChoiceSelected]}>
                <View style={styles.accessCopy}>
                  <Text style={styles.drawerChoiceTitle}>{[route.routeName, route.workArea].filter(Boolean).join(" · ")}</Text>
                  <Text style={styles.detail}>{route.driverName || "Open driver seat"}</Text>
                </View>
                {selected ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer} keyboardShouldPersistTaps="handled">
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>OPERATIONS · DELIVERY ACTION</Text>
            <Text style={styles.drawerTitle}>Manage delivery context</Text>
            <Text style={styles.detail}>Record a delivery note or document assistance between active routes.</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>1 · Choose action</Text>
          <View style={styles.readChips}>
            {(["DELIVERY_NOTE", "DRIVER_ASSIST"] as const).map((candidate) => {
              const selected = code === candidate;
              return (
                <Pressable key={candidate} onPress={() => { setCode(candidate); setFormError(null); }} style={[styles.drawerAction, selected && styles.drawerActionSelected]}>
                  <Text style={[styles.drawerActionText, selected && styles.drawerActionTextSelected]}>{candidate === "DELIVERY_NOTE" ? "Delivery note" : "Driver assist"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {code === "DELIVERY_NOTE" ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>2 · Add delivery context</Text>
            <TextInput multiline onChangeText={setNote} placeholder="Enter delivery context" placeholderTextColor={colors.muted} style={styles.noteInput} value={note} />
          </View>
        ) : (
          <>
            {routeChoice("2 · Route assisting", assistingRouteId, setAssistingRouteId)}
            {routeChoice("3 · Route receiving assistance", receivingRouteId, setReceivingRouteId)}
            <View style={styles.drawerStep}>
              <Text style={styles.drawerStepLabel}>4 · Stops transferred</Text>
              <TextInput keyboardType="number-pad" onChangeText={setStopCount} placeholder="Stop count" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={stopCount} />
            </View>
          </>
        )}

        <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{validation || formError || "Delivery action is ready to save."}</Text>
          <Text style={sharedStyles.muted}>The server will recheck the company grant, terminal date, delivery phase, and selected routes.</Text>
        </Card>
        <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : "Save delivery action"} onPress={() => void submit()} />
      </ScrollView>
    </Modal>
  );
}

function LegacyManagerActionDrawer(props: {
  busy: boolean;
  initialActionCode?: ManagerDispatchActionCode;
  initialRosterMemberId?: string | null;
  initialRouteId?: string | null;
  onClose: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitEvent: (draft: ManagerDispatchActionDraft) => Promise<void>;
  snapshot: ManagerDispatchSnapshot;
}) {
  const [tool, setTool] = useState<"event" | "delivery" | null>(props.initialActionCode ? "event" : null);
  const [eventCode, setEventCode] = useState<ManagerDispatchActionCode>(props.initialActionCode ?? "ASSIGN_DRIVER");
  const [deliveryCode, setDeliveryCode] = useState<ManagerDeliveryActionCode>("DELIVERY_NOTE");
  const staffingCodes: ManagerDispatchActionCode[] = ["ASSIGN_DRIVER", "UNASSIGN_DRIVER", "ASSIGN_HELPER", "UNASSIGN_HELPER", "ASSIGN_TRAINEE", "UNASSIGN_TRAINEE"];
  const allowedEventCodes = props.snapshot.dayStatus === "LOCKED"
    ? staffingCodes
    : MANAGER_DISPATCH_ACTIONS.map((action) => action.code);

  if (tool === "event") {
    return (
      <DispatchActionDrawer
        allowedCodes={allowedEventCodes}
        busy={props.busy}
        initialActionCode={eventCode}
        initialRosterMemberId={props.initialRosterMemberId}
        initialRouteId={props.initialRouteId ?? null}
        onClose={props.onClose}
        onSubmit={props.onSubmitEvent}
        snapshot={props.snapshot}
      />
    );
  }

  if (tool === "delivery") {
    return (
      <OperationsDeliveryActionDrawer
        busy={props.busy}
        initialCode={deliveryCode}
        onClose={props.onClose}
        onSubmit={props.onSubmitDelivery}
        snapshot={props.snapshot}
      />
    );
  }

  const openEvent = (code: ManagerDispatchActionCode) => { setEventCode(code); setTool("event"); };
  const openDelivery = (code: ManagerDeliveryActionCode) => { setDeliveryCode(code); setTool("delivery"); };

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer}>
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>MANAGER ACTION</Text>
            <Text style={styles.drawerTitle}>Manage today’s operation</Text>
            <Text style={styles.detail}>This universal tool records governed changes from any manager workspace.</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>
        <View style={styles.drawerChoiceStack}>
          <Pressable onPress={() => openEvent("ASSIGN_DRIVER")} style={styles.drawerChoice}>
            <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>Route staffing</Text><Text style={styles.detail}>Assign, change, or clear drivers, helpers, and trainees.</Text></View><Text style={styles.routeManageArrow}>›</Text>
          </Pressable>
          {props.snapshot.dayStatus === "ACTIVE" ? (
            <>
              <Pressable onPress={() => openEvent("ARRIVED")} style={styles.drawerChoice}>
                <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>Attendance and exceptions</Text><Text style={styles.detail}>Arrival, call-out, no-show, and late-arrival events.</Text></View><Text style={styles.routeManageArrow}>›</Text>
              </Pressable>
              <Pressable onPress={() => openEvent("ADD_ROUTE")} style={styles.drawerChoice}>
                <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>Route plan changes</Text><Text style={styles.detail}>Add or remove routes during the Dispatch phase.</Text></View><Text style={styles.routeManageArrow}>›</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => openDelivery("DELIVERY_NOTE")} style={styles.drawerChoice}>
                <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>Delivery note</Text><Text style={styles.detail}>Record delivery context after operational handoff.</Text></View><Text style={styles.routeManageArrow}>›</Text>
              </Pressable>
              <Pressable onPress={() => openDelivery("DRIVER_ASSIST")} style={styles.drawerChoice}>
                <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>Driver assist</Text><Text style={styles.detail}>Document assistance and transferred stops between routes.</Text></View><Text style={styles.routeManageArrow}>›</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

type ManagerSelectOption = {
  value: string;
  label: string;
  detail?: string;
};

type ManagerActionGroupKey =
  | "route_staffing"
  | "workforce"
  | "route_operations"
  | "delivery_support"
  | "notes_context";

type ManagerActionOption = ManagerSelectOption & {
  group: ManagerActionGroupKey;
};

const managerActionGroupCopy: Record<ManagerActionGroupKey, { label: string; detail: string }> = {
  route_staffing: { label: "Route staffing", detail: "Assign or clear drivers, helpers, and trainees" },
  workforce: { label: "Workforce", detail: "Arrival, call-out, no-show, and staffing-pool events" },
  route_operations: { label: "Route operations", detail: "Add, remove, transfer, or flag a route" },
  delivery_support: { label: "Delivery support", detail: "Record assistance between active routes" },
  notes_context: { label: "Notes and context", detail: "Record operational or delivery context" },
};

const managerStaffingCodes = new Set<ManagerDispatchActionCode>([
  "ASSIGN_DRIVER",
  "UNASSIGN_DRIVER",
  "ASSIGN_HELPER",
  "UNASSIGN_HELPER",
  "ASSIGN_TRAINEE",
  "UNASSIGN_TRAINEE",
]);

function managerEventActionGroup(action: ReturnType<typeof dispatchActionDefinition>): ManagerActionGroupKey {
  if (managerStaffingCodes.has(action.code) || action.category.toUpperCase() === "ASSIGNMENT") return "route_staffing";
  if (action.category.toUpperCase() === "WORKFORCE") return "workforce";
  if (["OPERATIONS", "COVERAGE", "PERFORMANCE"].includes(action.category.toUpperCase())) return "route_operations";
  return "notes_context";
}

function ManagerSelectField(props: {
  label: string;
  onChange: (value: string) => void;
  options: ManagerSelectOption[];
  placeholder: string;
  searchable?: boolean;
  value: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = props.options.find((option) => option.value === props.value) ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const options = normalizedSearch
    ? props.options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(normalizedSearch))
    : props.options;
  function close() {
    setOpen(false);
    setSearch("");
  }

  return (
    <>
      <View style={styles.drawerStep}>
        <Text style={styles.drawerStepLabel}>{props.label}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
        >
          <View style={styles.accessCopy}>
            <Text style={selected ? styles.selectFieldValue : styles.selectFieldPlaceholder}>
              {selected?.label ?? props.placeholder}
            </Text>
            {selected?.detail ? <Text style={styles.detail}>{selected.detail}</Text> : null}
          </View>
          <Text style={styles.selectFieldArrow}>⌄</Text>
        </Pressable>
      </View>
      {open ? (
        <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
          <View style={styles.selectionSheet}>
            <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
              <View style={styles.accessCopy}>
                <Text style={styles.nativeBannerLabel}>CHOOSE</Text>
                <Text style={styles.drawerTitle}>{props.label.replace(/^(?:Step )?\d+ · /, "")}</Text>
                <Text style={styles.detail}>{options.length} available</Text>
              </View>
              <Pressable onPress={close}><Text style={styles.done}>Done</Text></Pressable>
            </View>
            {props.searchable ? (
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSearch}
                placeholder="Search"
                placeholderTextColor={colors.muted}
                style={styles.drawerSearch}
                value={search}
              />
            ) : null}
            <ScrollView contentContainerStyle={styles.selectionOptionStack} keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const isSelected = option.value === props.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      props.onChange(option.value);
                      close();
                    }}
                    style={({ pressed }) => [styles.selectionOption, isSelected && styles.drawerChoiceSelected, pressed && styles.pressed]}
                  >
                    <View style={styles.accessCopy}>
                      <Text style={styles.drawerChoiceTitle}>{option.label}</Text>
                      {option.detail ? <Text style={styles.detail}>{option.detail}</Text> : null}
                    </View>
                    {isSelected ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
                  </Pressable>
                );
              })}
              {options.length === 0 ? <Text style={sharedStyles.muted}>No eligible options match this action.</Text> : null}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function ManagerActionDrawer(props: {
  busy: boolean;
  initialActionCode?: ManagerDispatchActionCode;
  initialRosterMemberId?: string | null;
  initialRouteId?: string | null;
  onClose: () => void;
  onLoadWalkOns: () => Promise<ManagerWalkOnSnapshot>;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitEvent: (draft: ManagerDispatchActionDraft) => Promise<void>;
  onSubmitWalkOn: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
  snapshot: ManagerDispatchSnapshot;
}) {
  type Phase = "DISPATCH" | "DELIVERY";
  type SelectedAction = { kind: "event"; code: ManagerDispatchActionCode } | { kind: "delivery"; code: ManagerDeliveryActionCode } | { kind: "walk_on"; code: "ADD_WALK_ON" };
  const initialPhase: Phase = props.snapshot.dayStatus === "ACTIVE" ? "DISPATCH" : "DELIVERY";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const initialAction = props.initialActionCode
    ? { kind: "event" as const, code: props.initialActionCode }
    : null;
  const [selectedAction, setSelectedAction] = useState<SelectedAction | null>(initialAction);
  const [actionGroup, setActionGroup] = useState<ManagerActionGroupKey | null>(
    initialAction ? managerEventActionGroup(dispatchActionDefinition(initialAction.code, props.snapshot)) : null,
  );
  const [routeId, setRouteId] = useState<string | null>(props.initialRouteId ?? null);
  const [rosterMemberId, setRosterMemberId] = useState<string | null>(props.initialRosterMemberId ?? null);
  const [manualRoute, setManualRoute] = useState("");
  const [note, setNote] = useState("");
  const [assistingRouteId, setAssistingRouteId] = useState<string | null>(props.initialRouteId ?? null);
  const [receivingRouteId, setReceivingRouteId] = useState<string | null>(null);
  const [stopCount, setStopCount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [walkOnOpen, setWalkOnOpen] = useState(false);
  const [walkOnLoading, setWalkOnLoading] = useState(false);
  const [walkOnSnapshot, setWalkOnSnapshot] = useState<ManagerWalkOnSnapshot | null>(null);
  const [walkOnError, setWalkOnError] = useState<string | null>(null);

  const eventAction = selectedAction?.kind === "event" ? dispatchActionDefinition(selectedAction.code, props.snapshot) : null;
  const eventDraft: ManagerDispatchActionDraft | null = eventAction && selectedAction?.kind === "event"
    ? { phase, code: selectedAction.code, routeId, rosterMemberId, manualRoute, note }
    : null;
  const deliveryDraft: ManagerDeliveryActionDraft | null = selectedAction?.kind === "delivery"
    ? { code: selectedAction.code, note, assistingRouteId, receivingRouteId, stopCount }
    : null;
  const validation = selectedAction?.kind === "walk_on" ? null : eventDraft
    ? validateDispatchAction(eventDraft, props.snapshot)
    : deliveryDraft ? validateManagerDeliveryAction(deliveryDraft) : actionGroup ? "Choose an action." : "Choose a primary action group.";
  const actionLabel = selectedAction?.kind === "event"
    ? dispatchActionDefinition(selectedAction.code, props.snapshot).label
    : selectedAction?.kind === "walk_on" ? "Walk-on" : selectedAction?.code === "DELIVERY_NOTE" ? "Delivery note" : selectedAction?.code === "DRIVER_ASSIST" ? "Driver assist" : "action";
  const assignsSeat = selectedAction?.kind === "event" && ["ASSIGN_DRIVER", "ASSIGN_HELPER", "ASSIGN_TRAINEE"].includes(selectedAction.code);
  const people = props.snapshot.people.filter((person) => !assignsSeat || !person.assignedRouteId || person.assignedRouteId === routeId);
  const routeOptions: ManagerSelectOption[] = props.snapshot.routes.map((route) => ({
    value: route.id,
    label: [route.routeName, route.workArea].filter(Boolean).join(" · "),
    detail: route.driverName || "Open driver seat",
  }));
  const peopleOptions: ManagerSelectOption[] = people.map((person) => ({
    value: person.rosterMemberId,
    label: person.fullName,
    detail: `${person.workerType}${person.arrived ? " · Arrived" : ""}${person.assignedSeat ? ` · ${person.assignedSeat}` : ""}`,
  }));
  const dispatchCatalog = dispatchActionDefinitions(props.snapshot);
  const allActionOptions: ManagerActionOption[] = phase === "DISPATCH"
    ? [
        ...dispatchCatalog.map((action) => ({
        value: `event:${action.code}`,
        label: action.label,
        detail: action.category,
        group: managerEventActionGroup(action),
        })),
        { value: "walk_on:ADD_WALK_ON", label: "Walk-on", detail: "Reusable support identity", group: "workforce" as const },
      ]
    : [
        ...MANAGER_DISPATCH_ACTIONS.filter((action) => managerStaffingCodes.has(action.code)).map((action) => ({
          value: `event:${action.code}`,
          label: action.label,
          detail: "Route staffing",
          group: "route_staffing" as const,
        })),
        { value: "delivery:DRIVER_ASSIST", label: "Driver assist", detail: "Route-to-route assistance", group: "delivery_support" as const },
        { value: "delivery:DELIVERY_NOTE", label: "Delivery note", detail: "Delivery context", group: "notes_context" as const },
      ];
  const groupOrder: ManagerActionGroupKey[] = phase === "DISPATCH"
    ? ["route_staffing", "workforce", "route_operations", "notes_context"]
    : ["route_staffing", "delivery_support", "notes_context"];
  const groupOptions: ManagerSelectOption[] = groupOrder
    .filter((group) => allActionOptions.some((option) => option.group === group))
    .map((group) => ({ value: group, ...managerActionGroupCopy[group] }));
  const actionOptions = actionGroup ? allActionOptions.filter((option) => option.group === actionGroup) : [];
  const selectedActionValue = selectedAction ? `${selectedAction.kind}:${selectedAction.code}` : null;
  const nextStep = 3;

  function choosePhase(nextPhase: Phase) {
    setPhase(nextPhase);
    setFormError(null);
    setActionGroup(null);
    setSelectedAction(null);
  }

  function chooseActionGroup(value: string) {
    setActionGroup(value as ManagerActionGroupKey);
    setSelectedAction(null);
    setRosterMemberId(null);
    setManualRoute("");
    setNote("");
    setFormError(null);
  }

  function chooseAction(value: string) {
    const [kind, code] = value.split(":") as ["event" | "delivery" | "walk_on", ManagerDispatchActionCode | ManagerDeliveryActionCode | "ADD_WALK_ON"];
    setSelectedAction(kind === "event"
      ? { kind, code: code as ManagerDispatchActionCode }
      : kind === "delivery"
        ? { kind, code: code as ManagerDeliveryActionCode }
        : { kind, code: "ADD_WALK_ON" });
    setRosterMemberId(null);
    setManualRoute("");
    setNote("");
    setFormError(null);
  }

  async function openWalkOnWorkflow() {
    try {
      setWalkOnLoading(true);
      setWalkOnError(null);
      const next = await props.onLoadWalkOns();
      setWalkOnSnapshot(next);
      setWalkOnOpen(true);
    } catch (caught) {
      setWalkOnError(caught instanceof Error ? caught.message : "Walk-on identities could not be loaded.");
    } finally {
      setWalkOnLoading(false);
    }
  }

  async function submit() {
    if (validation || props.busy) return;
    try {
      setFormError(null);
      if (eventDraft) await props.onSubmitEvent(eventDraft);
      else if (deliveryDraft) await props.onSubmitDelivery(deliveryDraft);
      props.onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "The manager action could not be saved.");
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer} keyboardShouldPersistTaps="handled">
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>MANAGER ACTION</Text>
            <Text style={styles.drawerTitle}>Manage today’s operation</Text>
            <Text style={styles.detail}>One governed action tool for every manager workspace.</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>Choose action phase</Text>
          <View style={styles.phaseSelector}>
            {(["DISPATCH", "DELIVERY"] as const).map((candidate) => {
              const active = phase === candidate;
              return (
                <Pressable key={candidate} onPress={() => choosePhase(candidate)} style={[styles.phaseOption, active && styles.phaseOptionActive]}>
                  <Text style={[styles.phaseOptionText, active && styles.phaseOptionTextActive]}>{candidate === "DISPATCH" ? "Dispatch" : "Delivery"}</Text>
                  <Text style={[styles.phaseOptionDetail, active && styles.phaseOptionDetailActive]}>{candidate === "DISPATCH" ? "Sort + handoff" : "On-road work"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ManagerSelectField label="Step 1 · Choose action group" onChange={chooseActionGroup} options={groupOptions} placeholder="Choose a primary group" value={actionGroup} />

        {actionGroup ? (
          <ManagerSelectField
            label="Step 2 · Choose action"
            onChange={chooseAction}
            options={actionOptions}
            placeholder="Choose an action"
            searchable
            value={selectedActionValue}
          />
        ) : null}

        {eventAction?.requiresRoute ? (
          <ManagerSelectField label={`${nextStep} · Choose route`} onChange={(value) => { setRouteId(value); setFormError(null); }} options={routeOptions} placeholder="Select route" searchable value={routeId} />
        ) : null}
        {eventAction?.requiresManualRoute ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>{nextStep} · Enter route</Text>
            <TextInput autoCapitalize="characters" autoCorrect={false} onChangeText={(value) => { setManualRoute(value); setFormError(null); }} placeholder="Route or WA number" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={manualRoute} />
          </View>
        ) : null}
        {eventAction?.requiresPerson ? (
          <ManagerSelectField
            label={`${nextStep + Number(eventAction.requiresRoute || eventAction.requiresManualRoute)} · Choose person`}
            onChange={(value) => { setRosterMemberId(value); setFormError(null); }}
            options={peopleOptions}
            placeholder="Select workforce member"
            searchable
            value={rosterMemberId}
          />
        ) : null}
        {eventAction?.allowsNote ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>{nextStep + Number(eventAction.requiresRoute || eventAction.requiresManualRoute) + Number(eventAction.requiresPerson)} · Add context</Text>
            <TextInput multiline onChangeText={setNote} placeholder={eventAction.code === "PASS_ROUTE_TO_CSA" ? "Receiving CSA / company" : eventAction.notePrompt ?? "Optional note or dispatch context"} placeholderTextColor={colors.muted} style={styles.noteInput} value={note} />
          </View>
        ) : null}

        {selectedAction?.kind === "delivery" && selectedAction.code === "DELIVERY_NOTE" ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>3 · Add delivery context</Text>
            <TextInput multiline onChangeText={setNote} placeholder="Enter delivery context" placeholderTextColor={colors.muted} style={styles.noteInput} value={note} />
          </View>
        ) : null}
        {selectedAction?.kind === "delivery" && selectedAction.code === "DRIVER_ASSIST" ? (
          <>
            <ManagerSelectField label="3 · Route assisting" onChange={(value) => { setAssistingRouteId(value); setFormError(null); }} options={routeOptions} placeholder="Select assisting route" searchable value={assistingRouteId} />
            <ManagerSelectField label="4 · Route receiving assistance" onChange={(value) => { setReceivingRouteId(value); setFormError(null); }} options={routeOptions} placeholder="Select receiving route" searchable value={receivingRouteId} />
            <View style={styles.drawerStep}>
              <Text style={styles.drawerStepLabel}>5 · Stops transferred</Text>
              <TextInput keyboardType="number-pad" onChangeText={setStopCount} placeholder="Stop count" placeholderTextColor={colors.muted} style={styles.drawerSearch} value={stopCount} />
            </View>
          </>
        ) : null}

        {selectedAction?.kind === "walk_on" ? (
          <Card tone={walkOnError ? "danger" : "primary"}>
            <Text style={sharedStyles.bodyStrong}>{walkOnError || "Continue into the shared Walk Ons workflow."}</Text>
            <Text style={sharedStyles.muted}>The same governed identity and dated-assignment client is used by the native Walk Ons workspace.</Text>
            <PrimaryButton compact disabled={walkOnLoading || props.busy} label={walkOnLoading ? "Loading walk-ons…" : "Open walk-on workflow"} onPress={() => void openWalkOnWorkflow()} />
          </Card>
        ) : null}

        {selectedAction?.kind !== "walk_on" ? <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{formError || validation || `${actionLabel} is ready to save.`}</Text>
          <Text style={sharedStyles.muted}>The server rechecks company access, terminal date, and every linked person or route. The selected phase classifies the event.</Text>
        </Card> : null}
        {selectedAction?.kind !== "walk_on" ? <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : `Save ${actionLabel.toLowerCase()}`} onPress={() => void submit()} /> : null}
        {walkOnOpen && walkOnSnapshot ? (
          <WalkOnAssignmentModal
            busy={props.busy}
            onClose={() => setWalkOnOpen(false)}
            onSubmit={async (draft) => {
              await props.onSubmitWalkOn(draft);
              props.onClose();
            }}
            snapshot={walkOnSnapshot}
            title="Add walk-on to Dispatch"
          />
        ) : null}
      </ScrollView>
    </Modal>
  );
}

function RouteManagementDrawer(props: {
  onAction?: (code: ManagerDispatchActionCode, rosterMemberId: string | null) => void;
  onClose: () => void;
  onLoadEvidence: () => Promise<ManagerRouteEvidenceSnapshot>;
  route: ManagerOperationsRoute | null;
  staffingRoute: ManagerDispatchSnapshot["routes"][number] | null;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidence, setEvidence] = useState<ManagerRouteEvidenceSnapshot | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "open" | "complete" | "attention">("all");
  if (!props.route) return null;
  const route = props.route;
  const routeIdentity = route.workArea && !route.routeName.includes(route.workArea)
    ? `${route.routeName} · ${route.workArea}`
    : route.routeName;
  const driverId = props.staffingRoute?.driverRosterMemberId ?? null;
  const actions: Array<{ code: ManagerDispatchActionCode; label: string; detail: string; rosterMemberId: string | null; danger?: boolean }> = props.onAction ? [
    {
      code: "ASSIGN_DRIVER",
      label: route.driverName ? "Replace driver" : "Assign driver",
      detail: route.driverName ? `Change the driver currently assigned to ${routeIdentity}.` : `Fill the open driver seat on ${routeIdentity}.`,
      rosterMemberId: null,
    },
    ...(route.driverName ? [{
      code: "UNASSIGN_DRIVER" as const,
      label: "Clear driver",
      detail: `Remove ${route.driverName} from this route seat.`,
      rosterMemberId: driverId,
    }] : []),
    {
      code: "ASSIGN_HELPER",
      label: "Assign helper",
      detail: props.staffingRoute?.helperNames.length ? `Add or change helper coverage. Current: ${props.staffingRoute.helperNames.join(", ")}.` : `Add helper coverage to ${routeIdentity}.`,
      rosterMemberId: null,
    },
    ...(props.staffingRoute?.helperRosterMemberIds.length ? [{
      code: "UNASSIGN_HELPER" as const,
      label: "Clear helpers",
      detail: `Remove ${props.staffingRoute.helperNames.join(", ")} from the helper seats.`,
      rosterMemberId: null,
    }] : []),
    {
      code: "ASSIGN_TRAINEE",
      label: "Assign trainee",
      detail: props.staffingRoute?.traineeNames.length ? `Add or change trainee coverage. Current: ${props.staffingRoute.traineeNames.join(", ")}.` : `Add a trainee to ${routeIdentity}.`,
      rosterMemberId: null,
    },
    ...(props.staffingRoute?.traineeRosterMemberIds.length ? [{
      code: "UNASSIGN_TRAINEE" as const,
      label: "Clear trainees",
      detail: `Remove ${props.staffingRoute.traineeNames.join(", ")} from the trainee seats.`,
      rosterMemberId: null,
    }] : []),
    ...(driverId ? [
      { code: "ARRIVED" as const, label: "Mark driver arrived", detail: `Record ${route.driverName}'s arrival.`, rosterMemberId: driverId },
      { code: "CALL_OUT" as const, label: "Record call out", detail: `Record a call out for ${route.driverName}.`, rosterMemberId: driverId },
      { code: "NO_SHOW" as const, label: "Record no show", detail: `Record a no show for ${route.driverName}.`, rosterMemberId: driverId },
      { code: "LATE_ARRIVAL" as const, label: "Record late arrival", detail: `Record a late arrival for ${route.driverName}.`, rosterMemberId: driverId },
    ] : []),
    {
      code: "REMOVE_ROUTE",
      label: "Remove route",
      detail: `Remove ${routeIdentity} from today's dispatch board.`,
      rosterMemberId: null,
      danger: true,
    },
  ] : [];

  async function openEvidence() {
    setEvidenceOpen(true);
    if (evidence) return;
    try {
      setEvidenceLoading(true);
      setEvidenceError(null);
      setEvidence(await props.onLoadEvidence());
    } catch (caught) {
      setEvidenceError(caught instanceof Error ? caught.message : "Delivery evidence could not be loaded.");
    } finally {
      setEvidenceLoading(false);
    }
  }

  const visibleEvidence = evidence?.items.filter((item) => evidenceFilter === "all" || item.status === evidenceFilter) ?? [];

  if (evidenceOpen) {
    return (
      <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
        <ScrollView contentContainerStyle={styles.dispatchDrawer}>
          <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
            <View style={styles.accessCopy}>
              <Pressable onPress={() => setEvidenceOpen(false)}><Text style={styles.back}>‹ Route overview</Text></Pressable>
              <Text style={styles.nativeBannerLabel}>OPERATIONS · DELIVERY EVIDENCE</Text>
              <Text style={styles.drawerTitle}>{routeIdentity}</Text>
              <Text style={styles.detail}>{evidence?.serviceDate || "Current operating date"}</Text>
            </View>
            <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
          </View>

          {evidenceLoading ? (
            <View style={styles.loadingCard}><ActivityIndicator color={colors.primary} /><Text style={sharedStyles.muted}>Loading the route evidence contract…</Text></View>
          ) : evidenceError ? (
            <Card tone="danger">
              <Text style={sharedStyles.bodyStrong}>Delivery evidence is unavailable</Text>
              <Text style={sharedStyles.muted}>{evidenceError}</Text>
              <PrimaryButton compact label="Retry" onPress={() => { setEvidence(null); void openEvidence(); }} secondary />
            </Card>
          ) : evidence ? (
            <>
              <View style={styles.dispatchHeroMetrics}>
                <View style={styles.dispatchHeroMetric}><Text style={styles.pulseStatLabel}>Stops</Text><Text style={styles.dispatchHeroMetricValue}>{evidence.summary.completedStops}/{evidence.summary.deliveryStops}</Text></View>
                <View style={styles.dispatchHeroMetric}><Text style={styles.pulseStatLabel}>Packages</Text><Text style={styles.dispatchHeroMetricValue}>{evidence.summary.packages}</Text></View>
                <View style={styles.dispatchHeroMetric}><Text style={styles.pulseStatLabel}>Pickups</Text><Text style={styles.dispatchHeroMetricValue}>{evidence.summary.pickups}</Text></View>
              </View>
              <Card tone={evidence.summary.attention > 0 ? "danger" : "primary"}>
                <Text style={sharedStyles.bodyStrong}>{evidence.summary.status || "Route evidence"}</Text>
                <Text style={sharedStyles.muted}>{evidence.summary.express} Express · {evidence.summary.attention} need attention{evidence.summary.asOf ? ` · As of ${formatEventTime(evidence.summary.asOf, evidence.timeZone)}` : ""}</Text>
              </Card>
              <ScrollView contentContainerStyle={styles.operationsFilters} horizontal showsHorizontalScrollIndicator={false}>
                {(["all", "open", "complete", "attention"] as const).map((key) => {
                  const count = key === "all" ? evidence.items.length : evidence.items.filter((item) => item.status === key).length;
                  return (
                    <Pressable key={key} onPress={() => setEvidenceFilter(key)} style={[styles.operationsFilter, evidenceFilter === key && styles.operationsFilterActive]}>
                      <Text style={[styles.operationsFilterText, evidenceFilter === key && styles.operationsFilterTextActive]}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                      <View style={[styles.operationsFilterCount, evidenceFilter === key && styles.operationsFilterCountActive]}><Text style={[styles.operationsFilterCountText, evidenceFilter === key && styles.operationsFilterCountTextActive]}>{count}</Text></View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.drawerChoiceStack}>
                {visibleEvidence.map((item) => (
                  <View key={item.id} style={[styles.evidenceItem, item.status === "attention" && styles.evidenceItemAttention, item.status === "complete" && styles.evidenceItemComplete]}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.drawerChoiceTitle}>{item.title}</Text>
                      <Text style={styles.evidenceStatus}>{item.status.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.detail}>{item.subtitle}</Text>
                    <Text style={styles.evidenceAddress}>{item.address}</Text>
                    <Text style={styles.detail}>{item.window} · {item.packageCount}{item.expectedPackageCount == null ? "" : `/${item.expectedPackageCount}`} packages</Text>
                    {item.tags.length ? <View style={styles.readChips}>{item.tags.map((tag) => <View key={tag} style={styles.readChip}><Text style={styles.readChipText}>{tag}</Text></View>)}</View> : null}
                  </View>
                ))}
                {visibleEvidence.length === 0 ? <Card><Text style={sharedStyles.bodyStrong}>No matching evidence</Text><Text style={sharedStyles.muted}>Choose another evidence filter.</Text></Card> : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer}>
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>OPERATIONS · ROUTE</Text>
            <Text style={styles.drawerTitle}>{routeIdentity}</Text>
            <Text style={styles.detail}>{route.driverName || "Open driver seat"} · {operationsPhaseCopy[route.phase].label}</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.operationsMetrics}>
          <OperationsMetric label="Stops" value={`${route.completedStops}/${route.plannedStops || "—"}`} />
          <OperationsMetric label="Packages" value={`${route.completedPackages}/${route.plannedPackages || "—"}`} />
          <OperationsMetric label="PU" value={`${route.completedPickups}/${route.plannedPickups}`} />
          <OperationsMetric express={route} label="Express" value="" />
        </View>

        {props.staffingRoute ? (
          <Card>
            <Text style={sharedStyles.bodyStrong}>Route staffing</Text>
            <Text style={sharedStyles.muted}>Driver · {props.staffingRoute.driverName || "Open"}</Text>
            <Text style={sharedStyles.muted}>Helpers · {props.staffingRoute.helperNames.join(", ") || "None"}</Text>
            <Text style={sharedStyles.muted}>Trainees · {props.staffingRoute.traineeNames.join(", ") || "None"}</Text>
          </Card>
        ) : null}

        <PrimaryButton label="Review delivery evidence" onPress={() => void openEvidence()} />

        {props.onAction ? (
          <>
            <Card tone="primary">
              <Text style={sharedStyles.bodyStrong}>Route-scoped controls</Text>
              <Text style={sharedStyles.muted}>Each control carries this route into the universal Action tool for final confirmation.</Text>
            </Card>

            <View style={styles.drawerChoiceStack}>
              {actions.map((item) => (
                <Pressable
                  key={item.code}
                  onPress={() => props.onAction?.(item.code, item.rosterMemberId)}
                  style={({ pressed }) => [styles.drawerChoice, item.danger && styles.drawerChoiceDanger, pressed && styles.pressed]}
                >
                  <View style={styles.accessCopy}>
                    <Text style={styles.drawerChoiceTitle}>{item.label}</Text>
                    <Text style={styles.detail}>{item.detail}</Text>
                  </View>
                  <Text style={styles.routeManageArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Card>
            <Text style={sharedStyles.bodyStrong}>Evidence access only</Text>
            <Text style={sharedStyles.muted}>This role can review route execution evidence. Dispatch controls are not in its current grant scope.</Text>
          </Card>
        )}
      </ScrollView>
    </Modal>
  );
}

function DispatchActionDrawer(props: {
  allowedCodes?: ManagerDispatchActionCode[];
  busy: boolean;
  initialActionCode?: ManagerDispatchActionCode;
  initialRosterMemberId?: string | null;
  initialRouteId: string | null;
  onClose: () => void;
  onSubmit: (draft: ManagerDispatchActionDraft) => Promise<void>;
  snapshot: ManagerDispatchSnapshot;
}) {
  const [code, setCode] = useState<ManagerDispatchActionCode>(props.initialActionCode ?? "ASSIGN_DRIVER");
  const [routeId, setRouteId] = useState<string | null>(props.initialRouteId);
  const [rosterMemberId, setRosterMemberId] = useState<string | null>(props.initialRosterMemberId ?? null);
  const [manualRoute, setManualRoute] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const action = dispatchActionDefinition(code);
  const draft: ManagerDispatchActionDraft = { code, routeId, rosterMemberId, manualRoute, note };
  const validation = validateDispatchAction(draft, props.snapshot);
  const assignsSeat = ["ASSIGN_DRIVER", "ASSIGN_HELPER", "ASSIGN_TRAINEE"].includes(code);
  const people = props.snapshot.people
    .filter((person) => !assignsSeat || !person.assignedRouteId || person.assignedRouteId === routeId)
    .filter((person) => `${person.fullName} ${person.workerType}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 24);
  const noteStep = 2 + Number(action.requiresRoute || action.requiresManualRoute) + Number(action.requiresPerson);

  async function submit() {
    if (validation || props.busy) return;
    try {
      setFormError(null);
      await props.onSubmit(draft);
      props.onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "The dispatch action could not be saved.");
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer} keyboardShouldPersistTaps="handled">
        <View style={styles.reviewHeader}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>DISPATCH ACTION</Text>
            <Text style={styles.drawerTitle}>Manage today’s operation</Text>
            <Text style={styles.detail}>Choose an action, link its governed target, and confirm the change.</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>1 · Choose action</Text>
          {(["Assignment", "Attendance", "Workforce", "Routes"] as const)
            .filter((category) => MANAGER_DISPATCH_ACTIONS.some((candidate) => candidate.category === category && (!props.allowedCodes || props.allowedCodes.includes(candidate.code))))
            .map((category) => (
            <View key={category} style={styles.drawerActionGroup}>
              <Text style={styles.drawerGroupLabel}>{category}</Text>
              <View style={styles.readChips}>
                {MANAGER_DISPATCH_ACTIONS.filter((candidate) => candidate.category === category && (!props.allowedCodes || props.allowedCodes.includes(candidate.code))).map((candidate) => {
                  const selected = candidate.code === code;
                  return (
                    <Pressable
                      key={candidate.code}
                      onPress={() => {
                        setCode(candidate.code);
                        setRosterMemberId(null);
                        setManualRoute("");
                        if (!candidate.requiresRoute) setRouteId(null);
                        setFormError(null);
                      }}
                      style={[styles.drawerAction, selected && styles.drawerActionSelected]}
                    >
                      <Text style={[styles.drawerActionText, selected && styles.drawerActionTextSelected]}>{candidate.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {action.requiresRoute ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>2 · Choose route</Text>
            <View style={styles.drawerChoiceStack}>
              {props.snapshot.routes.map((route) => {
                const selected = route.id === routeId;
                return (
                  <Pressable
                    key={route.id}
                    onPress={() => { setRouteId(route.id); setFormError(null); }}
                    style={[styles.drawerChoice, selected && styles.drawerChoiceSelected]}
                  >
                    <View style={styles.accessCopy}>
                      <Text style={styles.drawerChoiceTitle}>{[route.routeName, route.workArea].filter(Boolean).join(" · ")}</Text>
                      <Text style={styles.detail}>{route.driverName || "Open driver seat"}</Text>
                    </View>
                    {selected ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {action.requiresManualRoute ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>2 · Enter route</Text>
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={(value) => { setManualRoute(value); setFormError(null); }}
              placeholder="Route or WA number"
              placeholderTextColor={colors.muted}
              style={styles.drawerSearch}
              value={manualRoute}
            />
          </View>
        ) : null}

        {action.requiresPerson ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>{action.requiresRoute || action.requiresManualRoute ? "3" : "2"} · Choose person</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setSearch}
              placeholder="Search workforce"
              placeholderTextColor={colors.muted}
              style={styles.drawerSearch}
              value={search}
            />
            <View style={styles.drawerChoiceStack}>
              {people.map((person) => {
                const selected = person.rosterMemberId === rosterMemberId;
                return (
                  <Pressable
                    key={person.rosterMemberId}
                    onPress={() => { setRosterMemberId(person.rosterMemberId); setFormError(null); }}
                    style={[styles.drawerChoice, selected && styles.drawerChoiceSelected]}
                  >
                    <View style={styles.accessCopy}>
                      <Text style={styles.drawerChoiceTitle}>{person.fullName}</Text>
                      <Text style={styles.detail}>{person.workerType}{person.arrived ? " · Arrived" : ""}</Text>
                    </View>
                    {selected ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
                  </Pressable>
                );
              })}
              {people.length === 0 ? <Text style={sharedStyles.muted}>No eligible workforce matches this action.</Text> : null}
            </View>
          </View>
        ) : null}

        {action.notePrompt ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>{noteStep} · Add context</Text>
            <TextInput
              multiline
              onChangeText={setNote}
              placeholder={action.notePrompt}
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              value={note}
            />
          </View>
        ) : null}

        <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{validation || formError || `${action.label} is ready to save.`}</Text>
          <Text style={sharedStyles.muted}>The database will recheck the company, grant, route, person, service date, and dispatch-day state.</Text>
        </Card>
        <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : `Confirm ${action.label.toLowerCase()}`} onPress={() => void submit()} />
      </ScrollView>
    </Modal>
  );
}

export function ManagerDispatchScreen(props: {
  busy: boolean;
  context: ManagerAccessContext;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onLoadWalkOns: () => Promise<ManagerWalkOnSnapshot>;
  onRefresh: () => void;
  onSettings: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmit: (draft: ManagerDispatchActionDraft) => Promise<void>;
  onSubmitWalkOn: (draft: ManagerWalkOnAssignmentDraft) => Promise<void>;
  snapshot: ManagerDispatchSnapshot | null;
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const [initialActionCode, setInitialActionCode] = useState<ManagerDispatchActionCode>("ASSIGN_DRIVER");
  const [initialRouteId, setInitialRouteId] = useState<string | null>(null);
  const [initialRosterMemberId, setInitialRosterMemberId] = useState<string | null>(null);
  const routesAssigned = props.snapshot?.routes.filter((route) => route.driverName).length ?? 0;
  const arrived = props.snapshot?.people.filter((person) => person.arrived).length ?? 0;
  const timeZone = props.snapshot?.timeZone ?? "UTC";

  function openAction(
    code: ManagerDispatchActionCode = "ASSIGN_DRIVER",
    routeId: string | null = null,
    rosterMemberId: string | null = null,
  ) {
    setInitialActionCode(code);
    setInitialRouteId(routeId);
    setInitialRosterMemberId(rosterMemberId);
    setActionOpen(true);
  }

  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · OPERATIONS" onSettings={props.onSettings} title="Dispatch" />
      <Pressable onPress={props.onBack}><Text style={styles.back}>‹ Operations</Text></Pressable>
      {props.loading && !props.snapshot ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.primary} /><Text style={sharedStyles.muted}>Loading the dispatch authority…</Text></View>
      ) : props.error && !props.snapshot ? (
        <Card tone="danger"><Text style={sharedStyles.bodyStrong}>Dispatch is unavailable</Text><Text style={sharedStyles.muted}>{props.error}</Text><PrimaryButton compact label="Retry" onPress={props.onRefresh} secondary /></Card>
      ) : props.snapshot ? (
        <>
          {props.error ? (
            <Card tone="danger">
              <Text style={sharedStyles.bodyStrong}>The latest change was not saved</Text>
              <Text style={sharedStyles.muted}>{props.error}</Text>
              <PrimaryButton compact label="Refresh board" onPress={props.onRefresh} secondary />
            </Card>
          ) : null}
          <View style={styles.dispatchHero}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.nativeBannerLabel}>SERVER-DATED BOARD</Text>
                <Text style={styles.dispatchHeroDate}>{props.snapshot.serviceDate}</Text>
              </View>
              <View style={[styles.dispatchPhase, props.snapshot.dayStatus === "LOCKED" && styles.dispatchPhaseLocked]}>
                <Text style={styles.dispatchPhaseText}>{props.snapshot.dayStatus === "LOCKED" ? "SERVICE" : "DISPATCH"}</Text>
              </View>
            </View>
            <Text style={styles.nativeBannerDetail}>{props.snapshot.terminalCode ? `${props.snapshot.terminalCode} · ` : ""}{props.snapshot.timeZone}</Text>
            <View style={styles.dispatchHeroMetrics}>
              <View style={styles.dispatchHeroMetric}><Text style={styles.pulseStatLabel}>Routes</Text><Text style={styles.dispatchHeroMetricValue}>{props.snapshot.routes.length}</Text></View>
              <View style={styles.dispatchHeroMetric}><Text style={styles.pulseStatLabel}>Assigned</Text><Text style={styles.dispatchHeroMetricValue}>{routesAssigned}</Text></View>
              <View style={styles.dispatchHeroMetric}><Text style={styles.pulseStatLabel}>Arrived</Text><Text style={styles.dispatchHeroMetricValue}>{arrived}</Text></View>
            </View>
          </View>
          <View style={styles.dispatchToolbar}>
            <PrimaryButton compact label="Action" onPress={() => openAction()} />
            <PrimaryButton compact label="Refresh" onPress={props.onRefresh} secondary />
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Route board</Text>
            <Text style={styles.sectionMeta}>{props.snapshot.routes.length}</Text>
          </View>
          <View style={styles.operationsRouteStack}>
            {props.snapshot.routes.map((route) => (
              <OperationsRouteCard key={route.id} onManage={() => openAction("ASSIGN_DRIVER", route.id)} route={route} />
            ))}
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Recent actions</Text>
            <Text style={styles.sectionMeta}>{props.snapshot.events.length}</Text>
          </View>
          {props.snapshot.events.slice(0, 8).map((event) => (
            <View key={event.id} style={styles.dispatchEventRow}>
              <View style={styles.accessCopy}>
                <Text style={styles.drawerChoiceTitle}>{event.eventLabel}</Text>
                <Text style={styles.detail}>{[event.personName, event.routeLabel, event.note].filter(Boolean).join(" · ") || event.eventCategory}</Text>
              </View>
              <Text style={styles.readMeta}>{formatEventTime(event.createdAt, timeZone)}</Text>
            </View>
          ))}
          {props.snapshot.events.length === 0 ? <Card><Text style={sharedStyles.bodyStrong}>No dispatch actions yet</Text><Text style={sharedStyles.muted}>The scheduled route board is ready for management.</Text></Card> : null}
          {actionOpen ? (
            <ManagerActionDrawer
              busy={props.busy}
              initialActionCode={initialRouteId ? initialActionCode : undefined}
              initialRosterMemberId={initialRosterMemberId}
              initialRouteId={initialRouteId}
              onClose={() => setActionOpen(false)}
              onLoadWalkOns={props.onLoadWalkOns}
              onSubmitDelivery={props.onSubmitDelivery}
              onSubmitEvent={props.onSubmit}
              onSubmitWalkOn={props.onSubmitWalkOn}
              snapshot={props.snapshot}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function MessageComposer(props: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: ManagerMessageDraft, status: "draft" | "published") => Promise<void>;
  snapshot: ManagerMessagesSnapshot;
}) {
  const [draft, setDraft] = useState<ManagerMessageDraft>({
    ...EMPTY_MANAGER_MESSAGE_DRAFT,
    recipientRosterMemberIds: [],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [publishIntent, setPublishIntent] = useState(false);
  const validation = validateManagerMessageDraft(draft);

  async function submit(status: "draft" | "published") {
    const currentValidation = validateManagerMessageDraft(draft);
    if (currentValidation || props.busy) {
      setFormError(currentValidation);
      return;
    }
    try {
      setFormError(null);
      await props.onSubmit(draft, status);
      props.onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "The message could not be saved.");
    }
  }

  function selectVisibility(visibility: ManagerMessageDraft["visibility"]) {
    setDraft((current) => ({
      ...current,
      visibility,
      audienceMode: visibility === "drivers" ? current.audienceMode : "all_drivers",
      recipientRosterMemberIds: visibility === "drivers" ? current.recipientRosterMemberIds : [],
    }));
    setFormError(null);
  }

  function toggleRecipient(rosterMemberId: string) {
    setDraft((current) => {
      const selected = new Set(current.recipientRosterMemberIds);
      if (selected.has(rosterMemberId)) selected.delete(rosterMemberId);
      else selected.add(rosterMemberId);
      return { ...current, recipientRosterMemberIds: Array.from(selected) };
    });
  }

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <ScrollView contentContainerStyle={styles.dispatchDrawer} keyboardShouldPersistTaps="handled">
        <View style={[styles.reviewHeader, styles.modalHeaderClearance]}>
          <View style={styles.accessCopy}>
            <Text style={styles.nativeBannerLabel}>MESSAGE DRAFT</Text>
            <Text style={styles.drawerTitle}>Create company message</Text>
            <Text style={styles.detail}>Draft, broadcast, or target the same governed company message board used by Insight.</Text>
          </View>
          <Pressable disabled={props.busy} onPress={props.onClose}><Text style={styles.done}>Close</Text></Pressable>
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>1 · Message</Text>
          <TextInput
            onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
            placeholder="Message title"
            placeholderTextColor={colors.muted}
            style={styles.drawerSearch}
            value={draft.title}
          />
          <TextInput
            multiline
            onChangeText={(body) => setDraft((current) => ({ ...current, body }))}
            placeholder="Write the update drivers or leaders need to see."
            placeholderTextColor={colors.muted}
            style={styles.messageBodyInput}
            value={draft.body}
          />
        </View>

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>2 · Visibility</Text>
          <View style={styles.messageChoiceRow}>
            {(["drivers", "all", "leadership"] as const).map((visibility) => {
              const selected = draft.visibility === visibility;
              const label = visibility === "drivers" ? "Drivers" : visibility === "all" ? "Everyone" : "Leadership";
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={visibility}
                  onPress={() => selectVisibility(visibility)}
                  style={[styles.messageChoice, selected && styles.drawerChoiceSelected]}
                >
                  <Text style={[styles.drawerActionText, selected && styles.drawerActionTextSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {draft.visibility === "drivers" ? (
          <View style={styles.drawerStep}>
            <Text style={styles.drawerStepLabel}>3 · Driver audience</Text>
            <Pressable
              onPress={() => setDraft((current) => ({ ...current, audienceMode: "all_drivers", recipientRosterMemberIds: [] }))}
              style={[styles.drawerChoice, draft.audienceMode === "all_drivers" && styles.drawerChoiceSelected]}
            >
              <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>All active drivers</Text><Text style={styles.detail}>{props.snapshot.recipients.length} available recipients</Text></View>
              {draft.audienceMode === "all_drivers" ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
            </Pressable>
            <Pressable
              onPress={() => setDraft((current) => ({ ...current, audienceMode: "selected_drivers" }))}
              style={[styles.drawerChoice, draft.audienceMode === "selected_drivers" && styles.drawerChoiceSelected]}
            >
              <View style={styles.accessCopy}><Text style={styles.drawerChoiceTitle}>Selected drivers</Text><Text style={styles.detail}>Choose one or more active or trainee drivers.</Text></View>
              {draft.audienceMode === "selected_drivers" ? <Text style={styles.drawerSelectedMark}>SELECTED</Text> : null}
            </Pressable>
            {draft.audienceMode === "selected_drivers" ? (
              <View style={styles.messageRecipientList}>
                {props.snapshot.recipients.length === 0 ? <Text style={sharedStyles.muted}>No active drivers are available for targeting.</Text> : props.snapshot.recipients.map((recipient) => {
                  const selected = draft.recipientRosterMemberIds.includes(recipient.rosterMemberId);
                  return (
                    <Pressable key={recipient.rosterMemberId} onPress={() => toggleRecipient(recipient.rosterMemberId)} style={[styles.messageRecipient, selected && styles.drawerChoiceSelected]}>
                      <View style={styles.accessCopy}>
                        <Text style={styles.drawerChoiceTitle}>{recipient.fullName}</Text>
                        <Text style={styles.detail}>{recipient.jobTitle || recipient.employmentStatus || "Driver"}</Text>
                      </View>
                      <Text style={selected ? styles.drawerSelectedMark : styles.messageUnselected}>{selected ? "SELECTED" : "SELECT"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.drawerStep}>
          <Text style={styles.drawerStepLabel}>{draft.visibility === "drivers" ? "4" : "3"} · Acknowledgment</Text>
          <Pressable onPress={() => setDraft((current) => ({ ...current, requiresAck: !current.requiresAck }))} style={[styles.drawerChoice, draft.requiresAck && styles.drawerChoiceSelected]}>
            <View style={styles.accessCopy}>
              <Text style={styles.drawerChoiceTitle}>Require acknowledgment</Text>
              <Text style={styles.detail}>Drivers must explicitly mark this message read.</Text>
            </View>
            <Text style={draft.requiresAck ? styles.drawerSelectedMark : styles.messageUnselected}>{draft.requiresAck ? "ON" : "OFF"}</Text>
          </Pressable>
        </View>

        <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{formError || validation || "Message is ready."}</Text>
          <Text style={sharedStyles.muted}>Audience: {managerMessageAudienceLabel(draft, props.snapshot.recipients.length)} · {draft.requiresAck ? "Acknowledgment required" : "Read only"}</Text>
          <Text style={sharedStyles.muted}>Publishing requires a live connection and deliberate confirmation. It is never queued as an offline action.</Text>
        </Card>
        <View style={styles.messageActions}>
          <PrimaryButton compact disabled={Boolean(validation) || props.busy} fill label={props.busy ? "Saving…" : "Save draft"} onPress={() => void submit("draft")} secondary />
          <PrimaryButton compact disabled={Boolean(validation) || props.busy} label={props.busy ? "Publishing…" : "Publish now"} onPress={() => setPublishIntent(true)} fill />
        </View>
      </ScrollView>
      {publishIntent ? (
        <IntentVerificationModal
          actionLabel="publish message"
          busy={props.busy}
          onCancel={() => setPublishIntent(false)}
          onConfirm={() => {
            setPublishIntent(false);
            void submit("published");
          }}
          visible
        />
      ) : null}
    </Modal>
  );
}

export function ManagerMessagesScreen(props: {
  busy: boolean;
  context: ManagerAccessContext;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
  onSettings: () => void;
  onSubmit: (draft: ManagerMessageDraft, status: "draft" | "published") => Promise<void>;
  snapshot: ManagerMessagesSnapshot | null;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [surface, setSurface] = useState<"all" | "published" | "drafts" | "acknowledgments">("all");
  const published = props.snapshot?.messages.filter((message) => message.status === "published").length ?? 0;
  const drafts = props.snapshot?.messages.filter((message) => message.status === "draft").length ?? 0;
  const acknowledgments = props.snapshot?.messages.filter((message) => message.requiresAck).length ?? 0;
  const visibleMessages = props.snapshot?.messages.filter((message) => {
    if (surface === "published") return message.status === "published";
    if (surface === "drafts") return message.status === "draft";
    if (surface === "acknowledgments") return message.requiresAck;
    return true;
  }) ?? [];
  const messageSurfaces: Array<{ key: typeof surface; label: string; count: number }> = [
    { key: "all", label: "All", count: props.snapshot?.messages.length ?? 0 },
    { key: "published", label: "Published", count: published },
    { key: "drafts", label: "Drafts", count: drafts },
    { key: "acknowledgments", label: "Acknowledgments", count: acknowledgments },
  ];
  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Messages" />
      <Text style={sharedStyles.muted}>Draft, publish, broadcast, or target operational updates using the same governed company message board as Insight.</Text>
      {props.error ? <Card tone="danger"><Text style={sharedStyles.bodyStrong}>Messages need another try</Text><Text style={sharedStyles.muted}>{props.error}</Text><PrimaryButton compact label="Retry" onPress={props.onRefresh} secondary /></Card> : null}
      {props.loading ? <View style={styles.loadingCard}><ActivityIndicator color={colors.primary} /><Text style={sharedStyles.muted}>Loading company messages and audience authority…</Text></View> : null}
      {props.snapshot ? (
        <>
          <View style={styles.metricBand}>
            <View style={[styles.metricCard, styles.metricSuccess]}><Text style={styles.metricLabel}>Published</Text><Text style={styles.metricValue}>{published}</Text></View>
            <View style={[styles.metricCard, styles.metricWarning]}><Text style={styles.metricLabel}>Drafts</Text><Text style={styles.metricValue}>{drafts}</Text></View>
            <View style={[styles.metricCard, styles.metricDefault]}><Text style={styles.metricLabel}>Requires read</Text><Text style={styles.metricValue}>{acknowledgments}</Text></View>
          </View>
          {props.snapshot.canAuthor ? <PrimaryButton label="Create message" onPress={() => setComposerOpen(true)} /> : (
            <Card><Text style={sharedStyles.bodyStrong}>Read access</Text><Text style={sharedStyles.muted}>Company administrator access is required to draft or publish messages.</Text></Card>
          )}
          <ScrollView contentContainerStyle={styles.readFilters} horizontal showsHorizontalScrollIndicator={false}>
            {messageSurfaces.map((item) => {
              const selected = surface === item.key;
              return (
                <Pressable key={item.key} onPress={() => setSurface(item.key)} style={[styles.readFilter, selected && styles.readFilterActive]}>
                  <Text style={[styles.readFilterText, selected && styles.readFilterTextActive]}>{item.label}</Text>
                  <View style={[styles.readFilterCount, selected && styles.readFilterCountActive]}><Text style={[styles.readFilterCountText, selected && styles.readFilterCountTextActive]}>{item.count}</Text></View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>{messageSurfaces.find((item) => item.key === surface)?.label} messages</Text><Text style={styles.sectionMeta}>{visibleMessages.length}</Text></View>
          {visibleMessages.length === 0 ? <Card><Text style={sharedStyles.bodyStrong}>No messages in this view</Text><Text style={sharedStyles.muted}>Change the filter or create the next company update.</Text></Card> : visibleMessages.map((message) => (
            <View key={message.id} style={styles.readCard}>
              <View style={[styles.readAccent, message.status === "published" ? styles.readAccentSuccess : styles.readAccentWarning]} />
              <View style={styles.readCardHeader}><Text style={styles.readEyebrow}>{message.status}</Text><Text style={styles.readMeta}>{message.visibility}</Text></View>
              <Text style={styles.readCardTitle}>{message.title}</Text>
              <Text numberOfLines={4} style={styles.readCardDetail}>{message.body}</Text>
              <View style={styles.readChips}><View style={styles.readChip}><Text style={styles.readChipText}>{message.requiresAck ? "Ack required" : "Read only"}</Text></View></View>
            </View>
          ))}
          {composerOpen ? <MessageComposer busy={props.busy} onClose={() => setComposerOpen(false)} onSubmit={props.onSubmit} snapshot={props.snapshot} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

export function ManagerFooter(props: {
  activeTab: ManagerTabKey;
  onAccount: () => void;
  onTab: (tab: ManagerTabKey) => void;
  tablet?: boolean;
}) {
  const tabs: Array<[ManagerTabKey | "account", string]> = [
    ["today", "Today"],
    ["schedule", "Schedule"],
    ["workspaces", "Workspaces"],
    ["inspect", "Inspect"],
    ["messages", "Messages"],
    ["account", "Account"],
  ];
  return (
    <View style={[styles.footer, props.tablet && styles.footerTablet]}>
      {tabs.map(([key, label]) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: key !== "account" && props.activeTab === key }}
          key={key}
          onPress={() => key === "account" ? props.onAccount() : props.onTab(key)}
          style={[
            styles.footerItem,
            props.tablet && styles.footerItemTablet,
            props.tablet && key === "account" && styles.footerAccountTablet,
            props.tablet && key !== "account" && props.activeTab === key && styles.footerItemActiveTablet,
          ]}
        >
          <Text style={[styles.footerCode, key !== "account" && props.activeTab === key && styles.footerActive]}>
            {key === "today" ? "T" : key === "schedule" ? "31" : key === "workspaces" ? "W" : key === "inspect" ? "IN" : key === "messages" ? "M" : "TC"}
          </Text>
          <Text style={[styles.footerLabel, key !== "account" && props.activeTab === key && styles.footerActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.58 },
  managerHomeGrid: { gap: 14 },
  managerHomeGridTablet: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  managerHomeColumn: { flex: 1, minWidth: 0, gap: 14 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sectionLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  sectionMeta: { color: colors.muted, fontSize: 12 },
  accessTile: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  accessTileAttention: { borderColor: colors.warning },
  accessCode: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.palePrimary },
  accessCodeAttention: { backgroundColor: colors.paleWarning },
  accessCodeText: { color: colors.primary, fontSize: 12 },
  accessCodeTextAttention: { color: colors.warning },
  accessCopy: { flex: 1 },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  trailing: { color: colors.primary, fontSize: 9, fontWeight: "800" },
  arrow: { color: colors.primary, fontSize: 24, fontWeight: "700" },
  pulse: { gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.ink },
  pulseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pulseLabel: { color: colors.white, fontSize: 12 },
  successChip: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.white },
  postureChip: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  postureChipSuccess: { backgroundColor: colors.white },
  postureChipDanger: { backgroundColor: colors.paleWarning },
  successDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  dangerDot: { backgroundColor: colors.warning },
  successText: { color: colors.success, fontSize: 11 },
  dangerText: { color: colors.warning },
  pulseStats: { flexDirection: "row", gap: 8 },
  pulseStat: { flex: 1, minHeight: 58, justifyContent: "center", gap: 4, padding: 10, borderRadius: 10, backgroundColor: colors.primary },
  pulseStatLabel: { color: colors.white, fontSize: 10 },
  pulseStatValue: { color: colors.white, fontSize: 13, fontWeight: "700" },
  snapshot: { gap: 8, padding: 16, borderRadius: 18, backgroundColor: colors.ink },
  snapshotDetail: { color: colors.white, fontSize: 14, lineHeight: 20 },
  back: { color: colors.primary, fontSize: 14, fontWeight: "700", paddingVertical: 4 },
  weekNavigator: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  weekArrow: { width: 48, minHeight: 64, alignItems: "center", justifyContent: "center" },
  weekArrowText: { color: colors.primary, fontSize: 30, lineHeight: 32 },
  weekCopy: { flex: 1, alignItems: "center", gap: 3 },
  weekEyebrow: { color: colors.primary, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  weekTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  loadingCard: { minHeight: 110, alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 18, backgroundColor: colors.panel },
  coverageRail: { gap: 8, paddingVertical: 2 },
  coverageDay: { width: 66, minHeight: 104, alignItems: "center", justifyContent: "center", gap: 3, borderWidth: 1, borderRadius: 15 },
  coverageDayLabel: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  coverageDayDate: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  coverageDelta: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  coverageStatus: { color: colors.muted, fontSize: 8, fontWeight: "800" },
  tabletCalendarGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 8 },
  tabletCalendarDay: { width: "13.4%", minWidth: 112, flexGrow: 1, minHeight: 174, justifyContent: "space-between", gap: 10, padding: 12, borderWidth: 1, borderRadius: 14 },
  tabletCalendarDaySelected: { borderWidth: 2, borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  tabletCalendarDateRow: { minHeight: 42, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 4 },
  tabletCalendarWeekday: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  tabletCalendarDate: { color: colors.ink, fontSize: 24, lineHeight: 27, fontWeight: "900" },
  tabletToday: { color: colors.white, fontSize: 8, fontWeight: "900", letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary },
  tabletCalendarMetrics: { gap: 3 },
  tabletCalendarMetric: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  tabletCalendarMetricValue: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  tabletCalendarCounts: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  tabletCalendarCount: { color: colors.muted, fontSize: 9, lineHeight: 13 },
  tabletCalendarSignalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  tabletCalendarDelta: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  tabletCalendarSignal: { flex: 1, color: colors.ink, fontSize: 8, lineHeight: 10, fontWeight: "800", textAlign: "right" },
  tabletCalendarDetail: { gap: 16, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.white },
  tabletCalendarDetailTop: { flexDirection: "row", alignItems: "stretch", gap: 18 },
  tabletCalendarDetailCopy: { width: 330, minWidth: 0, gap: 8 },
  tabletCalendarDetailTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  tabletCalendarDetailSignal: { alignSelf: "flex-start" },
  tabletCalendarDetailLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 4 },
  tabletRouteChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tabletRouteChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.palePrimary },
  tabletRouteChipText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  tabletCalendarDetailStats: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "stretch", gap: 8 },
  tabletCalendarDetailStat: { flex: 1, minWidth: 0, justifyContent: "center", gap: 8, padding: 12, borderRadius: 13, backgroundColor: colors.panel },
  tabletCalendarDetailStatLabel: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: "800" },
  tabletCalendarDetailStatValue: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  tabletCalendarPeopleGrid: { flexDirection: "row", alignItems: "stretch", gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  tabletCalendarPeopleGroup: { flex: 1, minWidth: 0, gap: 8, padding: 12, borderRadius: 13, backgroundColor: colors.panel },
  tabletCalendarPeopleLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  tabletCalendarPersonChips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  tabletCalendarPersonChip: { maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.white },
  tabletCalendarPersonChipText: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  tabletCalendarPeopleMore: { color: colors.primary, fontSize: 9, fontWeight: "800" },
  mobileScheduleTraineeGroup: { gap: 4, padding: 10, borderRadius: 12, backgroundColor: colors.panel },
  mobileScheduleTraineeLabel: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  mobileScheduleTraineePerson: { color: colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  statusCovered: { borderColor: colors.success, backgroundColor: "#EAF6F1" },
  statusTight: { borderColor: colors.warning, backgroundColor: colors.paleWarning },
  statusGap: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  statusNeutral: { borderColor: colors.border, backgroundColor: colors.panel },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderRadius: 999 },
  statusPillText: { color: colors.ink, fontSize: 9, fontWeight: "800" },
  requestCard: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  requestAvatar: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.paleWarning },
  requestAvatarText: { color: colors.warning, fontSize: 13, fontWeight: "800" },
  reviewAction: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  overrideType: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  workbenchRow: { minHeight: 80, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  workbenchDate: { width: 48, height: 54, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 12 },
  workbenchDay: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  workbenchInitials: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  pendingText: { color: colors.warning, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  readyText: { color: colors.success, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  scheduleToolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  scheduleSearch: { flex: 1, minWidth: 230 },
  scheduleFilter: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.white },
  scheduleChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scheduleChoice: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  scheduleChoiceActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  scheduleChoiceText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  scheduleChoiceTextActive: { color: colors.primary },
  scheduleFieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  scheduleField: { flex: 1, minWidth: 220, gap: 7 },
  scheduleFieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  scheduleDaysGrid: { gap: 10 },
  scheduleDayEditor: { flexDirection: "row", alignItems: "center", gap: 10 },
  scheduleDayToggle: { width: 54, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  scheduleDayToggleActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  scheduleRouteInput: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, backgroundColor: colors.white },
  scheduleRotationToggle: { alignSelf: "flex-start" },
  delta: { minWidth: 32, color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "right" },
  reviewSheet: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48, gap: 18, backgroundColor: colors.white },
  reviewHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  modalHeaderClearance: { paddingRight: 54 },
  done: { color: colors.primary, fontSize: 16, fontWeight: "800", paddingVertical: 8 },
  requestQuote: { color: colors.ink, fontSize: 14, fontStyle: "italic", lineHeight: 21 },
  decisionRow: { flexDirection: "row", gap: 10 },
  decisionButton: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.white },
  decisionApprove: { borderColor: colors.success, backgroundColor: "#EAF6F1" },
  decisionDeny: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  decisionText: { color: colors.muted, fontSize: 15, fontWeight: "800" },
  decisionTextActive: { color: colors.ink },
  noteInput: { minHeight: 112, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, color: colors.ink, fontSize: 15, lineHeight: 22, textAlignVertical: "top" },
  workspacePage: { width: "100%", maxWidth: 880, alignSelf: "center", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 14, backgroundColor: colors.white },
  workspacePageTablet: { maxWidth: 1160, paddingHorizontal: 32, paddingTop: 28, paddingBottom: 36, gap: 18 },
  workspaceDirectory: { gap: 14 },
  workspaceDirectoryTablet: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  workspaceIntroduction: { gap: 14 },
  workspaceIntroductionTablet: { width: 330 },
  workspaceGroup: { gap: 10 },
  workspaceGroupTablet: { flex: 1, minWidth: 0 },
  workspaceTileGrid: { gap: 10 },
  workspaceTileGridTablet: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12 },
  workspaceTileCell: { width: "100%" },
  workspaceTileCellTablet: { width: "49%" },
  capabilityModal: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48, gap: 18, backgroundColor: colors.white },
  capabilityRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 13, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.white },
  capabilityNumber: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.palePrimary },
  capabilityNumberText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  capabilityText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  nativeBanner: { gap: 6, padding: 18, borderRadius: 18, backgroundColor: colors.ink },
  nativeBannerLabel: { color: "#8DD3EF", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  nativeBannerTitle: { color: colors.white, fontSize: 20, fontWeight: "800" },
  nativeBannerDetail: { color: "#D6E1EC", fontSize: 13, lineHeight: 19 },
  peopleHero: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, padding: 17, borderRadius: 18, backgroundColor: colors.ink },
  peopleHeroDate: { color: colors.white, fontSize: 18, fontWeight: "900", marginTop: 5 },
  peopleHeroMeta: { color: "#D6E1EC", fontSize: 10, fontWeight: "800", textAlign: "right" },
  peopleTabs: { flexDirection: "row", gap: 6, padding: 5, borderRadius: 15, backgroundColor: colors.panel },
  peopleTab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent", borderRadius: 11 },
  peopleTabActive: { borderColor: colors.primary, backgroundColor: colors.white },
  peopleTabText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  peopleTabTextActive: { color: colors.primary },
  peopleMetrics: { flexDirection: "row", gap: 7 },
  peopleMetric: { flex: 1, minWidth: 0, minHeight: 70, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.panel },
  peopleMetricAttention: { borderColor: colors.warning, backgroundColor: colors.paleWarning },
  peopleMetricValue: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  peopleMetricLabel: { color: colors.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  peopleCard: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  peopleCardAttention: { borderColor: "#E9C999", backgroundColor: "#FFFBF5" },
  peopleAvatar: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.palePrimary },
  peopleAvatarText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  peopleCardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  peopleCardTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "900" },
  peopleCardArrow: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  peopleChips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 },
  peopleChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.palePrimary },
  peopleChipText: { color: colors.primary, fontSize: 8, fontWeight: "800" },
  peopleChipAttention: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.paleWarning },
  peopleChipAttentionText: { color: colors.warning, fontSize: 8, fontWeight: "900" },
  peopleProgressTrack: { height: 7, overflow: "hidden", borderRadius: 999, backgroundColor: "#DDE4EC", marginTop: 9 },
  peopleProgressFill: { height: "100%", borderRadius: 999, backgroundColor: colors.success },
  peopleInterview: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  peopleModal: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 48, gap: 18, backgroundColor: colors.white },
  peopleFacts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  peopleFact: { width: "48%", minHeight: 62, justifyContent: "center", gap: 5, padding: 11, borderRadius: 12, backgroundColor: colors.panel },
  peopleFactLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  peopleFactValue: { color: colors.ink, fontSize: 12, fontWeight: "800", lineHeight: 16 },
  peopleCompliance: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 14 },
  peopleComplianceWarning: { borderColor: colors.warning, backgroundColor: colors.paleWarning },
  peopleComplianceUrgent: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  peopleWarningText: { color: colors.warning, fontSize: 10, fontWeight: "900", textAlign: "right" },
  peopleUrgentText: { color: colors.danger, fontSize: 10, fontWeight: "900", textAlign: "right" },
  peopleHiringCard: { gap: 7, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.panel },
  metricBand: { flexDirection: "row", gap: 8 },
  metricCard: { flex: 1, minHeight: 78, justifyContent: "center", gap: 6, padding: 11, borderWidth: 1, borderRadius: 14 },
  metricDefault: { borderColor: colors.border, backgroundColor: colors.panel },
  metricSuccess: { borderColor: colors.success, backgroundColor: "#EAF6F1" },
  metricWarning: { borderColor: colors.warning, backgroundColor: colors.paleWarning },
  metricDanger: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  readDescription: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  readStatus: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.panel },
  readStatusText: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "700" },
  readFilters: { gap: 8, paddingRight: 20 },
  readFilter: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.white },
  readFilterActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  readFilterText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  readFilterTextActive: { color: colors.primary },
  readFilterCount: { minWidth: 21, height: 21, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderRadius: 999, backgroundColor: colors.panel },
  readFilterCountActive: { backgroundColor: colors.primary },
  readFilterCountText: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  readFilterCountTextActive: { color: colors.white },
  readCard: { position: "relative", gap: 9, padding: 15, paddingTop: 17, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.white },
  readAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  readAccentDefault: { backgroundColor: colors.primary },
  readAccentSuccess: { backgroundColor: colors.success },
  readAccentWarning: { backgroundColor: colors.warning },
  readAccentDanger: { backgroundColor: colors.danger },
  readCardHeader: { minHeight: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  readEyebrow: { flex: 1, color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 0.9, textTransform: "uppercase" },
  readMeta: { maxWidth: "46%", color: colors.muted, fontSize: 9, fontWeight: "700", textAlign: "right" },
  readCardTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  readCardDetail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  readFacts: { flexDirection: "row", gap: 7 },
  readFact: { flex: 1, minWidth: 0, gap: 4, padding: 9, borderRadius: 11, backgroundColor: colors.panel },
  readFactLabel: { color: colors.muted, fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  readFactValue: { color: colors.ink, fontSize: 11, fontWeight: "800", lineHeight: 15 },
  readChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  readChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.palePrimary },
  readChipText: { color: colors.primary, fontSize: 9, fontWeight: "800" },
  reportDateNavigator: { minHeight: 82, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  reportDateArrow: { width: 54, minHeight: 80, alignItems: "center", justifyContent: "center" },
  reportDateArrowText: { color: colors.primary, fontSize: 30, fontWeight: "700" },
  reportDateCopy: { flex: 1, alignItems: "center", gap: 3 },
  reportDateLabel: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  reportDateValue: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  reportDateMeta: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  operationsControls: { gap: 8, paddingRight: 20 },
  operationsControlsTablet: { flexDirection: "row", flexWrap: "wrap", paddingRight: 0 },
  operationsControl: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  operationsControlPrimary: { borderColor: colors.success, backgroundColor: colors.success },
  controlDisabled: { opacity: 0.5 },
  operationsControlText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  operationsControlTextPrimary: { color: colors.white },
  operationsSummaryPanel: { gap: 10, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.panel },
  operationsStatus: { gap: 3, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  operationsStatusTitle: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  operationsStatusDetail: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  operationsFilters: { gap: 8, paddingRight: 20 },
  operationsFiltersTablet: { flexDirection: "row", flexWrap: "wrap", paddingRight: 0 },
  operationsFilter: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.white },
  operationsFilterActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  operationsFilterText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  operationsFilterTextActive: { color: colors.primary },
  operationsFilterCount: { minWidth: 21, height: 21, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderRadius: 999, backgroundColor: colors.panel },
  operationsFilterCountActive: { backgroundColor: colors.primary },
  operationsFilterCountText: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  operationsFilterCountTextActive: { color: colors.white },
  operationsRouteStack: { gap: 11 },
  operationsRouteStackTablet: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12 },
  operationsRouteCell: { width: "100%" },
  operationsRouteCellTablet: { width: "49%" },
  operationsRouteCard: { gap: 11, padding: 14, paddingBottom: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.white },
  operationsRouteCardActive: { borderColor: "#D9C9F6", backgroundColor: "#FAF7FF" },
  operationsRouteCardComplete: { borderColor: "#CBE5DA", backgroundColor: "#F2FAF6" },
  operationsRouteCardAttention: { borderColor: "#E9C999", backgroundColor: "#FFF9EF" },
  operationsRouteHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  operationsRouteIdentity: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "900" },
  operationsPostureBlock: { maxWidth: 122, alignItems: "flex-end", gap: 2 },
  operationsPosture: { color: "#7140C6", fontSize: 12, fontWeight: "800" },
  operationsPostureComplete: { color: colors.success },
  operationsPostureAttention: { color: colors.warning },
  operationsPostureMeta: { color: colors.success, fontSize: 8, fontWeight: "800", textAlign: "right" },
  operationsDriver: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  operationsMetrics: { flexDirection: "row", gap: 6 },
  operationsMetric: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 3, paddingVertical: 8, borderWidth: 1, borderColor: "#E5EAF0", borderRadius: 11, backgroundColor: "rgba(255,255,255,0.82)" },
  operationsMetricRisk: { borderColor: "#F0B66C" },
  operationsMetricValue: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  operationsMetricLabel: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  expressComplete: { color: colors.success },
  expressAttempted: { color: "#6D4BC3" },
  expressOpen: { color: colors.danger },
  expressDivider: { color: colors.muted },
  operationsProgress: { height: 10, justifyContent: "center", overflow: "hidden", borderRadius: 999, backgroundColor: "#DDE4EC" },
  operationsProgressFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.primary },
  operationsProgressTruck: { position: "absolute", color: colors.white, fontSize: 8, transform: [{ rotate: "-5deg" }] },
  operationsProgressFlag: { position: "absolute", right: 1, fontSize: 8 },
  routeManage: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.palePrimary },
  routeManageText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  routeManageArrow: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  dispatchHero: { gap: 12, padding: 17, borderRadius: 18, backgroundColor: colors.ink },
  dispatchHeroDate: { color: colors.white, fontSize: 22, fontWeight: "900", marginTop: 4 },
  dispatchPhase: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.success },
  dispatchPhaseLocked: { backgroundColor: colors.primary },
  dispatchPhaseText: { color: colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  dispatchHeroMetrics: { flexDirection: "row", gap: 8 },
  dispatchHeroMetric: { flex: 1, gap: 3, padding: 10, borderRadius: 11, backgroundColor: colors.primary },
  dispatchHeroMetricValue: { color: colors.white, fontSize: 18, fontWeight: "900" },
  dispatchToolbar: { flexDirection: "row", gap: 9 },
  dispatchEventRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  dispatchDrawer: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 48, gap: 18, backgroundColor: colors.white },
  drawerTitle: { color: colors.ink, fontSize: 24, fontWeight: "900", marginTop: 4 },
  drawerStep: { gap: 10 },
  drawerStepLabel: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  drawerActionGroup: { gap: 7 },
  drawerGroupLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  drawerAction: { paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.white },
  drawerActionSelected: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  drawerActionText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  drawerActionTextSelected: { color: colors.primary },
  drawerChoiceStack: { gap: 8 },
  drawerChoice: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  drawerChoiceDanger: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  evidenceItem: { gap: 6, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  evidenceItemAttention: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  evidenceItemComplete: { borderColor: colors.success, backgroundColor: "#EDF8F3" },
  evidenceStatus: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  evidenceAddress: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  drawerChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  drawerChoiceTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  drawerSelectedMark: { color: colors.primary, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  drawerSearch: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 13, color: colors.ink, fontSize: 14, backgroundColor: colors.white },
  messageBodyInput: { minHeight: 150, paddingHorizontal: 13, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 13, color: colors.ink, fontSize: 14, lineHeight: 21, backgroundColor: colors.white, textAlignVertical: "top" },
  messageChoiceRow: { flexDirection: "row", gap: 7 },
  messageChoice: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.white },
  messageRecipientList: { gap: 7, paddingTop: 2 },
  messageRecipient: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.white },
  messageUnselected: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  messageActions: { flexDirection: "row", gap: 10 },
  phaseSelector: { flexDirection: "row", gap: 8, padding: 5, borderRadius: 16, backgroundColor: colors.panel },
  phaseOption: { flex: 1, minHeight: 58, justifyContent: "center", gap: 3, paddingHorizontal: 13, borderWidth: 1, borderColor: "transparent", borderRadius: 12 },
  phaseOptionActive: { borderColor: colors.primary, backgroundColor: colors.white },
  phaseOptionText: { color: colors.muted, fontSize: 14, fontWeight: "900" },
  phaseOptionTextActive: { color: colors.primary },
  phaseOptionDetail: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  phaseOptionDetailActive: { color: colors.ink },
  walkOnMode: { flex: 1, minHeight: 68, justifyContent: "center", gap: 3, paddingHorizontal: 9, borderWidth: 1, borderColor: "transparent", borderRadius: 12 },
  walkOnModeDetail: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  walkOnHero: { gap: 14, padding: 17, borderRadius: 18, backgroundColor: colors.ink },
  walkOnDate: { minWidth: 70, alignItems: "flex-end", gap: 3 },
  walkOnDateLabel: { color: "#8DD3EF", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  walkOnDateValue: { color: colors.white, fontSize: 12, fontWeight: "900" },
  walkOnCardAttention: { borderColor: colors.warning, backgroundColor: "#FFFBF5" },
  walkOnCardActions: { flexDirection: "row", gap: 8 },
  walkOnCardAction: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: 11, backgroundColor: colors.palePrimary },
  walkOnCardActionText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  walkOnHistory: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  walkOnHistoryRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.panel },
  walkOnPayStatus: { color: colors.success, fontSize: 8, fontWeight: "900", textAlign: "right" },
  walkOnPayStatusAttention: { color: colors.warning },
  selectField: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  selectFieldValue: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  selectFieldPlaceholder: { color: colors.muted, fontSize: 15 },
  selectFieldArrow: { color: colors.primary, fontSize: 22, fontWeight: "900" },
  selectionSheet: { flex: 1, gap: 16, paddingHorizontal: 22, paddingTop: 26, backgroundColor: colors.white },
  selectionOptionStack: { gap: 8, paddingBottom: 48 },
  selectionOption: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  footer: { width: "100%", maxWidth: 880, alignSelf: "center", height: 74, flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  footerTablet: { width: 116, maxWidth: 116, height: "100%", alignSelf: "stretch", flexDirection: "column", borderTopWidth: 0, borderRightWidth: 1, borderRightColor: colors.border, paddingVertical: 16 },
  footerItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  footerItemTablet: { flex: 0, width: "100%", minHeight: 78, borderLeftWidth: 3, borderLeftColor: "transparent" },
  footerItemActiveTablet: { borderLeftColor: colors.primary, backgroundColor: colors.palePrimary },
  footerAccountTablet: { marginTop: "auto" },
  footerCode: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  footerLabel: { color: colors.muted, fontSize: 10 },
  footerActive: { color: colors.primary },
});
