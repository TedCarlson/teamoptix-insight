import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { IntentVerificationModal } from "../components/IntentVerificationModal";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";
import {
  isoDate,
  normalizeTimeOffDates,
  scheduleForDate,
  timeOffEligibilityError,
  timeOffRangeDates,
  type DriverSchedule,
  type DriverTimeOffRequest,
} from "../domain/mobile";
import type { IntentConfirmation } from "../outbox/types";
import { colors } from "../theme";

type ScheduleScreenProps = {
  busy: boolean;
  companyName: string;
  notice: string | null;
  requests: DriverTimeOffRequest[];
  schedule: DriverSchedule | null;
  month: Date;
  onMonth: (next: Date) => void;
  onSettings: () => void;
  onSubmitRequest: (
    dates: string[],
    note: string,
    intent: IntentConfirmation,
  ) => Promise<void>;
  onWithdrawRequest: (
    request: DriverTimeOffRequest,
    intent: IntentConfirmation,
  ) => Promise<void>;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  return addDays(first, -((first.getDay() + 1) % 7));
}

function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function requestDateLabel(request: DriverTimeOffRequest) {
  const dates = normalizeTimeOffDates(request.requested_dates);
  if (dates.length === 0) return `${dateLabel(request.start_date)} – ${dateLabel(request.end_date)}`;
  const continuous = timeOffRangeDates(dates).length === dates.length;
  if (continuous) {
    return dates.length === 1
      ? dateLabel(dates[0])
      : `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}`;
  }
  if (dates.length <= 3) return dates.map(dateLabel).join(", ");
  return `${dates.slice(0, 2).map(dateLabel).join(", ")} + ${dates.length - 2} more`;
}

export function ScheduleScreen(props: ScheduleScreenProps) {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<"RANGE" | "SELECTED_ONLY">("RANGE");
  const [note, setNote] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [intentMode, setIntentMode] = useState<"SUBMIT" | "WITHDRAW" | null>(null);
  const [withdrawRequest, setWithdrawRequest] = useState<DriverTimeOffRequest | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const todayIso = isoDate(new Date());
  const start = startOfGrid(props.month);
  const requestByDate = useMemo(() => {
    const map = new Map<string, DriverTimeOffRequest>();
    for (const request of props.requests) {
      if (request.status === "DENIED" || request.status === "WITHDRAWN") continue;
      for (const date of request.requested_dates) map.set(date, request);
    }
    return map;
  }, [props.requests]);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    const iso = isoDate(date);
    return {
      date,
      iso,
      current: date.getMonth() === props.month.getMonth(),
      request: requestByDate.get(iso) ?? null,
      ...scheduleForDate(props.schedule, date),
    };
  });
  const rangeDates = timeOffRangeDates(selectedDates);
  const hasGaps = rangeDates.length !== selectedDates.length;
  const resolvedDates = selectionMode === "RANGE" ? rangeDates : normalizeTimeOffDates(selectedDates);
  const eligibilityError = timeOffEligibilityError(resolvedDates);
  const activeRequests = props.requests
    .filter((request) => request.status !== "WITHDRAWN")
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));

  function toggleDate(iso: string, currentMonth: boolean) {
    if (!currentMonth) return;
    setLocalError(null);
    setSelectedDates((current) => {
      if (current.includes(iso)) return current.filter((date) => date !== iso);
      if (current.length >= 15) {
        setLocalError("Select no more than 15 days.");
        return current;
      }
      return [...current, iso].sort();
    });
  }

  function clearDraft() {
    setSelectedDates([]);
    setSelectionMode("RANGE");
    setNote("");
    setLocalError(null);
    setReviewOpen(false);
  }

  async function confirmSubmit(intent: IntentConfirmation) {
    try {
      setIntentMode(null);
      await props.onSubmitRequest(resolvedDates, note, intent);
      clearDraft();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to save the request.");
      setReviewOpen(true);
    }
  }

  async function confirmWithdraw(intent: IntentConfirmation) {
    if (!withdrawRequest) return;
    const request = withdrawRequest;
    try {
      setIntentMode(null);
      setWithdrawRequest(null);
      await props.onWithdrawRequest(request, intent);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to withdraw the request.");
    }
  }

  return (
    <>
      <Screen>
        <AppHeader companyName={props.companyName} onSettings={props.onSettings} title="Schedule" />
        <View style={styles.monthHeader}>
          <Text style={sharedStyles.h2}>
            {props.month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <View style={styles.monthActions}>
            <Pressable onPress={() => props.onMonth(new Date(props.month.getFullYear(), props.month.getMonth() - 1, 1))} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>‹</Text>
            </Pressable>
            <Pressable onPress={() => props.onMonth(new Date())} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
            <Pressable onPress={() => props.onMonth(new Date(props.month.getFullYear(), props.month.getMonth() + 1, 1))} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>›</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.requestHint}>Tap future dates to request time off.</Text>
        <View style={styles.weekdays}>
          {["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"].map((day) => (
            <Text key={day} style={styles.weekday}>{day}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((cell) => {
            const selected = selectedDates.includes(cell.iso);
            const requestToken = cell.request?.status === "APPROVED" ? "APP" : cell.request ? "PEND" : null;
            return (
              <Pressable
                accessibilityLabel={`${cell.iso}, ${cell.route}${requestToken ? `, ${requestToken}` : ""}`}
                accessibilityRole="button"
                key={cell.iso}
                onPress={() => toggleDate(cell.iso, cell.current)}
                style={[
                  styles.cell,
                  cell.scheduled && styles.cellScheduled,
                  cell.iso === todayIso && styles.cellToday,
                  selected && styles.cellSelected,
                  !cell.current && styles.cellMuted,
                ]}
              >
                {requestToken ? <Text style={[styles.requestToken, selected && styles.selectedText]}>{requestToken}</Text> : null}
                <Text style={[styles.dayNumber, !cell.current && styles.mutedText, selected && styles.selectedText]}>{cell.date.getDate()}</Text>
                <Text numberOfLines={1} style={[styles.route, cell.scheduled && styles.routeScheduled, selected && styles.selectedText]}>
                  {cell.route}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.legendDot, styles.onDot]} /><Text style={sharedStyles.muted}>On / Route</Text></View>
          <View style={styles.legendItem}><View style={styles.legendDot} /><Text style={sharedStyles.muted}>Off</Text></View>
          <Text style={sharedStyles.muted}>PEND / APP</Text>
        </View>
        {localError ? <Text style={sharedStyles.danger}>{localError}</Text> : null}
        {selectedDates.length > 0 ? (
          <Card tone="primary">
            <Text style={sharedStyles.bodyStrong}>{selectedDates.length} date{selectedDates.length === 1 ? "" : "s"} selected</Text>
            <Text style={sharedStyles.muted}>{selectedDates.map(dateLabel).join(", ")}</Text>
            <PrimaryButton label="Review time-off request" onPress={() => setReviewOpen(true)} />
            <PrimaryButton label="Clear selection" onPress={clearDraft} secondary />
          </Card>
        ) : null}
        {props.notice ? <Card tone="primary"><Text style={sharedStyles.muted}>{props.notice}</Text></Card> : null}
        <View style={styles.requestSection}>
          <Text style={sharedStyles.h3}>My requests</Text>
          {activeRequests.length === 0 ? <Text style={sharedStyles.muted}>No time-off requests yet.</Text> : null}
          {activeRequests.slice(0, 5).map((request) => (
            <Card key={request.id} outlined>
              <View style={styles.requestRow}>
                <View style={styles.requestCopy}>
                  <Text style={sharedStyles.bodyStrong}>
                    {requestDateLabel(request)}
                  </Text>
                  <Text style={[styles.status, request.status === "DENIED" && styles.statusDenied]}>{request.status}</Text>
                  {request.manager_note ? <Text style={sharedStyles.muted}>{request.manager_note}</Text> : null}
                </View>
                {request.status === "PENDING" && !request.id.startsWith("local:") ? (
                  <Pressable
                    onPress={() => {
                      setWithdrawRequest(request);
                      setIntentMode("WITHDRAW");
                    }}
                    style={styles.withdraw}
                  >
                    <Text style={styles.withdrawText}>Withdraw</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      </Screen>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={reviewOpen}>
        <View style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <View><Text style={sharedStyles.eyebrow}>SCHEDULE</Text><Text style={sharedStyles.h1}>Request time off</Text></View>
            <Pressable onPress={() => setReviewOpen(false)}><Text style={styles.done}>Done</Text></Pressable>
          </View>
          <Card>
            <Text style={sharedStyles.bodyStrong}>{resolvedDates.length} requested day{resolvedDates.length === 1 ? "" : "s"}</Text>
            <Text style={sharedStyles.muted}>{resolvedDates.map(dateLabel).join(", ")}</Text>
          </Card>
          {hasGaps ? (
            <View style={styles.modeRow}>
              <Pressable onPress={() => setSelectionMode("RANGE")} style={[styles.mode, selectionMode === "RANGE" && styles.modeActive]}>
                <Text style={[styles.modeText, selectionMode === "RANGE" && styles.modeTextActive]}>Entire range</Text>
              </Pressable>
              <Pressable onPress={() => setSelectionMode("SELECTED_ONLY")} style={[styles.mode, selectionMode === "SELECTED_ONLY" && styles.modeActive]}>
                <Text style={[styles.modeText, selectionMode === "SELECTED_ONLY" && styles.modeTextActive]}>Selected only</Text>
              </Pressable>
            </View>
          ) : null}
          <View>
            <Text style={sharedStyles.label}>Note — optional</Text>
            <TextInput
              maxLength={500}
              multiline
              onChangeText={setNote}
              placeholder="Add context for leadership"
              style={[sharedStyles.input, styles.note]}
              value={note}
            />
          </View>
          {eligibilityError ? <Text style={sharedStyles.danger}>{eligibilityError}</Text> : null}
          <PrimaryButton
            disabled={Boolean(eligibilityError) || props.busy}
            label="Continue"
            onPress={() => {
              setReviewOpen(false);
              setIntentMode("SUBMIT");
            }}
          />
          <Text style={sharedStyles.muted}>Leadership will review this request. Your schedule does not change until it is approved.</Text>
        </View>
      </Modal>

      {intentMode ? (
        <IntentVerificationModal
          actionLabel={intentMode === "SUBMIT" ? "time-off request" : "withdraw request"}
          busy={props.busy}
          onCancel={() => {
            const cancelledMode = intentMode;
            setIntentMode(null);
            if (cancelledMode === "SUBMIT") setReviewOpen(true);
            if (cancelledMode === "WITHDRAW") setWithdrawRequest(null);
          }}
          onConfirm={(intent) => {
            if (intentMode === "SUBMIT") void confirmSubmit(intent);
            else void confirmWithdraw(intent);
          }}
          visible
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthActions: { flexDirection: "row", gap: 6, alignItems: "center" },
  monthButton: { width: 30, height: 30, borderColor: colors.border, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  monthButtonText: { color: colors.ink, fontSize: 20 },
  todayButton: { height: 30, paddingHorizontal: 10, borderColor: colors.border, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  todayButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  requestHint: { color: colors.muted, fontSize: 12 },
  weekdays: { flexDirection: "row", marginTop: 4 },
  weekday: { width: "14.2857%", textAlign: "center", color: colors.muted, fontSize: 9, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", borderLeftWidth: 1, borderTopWidth: 1, borderColor: colors.border },
  cell: { width: "14.2857%", height: 55, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border, padding: 4, backgroundColor: colors.white },
  cellScheduled: { backgroundColor: colors.palePrimary },
  cellToday: { borderColor: colors.primary, borderWidth: 2 },
  cellSelected: { backgroundColor: colors.primary },
  cellMuted: { opacity: 0.38 },
  dayNumber: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  mutedText: { color: colors.muted },
  route: { color: colors.muted, fontSize: 9, marginTop: 5 },
  routeScheduled: { color: colors.primary, fontWeight: "800" },
  requestToken: { color: colors.warning, fontSize: 7, fontWeight: "900", position: "absolute", right: 2, top: 2 },
  selectedText: { color: colors.white },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1 },
  onDot: { backgroundColor: colors.primary, borderColor: colors.primary },
  requestSection: { gap: 10, marginTop: 4 },
  requestRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  requestCopy: { flex: 1, gap: 2 },
  status: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  statusDenied: { color: colors.danger },
  withdraw: { borderColor: colors.danger, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  withdrawText: { color: colors.danger, fontSize: 12, fontWeight: "800" },
  modalPage: { flex: 1, padding: 24, paddingTop: 56, gap: 18, backgroundColor: colors.white },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  done: { color: colors.primary, fontSize: 16, fontWeight: "800", padding: 8 },
  modeRow: { flexDirection: "row", gap: 8 },
  mode: { flex: 1, minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  modeActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  modeText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  modeTextActive: { color: colors.primary },
  note: { minHeight: 100, paddingTop: 12, textAlignVertical: "top" },
});
