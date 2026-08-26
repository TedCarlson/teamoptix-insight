import { useMemo, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import {
  isManagerAccessContext,
  type MobileAccessContext,
} from "../domain/access";
import type { PushRegistrationState } from "../notifications/push";
import type { MobileOutboxCounts } from "../outbox/types";
import { colors } from "../theme";

export type TabKey = "home" | "messages" | "schedule" | "inspect" | "scorecard";

export function Screen(props: { children: ReactNode; scroll?: boolean }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  if (props.scroll === false) {
    return <View style={[styles.screen, isTablet && styles.screenTablet]}>{props.children}</View>;
  }
  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  );
}

export function AppHeader(props: {
  title: string;
  companyName: string;
  eyebrow?: string;
  subtitle?: string;
  onSettings: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.brand}>{props.eyebrow ?? "INSIGHT"}</Text>
        <Text style={styles.headerTitle}>{props.title}</Text>
        <Text style={styles.company}>{props.companyName}</Text>
        {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel="Account and company settings"
        accessibilityRole="button"
        onPress={props.onSettings}
        style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
      >
        <Text style={styles.settingsGlyph}>⚙︎</Text>
      </Pressable>
    </View>
  );
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
  compact?: boolean;
  fill?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.compact && styles.buttonCompact,
        props.fill && styles.buttonFill,
        props.secondary && styles.buttonSecondary,
        props.danger && styles.buttonDanger,
        (pressed || props.disabled) && styles.pressed,
      ]}
    >
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
        minimumFontScale={0.8}
        numberOfLines={1}
        style={[
          styles.buttonText,
          props.compact && styles.buttonTextCompact,
          props.secondary && styles.buttonSecondaryText,
          props.danger && styles.buttonDangerText,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function Card(props: { children: ReactNode; outlined?: boolean; tone?: "danger" | "primary" }) {
  return (
    <View
      style={[
        styles.card,
        props.outlined && styles.cardOutlined,
        props.tone === "danger" && styles.cardDanger,
        props.tone === "primary" && styles.cardPrimary,
      ]}
    >
      {props.children}
    </View>
  );
}

export function Footer(props: {
  activeTab: TabKey;
  counts: MobileOutboxCounts;
  syncing: boolean;
  lastSynchronizedAt: Date | null;
  onTab: (tab: TabKey) => void;
  onSync: () => void;
}) {
  const offline = props.counts.totalPending > 0;
  const syncLabel = props.syncing
    ? "Synchronizing…"
    : offline
      ? `Saved offline · ${props.counts.totalPending} item${props.counts.totalPending === 1 ? "" : "s"} waiting`
      : "Up to date";
  const detail = !offline && props.lastSynchronizedAt
    ? "Last synchronized just now"
    : offline
      ? "Tap to retry"
      : "Ready to synchronize";

  const tabs: Array<[TabKey, string]> = [
    ["home", "Home"],
    ["messages", "Messages"],
    ["schedule", "Schedule"],
    ["inspect", "Inspect"],
    ["scorecard", "Scorecard"],
  ];

  return (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="button"
        onPress={props.onSync}
        style={[styles.syncPill, offline && styles.syncPillOffline]}
      >
        <View style={[styles.dot, offline && styles.dotOffline]} />
        <Text style={[styles.syncLabel, offline && styles.syncLabelOffline]}>{syncLabel}</Text>
        <Text numberOfLines={1} style={[styles.syncDetail, offline && styles.syncDetailOffline]}>{detail}</Text>
      </Pressable>
      <View style={styles.separator} />
      <View style={styles.nav}>
        {tabs.map(([key, label]) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: props.activeTab === key }}
            key={key}
            onPress={() => props.onTab(key)}
            style={styles.navItem}
          >
            <Text style={[styles.navLabel, props.activeTab === key && styles.navLabelActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function contextTitle(context: MobileAccessContext) {
  if (context.role === "MANAGER") return "Manager";
  return context.access_mode === "ADMIN_DEMO"
    ? `Driver demo · ${context.driver_name}`
    : "Driver";
}

function contextDetail(context: MobileAccessContext) {
  if (context.role === "MANAGER") {
    return context.title?.trim()
      || `${context.grants.length} workspace${context.grants.length === 1 ? "" : "s"} in scope`;
  }
  return context.access_mode === "ADMIN_DEMO"
    ? "Isolated driver test experience"
    : "My schedule, route, and inspections";
}

function identityInitials(value: string) {
  const normalized = value.split("@")[0].replace(/[^a-z0-9]+/gi, " ").trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0] ?? "IN").slice(0, 2).toUpperCase();
}

function ContextChoice(props: {
  context: MobileAccessContext;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.contextChoice,
        props.active && styles.contextChoiceActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.contextCode}>
        <Text style={styles.contextCodeText}>{props.context.role === "MANAGER" ? "MG" : "DR"}</Text>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={styles.bodyStrong}>{contextTitle(props.context)}</Text>
        <Text style={styles.choiceDetail}>{contextDetail(props.context)}</Text>
      </View>
      {props.active ? (
        <View style={styles.activeChip}>
          <View style={styles.activeDot} />
          <Text style={styles.activeChipText}>ACTIVE</Text>
        </View>
      ) : (
        <Text style={styles.contextArrow}>›</Text>
      )}
    </Pressable>
  );
}

function DriverContextList(props: {
  contexts: MobileAccessContext[];
  selectedContextKey?: string;
  onSelect: (contextKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(props.contexts.length <= 4);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return props.contexts;
    return props.contexts.filter((context) =>
      `${contextTitle(context)} ${context.company_name}`.toLowerCase().includes(needle),
    );
  }, [props.contexts, query]);

  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [styles.driverGateSummary, pressed && styles.pressed]}
      >
        <View>
          <Text style={styles.bodyStrong}>Driver demo gates</Text>
          <Text style={styles.choiceDetail}>{props.contexts.length} isolated driver experiences</Text>
        </View>
        <Text style={styles.contextArrow}>›</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.contextList}>
      {props.contexts.length > 4 ? (
        <View style={styles.driverListTools}>
          <TextInput
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder="Search driver or company"
            placeholderTextColor={colors.muted}
            style={sharedStyles.input}
            value={query}
          />
          <Pressable onPress={() => { setExpanded(false); setQuery(""); }}>
            <Text style={styles.collapseAction}>Collapse driver gates</Text>
          </Pressable>
        </View>
      ) : null}
      {filtered.map((context) => (
        <ContextChoice
          active={props.selectedContextKey === context.context_key}
          context={context}
          key={context.context_key}
          onPress={() => props.onSelect(context.context_key)}
        />
      ))}
      {filtered.length === 0 ? <Text style={styles.bodyMuted}>No driver gates match.</Text> : null}
    </View>
  );
}

export function ContextResolverScreen(props: {
  contexts: MobileAccessContext[];
  displayName: string | null;
  email: string;
  onSelectContext: (contextKey: string) => void;
  onSignOut: () => void;
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const managers = props.contexts.filter(isManagerAccessContext);
  const drivers = props.contexts.filter((context) => context.role === "DRIVER");
  const companies = new Set(props.contexts.map((context) => context.company_id));

  const heading = (
    <View>
      <Text style={styles.brand}>INSIGHT</Text>
      <Text style={[styles.resolverTitle, isTablet && styles.resolverTitleTablet]}>Choose context</Text>
      {isTablet ? (
        <Text style={styles.resolverIntroduction}>
          Select the workspace you want to use. Your role and available data will follow that context.
        </Text>
      ) : null}
    </View>
  );

  const identity = (
    <View style={[styles.identityCard, isTablet && styles.identityCardTablet]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{identityInitials(props.displayName ?? props.email)}</Text>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={styles.bodyStrong}>{props.email}</Text>
        {props.displayName ? <Text style={styles.choiceDetail}>{props.displayName}</Text> : null}
      </View>
    </View>
  );

  const managerAccess = managers.length > 0 ? (
    <View style={styles.modalSection}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Manager access</Text>
        <Text style={styles.sectionMeta}>{managers.length} SCOPE{managers.length === 1 ? "" : "S"}</Text>
      </View>
      {managers.map((context) => (
        <ContextChoice
          context={context}
          key={context.context_key}
          onPress={() => props.onSelectContext(context.context_key)}
        />
      ))}
    </View>
  ) : null;

  const driverAccess = drivers.length > 0 ? (
    <View style={styles.modalSection}>
      <Text style={styles.sectionTitle}>Driver access</Text>
      <DriverContextList contexts={drivers} onSelect={props.onSelectContext} />
    </View>
  ) : null;

  const contextGuidance = (
    <>
      <View style={styles.guidanceCard}>
        <Text style={styles.bodyStrong}>Context controls the workspace</Text>
        <Text style={styles.choiceDetail}>Navigation and data change. Your access grants do not.</Text>
      </View>
      <View style={styles.scopeCard}>
        <View>
          <Text style={styles.sectionMeta}>COMPANY SCOPE</Text>
          <Text style={styles.bodyStrong}>{companies.size} active</Text>
        </View>
        <Text style={styles.brand}>{props.contexts.length} CONTEXT{props.contexts.length === 1 ? "" : "S"}</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.resolverScrim, isTablet && styles.resolverScrimTablet]}>
      <View style={[styles.resolverSheet, isTablet && styles.resolverSheetTablet]}>
        <ScrollView
          contentContainerStyle={[styles.resolverContent, isTablet && styles.resolverContentTablet]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isTablet ? (
            <>
              <View style={styles.resolverIntroColumn}>
                {heading}
                {identity}
                <View style={styles.resolverGuidanceGroup}>{contextGuidance}</View>
              </View>
              <View style={styles.resolverAccessColumn}>
                {managerAccess}
                {driverAccess}
              </View>
            </>
          ) : (
            <>
              {heading}
              {identity}
              {managerAccess}
              {driverAccess}
              {contextGuidance}
            </>
          )}
        </ScrollView>
        <View style={[styles.pinnedActions, isTablet && styles.pinnedActionsTablet]}>
          <PrimaryButton danger label="Sign out" onPress={props.onSignOut} secondary />
        </View>
      </View>
    </View>
  );
}

export function AccountModal(props: {
  visible: boolean;
  contexts: MobileAccessContext[];
  selectedContextKey: string;
  email: string;
  onSelectContext: (contextKey: string) => void;
  onClose: () => void;
  onEnableNotifications: () => void;
  onSignOut: () => void;
  notificationBusy: boolean;
  notificationError: string | null;
  notificationState: PushRegistrationState;
}) {
  const managers = props.contexts.filter(isManagerAccessContext);
  const drivers = props.contexts.filter((context) => context.role === "DRIVER");
  const notificationCopy = props.notificationState === "REGISTERED"
    ? "This device is registered for Insight updates."
    : props.notificationState === "READY"
      ? "Notifications are allowed. Register this device to keep delivery current."
      : props.notificationState === "DENIED"
        ? "Notifications are disabled in device Settings."
        : props.notificationState === "UNSUPPORTED"
          ? "Push notifications require a physical device."
          : props.notificationState === "ERROR"
            ? "Notification registration needs attention."
            : props.notificationState === "CHECKING"
              ? "Checking notification access…"
              : "Enable notifications for schedule decisions and important messages.";
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={props.visible}>
      <View style={styles.modalPage}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.brand}>INSIGHT</Text>
            <Text style={styles.modalTitle}>Account</Text>
          </View>
          <Pressable onPress={props.onClose}><Text style={styles.close}>Done</Text></Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.modalScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identityCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{identityInitials(props.email)}</Text></View>
            <Text style={[styles.bodyStrong, styles.choiceCopy]}>{props.email}</Text>
          </View>
          {managers.length > 0 ? (
            <View style={styles.modalSection}>
              <Text style={styles.sectionTitle}>Manager access</Text>
              {managers.map((context) => (
                <ContextChoice
                  active={props.selectedContextKey === context.context_key}
                  context={context}
                  key={context.context_key}
                  onPress={() => props.onSelectContext(context.context_key)}
                />
              ))}
            </View>
          ) : null}
          {drivers.length > 0 ? (
            <View style={styles.modalSection}>
              <Text style={styles.sectionTitle}>Driver access</Text>
              <DriverContextList
                contexts={drivers}
                onSelect={props.onSelectContext}
                selectedContextKey={props.selectedContextKey}
              />
            </View>
          ) : null}
          <View style={styles.guidanceCard}>
            <Text style={styles.bodyStrong}>Context changes the workspace</Text>
            <Text style={styles.choiceDetail}>Navigation and data change. Your access grants do not.</Text>
          </View>
          <Card>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <Text style={styles.bodyMuted}>{notificationCopy}</Text>
            {props.notificationError ? <Text style={sharedStyles.danger}>{props.notificationError}</Text> : null}
            {props.notificationState !== "REGISTERED"
              && props.notificationState !== "UNSUPPORTED" ? (
                <PrimaryButton
                  compact
                  disabled={props.notificationBusy || props.notificationState === "CHECKING"}
                  label={props.notificationBusy ? "Registering…" : "Register this device"}
                  onPress={props.onEnableNotifications}
                />
              ) : null}
          </Card>
        </ScrollView>
        <View style={styles.pinnedActions}>
          <PrimaryButton danger label="Sign out" onPress={props.onSignOut} secondary />
        </View>
      </View>
    </Modal>
  );
}

export const sharedStyles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  h1: { color: colors.ink, fontSize: 26, fontWeight: "800", lineHeight: 32 },
  h2: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 24 },
  h3: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 21 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  bodyStrong: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  danger: { color: colors.danger, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700", marginBottom: 6 },
  input: {
    minHeight: 48,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  row: { flexDirection: "row", alignItems: "center" },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, width: "100%", maxWidth: 880, alignSelf: "center", paddingHorizontal: 24, paddingTop: 20, backgroundColor: colors.white },
  screenTablet: { maxWidth: 1160, paddingHorizontal: 32, paddingTop: 28 },
  scrollContent: { width: "100%", maxWidth: 880, alignSelf: "center", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 14 },
  scrollContentTablet: { maxWidth: 1160, paddingHorizontal: 32, paddingTop: 28, paddingBottom: 36, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  headerCopy: { flex: 1, paddingRight: 12 },
  brand: { color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  headerTitle: { color: colors.ink, fontSize: 28, fontWeight: "800", lineHeight: 33 },
  company: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  subtitle: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 12 },
  settings: { alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 24, backgroundColor: colors.panel },
  settingsGlyph: { fontSize: 23, color: colors.muted },
  pressed: { opacity: 0.55 },
  button: { minHeight: 52, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonCompact: { paddingHorizontal: 12 },
  buttonFill: { flex: 1 },
  buttonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.white, borderColor: colors.danger, borderWidth: 1 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  buttonTextCompact: { fontSize: 14 },
  buttonSecondaryText: { color: colors.primary },
  buttonDangerText: { color: colors.danger },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 16, gap: 8 },
  cardOutlined: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 },
  cardDanger: { backgroundColor: colors.paleDanger },
  cardPrimary: { backgroundColor: colors.palePrimary },
  footer: { width: "100%", maxWidth: 880, alignSelf: "center", backgroundColor: colors.white },
  syncPill: { marginHorizontal: 24, minHeight: 42, borderRadius: 20, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.panel },
  syncPillOffline: { backgroundColor: colors.paleWarning },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  dotOffline: { backgroundColor: colors.warning },
  syncLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  syncLabelOffline: { color: colors.warning },
  syncDetail: { flex: 1, color: colors.muted, fontSize: 12 },
  syncDetailOffline: { color: colors.warning },
  separator: { marginTop: 10, height: 1, backgroundColor: colors.border },
  nav: { height: 68, flexDirection: "row" },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navLabel: { color: colors.muted, fontSize: 12 },
  navLabelActive: { color: colors.primary, fontWeight: "700" },
  modalPage: { flex: 1, backgroundColor: colors.white },
  modalHeader: { width: "100%", maxWidth: 760, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 48, paddingBottom: 16 },
  modalScrollContent: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 24, paddingBottom: 24, gap: 14 },
  modalTitle: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  close: { color: colors.primary, fontSize: 16, fontWeight: "800", padding: 8 },
  modalSection: { gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionMeta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  companyChoice: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between" },
  companyChoiceActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  choiceCopy: { flex: 1, paddingRight: 12 },
  choiceDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  bodyStrong: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  bodyMuted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  resolverScrim: { flex: 1, backgroundColor: colors.ink, paddingTop: 80 },
  resolverScrimTablet: { paddingHorizontal: 32, paddingVertical: 32 },
  resolverSheet: { flex: 1, width: "100%", maxWidth: 880, alignSelf: "center", backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  resolverSheetTablet: { maxWidth: 1160, borderRadius: 24 },
  resolverContent: { flexGrow: 1, padding: 16, paddingTop: 32, paddingBottom: 24, gap: 16 },
  resolverContentTablet: { flexDirection: "row", alignItems: "flex-start", padding: 32, gap: 32 },
  resolverIntroColumn: { width: 340, gap: 20 },
  resolverAccessColumn: { flex: 1, minWidth: 0, gap: 24 },
  resolverGuidanceGroup: { gap: 12, marginTop: 8 },
  resolverTitle: { color: colors.ink, fontSize: 24, fontWeight: "800", lineHeight: 30, marginTop: 8 },
  resolverTitleTablet: { fontSize: 34, lineHeight: 40, marginTop: 12 },
  resolverIntroduction: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12 },
  identityCard: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.palePrimary },
  identityCardTablet: { minHeight: 88, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.white },
  avatarText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  contextList: { gap: 10 },
  contextChoice: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  contextChoiceActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  contextCode: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.palePrimary },
  contextCodeText: { color: colors.primary, fontSize: 12 },
  contextArrow: { color: colors.primary, fontSize: 24, fontWeight: "700" },
  activeChip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.success, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.white },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  activeChipText: { color: colors.success, fontSize: 11 },
  driverGateSummary: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
  driverListTools: { gap: 8 },
  collapseAction: { color: colors.primary, fontSize: 13, fontWeight: "700", paddingVertical: 4 },
  guidanceCard: { gap: 4, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.panel },
  scopeCard: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  pinnedActions: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  pinnedActionsTablet: { maxWidth: "100%", paddingHorizontal: 32 },
});
