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

import type {
  CompanyWorkspaceGrantKey,
  DriverAccessContext,
  ManagerAccessContext,
} from "../domain/access";
import type {
  ManagerCoverageStatus,
  ManagerScheduleDay,
  ManagerScheduleSnapshot,
  ManagerTimeOffRequest,
} from "../domain/managerSchedule";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";
import { colors } from "../theme";

export type ManagerTabKey = "today" | "schedule" | "workspaces" | "messages";

type WorkspaceDestination = {
  grant: CompanyWorkspaceGrantKey;
  code: string;
  label: string;
  detail: string;
  path: string;
  group: "Operations" | "Workforce" | "Business & Admin";
};

const destinations: WorkspaceDestination[] = [
  { grant: "schedule", code: "SC", label: "Schedule", detail: "Coverage, overrides, and workbench", path: "/schedule", group: "Operations" },
  { grant: "dispatch", code: "DP", label: "Dispatch", detail: "Dispatch posture and route assignments", path: "/operations/dispatch", group: "Operations" },
  { grant: "routes", code: "RT", label: "Routes", detail: "Route records and route setup", path: "/routes", group: "Operations" },
  { grant: "planning", code: "PL", label: "Planning", detail: "Operations planning workspace", path: "/operations/planning", group: "Operations" },
  { grant: "delivery_window", code: "DW", label: "Delivery Window", detail: "In-day service and completion", path: "/operations/delivery-window", group: "Operations" },
  { grant: "operations_uploads", code: "UP", label: "Operations Uploads", detail: "DSW, DRO, and FCC reports", path: "/operations", group: "Operations" },
  { grant: "reports", code: "RP", label: "Ops Reports", detail: "Previous-day operational reporting", path: "/prior-day", group: "Operations" },
  { grant: "fleet", code: "FL", label: "Fleet", detail: "Vehicles, maintenance, and inspections", path: "/fleet", group: "Operations" },
  { grant: "roster", code: "RO", label: "Roster", detail: "Active and former workforce records", path: "/people/roster", group: "Workforce" },
  { grant: "hiring", code: "HR", label: "Hiring", detail: "Candidate pipeline and interviews", path: "/hiring", group: "Workforce" },
  { grant: "payroll", code: "PY", label: "Payroll", detail: "Summaries, compliance, and time tracking", path: "/payroll/summary", group: "Business & Admin" },
  { grant: "admin_config", code: "AD", label: "Company Config", detail: "Company and operations settings", path: "/config", group: "Business & Admin" },
  { grant: "grant_management", code: "AC", label: "Access Management", detail: "People and workspace grants", path: "/config/access", group: "Business & Admin" },
  { grant: "opportunity_analysis", code: "OA", label: "Opportunity Analysis", detail: "Prospective service opportunities", path: "/opportunity-analysis", group: "Business & Admin" },
];

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
    ["dispatch", "routes", "planning", "delivery_window", "operations_uploads", "reports"].includes(grant),
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
  onOpenWeb: (path: string) => void;
  onSettings: () => void;
}) {
  const allowed = destinations.filter((destination) => props.context.grants.includes(destination.grant));
  const groups = ["Operations", "Workforce", "Business & Admin"] as const;
  return (
    <ScrollView contentContainerStyle={styles.workspacePage} showsVerticalScrollIndicator={false}>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Workspaces" />
      <Text style={sharedStyles.muted}>Your company grants control every destination shown here.</Text>
      {groups.map((group) => {
        const items = allowed.filter((destination) => destination.group === group);
        if (items.length === 0) return null;
        return (
          <View key={group} style={styles.workspaceGroup}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionLabel}>{group}</Text>
              <Text style={styles.sectionMeta}>{items.length}</Text>
            </View>
            {items.map((destination) => (
              <AccessTile
                code={destination.code}
                detail={destination.detail}
                key={destination.grant}
                label={destination.label}
                onPress={() => destination.grant === "schedule"
                  ? props.onOpenNativeSchedule()
                  : props.onOpenWeb(destination.path)}
                trailing={destination.grant === "schedule" ? "NATIVE" : "WEB"}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function ManagerMessagesScreen(props: {
  context: ManagerAccessContext;
  onOpenWeb: (path: string) => void;
  onSettings: () => void;
}) {
  return (
    <Screen>
      <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Messages" />
      <Text style={sharedStyles.muted}>Author and publish company updates through the existing governed messaging workspace.</Text>
      <AccessTile code="MS" detail="Author, review, and ship company updates" label="Company messaging" onPress={() => props.onOpenWeb("/announcements")} trailing="WEB" />
      <Card>
        <Text style={sharedStyles.bodyStrong}>Native authoring is next</Text>
        <Text style={sharedStyles.muted}>The web workspace remains the authority until message composition is rebuilt for native interaction.</Text>
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
  footer: { height: 74, flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  footerItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  footerCode: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  footerLabel: { color: colors.muted, fontSize: 10 },
  footerActive: { color: colors.primary },
});
