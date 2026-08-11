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
  type ManagerWorkspaceKey,
  type ManagerWorkspaceSnapshot,
  type ManagerWorkspaceSuite,
  type ManagerWorkspaceTone,
} from "../domain/managerWorkspace";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";
import { colors } from "../theme";

export type ManagerTabKey = "today" | "schedule" | "workspaces" | "messages";

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

function OperationsControl(props: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.operationsControl, props.primary && styles.operationsControlPrimary, pressed && styles.pressed]}
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

function OperationsRouteCard(props: { route: ManagerOperationsRoute }) {
  const presentation = operationsPhaseCopy[props.route.phase];
  const routeIdentity = props.route.workArea && !props.route.routeName.includes(props.route.workArea)
    ? `${props.route.routeName} · ${props.route.workArea}`
    : props.route.routeName;
  const stopsPercent = props.route.plannedStops > 0
    ? Math.min(100, Math.round((props.route.completedStops / props.route.plannedStops) * 100))
    : props.route.progressPercent;
  return (
    <View style={[
      styles.operationsRouteCard,
      presentation.tone === "active" && styles.operationsRouteCardActive,
      presentation.tone === "complete" && styles.operationsRouteCardComplete,
      presentation.tone === "attention" && styles.operationsRouteCardAttention,
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
    </View>
  );
}

type OperationsFilter = "all" | "on_job" | "end_of_day" | "attention";

function OperationsReadSurface(props: {
  loading: boolean;
  error: string | null;
  snapshot: ManagerWorkspaceSnapshot | null;
  onOpenWeb: () => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<OperationsFilter>("all");
  if (props.loading || props.error || !props.snapshot?.operations) {
    return <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />;
  }
  const operations = props.snapshot.operations;
  const counts: Record<OperationsFilter, number> = {
    all: operations.routes.length,
    on_job: operations.routes.filter((route) => route.phase === "on_job").length,
    end_of_day: operations.routes.filter((route) => route.phase === "end_of_day").length,
    attention: operations.routes.filter((route) => !["on_job", "end_of_day"].includes(route.phase)).length,
  };
  const visibleRoutes = operations.routes.filter((route) => {
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
  return (
    <>
      <ScrollView contentContainerStyle={styles.operationsControls} horizontal showsHorizontalScrollIndicator={false}>
        <OperationsControl label="Action" onPress={props.onOpenWeb} primary />
        <OperationsControl label="Compliance Report" onPress={props.onOpenWeb} />
        <OperationsControl label="Express Report" onPress={props.onOpenWeb} />
        <OperationsControl label="Attendance" onPress={props.onOpenWeb} />
        <OperationsControl label="Refresh" onPress={props.onRefresh} />
      </ScrollView>
      <View style={styles.operationsStatus}>
        <Text style={styles.operationsStatusTitle}>{operations.routes.length} routes · {operations.serviceDate}</Text>
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
        {visibleRoutes.length ? visibleRoutes.map((route) => <OperationsRouteCard key={route.id} route={route} />) : (
          <Card><Text style={sharedStyles.bodyStrong}>No matching routes</Text><Text style={sharedStyles.muted}>Choose another operating filter.</Text></Card>
        )}
      </View>
    </>
  );
}

export function ManagerWorkspaceDetailScreen(props: {
  context: ManagerAccessContext;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onOpenWeb: (path: string) => void;
  onRefresh: () => void;
  onSettings: () => void;
  snapshot: ManagerWorkspaceSnapshot | null;
  suite: ManagerWorkspaceSuite;
}) {
  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title={props.suite.label} />
      <Pressable onPress={props.onBack}><Text style={styles.back}>‹ Workspaces</Text></Pressable>
      {props.suite.key === "operations" ? (
        <OperationsReadSurface error={props.error} loading={props.loading} onOpenWeb={() => props.onOpenWeb(props.suite.fallbackPath)} onRefresh={props.onRefresh} snapshot={props.snapshot} />
      ) : (
        <WorkspaceSnapshotView error={props.error} loading={props.loading} onRetry={props.onRefresh} snapshot={props.snapshot} />
      )}
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
  operationsControls: { gap: 8, paddingRight: 20 },
  operationsControl: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  operationsControlPrimary: { borderColor: colors.success, backgroundColor: colors.success },
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
  footer: { height: 74, flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  footerItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  footerCode: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  footerLabel: { color: colors.muted, fontSize: 10 },
  footerActive: { color: colors.primary },
});
