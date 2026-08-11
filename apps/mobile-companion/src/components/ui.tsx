import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { AccessMembership } from "../lib/supabase";
import type { PushRegistrationState } from "../notifications/push";
import type { MobileOutboxCounts } from "../outbox/types";
import { colors } from "../theme";

export type TabKey = "home" | "messages" | "schedule" | "inspect" | "scorecard";

export function Screen(props: { children: ReactNode; scroll?: boolean }) {
  if (props.scroll === false) {
    return <View style={styles.screen}>{props.children}</View>;
  }
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
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

export function AccountModal(props: {
  visible: boolean;
  memberships: AccessMembership[];
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
        <Text style={styles.company}>{props.email}</Text>
        {props.memberships.length > 1 ? (
          <View style={styles.modalSection}>
            <Text style={styles.sectionTitle}>Driver gate</Text>
            {props.memberships.map((membership) => (
              <Pressable
                key={`${membership.access_mode}:${membership.context_key}`}
                onPress={() => props.onSelectContext(membership.context_key)}
                style={[
                  styles.companyChoice,
                  props.selectedContextKey === membership.context_key && styles.companyChoiceActive,
                ]}
              >
                <View style={styles.choiceCopy}>
                  <Text style={styles.bodyStrong}>{membership.driver_name}</Text>
                  <Text style={styles.choiceDetail}>
                    {membership.company_name} · {membership.access_mode === "ADMIN_DEMO" ? "Admin demo" : "Driver"}
                  </Text>
                </View>
                {props.selectedContextKey === membership.context_key ? <Text style={styles.brand}>ACTIVE</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
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
        <Card>
          <Text style={styles.sectionTitle}>Observation only</Text>
          <Text style={styles.bodyMuted}>
            Device evidence does not automatically establish payroll, vehicle, carrier, or delivery truth.
          </Text>
        </Card>
        <PrimaryButton danger label="Sign out" onPress={props.onSignOut} secondary />
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
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 20, backgroundColor: colors.white },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 14 },
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
  footer: { backgroundColor: colors.white },
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
  modalPage: { flex: 1, padding: 24, paddingTop: 56, gap: 18, backgroundColor: colors.white },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  close: { color: colors.primary, fontSize: 16, fontWeight: "800", padding: 8 },
  modalSection: { gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  companyChoice: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between" },
  companyChoiceActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  choiceCopy: { flex: 1, paddingRight: 12 },
  choiceDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  bodyStrong: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  bodyMuted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
