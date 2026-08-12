import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { DriverAccessContext, ManagerAccessContext } from "../domain/access";
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
  ManagerCoverageStatus,
  ManagerScheduleDay,
  ManagerScheduleSnapshot,
  ManagerTimeOffRequest,
} from "../domain/managerSchedule";
import {
  managerWorkspaceSuite,
  managerWorkspaceSuites,
  type ManagerOperationsPhase,
  type ManagerOperationsRoute,
  type ManagerWorkspaceChildKey,
  type ManagerWorkspaceKey,
  type ManagerWorkspaceSnapshot,
  type ManagerWorkspaceSuite,
  type ManagerWorkspaceTone,
} from "../domain/managerWorkspace";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";
import { colors } from "../theme";

export type ManagerTabKey = "today" | "schedule" | "workspaces" | "messages";

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
    </Screen>
  );
}

export type ManagerScheduleSurface = "bridge" | "overview" | "coverage" | "overrides" | "workbench";

function readableDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", options ?? { month: "short", day: "numeric" })
    .format(new Date(year, month - 1, day, 12));
}

function dayInitial(value: string) {
  return readableDate(value, { weekday: "narrow" });
}

function statusTone(status: ManagerCoverageStatus) {
  if (status === "GAP") return styles.statusGap;
  if (status === "TIGHT") return styles.statusTight;
  return styles.statusCovered;
}

function WeekNavigator(props: {
  snapshot: ManagerScheduleSnapshot | null;
  onNextWeek: () => void;
  onPreviousWeek: () => void;
}) {
  return (
    <View style={styles.weekNavigator}>
      <Pressable accessibilityLabel="Previous week" onPress={props.onPreviousWeek} style={styles.weekArrow}>
        <Text style={styles.weekArrowText}>‹</Text>
      </Pressable>
      <View style={styles.weekCopy}>
        <Text style={styles.weekEyebrow}>OPERATING WEEK</Text>
        <Text style={styles.weekTitle}>
          {props.snapshot
            ? `${readableDate(props.snapshot.weekStart)} – ${readableDate(props.snapshot.weekEnd)}`
            : "Loading week…"}
        </Text>
      </View>
      <Pressable accessibilityLabel="Next week" onPress={props.onNextWeek} style={styles.weekArrow}>
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
        <Text style={sharedStyles.muted}>Resolving coverage and manager requests…</Text>
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
  const gaps = props.snapshot.days.filter((day) => day.status === "GAP").length;
  const tight = props.snapshot.days.filter((day) => day.status === "TIGHT").length;
  const routes = Math.max(...props.snapshot.days.map((day) => day.routeDemand), 0);
  return (
    <View style={styles.pulse}>
      <View style={styles.pulseHeader}>
        <Text style={styles.pulseLabel}>Week posture</Text>
        <View style={[styles.postureChip, gaps > 0 ? styles.postureChipDanger : styles.postureChipSuccess]}>
          <View style={[styles.successDot, gaps > 0 && styles.dangerDot]} />
          <Text style={[styles.successText, gaps > 0 && styles.dangerText]}>
            {gaps > 0 ? `${gaps} gap${gaps === 1 ? "" : "s"}` : tight > 0 ? `${tight} tight` : "Covered"}
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
        <View key={day.serviceDate} style={[styles.coverageDay, statusTone(day.status)]}>
          <Text style={styles.coverageDayLabel}>{dayInitial(day.serviceDate)}</Text>
          <Text style={styles.coverageDayDate}>{readableDate(day.serviceDate, { day: "numeric" })}</Text>
          <Text style={styles.coverageDelta}>{day.capacityDelta > 0 ? `+${day.capacityDelta}` : day.capacityDelta}</Text>
          <Text style={styles.coverageStatus}>{day.status}</Text>
        </View>
      ))}
    </ScrollView>
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

export function ManagerScheduleScreen(props: {
  context: ManagerAccessContext;
  driverContext: DriverAccessContext | null;
  error: string | null;
  loading: boolean;
  reviewBusy: boolean;
  snapshot: ManagerScheduleSnapshot | null;
  surface: ManagerScheduleSurface;
  onBack: () => void;
  onManage: () => void;
  onMySchedule: () => void;
  onNextWeek: () => void;
  onOpenWeb: (path: string) => void;
  onPreviousWeek: () => void;
  onRefresh: () => void;
  onReviewRequest: (request: ManagerTimeOffRequest, decision: "APPROVED" | "DENIED", note: string) => Promise<void>;
  onSettings: () => void;
  onSurface: (surface: ManagerScheduleSurface) => void;
}) {
  const [reviewRequest, setReviewRequest] = useState<ManagerTimeOffRequest | null>(null);

  if (props.surface !== "bridge") {
    const title = props.surface === "overview"
      ? "Schedule"
      : props.surface === "coverage"
        ? "Coverage"
        : props.surface === "overrides"
          ? "Overrides"
          : "Workbench";
    return (
      <Screen>
        <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title={title} />
        <Pressable onPress={props.onBack}><Text style={styles.back}>‹ {props.surface === "overview" ? "Personal or management" : "Schedule"}</Text></Pressable>
        <WeekNavigator snapshot={props.snapshot} onNextWeek={props.onNextWeek} onPreviousWeek={props.onPreviousWeek} />
        <ScheduleLoading error={props.error} loading={props.loading} onRetry={props.onRefresh} />

        {props.snapshot && props.surface === "overview" ? (
          <>
            <PostureCard snapshot={props.snapshot} />
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Manage schedule</Text>
              <Text style={styles.sectionMeta}>NATIVE TOOLS</Text>
            </View>
            <AccessTile code="CA" detail="Daily supply, route demand, and risk" label="Coverage" onPress={() => props.onSurface("coverage")} trailing="NATIVE" />
            <AccessTile attention={props.snapshot.pendingRequests.length > 0} code="OV" detail={`${props.snapshot.pendingRequests.length} time-off request${props.snapshot.pendingRequests.length === 1 ? "" : "s"} need review`} label="Overrides" onPress={() => props.onSurface("overrides")} trailing="NATIVE" />
            <AccessTile code="WB" detail="Open routes, standby drivers, and next actions" label="Workbench" onPress={() => props.onSurface("workbench")} trailing="NATIVE" />
          </>
        ) : null}

        {props.snapshot && props.surface === "coverage" ? (
          <>
            <PostureCard snapshot={props.snapshot} />
            <CoverageRail days={props.snapshot.days} />
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Needs attention</Text>
              <Text style={styles.sectionMeta}>{props.snapshot.days.filter((day) => day.status !== "COVERED").length}</Text>
            </View>
            {props.snapshot.days.filter((day) => day.status !== "COVERED").map((day) => (
              <Card key={day.serviceDate} tone={day.status === "GAP" ? "danger" : undefined}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={sharedStyles.bodyStrong}>{readableDate(day.serviceDate, { weekday: "long", month: "short", day: "numeric" })}</Text>
                    <Text style={sharedStyles.muted}>{day.scheduledDrivers} drivers · {day.routeDemand} routes</Text>
                  </View>
                  <View style={[styles.statusPill, statusTone(day.status)]}><Text style={styles.statusPillText}>{day.status}</Text></View>
                </View>
                <Text style={sharedStyles.muted}>
                  {day.openRoutes.length > 0
                    ? `Open: ${day.openRoutes.map((route) => route.current_wa_num || route.route_name || "Unnamed").join(", ")}`
                    : "Every demanded route has an assignment; no contingency remains."}
                </Text>
              </Card>
            ))}
            {props.snapshot.days.every((day) => day.status === "COVERED") ? (
              <Card><Text style={sharedStyles.bodyStrong}>No coverage risks this week</Text><Text style={sharedStyles.muted}>Every operating day has positive driver contingency.</Text></Card>
            ) : null}
          </>
        ) : null}

        {props.snapshot && props.surface === "overrides" ? (
          <>
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
              <Card key={override.id}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.accessCopy}>
                    <Text style={sharedStyles.bodyStrong}>{override.full_name}</Text>
                    <Text style={sharedStyles.muted}>{readableDate(override.start_date)} – {readableDate(override.end_date)}</Text>
                  </View>
                  <Text style={styles.overrideType}>{override.override_type.replaceAll("_", " ")}</Text>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {props.snapshot && props.surface === "workbench" ? (
          <>
            <PostureCard snapshot={props.snapshot} />
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>Week actions</Text>
              <Text style={styles.sectionMeta}>LIVE MODEL</Text>
            </View>
            {props.snapshot.days.map((day) => (
              <View key={day.serviceDate} style={styles.workbenchRow}>
                <View style={[styles.workbenchDate, statusTone(day.status)]}>
                  <Text style={styles.coverageDayLabel}>{dayInitial(day.serviceDate)}</Text>
                  <Text style={styles.workbenchDay}>{readableDate(day.serviceDate, { day: "numeric" })}</Text>
                </View>
                <View style={styles.accessCopy}>
                  <Text style={sharedStyles.bodyStrong}>{day.openRoutes.length} open · {day.standbyDrivers.length} standby</Text>
                  <Text style={styles.detail}>{day.assignedDrivers} assigned of {day.routeDemand} demanded routes</Text>
                </View>
                <Text style={styles.delta}>{day.capacityDelta > 0 ? `+${day.capacityDelta}` : day.capacityDelta}</Text>
              </View>
            ))}
            <Card>
              <Text style={sharedStyles.bodyStrong}>Commit controls are being adapted</Text>
              <Text style={sharedStyles.muted}>This native workbench is authoritative for posture and review. Complex bulk schedule edits remain available as a browser fallback during the first pass.</Text>
              <PrimaryButton compact label="Open web fallback" onPress={() => props.onOpenWeb("/schedule/generated")} secondary />
            </Card>
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
      <AccessTile attention code="MG" detail="Coverage, overrides, and workbench" label="Manage Schedule" onPress={props.onManage} />
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
  const suites = managerWorkspaceSuites(props.context);
  return (
    <ScrollView contentContainerStyle={styles.workspacePage} showsVerticalScrollIndicator={false}>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Workspaces" />
      <Text style={sharedStyles.muted}>Every destination is grant-matched. Native read layers come first; browser workspaces remain available as fallback.</Text>
      <View style={styles.nativeBanner}>
        <Text style={styles.nativeBannerLabel}>MC-8 · PASS 1</Text>
        <Text style={styles.nativeBannerTitle}>Manager surface suite</Text>
        <Text style={styles.nativeBannerDetail}>{suites.length + (props.context.grants.includes("schedule") ? 1 : 0)} native workspace{(suites.length + (props.context.grants.includes("schedule") ? 1 : 0)) === 1 ? "" : "s"} in your scope</Text>
      </View>
      <View style={styles.workspaceGroup}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionLabel}>Native workspaces</Text>
          <Text style={styles.sectionMeta}>READ LAYER</Text>
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
        <Text style={sharedStyles.muted}>Loading the governed read layer…</Text>
      </View>
    );
  }
  if (props.error) {
    return (
      <Card tone="danger">
        <Text style={sharedStyles.bodyStrong}>This read layer is unavailable</Text>
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
  onOpenWeb: () => void;
  onRefresh: () => void;
  onRefreshDispatch: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitDispatch: (draft: ManagerDispatchActionDraft) => Promise<void>;
}) {
  const [filter, setFilter] = useState<OperationsFilter>("all");
  const [actionOpen, setActionOpen] = useState(false);
  const [routeDrawerId, setRouteDrawerId] = useState<string | null>(null);
  const [initialActionCode, setInitialActionCode] = useState<ManagerDispatchActionCode>("ASSIGN_DRIVER");
  const [initialRouteId, setInitialRouteId] = useState<string | null>(null);
  const [initialRosterMemberId, setInitialRosterMemberId] = useState<string | null>(null);
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

  return (
    <>
      <ScrollView contentContainerStyle={styles.operationsControls} horizontal showsHorizontalScrollIndicator={false}>
        <OperationsControl
          disabled={!props.dispatchSnapshot}
          label={props.dispatchLoading ? "Preparing actions…" : "Action"}
          onPress={() => openAction()}
          primary
        />
        <OperationsControl label="Compliance Report" onPress={props.onOpenWeb} />
        <OperationsControl label="Express Report" onPress={props.onOpenWeb} />
        <OperationsControl label="Attendance" onPress={props.onOpenWeb} />
        <OperationsControl label="Refresh" onPress={props.onRefresh} />
      </ScrollView>
      {props.dispatchError ? (
        <Card tone="danger">
          <Text style={sharedStyles.bodyStrong}>Management actions are temporarily unavailable</Text>
          <Text style={sharedStyles.muted}>{props.dispatchError}</Text>
          <PrimaryButton compact label="Retry actions" onPress={props.onRefreshDispatch} secondary />
        </Card>
      ) : null}
      <View style={styles.operationsStatus}>
        <Text style={styles.operationsStatusTitle}>{routes.length} routes · {props.dispatchSnapshot?.serviceDate ?? operations.serviceDate}</Text>
        <Text style={styles.operationsStatusDetail}>{operations.terminalCode ? `${operations.terminalCode} terminal · ` : ""}{operations.statusText}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.operationsFilters} horizontal showsHorizontalScrollIndicator={false}>
        {filters.filter((item) => item.key === "all" || counts[item.key] > 0).map((item) => (
          <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.operationsFilter, filter === item.key && styles.operationsFilterActive]}>
            <Text style={[styles.operationsFilterText, filter === item.key && styles.operationsFilterTextActive]}>{item.label}</Text>
            <View style={[styles.operationsFilterCount, filter === item.key && styles.operationsFilterCountActive]}><Text style={[styles.operationsFilterCountText, filter === item.key && styles.operationsFilterCountTextActive]}>{counts[item.key]}</Text></View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.operationsRouteStack}>
        {visibleRoutes.length ? visibleRoutes.map((route) => (
          <OperationsRouteCard
            key={route.id}
            onManage={() => setRouteDrawerId(route.id)}
            route={route}
          />
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
          onSubmitDelivery={props.onSubmitDelivery}
          onSubmitEvent={props.onSubmitDispatch}
          snapshot={props.dispatchSnapshot}
        />
      ) : null}
    </>
  );
}

export function ManagerWorkspaceDetailScreen(props: {
  context: ManagerAccessContext;
  dispatchBusy: boolean;
  dispatchError: string | null;
  dispatchLoading: boolean;
  dispatchSnapshot: ManagerDispatchSnapshot | null;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onOpenChild: (key: ManagerWorkspaceChildKey) => void;
  onLoadRouteEvidence: (routeKey: string) => Promise<ManagerRouteEvidenceSnapshot>;
  onOpenWeb: (path: string) => void;
  onRefresh: () => void;
  onRefreshDispatch: () => void;
  onSettings: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitDispatch: (draft: ManagerDispatchActionDraft) => Promise<void>;
  snapshot: ManagerWorkspaceSnapshot | null;
  suite: ManagerWorkspaceSuite;
}) {
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
          onOpenWeb={() => props.onOpenWeb(props.suite.fallbackPath)}
          onLoadRouteEvidence={props.onLoadRouteEvidence}
          onRefresh={props.onRefresh}
          onRefreshDispatch={props.onRefreshDispatch}
          onSubmitDelivery={props.onSubmitDelivery}
          onSubmitDispatch={props.onSubmitDispatch}
          snapshot={props.snapshot}
        />
      ) : (
        <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />
      )}
      {props.suite.key === "operations" ? (
        <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Operational surfaces</Text>
            <Text style={styles.sectionMeta}>PASS 2</Text>
          </View>
          {props.suite.children.map((child) => {
            return (
              <AccessTile
                code={child.code}
                detail={child.detail}
                key={child.label}
                label={child.label}
                onPress={() => child.key ? props.onOpenChild(child.key) : props.onOpenWeb(child.path)}
                trailing="NATIVE"
              />
            );
          })}
        </>
      ) : null}
      {props.suite.key !== "operations" ? (
        <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>Surfaces</Text>
            <Text style={styles.sectionMeta}>READ ONLY</Text>
          </View>
          {props.suite.children.map((child) => (
            <AccessTile
              code={child.code}
              detail={child.detail}
              key={child.label}
              label={child.label}
              onPress={() => props.onOpenWeb(child.path)}
              trailing="WEB FALLBACK"
            />
          ))}
          <Card>
            <Text style={sharedStyles.bodyStrong}>Pass 1 boundary</Text>
            <Text style={sharedStyles.muted}>This native surface is optimized for mobile review. The browser fallback preserves full desktop controls until its management client moves into Pass 2.</Text>
            <PrimaryButton compact label="Open full web workspace" onPress={() => props.onOpenWeb(props.suite.fallbackPath)} secondary />
          </Card>
        </>
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

export function ManagerOperationsChildScreen(props: {
  childKey: Exclude<ManagerWorkspaceChildKey, "dispatch">;
  context: ManagerAccessContext;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onOpenWeb: (path: string) => void;
  onRefresh: () => void;
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
      <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />
      <Card>
        <Text style={sharedStyles.bodyStrong}>Native read · full controls preserved</Text>
        <Text style={sharedStyles.muted}>This screen is optimized for mobile review. The browser workspace remains available as a fallback for deeper controls.</Text>
        <PrimaryButton compact label="Open full web workspace" onPress={() => props.onOpenWeb(child.path)} secondary />
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
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmitEvent: (draft: ManagerDispatchActionDraft) => Promise<void>;
  snapshot: ManagerDispatchSnapshot;
}) {
  type Phase = "DISPATCH" | "DELIVERY";
  type SelectedAction = { kind: "event"; code: ManagerDispatchActionCode } | { kind: "delivery"; code: ManagerDeliveryActionCode };
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

  const eventAction = selectedAction?.kind === "event" ? dispatchActionDefinition(selectedAction.code, props.snapshot) : null;
  const eventDraft: ManagerDispatchActionDraft | null = eventAction && selectedAction?.kind === "event"
    ? { phase, code: selectedAction.code, routeId, rosterMemberId, manualRoute, note }
    : null;
  const deliveryDraft: ManagerDeliveryActionDraft | null = selectedAction?.kind === "delivery"
    ? { code: selectedAction.code, note, assistingRouteId, receivingRouteId, stopCount }
    : null;
  const validation = eventDraft
    ? validateDispatchAction(eventDraft, props.snapshot)
    : deliveryDraft ? validateManagerDeliveryAction(deliveryDraft) : actionGroup ? "Choose an action." : "Choose a primary action group.";
  const actionLabel = selectedAction?.kind === "event"
    ? dispatchActionDefinition(selectedAction.code, props.snapshot).label
    : selectedAction?.code === "DELIVERY_NOTE" ? "Delivery note" : selectedAction?.code === "DRIVER_ASSIST" ? "Driver assist" : "action";
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
    ? dispatchCatalog.map((action) => ({
        value: `event:${action.code}`,
        label: action.label,
        detail: action.category,
        group: managerEventActionGroup(action),
      }))
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
    const [kind, code] = value.split(":") as ["event" | "delivery", ManagerDispatchActionCode | ManagerDeliveryActionCode];
    setSelectedAction(kind === "event"
      ? { kind, code: code as ManagerDispatchActionCode }
      : { kind, code: code as ManagerDeliveryActionCode });
    setRosterMemberId(null);
    setManualRoute("");
    setNote("");
    setFormError(null);
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

        <Card tone={validation || formError ? "danger" : "primary"}>
          <Text style={sharedStyles.bodyStrong}>{formError || validation || `${actionLabel} is ready to save.`}</Text>
          <Text style={sharedStyles.muted}>The server rechecks company access, terminal date, and every linked person or route. The selected phase classifies the event.</Text>
        </Card>
        <PrimaryButton disabled={Boolean(validation) || props.busy} label={props.busy ? "Saving…" : `Save ${actionLabel.toLowerCase()}`} onPress={() => void submit()} />
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
  onRefresh: () => void;
  onSettings: () => void;
  onSubmitDelivery: (draft: ManagerDeliveryActionDraft) => Promise<void>;
  onSubmit: (draft: ManagerDispatchActionDraft) => Promise<void>;
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
              onSubmitDelivery={props.onSubmitDelivery}
              onSubmitEvent={props.onSubmit}
              snapshot={props.snapshot}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export function ManagerMessagesScreen(props: {
  context: ManagerAccessContext;
  error: string | null;
  loading: boolean;
  onOpenWeb: (path: string) => void;
  onRefresh: () => void;
  onSettings: () => void;
  snapshot: ManagerWorkspaceSnapshot | null;
}) {
  const suite = managerWorkspaceSuite("messages", props.context);
  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Messages" />
      <Text style={sharedStyles.muted}>Review published updates, drafts, and acknowledgment requirements from the native manager layer.</Text>
      <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />
      {suite?.children.map((child) => (
        <AccessTile code={child.code} detail={child.detail} key={child.label} label={child.label} onPress={() => props.onOpenWeb(child.path)} trailing="WEB FALLBACK" />
      ))}
      <Card>
        <Text style={sharedStyles.bodyStrong}>Authoring enters Pass 2</Text>
        <Text style={sharedStyles.muted}>Message composition and publishing remain governed browser actions while this pass locks the native read experience.</Text>
      </Card>
    </Screen>
  );
}

export function ManagerFooter(props: {
  activeTab: ManagerTabKey;
  onAccount: () => void;
  onTab: (tab: ManagerTabKey) => void;
}) {
  const tabs: Array<[ManagerTabKey | "account", string]> = [
    ["today", "Today"],
    ["schedule", "Schedule"],
    ["workspaces", "Workspaces"],
    ["messages", "Messages"],
    ["account", "Account"],
  ];
  return (
    <View style={styles.footer}>
      {tabs.map(([key, label]) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: key !== "account" && props.activeTab === key }}
          key={key}
          onPress={() => key === "account" ? props.onAccount() : props.onTab(key)}
          style={styles.footerItem}
        >
          <Text style={[styles.footerCode, key !== "account" && props.activeTab === key && styles.footerActive]}>
            {key === "today" ? "T" : key === "schedule" ? "31" : key === "workspaces" ? "W" : key === "messages" ? "M" : "TC"}
          </Text>
          <Text style={[styles.footerLabel, key !== "account" && props.activeTab === key && styles.footerActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.58 },
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
  statusCovered: { borderColor: colors.success, backgroundColor: "#EAF6F1" },
  statusTight: { borderColor: colors.warning, backgroundColor: colors.paleWarning },
  statusGap: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
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
  workspacePage: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 14, backgroundColor: colors.white },
  workspaceGroup: { gap: 10 },
  nativeBanner: { gap: 6, padding: 18, borderRadius: 18, backgroundColor: colors.ink },
  nativeBannerLabel: { color: "#8DD3EF", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  nativeBannerTitle: { color: colors.white, fontSize: 20, fontWeight: "800" },
  nativeBannerDetail: { color: "#D6E1EC", fontSize: 13, lineHeight: 19 },
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
  operationsControl: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  operationsControlPrimary: { borderColor: colors.success, backgroundColor: colors.success },
  controlDisabled: { opacity: 0.5 },
  operationsControlText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  operationsControlTextPrimary: { color: colors.white },
  operationsStatus: { gap: 3, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  operationsStatusTitle: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  operationsStatusDetail: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  operationsFilters: { gap: 8, paddingRight: 20 },
  operationsFilter: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.white },
  operationsFilterActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  operationsFilterText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  operationsFilterTextActive: { color: colors.primary },
  operationsFilterCount: { minWidth: 21, height: 21, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderRadius: 999, backgroundColor: colors.panel },
  operationsFilterCountActive: { backgroundColor: colors.primary },
  operationsFilterCountText: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  operationsFilterCountTextActive: { color: colors.white },
  operationsRouteStack: { gap: 11 },
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
  phaseSelector: { flexDirection: "row", gap: 8, padding: 5, borderRadius: 16, backgroundColor: colors.panel },
  phaseOption: { flex: 1, minHeight: 58, justifyContent: "center", gap: 3, paddingHorizontal: 13, borderWidth: 1, borderColor: "transparent", borderRadius: 12 },
  phaseOptionActive: { borderColor: colors.primary, backgroundColor: colors.white },
  phaseOptionText: { color: colors.muted, fontSize: 14, fontWeight: "900" },
  phaseOptionTextActive: { color: colors.primary },
  phaseOptionDetail: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  phaseOptionDetailActive: { color: colors.ink },
  selectField: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  selectFieldValue: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  selectFieldPlaceholder: { color: colors.muted, fontSize: 15 },
  selectFieldArrow: { color: colors.primary, fontSize: 22, fontWeight: "900" },
  selectionSheet: { flex: 1, gap: 16, paddingHorizontal: 22, paddingTop: 26, backgroundColor: colors.white },
  selectionOptionStack: { gap: 8, paddingBottom: 48 },
  selectionOption: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  footer: { height: 74, flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  footerItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  footerCode: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  footerLabel: { color: colors.muted, fontSize: 10 },
  footerActive: { color: colors.primary },
});
