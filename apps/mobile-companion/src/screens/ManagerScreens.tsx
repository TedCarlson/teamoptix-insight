import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  CompanyWorkspaceGrantKey,
  DriverAccessContext,
  ManagerAccessContext,
} from "../domain/access";
import { AppHeader, Card, Screen, sharedStyles } from "../components/ui";
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

const scheduleSurfaces = [
  { code: "CA", label: "Calendar", detail: "Daily coverage and route demand", path: "/schedule" },
  { code: "OV", label: "Overrides", detail: "Time off, call-outs, add-ins, and changes", path: "/schedule/overrides" },
  { code: "WB", label: "Workbench", detail: "Build and commit the future schedule", path: "/schedule/generated" },
  { code: "PS", label: "Presets", detail: "Reusable work-pattern presets", path: "/schedule/presets" },
];

export function ManagerScheduleScreen(props: {
  context: ManagerAccessContext;
  driverContext: DriverAccessContext | null;
  manageOpen: boolean;
  onBackToBridge: () => void;
  onManage: () => void;
  onMySchedule: () => void;
  onOpenWeb: (path: string) => void;
  onSettings: () => void;
}) {
  if (props.manageOpen) {
    return (
      <Screen>
        <AppHeader companyName={props.context.company_name} eyebrow="INSIGHT · MANAGER" onSettings={props.onSettings} title="Schedule" />
        <Pressable onPress={props.onBackToBridge}><Text style={styles.back}>‹ Personal or management</Text></Pressable>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionLabel}>Manage schedule</Text>
          <Text style={styles.sectionMeta}>PRIMARY TOOLS</Text>
        </View>
        {scheduleSurfaces.map((surface) => (
          <AccessTile key={surface.label} {...surface} onPress={() => props.onOpenWeb(surface.path)} trailing="WEB" />
        ))}
        <Card>
          <Text style={sharedStyles.bodyStrong}>Mobile bridge</Text>
          <Text style={sharedStyles.muted}>These governed Schedule workspaces open in the secure web app while their native layouts are built.</Text>
        </Card>
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
  successDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  successText: { color: colors.success, fontSize: 11 },
  pulseStats: { flexDirection: "row", gap: 8 },
  pulseStat: { flex: 1, minHeight: 58, justifyContent: "center", gap: 4, padding: 10, borderRadius: 10, backgroundColor: colors.primary },
  pulseStatLabel: { color: colors.white, fontSize: 10 },
  pulseStatValue: { color: colors.white, fontSize: 13, fontWeight: "700" },
  snapshot: { gap: 8, padding: 16, borderRadius: 18, backgroundColor: colors.ink },
  snapshotDetail: { color: colors.white, fontSize: 14, lineHeight: 20 },
  back: { color: colors.primary, fontSize: 14, fontWeight: "700", paddingVertical: 4 },
  workspacePage: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 14, backgroundColor: colors.white },
  workspaceGroup: { gap: 10 },
  footer: { height: 74, flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  footerItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  footerCode: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  footerLabel: { color: colors.muted, fontSize: 10 },
  footerActive: { color: colors.primary },
});
