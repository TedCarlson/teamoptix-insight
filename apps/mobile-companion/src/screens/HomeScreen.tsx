import { Pressable, StyleSheet, Text, View } from "react-native";

import { scheduleForDate, type DriverSchedule } from "../domain/mobile";
import type { LocalSession } from "../outbox/types";
import { colors } from "../theme";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";

type HomeScreenProps = {
  companyName: string;
  schedule: DriverSchedule | null;
  dutySession: LocalSession | null;
  busy: boolean;
  unreadMessages: number;
  status: string | null;
  onSettings: () => void;
  onStartDuty: () => void;
  onStopDuty: () => void;
  onOpenSchedule: () => void;
  onOpenMessages: () => void;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function HomeScreen(props: HomeScreenProps) {
  const today = new Date();
  const todaySchedule = scheduleForDate(props.schedule, today);
  const days = Array.from({ length: 4 }, (_, index) => {
    const date = addDays(today, index);
    const schedule = scheduleForDate(props.schedule, date);
    return {
      key: date.toISOString(),
      label: index === 0 ? "TODAY" : date.toLocaleDateString(undefined, { weekday: "narrow" }).toUpperCase(),
      route: schedule.route,
      active: schedule.scheduled,
    };
  });

  return (
    <Screen>
      <AppHeader
        companyName={props.companyName}
        onSettings={props.onSettings}
        title="Today"
      />

      <Card>
        <View style={styles.todayRow}>
          <View style={styles.todayCopy}>
            <Text style={sharedStyles.eyebrow}>
              {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            <Text style={sharedStyles.bodyStrong}>Scheduled today</Text>
            <Text style={sharedStyles.muted}>{todaySchedule.route === "OFF" ? "Off" : `Route ${todaySchedule.route}`}</Text>
            <Text style={[sharedStyles.eyebrow, styles.dutyLabel]}>DUTY STATUS</Text>
            <Text style={sharedStyles.bodyStrong}>
              {props.dutySession ? "Tracking is active" : "Tracking is off"}
            </Text>
          </View>
          <View style={styles.dutyButton}>
            <PrimaryButton
              compact
              danger={Boolean(props.dutySession)}
              disabled={props.busy && !props.dutySession}
              fill
              label={props.busy ? "Working…" : props.dutySession ? "Stop duty" : "Start duty"}
              onPress={props.dutySession ? props.onStopDuty : props.onStartDuty}
              secondary={Boolean(props.dutySession)}
            />
          </View>
        </View>
      </Card>

      {props.status ? (
        <Card tone={props.status.toLowerCase().includes("requires") ? "danger" : "primary"}>
          <Text style={sharedStyles.muted}>{props.status}</Text>
        </Card>
      ) : null}

      <Pressable accessibilityRole="button" onPress={props.onOpenSchedule}>
        <Text style={[sharedStyles.bodyStrong, styles.sectionHeading]}>Schedule</Text>
        <View style={styles.scheduleRow}>
          {days.map((day) => (
            <View key={day.key} style={[styles.dayChip, day.active && styles.dayChipActive]}>
              <Text style={[styles.dayLabel, day.active && styles.dayLabelActive]}>{day.label}</Text>
              <Text style={styles.dayRoute}>{day.route}</Text>
            </View>
          ))}
        </View>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={props.onOpenMessages}>
        <Card outlined>
          <Text style={sharedStyles.bodyStrong}>Company Updates</Text>
          <Text style={sharedStyles.muted}>
            {props.unreadMessages > 0
              ? `${props.unreadMessages} message${props.unreadMessages === 1 ? "" : "s"} need your attention`
              : "Nothing new right now"}
          </Text>
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  todayRow: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  todayCopy: { flex: 1, gap: 4 },
  dutyButton: { width: 142 },
  dutyLabel: { marginTop: 7 },
  sectionHeading: { textAlign: "center", marginBottom: 8 },
  scheduleRow: { flexDirection: "row", gap: 8 },
  dayChip: { flex: 1, minHeight: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 9, alignItems: "center", justifyContent: "center", gap: 4 },
  dayChipActive: { backgroundColor: colors.palePrimary, borderColor: colors.palePrimary },
  dayLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  dayLabelActive: { color: colors.primary },
  dayRoute: { color: colors.ink, fontSize: 13, fontWeight: "700" },
});
