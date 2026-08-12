import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import {
  AccountModal,
  ContextResolverScreen,
  Footer,
  PrimaryButton,
  type TabKey,
} from "./src/components/ui";
import { IntentVerificationModal } from "./src/components/IntentVerificationModal";
import {
  loadDriverMessages,
  loadDriverSchedule,
  loadDriverTimeOffRequests,
  loadFleetVehicles,
  synchronizeMobileOutbox,
} from "./src/data/mobile";
import {
  loadManagerScheduleSnapshot,
  reviewManagerTimeOffRequest,
} from "./src/data/managerSchedule";
import {
  loadManagerMessagesSnapshot,
  saveManagerMessage,
} from "./src/data/managerMessages";
import {
  loadManagerDispatchSnapshot,
  recordManagerDispatchAction,
} from "./src/data/managerDispatch";
import { loadManagerRouteEvidence, recordManagerDeliveryAction } from "./src/data/managerOperations";
import { loadManagerWorkspaceSnapshot } from "./src/data/managerWorkspace";
import { updateManagerCandidateStage } from "./src/data/managerPeople";
import { createManagerFleetWorkOrder, updateManagerFleetWorkOrder } from "./src/data/managerFleet";
import { saveManagerRoute } from "./src/data/managerRoutes";
import { loadManagerOperationsChildSnapshot } from "./src/data/managerOperationsChildren";
import {
  manageManagerWalkOnIdentity,
  loadManagerWalkOnSnapshot,
  recordManagerWalkOnAction,
  saveManagerWalkOnAssignment,
} from "./src/data/managerWalkOns";
import {
  scheduleForDate,
  type DriverMessage,
  type DriverSchedule,
  type DriverTimeOffRequest,
  type FleetVehicle,
} from "./src/domain/mobile";
import {
  driverContextForCompany,
  isDriverAccessContext,
  isManagerAccessContext,
  type MobileAccessContext,
} from "./src/domain/access";
import {
  addScheduleDays,
  managerWeekStart,
  type ManagerScheduleSnapshot,
  type ManagerTimeOffRequest,
} from "./src/domain/managerSchedule";
import type {
  ManagerDispatchActionDraft,
  ManagerDispatchSnapshot,
} from "./src/domain/managerDispatch";
import type { ManagerDeliveryActionDraft } from "./src/domain/managerOperations";
import type { ManagerFleetWorkOrderDraft } from "./src/domain/managerFleet";
import type { ManagerRouteDraft } from "./src/domain/managerRoutes";
import type {
  ManagerMessageDraft,
  ManagerMessagesSnapshot,
} from "./src/domain/managerMessages";
import type {
  ManagerWalkOnAssignmentDraft,
  ManagerWalkOnIdentityDraft,
} from "./src/domain/managerWalkOns";
import {
  managerWorkspaceSuite,
  type ManagerWorkspaceChildKey,
  type ManagerWorkspaceKey,
  type ManagerWorkspaceSnapshot,
} from "./src/domain/managerWorkspace";
import {
  getSupabaseClient,
  loadMobileAccessContexts,
  type AccessMembership,
} from "./src/lib/supabase";
import {
  deactivatePushDevice,
  pushRegistrationState,
  registerPushDevice,
  type PushRegistrationState,
} from "./src/notifications/push";
import { EdgeOutbox } from "./src/outbox/database";
import type {
  InspectionSubmissionPayload,
  LocalInspectionEvidence,
  LocalSession,
  MobileOutboxCounts,
  IntentConfirmation,
} from "./src/outbox/types";
import { HomeScreen } from "./src/screens/HomeScreen";
import { InspectionScreen } from "./src/screens/InspectionScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ScheduleScreen } from "./src/screens/ScheduleScreen";
import { ScorecardScreen } from "./src/screens/ScorecardScreen";
import {
  ManagerFooter,
  ManagerDispatchScreen,
  ManagerHomeScreen,
  ManagerMessagesScreen,
  ManagerOperationsChildScreen,
  ManagerScheduleScreen,
  ManagerWorkspaceDetailScreen,
  ManagerWorkspacesScreen,
  type ManagerScheduleSurface,
  type ManagerTabKey,
} from "./src/screens/ManagerScreens";
import { colors } from "./src/theme";
import {
  captureForegroundPoint,
  FOREGROUND_BREADCRUMB_INTERVAL_MS,
  requirePreciseForegroundLocation,
} from "./src/tracking/location";

const EMPTY_MOBILE_COUNTS: MobileOutboxCounts = {
  queued: 0,
  pendingBatches: 0,
  rejected: 0,
  pendingInspections: 0,
  pendingAcknowledgments: 0,
  pendingTimeOffActions: 0,
  totalPending: 0,
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(error);
    } catch {
      return "The request failed without a readable error message.";
    }
  }
  return String(error);
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    try {
      setBusy(true);
      setError(null);
      const result = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error("Sign-in did not return a session.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.signInPage}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>INSIGHT</Text>
        <Text style={styles.signInTitle}>Mobile Companion</Text>
        <Text style={styles.signInLead}>Use your existing Insight account.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="name@company.com"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            style={styles.passwordInput}
            value={password}
          />
          <Pressable onPress={() => setShowPassword((current) => !current)}>
            <Text style={styles.show}>{showPassword ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          disabled={busy || !email.trim() || !password}
          label={busy ? "Signing in…" : "Sign in"}
          onPress={() => void signIn()}
        />

        <Text style={styles.authorityNote}>
          Your access is managed through your existing Insight account.
        </Text>
        <Text style={styles.signInFootnote}>
          Internet is required for first sign-in. After sign-in, supported work can be saved offline and synced later.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthenticatedApp(props: { session: Session }) {
  const [outbox, setOutbox] = useState<EdgeOutbox | null>(null);
  const [contexts, setContexts] = useState<MobileAccessContext[]>([]);
  const [selectedContextKey, setSelectedContextKey] = useState<string>("");
  const [profileId, setProfileId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [dutySession, setDutySession] = useState<LocalSession | null>(null);
  const [counts, setCounts] = useState<MobileOutboxCounts>(EMPTY_MOBILE_COUNTS);
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [schedule, setSchedule] = useState<DriverSchedule | null>(null);
  const [timeOffRequests, setTimeOffRequests] = useState<DriverTimeOffRequest[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<DriverMessage | null>(null);
  const [tab, setTab] = useState<TabKey>("home");
  const [managerTab, setManagerTab] = useState<ManagerTabKey>("today");
  const [managerScheduleSurface, setManagerScheduleSurface] = useState<ManagerScheduleSurface>("bridge");
  const [managerScheduleWeek, setManagerScheduleWeek] = useState(() => managerWeekStart());
  const [managerScheduleSnapshot, setManagerScheduleSnapshot] = useState<ManagerScheduleSnapshot | null>(null);
  const [managerScheduleLoading, setManagerScheduleLoading] = useState(false);
  const [managerScheduleError, setManagerScheduleError] = useState<string | null>(null);
  const [managerScheduleReviewBusy, setManagerScheduleReviewBusy] = useState(false);
  const [managerMessagesSnapshot, setManagerMessagesSnapshot] = useState<ManagerMessagesSnapshot | null>(null);
  const [managerMessagesLoading, setManagerMessagesLoading] = useState(false);
  const [managerMessagesError, setManagerMessagesError] = useState<string | null>(null);
  const [managerMessagesBusy, setManagerMessagesBusy] = useState(false);
  const [managerWorkspaceKey, setManagerWorkspaceKey] = useState<ManagerWorkspaceKey | null>(null);
  const [managerWorkspaceSnapshot, setManagerWorkspaceSnapshot] = useState<ManagerWorkspaceSnapshot | null>(null);
  const [managerWorkspaceLoading, setManagerWorkspaceLoading] = useState(false);
  const [managerWorkspaceError, setManagerWorkspaceError] = useState<string | null>(null);
  const [managerPeopleBusy, setManagerPeopleBusy] = useState(false);
  const [managerFleetBusy, setManagerFleetBusy] = useState(false);
  const [managerRoutesBusy, setManagerRoutesBusy] = useState(false);
  const [managerWorkspaceChildKey, setManagerWorkspaceChildKey] = useState<ManagerWorkspaceChildKey | null>(null);
  const [managerWorkspaceChildSnapshot, setManagerWorkspaceChildSnapshot] = useState<ManagerWorkspaceSnapshot | null>(null);
  const [managerWorkspaceChildLoading, setManagerWorkspaceChildLoading] = useState(false);
  const [managerWorkspaceChildError, setManagerWorkspaceChildError] = useState<string | null>(null);
  const [managerDispatchSnapshot, setManagerDispatchSnapshot] = useState<ManagerDispatchSnapshot | null>(null);
  const [managerDispatchLoading, setManagerDispatchLoading] = useState(false);
  const [managerDispatchError, setManagerDispatchError] = useState<string | null>(null);
  const [managerDispatchBusy, setManagerDispatchBusy] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<PushRegistrationState>("CHECKING");
  const [dutyIntent, setDutyIntent] = useState<"START" | "STOP" | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>("Preparing your secure Mobile Companion workspace…");
  const [messageNotice, setMessageNotice] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState<Date | null>(null);
  const syncingRef = useRef(false);
  const capturingBreadcrumbRef = useRef(false);

  const selectedContext = useMemo(
    () => contexts.find((item) => item.context_key === selectedContextKey) ?? null,
    [contexts, selectedContextKey],
  );
  const membership = isDriverAccessContext(selectedContext) ? selectedContext : null;
  const managerContext = isManagerAccessContext(selectedContext) ? selectedContext : null;
  const dutyMembership = useMemo(
    () => contexts.find((item): item is AccessMembership =>
      isDriverAccessContext(item) && item.context_key === dutySession?.tenantKey,
    ) ?? null,
    [contexts, dutySession?.tenantKey],
  );
  const syncMembership = membership ?? dutyMembership;

  const refreshManagerSchedule = useCallback(async () => {
    if (!managerContext || !managerContext.grants.includes("schedule")) return;
    try {
      setManagerScheduleLoading(true);
      setManagerScheduleError(null);
      setManagerScheduleSnapshot(null);
      const snapshot = await loadManagerScheduleSnapshot(managerContext, managerScheduleWeek);
      setManagerScheduleSnapshot(snapshot);
    } catch (caught) {
      setManagerScheduleError(errorMessage(caught));
    } finally {
      setManagerScheduleLoading(false);
    }
  }, [managerContext, managerScheduleWeek]);

  const refreshManagerWorkspace = useCallback(async (key: ManagerWorkspaceKey) => {
    if (!managerContext) return;
    try {
      setManagerWorkspaceLoading(true);
      setManagerWorkspaceError(null);
      setManagerWorkspaceSnapshot(null);
      const snapshot = await loadManagerWorkspaceSnapshot(managerContext, key);
      setManagerWorkspaceSnapshot(snapshot);
    } catch (caught) {
      setManagerWorkspaceError(errorMessage(caught));
    } finally {
      setManagerWorkspaceLoading(false);
    }
  }, [managerContext]);

  const refreshManagerMessages = useCallback(async () => {
    if (!managerContext) return;
    try {
      setManagerMessagesLoading(true);
      setManagerMessagesError(null);
      const snapshot = await loadManagerMessagesSnapshot(managerContext);
      setManagerMessagesSnapshot(snapshot);
    } catch (caught) {
      setManagerMessagesError(errorMessage(caught));
    } finally {
      setManagerMessagesLoading(false);
    }
  }, [managerContext]);

  const refreshManagerDispatch = useCallback(async () => {
    if (!managerContext || !managerContext.grants.includes("dispatch")) return;
    try {
      setManagerDispatchLoading(true);
      setManagerDispatchError(null);
      const snapshot = await loadManagerDispatchSnapshot(managerContext);
      setManagerDispatchSnapshot(snapshot);
    } catch (caught) {
      setManagerDispatchError(errorMessage(caught));
    } finally {
      setManagerDispatchLoading(false);
    }
  }, [managerContext]);

  const refreshManagerOperationsChild = useCallback(async (serviceDate?: string) => {
    if (!managerContext || !managerWorkspaceChildKey || managerWorkspaceChildKey === "dispatch") return;
    try {
      setManagerWorkspaceChildLoading(true);
      setManagerWorkspaceChildError(null);
      const snapshot = await loadManagerOperationsChildSnapshot(
        managerContext,
        managerWorkspaceChildKey,
        serviceDate,
      );
      setManagerWorkspaceChildSnapshot(snapshot);
    } catch (caught) {
      setManagerWorkspaceChildError(errorMessage(caught));
    } finally {
      setManagerWorkspaceChildLoading(false);
    }
  }, [managerContext, managerWorkspaceChildKey]);

  const refreshLocal = useCallback(async (nextOutbox: EdgeOutbox, companyId: string) => {
    const [session, nextCounts] = await Promise.all([
      nextOutbox.openSession(companyId),
      nextOutbox.mobileCounts(companyId),
    ]);
    setDutySession(session);
    setCounts(nextCounts);
  }, []);

  const refreshRemote = useCallback(async (
    nextOutbox: EdgeOutbox,
    nextMembership: AccessMembership,
    nextProfileId: string,
  ) => {
    const [messageResult, scheduleResult, vehicleResult, timeOffResult] = await Promise.allSettled([
      loadDriverMessages(nextMembership, nextProfileId, nextOutbox),
      loadDriverSchedule(nextMembership, nextOutbox),
      loadFleetVehicles(nextMembership, nextOutbox),
      loadDriverTimeOffRequests(nextMembership, nextOutbox),
    ]);
    if (messageResult.status === "fulfilled") setMessages(messageResult.value);
    if (scheduleResult.status === "fulfilled") setSchedule(scheduleResult.value);
    if (vehicleResult.status === "fulfilled") setVehicles(vehicleResult.value);
    if (timeOffResult.status === "fulfilled") setTimeOffRequests(timeOffResult.value);
    const failures = [messageResult, scheduleResult, vehicleResult, timeOffResult].filter(
      (result) => result.status === "rejected",
    );
    if (failures.length > 0) {
      setStatus("Some live data is unavailable. Saved driver data remains available where possible.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    let opened: EdgeOutbox | null = null;
    void (async () => {
      try {
        opened = await EdgeOutbox.open(props.session.user.id);
        const access = await loadMobileAccessContexts();
        const driverContexts = access.contexts.filter(isDriverAccessContext);
        const recovered = (
          await Promise.all(driverContexts.map((item) => opened!.openSession(item.context_key)))
        ).find(Boolean);
        if (!active) return;
        setOutbox(opened);
        setContexts(access.contexts);
        setProfileId(access.profileId);
        setDisplayName(access.displayName);
        setSelectedContextKey(
          recovered?.tenantKey
          ?? (access.contexts.length === 1 ? access.contexts[0].context_key : ""),
        );
        setStatus(
          access.contexts.length > 0
            ? recovered
              ? "Recovered your active duty session from the encrypted device outbox."
              : null
            : "This account has no eligible Mobile Companion roles or workspace grants.",
        );
      } catch (caught) {
        if (active) setStatus(errorMessage(caught));
      }
    })();
    return () => {
      active = false;
      // Fast Refresh can tear down this tree while an earlier background read
      // is still settling. Cleanup must never surface as an unhandled promise.
      void opened?.close().catch(() => undefined);
    };
  }, [props.session.user.id]);

  useEffect(() => {
    if (!outbox || !membership || !profileId) return;
    setMessages([]);
    setSchedule(null);
    setVehicles([]);
    setTimeOffRequests([]);
    void refreshLocal(outbox, membership.context_key).catch((caught) => {
      setStatus(`Saved device data is temporarily unavailable: ${errorMessage(caught)}`);
    });
    void refreshRemote(outbox, membership, profileId).catch((caught) => {
      setStatus(`Some live data is unavailable: ${errorMessage(caught)}`);
    });
  }, [membership, outbox, profileId, refreshLocal, refreshRemote]);

  useEffect(() => {
    if (!managerContext || managerTab !== "schedule") return;
    void refreshManagerSchedule();
  }, [managerContext, managerTab, refreshManagerSchedule]);

  useEffect(() => {
    if (!managerContext) return;
    const key = managerTab === "workspaces" ? managerWorkspaceKey : null;
    if (key) void refreshManagerWorkspace(key);
  }, [managerContext, managerTab, managerWorkspaceKey, refreshManagerWorkspace]);

  useEffect(() => {
    if (!managerContext || managerTab !== "messages") return;
    void refreshManagerMessages();
  }, [managerContext, managerTab, refreshManagerMessages]);

  useEffect(() => {
    const operationsParentOpen = managerWorkspaceKey === "operations" && managerWorkspaceChildKey === null;
    if (!managerContext?.grants.includes("dispatch") || managerTab !== "workspaces" || (!operationsParentOpen && managerWorkspaceChildKey !== "dispatch")) return;
    void refreshManagerDispatch();
  }, [managerContext, managerTab, managerWorkspaceChildKey, managerWorkspaceKey, refreshManagerDispatch]);

  useEffect(() => {
    if (managerTab !== "workspaces" || managerWorkspaceKey !== "operations" || !managerWorkspaceChildKey || managerWorkspaceChildKey === "dispatch") return;
    setManagerWorkspaceChildSnapshot(null);
    void refreshManagerOperationsChild();
  }, [managerTab, managerWorkspaceChildKey, managerWorkspaceKey, refreshManagerOperationsChild]);

  useEffect(() => {
    if (!membership) {
      setNotificationError(null);
      setNotificationState("UNSUPPORTED");
      return;
    }
    setNotificationError(null);
    setNotificationState("CHECKING");
    void pushRegistrationState()
      .then(setNotificationState)
      .catch((caught) => {
        setNotificationState("ERROR");
        setNotificationError(errorMessage(caught));
      });
  }, [membership]);

  const synchronize = useCallback(async () => {
    if (!outbox || !syncMembership || syncingRef.current) return null;
    try {
      syncingRef.current = true;
      setSyncing(true);
      const open = await outbox.openSession(syncMembership.context_key);
      if (open) await outbox.sealNextBatch(syncMembership.context_key, open.sessionId);
      const summary = await synchronizeMobileOutbox(outbox, syncMembership);
      await refreshLocal(outbox, syncMembership.context_key);
      if (summary.online && !summary.error) {
        setLastSynchronizedAt(new Date());
        setStatus(null);
        if (profileId && membership?.context_key === syncMembership.context_key) {
          await refreshRemote(outbox, syncMembership, profileId);
        }
      } else if (summary.error) {
        setStatus(`Sync paused safely: ${summary.error}`);
      }
      return summary;
    } catch (caught) {
      setStatus(`Sync paused safely: ${errorMessage(caught)}`);
      return null;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [membership?.context_key, outbox, profileId, refreshLocal, refreshRemote, syncMembership]);

  useEffect(() => {
    if (!outbox || !syncMembership) return;
    void synchronize();
    const interval = setInterval(() => void synchronize(), 60_000);
    const listener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void synchronize();
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, [outbox, synchronize, syncMembership]);

  useEffect(() => {
    if (!outbox || !dutySession || !dutyMembership) return;
    let active = true;

    const capture = async () => {
      if (
        !active
        || AppState.currentState !== "active"
        || capturingBreadcrumbRef.current
      ) return;
      try {
        capturingBreadcrumbRef.current = true;
        const point = await captureForegroundPoint(
          dutySession.sessionId,
          dutyMembership.context_key,
        );
        if (!active) return;
        await outbox.enqueuePoint(point);
        await refreshLocal(outbox, dutyMembership.context_key);
        void synchronize();
      } catch (caught) {
        if (active) {
          setStatus(`Foreground location evidence paused: ${errorMessage(caught)}`);
        }
      } finally {
        capturingBreadcrumbRef.current = false;
      }
    };

    const interval = setInterval(
      () => void capture(),
      FOREGROUND_BREADCRUMB_INTERVAL_MS,
    );
    const listener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void capture();
    });
    return () => {
      active = false;
      clearInterval(interval);
      listener.remove();
    };
  }, [dutyMembership, dutySession, outbox, refreshLocal, synchronize]);

  async function startDuty() {
    if (!outbox || !membership || busy) return;
    try {
      setBusy(true);
      setStatus(null);
      await requirePreciseForegroundLocation();
      const started = await outbox.startSession(
        membership.context_key,
        membership.company_slug,
      );
      try {
        const point = await captureForegroundPoint(started.sessionId, membership.context_key);
        await outbox.enqueuePoint(point);
      } catch (caught) {
        await outbox.stopSession(membership.context_key, started.sessionId);
        throw caught;
      }
      setDutySession(started);
      setStatus(membership.access_mode === "ADMIN_DEMO"
        ? "Demo duty started. Location evidence is isolated from operational driver records."
        : "Duty started. Foreground location evidence was saved on this device.");
      await refreshLocal(outbox, membership.context_key);
      void synchronize();
    } catch (caught) {
      setStatus(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function stopDuty() {
    if (!outbox || !membership || !dutySession) return;
    const stoppingSession = dutySession;
    setDutySession(null);
    setStatus("Stopping duty and saving the final device state…");
    try {
      try {
        const point = await captureForegroundPoint(
          stoppingSession.sessionId,
          membership.context_key,
        );
        await outbox.enqueuePoint(point);
      } catch {
        // Stop Duty is never blocked by a missing final foreground point.
      }
      await outbox.sealNextBatch(membership.context_key, stoppingSession.sessionId);
      await outbox.stopSession(membership.context_key, stoppingSession.sessionId);
      await refreshLocal(outbox, membership.context_key);
      setStatus(membership.access_mode === "ADMIN_DEMO"
        ? "Demo duty stopped. Test evidence remains isolated from operational records."
        : "Duty stopped. Any unsent evidence is saved securely on this device.");
      void synchronize();
    } catch (caught) {
      setStatus(`Duty was closed locally. ${errorMessage(caught)}`);
    }
  }

  async function acknowledgeMessage(message: DriverMessage) {
    if (!outbox || !membership || !profileId) return;
    try {
      setBusy(true);
      await outbox.enqueueMessageAcknowledgment(
        membership.context_key,
        message.id,
        profileId,
      );
      const optimistic = { ...message, acknowledged: true, acknowledged_at: null };
      setMessages((current) => current.map((item) => item.id === message.id ? optimistic : item));
      setSelectedMessage(optimistic);
      setMessageNotice("Acknowledgment saved. It will synchronize automatically.");
      await refreshLocal(outbox, membership.context_key);
      const summary = await synchronize();
      if (summary?.online && !summary.error) {
        setMessageNotice(membership.access_mode === "ADMIN_DEMO"
          ? "Acknowledgment recorded in the isolated demo ledger."
          : "Acknowledgment recorded by Insight.");
      }
    } catch (caught) {
      setMessageNotice(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitInspection(
    payload: InspectionSubmissionPayload,
    evidence: LocalInspectionEvidence[],
  ) {
    if (!outbox || !membership) throw new Error("The encrypted outbox is unavailable.");
    await outbox.enqueueInspectionSubmission(
      membership.context_key,
      membership.company_slug,
      payload,
      evidence,
    );
    await refreshLocal(outbox, membership.context_key);
    const summary = await synchronize();
    return summary?.online && !summary.error && summary.inspectionsAcknowledged > 0
      ? "submitted" as const
      : "offline" as const;
  }

  async function submitTimeOffRequest(
    dates: string[],
    note: string,
    intent: IntentConfirmation,
  ) {
    if (!outbox || !membership) throw new Error("The encrypted outbox is unavailable.");
    try {
      setBusy(true);
      setScheduleNotice(null);
      await outbox.enqueueTimeOffSubmission(
        membership.context_key,
        membership.company_slug,
        membership.roster_member_id,
        {
          requested_dates: dates,
          request_note: note,
          intent_confirmation: intent,
        },
      );
      await refreshLocal(outbox, membership.context_key);
      const summary = await synchronize();
      setScheduleNotice(
        summary?.online && !summary.error && summary.timeOffActionsAcknowledged > 0
          ? membership.access_mode === "ADMIN_DEMO"
            ? "Demo request recorded without changing the operational schedule."
            : "Time-off request submitted for leadership review."
          : "Saved on this device — waiting to submit.",
      );
      if (profileId) await refreshRemote(outbox, membership, profileId);
    } finally {
      setBusy(false);
    }
  }

  async function withdrawTimeOffRequest(
    request: DriverTimeOffRequest,
    intent: IntentConfirmation,
  ) {
    if (!outbox || !membership) throw new Error("The encrypted outbox is unavailable.");
    try {
      setBusy(true);
      setScheduleNotice(null);
      await outbox.enqueueTimeOffWithdrawal(
        membership.context_key,
        membership.company_slug,
        membership.roster_member_id,
        request.id,
        intent,
      );
      setTimeOffRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, status: "WITHDRAWN" }
        : item));
      await refreshLocal(outbox, membership.context_key);
      const summary = await synchronize();
      setScheduleNotice(
        summary?.online && !summary.error && summary.timeOffActionsAcknowledged > 0
          ? membership.access_mode === "ADMIN_DEMO"
            ? "Demo request withdrawn in the isolated test ledger."
            : "Time-off request withdrawn."
          : "Withdrawal saved on this device — waiting to submit.",
      );
      if (profileId) await refreshRemote(outbox, membership, profileId);
    } finally {
      setBusy(false);
    }
  }

  function changeTab(nextTab: TabKey) {
    if (nextTab !== "messages") setSelectedMessage(null);
    setTab(nextTab);
  }

  function selectContext(contextKey: string, driverTab: TabKey = "home") {
    const next = contexts.find((context) => context.context_key === contextKey);
    if (!next) return;
    if (
      dutySession
      && next.role === "DRIVER"
      && next.context_key !== dutySession.tenantKey
    ) {
      setStatus("Return to the active driver context and stop duty before choosing another driver gate.");
      return;
    }
    setSelectedContextKey(contextKey);
    setSettingsOpen(false);
    if (next.role === "DRIVER") {
      setTab(driverTab);
    } else {
      setManagerTab("today");
      setManagerScheduleSurface("bridge");
      setManagerScheduleWeek(managerWeekStart());
      setManagerScheduleSnapshot(null);
      setManagerScheduleError(null);
      setManagerMessagesSnapshot(null);
      setManagerMessagesError(null);
      setManagerWorkspaceKey(null);
      setManagerWorkspaceSnapshot(null);
      setManagerWorkspaceError(null);
      setManagerWorkspaceChildKey(null);
      setManagerWorkspaceChildSnapshot(null);
      setManagerWorkspaceChildError(null);
      setManagerDispatchSnapshot(null);
      setManagerDispatchError(null);
    }
  }

  async function reviewManagerRequest(
    request: ManagerTimeOffRequest,
    decision: "APPROVED" | "DENIED",
    note: string,
  ) {
    if (!managerContext) return;
    try {
      setManagerScheduleReviewBusy(true);
      setManagerScheduleError(null);
      await reviewManagerTimeOffRequest({
        context: managerContext,
        requestId: request.id,
        decision,
        managerNote: note,
      });
      await refreshManagerSchedule();
    } catch (caught) {
      setManagerScheduleError(errorMessage(caught));
      throw caught;
    } finally {
      setManagerScheduleReviewBusy(false);
    }
  }

  async function submitManagerDispatchAction(draft: ManagerDispatchActionDraft) {
    if (!managerContext || !managerDispatchSnapshot) return;
    try {
      setManagerDispatchBusy(true);
      setManagerDispatchError(null);
      await recordManagerDispatchAction(managerContext, managerDispatchSnapshot, draft);
      await refreshManagerDispatch();
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerDispatchError(message);
      throw new Error(message);
    } finally {
      setManagerDispatchBusy(false);
    }
  }

  async function submitManagerDeliveryAction(draft: ManagerDeliveryActionDraft) {
    if (!managerContext || !managerDispatchSnapshot) return;
    try {
      setManagerDispatchBusy(true);
      setManagerDispatchError(null);
      await recordManagerDeliveryAction(managerContext, managerDispatchSnapshot, draft);
      await refreshManagerDispatch();
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerDispatchError(message);
      throw new Error(message);
    } finally {
      setManagerDispatchBusy(false);
    }
  }

  async function submitManagerWalkOnAssignment(draft: ManagerWalkOnAssignmentDraft) {
    if (!managerContext) return;
    try {
      setManagerDispatchBusy(true);
      setManagerWorkspaceChildError(null);
      await saveManagerWalkOnAssignment(managerContext, draft);
      await refreshManagerOperationsChild();
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerWorkspaceChildError(message);
      throw new Error(message);
    } finally {
      setManagerDispatchBusy(false);
    }
  }

  async function submitManagerWalkOnIdentity(draft: ManagerWalkOnIdentityDraft) {
    if (!managerContext) return;
    try {
      setManagerDispatchBusy(true);
      setManagerWorkspaceChildError(null);
      await manageManagerWalkOnIdentity(managerContext, draft);
      await refreshManagerOperationsChild();
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerWorkspaceChildError(message);
      throw new Error(message);
    } finally {
      setManagerDispatchBusy(false);
    }
  }

  async function submitManagerWalkOnAction(draft: ManagerWalkOnAssignmentDraft) {
    if (!managerContext) return;
    try {
      setManagerDispatchBusy(true);
      setManagerDispatchError(null);
      await recordManagerWalkOnAction(managerContext, draft);
      await refreshManagerDispatch();
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerDispatchError(message);
      throw new Error(message);
    } finally {
      setManagerDispatchBusy(false);
    }
  }

  async function submitManagerMessage(
    draft: ManagerMessageDraft,
    messageStatus: "draft" | "published",
  ) {
    if (!managerContext || !profileId) return;
    try {
      setManagerMessagesBusy(true);
      setManagerMessagesError(null);
      await saveManagerMessage({
        context: managerContext,
        profileId,
        draft,
        status: messageStatus,
      });
      await refreshManagerMessages();
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerMessagesError(message);
      throw new Error(message);
    } finally {
      setManagerMessagesBusy(false);
    }
  }

  async function submitManagerCandidateStage(
    rosterMemberId: string,
    stageKey: string,
    note: string,
  ) {
    if (!managerContext || !managerWorkspaceSnapshot?.people) return;
    try {
      setManagerPeopleBusy(true);
      setManagerWorkspaceError(null);
      await updateManagerCandidateStage({
        context: managerContext,
        snapshot: managerWorkspaceSnapshot.people,
        rosterMemberId,
        stageKey,
        note,
      });
      await refreshManagerWorkspace("people");
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerWorkspaceError(message);
      throw new Error(message);
    } finally {
      setManagerPeopleBusy(false);
    }
  }

  async function submitManagerFleetWorkOrder(draft: ManagerFleetWorkOrderDraft) {
    if (!managerContext) return;
    try {
      setManagerFleetBusy(true);
      setManagerWorkspaceError(null);
      await createManagerFleetWorkOrder(managerContext, draft);
      await refreshManagerWorkspace("fleet");
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerWorkspaceError(message);
      throw new Error(message);
    } finally {
      setManagerFleetBusy(false);
    }
  }

  async function submitManagerFleetWorkOrderStatus(workOrderId: string, status: string) {
    if (!managerContext) return;
    try {
      setManagerFleetBusy(true);
      setManagerWorkspaceError(null);
      await updateManagerFleetWorkOrder(managerContext, workOrderId, status);
      await refreshManagerWorkspace("fleet");
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerWorkspaceError(message);
      throw new Error(message);
    } finally {
      setManagerFleetBusy(false);
    }
  }

  async function submitManagerRoute(routeId: string | null, draft: ManagerRouteDraft) {
    if (!managerContext) return;
    try {
      setManagerRoutesBusy(true);
      setManagerWorkspaceError(null);
      await saveManagerRoute(managerContext, routeId, draft);
      await refreshManagerWorkspace("routes");
    } catch (caught) {
      const message = errorMessage(caught);
      setManagerWorkspaceError(message);
      throw new Error(message);
    } finally {
      setManagerRoutesBusy(false);
    }
  }

  async function openCompanyWeb(path: string) {
    if (!managerContext) return;
    const base = (process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://teamoptix.io").replace(/\/$/, "");
    const url = `${base}/company/${managerContext.company_slug}${path}`;
    try {
      await Linking.openURL(url);
    } catch (caught) {
      setStatus(`Unable to open the web workspace: ${errorMessage(caught)}`);
    }
  }

  async function enableNotifications() {
    if (!membership || notificationBusy) return;
    try {
      setNotificationBusy(true);
      setNotificationError(null);
      await registerPushDevice(membership);
      setNotificationState("REGISTERED");
    } catch (caught) {
      const nextState = await pushRegistrationState().catch(() => "ERROR" as const);
      setNotificationState(nextState === "READY" ? "ERROR" : nextState);
      setNotificationError(errorMessage(caught));
    } finally {
      setNotificationBusy(false);
    }
  }

  async function signOut() {
    setSettingsOpen(false);
    await deactivatePushDevice().catch(() => undefined);
    await getSupabaseClient().auth.signOut();
  }

  if (!outbox || !profileId) {
    return (
      <View style={styles.loadingPage}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>{status ?? "Loading Mobile Companion…"}</Text>
        {contexts.length === 0 && outbox ? (
          <PrimaryButton label="Sign out" onPress={() => void signOut()} secondary />
        ) : null}
      </View>
    );
  }

  if (!selectedContext) {
    if (contexts.length > 0) {
      return (
        <ContextResolverScreen
          contexts={contexts}
          displayName={displayName}
          email={props.session.user.email ?? "Authenticated Insight user"}
          onSelectContext={selectContext}
          onSignOut={() => void signOut()}
        />
      );
    }
    return (
      <View style={styles.loadingPage}>
        <Text style={styles.loadingText}>
          {status ?? "This account has no eligible Mobile Companion roles or workspace grants."}
        </Text>
        <PrimaryButton label="Sign out" onPress={() => void signOut()} secondary />
      </View>
    );
  }

  if (managerContext) {
    const companyDriverContext = driverContextForCompany(contexts, managerContext.company_id);
    const activeManagerSuite = managerWorkspaceKey ? managerWorkspaceSuite(managerWorkspaceKey, managerContext) : null;
    return (
      <View style={styles.flex}>
        <View style={styles.content}>
          {managerTab === "today" ? (
            <ManagerHomeScreen
              context={managerContext}
              onOpenOperations={() => { setManagerTab("workspaces"); setManagerWorkspaceKey("operations"); setManagerWorkspaceChildKey(null); }}
              onOpenSchedule={() => { setManagerTab("schedule"); setManagerScheduleSurface("bridge"); }}
              onOpenWorkspaces={() => setManagerTab("workspaces")}
              onSettings={() => setSettingsOpen(true)}
            />
          ) : null}
          {managerTab === "schedule" ? (
            <ManagerScheduleScreen
              context={managerContext}
              driverContext={companyDriverContext}
              error={managerScheduleError}
              loading={managerScheduleLoading}
              reviewBusy={managerScheduleReviewBusy}
              snapshot={managerScheduleSnapshot}
              surface={managerScheduleSurface}
              onBack={() => setManagerScheduleSurface((current) => current === "overview" ? "bridge" : "overview")}
              onManage={() => setManagerScheduleSurface("overview")}
              onMySchedule={() => {
                if (companyDriverContext) selectContext(companyDriverContext.context_key, "schedule");
              }}
              onNextWeek={() => setManagerScheduleWeek((current) => addScheduleDays(current, 7))}
              onPreviousWeek={() => setManagerScheduleWeek((current) => addScheduleDays(current, -7))}
              onRefresh={() => void refreshManagerSchedule()}
              onReviewRequest={reviewManagerRequest}
              onSettings={() => setSettingsOpen(true)}
              onSurface={setManagerScheduleSurface}
            />
          ) : null}
          {managerTab === "workspaces" ? (
            managerWorkspaceChildKey === "dispatch" ? (
              <ManagerDispatchScreen
                busy={managerDispatchBusy}
                context={managerContext}
                error={managerDispatchError}
                loading={managerDispatchLoading}
                onBack={() => { setManagerWorkspaceChildKey(null); setManagerDispatchSnapshot(null); setManagerDispatchError(null); }}
                onLoadWalkOns={() => loadManagerWalkOnSnapshot(managerContext)}
                onRefresh={() => void refreshManagerDispatch()}
                onSettings={() => setSettingsOpen(true)}
                onSubmitDelivery={submitManagerDeliveryAction}
                onSubmit={submitManagerDispatchAction}
                onSubmitWalkOn={submitManagerWalkOnAction}
                snapshot={managerDispatchSnapshot}
              />
            ) : managerWorkspaceChildKey && managerWorkspaceKey === "operations" ? (
              <ManagerOperationsChildScreen
                busy={managerDispatchBusy}
                childKey={managerWorkspaceChildKey}
                context={managerContext}
                error={managerWorkspaceChildError}
                loading={managerWorkspaceChildLoading}
                onBack={() => {
                  setManagerWorkspaceChildKey(null);
                  setManagerWorkspaceChildSnapshot(null);
                  setManagerWorkspaceChildError(null);
                }}
                onManageWalkOn={submitManagerWalkOnIdentity}
                onOpenWeb={(path) => void openCompanyWeb(path)}
                onRefresh={() => void refreshManagerOperationsChild(managerWorkspaceChildSnapshot?.serviceDate)}
                onSaveWalkOn={submitManagerWalkOnAssignment}
                onServiceDate={(value) => void refreshManagerOperationsChild(value)}
                onSettings={() => setSettingsOpen(true)}
                snapshot={managerWorkspaceChildSnapshot}
              />
            ) : activeManagerSuite ? (
              <ManagerWorkspaceDetailScreen
                context={managerContext}
                dispatchBusy={managerDispatchBusy}
                dispatchError={managerDispatchError}
                dispatchLoading={managerDispatchLoading}
                dispatchSnapshot={managerDispatchSnapshot}
                error={managerWorkspaceError}
                loading={managerWorkspaceLoading}
                fleetBusy={managerFleetBusy}
                routesBusy={managerRoutesBusy}
                peopleBusy={managerPeopleBusy}
                onBack={() => { setManagerWorkspaceKey(null); setManagerWorkspaceChildKey(null); setManagerWorkspaceSnapshot(null); setManagerWorkspaceError(null); setManagerDispatchSnapshot(null); setManagerDispatchError(null); }}
                onOpenChild={(key) => {
                  setManagerWorkspaceChildSnapshot(null);
                  setManagerWorkspaceChildError(null);
                  setManagerWorkspaceChildKey(key);
                }}
                onLoadRouteEvidence={(routeKey) => loadManagerRouteEvidence(managerContext, routeKey)}
                onLoadWalkOns={() => loadManagerWalkOnSnapshot(managerContext)}
                onOpenWeb={(path) => void openCompanyWeb(path)}
                onRefresh={() => void refreshManagerWorkspace(activeManagerSuite.key)}
                onRefreshDispatch={() => void refreshManagerDispatch()}
                onSettings={() => setSettingsOpen(true)}
                onSubmitDelivery={submitManagerDeliveryAction}
                onSubmitDispatch={submitManagerDispatchAction}
                onSubmitCandidateStage={submitManagerCandidateStage}
                onSubmitFleetWorkOrder={submitManagerFleetWorkOrder}
                onSubmitFleetWorkOrderStatus={submitManagerFleetWorkOrderStatus}
                onSubmitRoute={submitManagerRoute}
                onSubmitWalkOn={submitManagerWalkOnAction}
                snapshot={managerWorkspaceSnapshot}
                suite={activeManagerSuite}
              />
            ) : (
              <ManagerWorkspacesScreen
                context={managerContext}
                onOpenNativeSchedule={() => { setManagerTab("schedule"); setManagerScheduleSurface("bridge"); }}
                onOpenSuite={(key) => { setManagerWorkspaceKey(key); setManagerWorkspaceChildKey(null); setManagerWorkspaceChildSnapshot(null); setManagerWorkspaceChildError(null); setManagerDispatchSnapshot(null); setManagerDispatchError(null); }}
                onSettings={() => setSettingsOpen(true)}
              />
            )
          ) : null}
          {managerTab === "messages" ? (
            <ManagerMessagesScreen
              busy={managerMessagesBusy}
              context={managerContext}
              error={managerMessagesError}
              loading={managerMessagesLoading}
              onRefresh={() => void refreshManagerMessages()}
              onSettings={() => setSettingsOpen(true)}
              onSubmit={submitManagerMessage}
              snapshot={managerMessagesSnapshot}
            />
          ) : null}
        </View>
        <ManagerFooter
          activeTab={managerTab}
          onAccount={() => setSettingsOpen(true)}
          onTab={(nextTab) => {
            setManagerTab(nextTab);
            if (nextTab !== "schedule") setManagerScheduleSurface("bridge");
            if (nextTab === "workspaces") { setManagerWorkspaceKey(null); setManagerWorkspaceChildKey(null); setManagerWorkspaceChildSnapshot(null); setManagerWorkspaceChildError(null); }
            setManagerWorkspaceSnapshot(null);
            setManagerWorkspaceError(null);
            if (nextTab !== "messages") {
              setManagerMessagesSnapshot(null);
              setManagerMessagesError(null);
            }
          }}
        />
        <AccountModal
          contexts={contexts}
          email={props.session.user.email ?? "Authenticated Insight user"}
          notificationBusy={notificationBusy}
          notificationError={notificationError}
          notificationState={notificationState}
          onClose={() => setSettingsOpen(false)}
          onEnableNotifications={() => void enableNotifications()}
          onSelectContext={selectContext}
          onSignOut={() => void signOut()}
          selectedContextKey={managerContext.context_key}
          visible={settingsOpen}
        />
      </View>
    );
  }

  if (!membership) return null;

  const routeName = scheduleForDate(schedule, new Date()).route;
  const unreadMessages = messages.filter(
    (message) => message.requires_ack && !message.acknowledged,
  ).length;

  return (
    <View style={styles.flex}>
      {membership.access_mode === "ADMIN_DEMO" ? (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerTitle}>ADMIN DEMO</Text>
          <Text numberOfLines={1} style={styles.demoBannerDetail}>
            {membership.driver_name} · isolated test evidence
          </Text>
        </View>
      ) : null}
      <View style={styles.content}>
        {tab === "home" ? (
          <HomeScreen
            busy={busy}
            companyName={membership.company_name}
            dutySession={dutySession}
            onOpenMessages={() => changeTab("messages")}
            onOpenSchedule={() => changeTab("schedule")}
            onSettings={() => setSettingsOpen(true)}
            onStartDuty={() => setDutyIntent("START")}
            onStopDuty={() => setDutyIntent("STOP")}
            schedule={schedule}
            status={status}
            unreadMessages={unreadMessages}
          />
        ) : null}
        {tab === "messages" ? (
          <MessagesScreen
            busy={busy}
            companyName={membership.company_name}
            messages={messages}
            notice={messageNotice}
            onAcknowledge={(message) => void acknowledgeMessage(message)}
            onSelect={setSelectedMessage}
            onSettings={() => setSettingsOpen(true)}
            selectedMessage={selectedMessage}
          />
        ) : null}
        {tab === "schedule" ? (
          <ScheduleScreen
            busy={busy}
            companyName={membership.company_name}
            month={month}
            notice={scheduleNotice}
            onMonth={setMonth}
            onSettings={() => setSettingsOpen(true)}
            onSubmitRequest={submitTimeOffRequest}
            onWithdrawRequest={withdrawTimeOffRequest}
            requests={timeOffRequests}
            schedule={schedule}
          />
        ) : null}
        {tab === "inspect" ? (
          <InspectionScreen
            companyName={membership.company_name}
            contextKey={membership.context_key}
            demoMode={membership.access_mode === "ADMIN_DEMO"}
            onSettings={() => setSettingsOpen(true)}
            onSubmit={submitInspection}
            outbox={outbox}
            routeName={routeName}
            vehicles={vehicles}
          />
        ) : null}
        {tab === "scorecard" ? (
          <ScorecardScreen
            companyName={membership.company_name}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : null}
      </View>
      <Footer
        activeTab={tab}
        counts={counts}
        lastSynchronizedAt={lastSynchronizedAt}
        onSync={() => void synchronize()}
        onTab={changeTab}
        syncing={syncing}
      />
      <AccountModal
        contexts={contexts}
        email={props.session.user.email ?? "Authenticated Insight user"}
        notificationBusy={notificationBusy}
        notificationError={notificationError}
        notificationState={notificationState}
        onClose={() => setSettingsOpen(false)}
        onEnableNotifications={() => void enableNotifications()}
        onSelectContext={selectContext}
        onSignOut={() => void signOut()}
        selectedContextKey={membership.context_key}
        visible={settingsOpen}
      />
      {dutyIntent ? (
        <IntentVerificationModal
          actionLabel={dutyIntent === "START" ? "start duty" : "stop duty"}
          busy={busy}
          onCancel={() => setDutyIntent(null)}
          onConfirm={() => {
            const action = dutyIntent;
            setDutyIntent(null);
            if (action === "START") void startDuty();
            else void stopDuty();
          }}
          visible
        />
      ) : null}
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supabase = getSupabaseClient();
      void supabase.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      return () => data.subscription.unsubscribe();
    } catch (caught) {
      setConfigurationError(errorMessage(caught));
      setSession(null);
      return undefined;
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <StatusBar style="dark" />
        {configurationError ? (
          <View style={styles.configurationPage}>
            <Text style={styles.signInTitle}>Configuration needed</Text>
            <Text style={styles.error}>{configurationError}</Text>
          </View>
        ) : session === undefined ? (
          <View style={styles.loadingPage}><ActivityIndicator color={colors.primary} /></View>
        ) : session ? (
          <AuthenticatedApp session={session} />
        ) : (
          <SignInScreen />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flex: 1, backgroundColor: colors.white },
  demoBanner: { minHeight: 34, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paleWarning, borderBottomColor: colors.warning, borderBottomWidth: 1 },
  demoBannerTitle: { color: colors.warning, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  demoBannerDetail: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "600" },
  loadingPage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  loadingText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  configurationPage: { flex: 1, justifyContent: "center", padding: 24, gap: 14 },
  signInPage: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.white },
  brand: { color: colors.primary, fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  signInTitle: { color: colors.ink, fontSize: 36, fontWeight: "800", lineHeight: 43 },
  signInLead: { color: colors.muted, fontSize: 20, lineHeight: 28, marginBottom: 20 },
  label: { color: colors.ink, fontSize: 15, fontWeight: "700", marginTop: 4 },
  input: { height: 52, borderColor: colors.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  passwordRow: { height: 52, borderColor: colors.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, fontSize: 16, color: colors.ink },
  show: { color: colors.primary, fontWeight: "800", padding: 8 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  authorityNote: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: "center" },
  signInFootnote: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 46 },
});
