import * as Crypto from "expo-crypto";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { IntentVerificationModal } from "../components/IntentVerificationModal";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";
import {
  emptyInspectionDraft,
  evidenceForItem,
  fleetInspectionItems,
  inspectionCompletedCount,
  inspectionItemsPayload,
  inspectionValidationError,
  requiredFleetEvidenceKeys,
  type FleetVehicle,
  type InspectionDraft,
} from "../domain/mobile";
import { EdgeOutbox } from "../outbox/database";
import type {
  InspectionResult,
  InspectionSubmissionPayload,
  LocalInspectionEvidence,
} from "../outbox/types";
import { colors } from "../theme";

type InspectionStage = "start" | "checklist" | "defect" | "review" | "submitted" | "offline";

type InspectionScreenProps = {
  contextKey: string;
  companyName: string;
  demoMode: boolean;
  routeName: string;
  vehicles: FleetVehicle[];
  outbox: EdgeOutbox;
  onSettings: () => void;
  onSubmit: (
    payload: InspectionSubmissionPayload,
    evidence: LocalInspectionEvidence[],
  ) => Promise<"submitted" | "offline">;
};

function bytesFromBase64(base64: string) {
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function resultLabel(result: InspectionResult) {
  return result === "NOT_APPLICABLE" ? "N/A" : result === "DEFECT" ? "Defect" : "Pass";
}

export function InspectionScreen(props: InspectionScreenProps) {
  const [stage, setStage] = useState<InspectionStage>("start");
  const [draft, setDraft] = useState<InspectionDraft>(emptyInspectionDraft);
  const [defectKey, setDefectKey] = useState<string | null>(null);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentOpen, setIntentOpen] = useState(false);

  const selectedVehicle = props.vehicles.find((vehicle) => vehicle.vehicle_id === draft.vehicleId) ?? null;
  const completed = inspectionCompletedCount(draft);
  const defectCount = Object.values(draft.results).filter((result) => result === "DEFECT").length;
  const defectItem = fleetInspectionItems.find(([, key]) => key === defectKey) ?? null;
  const sections = useMemo(
    () => Array.from(new Set(fleetInspectionItems.map(([section]) => section))),
    [],
  );

  useEffect(() => {
    let active = true;
    void props.outbox.inspectionDraft<InspectionDraft>(props.contextKey).then((saved) => {
      if (active && saved) setDraft(saved);
    });
    return () => { active = false; };
  }, [props.contextKey, props.outbox]);

  useEffect(() => {
    if (stage === "submitted" || stage === "offline") return;
    void props.outbox.saveInspectionDraft(props.contextKey, draft);
  }, [draft, props.contextKey, props.outbox, stage]);

  function update(next: Partial<InspectionDraft>) {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  }

  function answer(itemKey: string, result: InspectionResult) {
    update({ results: { ...draft.results, [itemKey]: result } });
    if (result === "DEFECT") {
      setDefectKey(itemKey);
      setStage("defect");
    }
  }

  async function captureEvidence(itemKey: string, source: "camera" | "library") {
    try {
      setBusy(true);
      setError(null);
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Camera access is required to take an inspection photo.");
      }
      const picked = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      if (picked.canceled) return;

      const saved = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 1600 } }],
        {
        base64: true,
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      if (!saved.base64) throw new Error("The inspection photo could not be prepared.");
      const bytes = bytesFromBase64(saved.base64);
      const digest = new Uint8Array(
        await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes),
      );
      const evidence: LocalInspectionEvidence = {
        itemKey,
        base64: saved.base64,
        contentType: "image/jpeg",
        sizeBytes: bytes.byteLength,
        sha256: bytesToHex(digest),
      };
      update({
        evidence: [...draft.evidence.filter((item) => item.itemKey !== itemKey), evidence],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function continueFromStart() {
    if (!draft.vehicleId) return setError("Select the vehicle.");
    if (!/^\d+$/.test(draft.odometer)) return setError("Enter the current mileage.");
    setStage("checklist");
    setError(null);
  }

  function openReview() {
    const error = inspectionValidationError(draft);
    if (error && completed < fleetInspectionItems.length) {
      setError(error);
      return;
    }
    setStage("review");
    setError(null);
  }

  async function submit() {
    const validationError = inspectionValidationError(draft);
    if (validationError) return setError(validationError);
    try {
      setBusy(true);
      setError(null);
      const result = await props.onSubmit(
        {
          vehicle_id: draft.vehicleId,
          inspection_type: draft.inspectionType,
          odometer_miles: Number(draft.odometer),
          safe_to_operate: Boolean(draft.safeToOperate),
          driver_notes: draft.driverNotes,
          route_name: props.routeName === "OFF" ? "" : props.routeName,
          items: inspectionItemsPayload(draft),
        },
        draft.evidence,
      );
      await props.outbox.clearInspectionDraft(props.contextKey);
      setDraft(emptyInspectionDraft());
      setStage(result === "submitted" ? "submitted" : "offline");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "submitted" || stage === "offline") {
    const submitted = stage === "submitted";
    return (
      <Screen>
        <AppHeader
          companyName={props.companyName}
          onSettings={props.onSettings}
          subtitle={submitted
            ? props.demoMode ? "Demo inspection recorded" : "Inspection submitted"
            : "Saved offline — waiting to sync"}
          title="Vehicle Inspection"
        />
        <Card tone="primary">
          <View style={styles.confirmationRow}>
            <View style={styles.checkCircle}><Text style={styles.check}>✓</Text></View>
            <View style={styles.confirmationCopy}>
              <Text style={sharedStyles.h3}>
                {submitted
                  ? props.demoMode ? "SAVED TO DEMO LEDGER" : "SUBMITTED TO INSIGHT"
                  : "SAVED ON THIS DEVICE"}
              </Text>
              <Text style={sharedStyles.muted}>
                {submitted
                  ? props.demoMode
                    ? "The workflow was recorded without creating an operational inspection or changing vehicle status."
                    : "Your inspection was received successfully."
                  : "We’ll try to sync it automatically while the app is open."}
              </Text>
            </View>
          </View>
        </Card>
      </Screen>
    );
  }

  if (stage === "start") {
    return (
      <Screen>
        <AppHeader
          companyName={props.companyName}
          onSettings={props.onSettings}
          subtitle="Inspection setup"
          title="Vehicle Inspection"
        />
        <Text style={sharedStyles.muted}>Route {props.routeName}</Text>
        <Card>
          <Text style={sharedStyles.label}>Vehicle — required</Text>
          <Pressable onPress={() => setVehicleMenuOpen((current) => !current)} style={styles.selectField}>
            <Text style={selectedVehicle ? sharedStyles.body : sharedStyles.muted}>
              {selectedVehicle ? `Unit ${selectedVehicle.unit_number}` : "Scan or select vehicle"}
            </Text>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>
          {vehicleMenuOpen ? (
            <View style={styles.vehicleMenu}>
              {props.vehicles.length === 0 ? <Text style={sharedStyles.muted}>No available vehicles.</Text> : null}
              {props.vehicles.map((vehicle) => (
                <Pressable
                  key={vehicle.vehicle_id}
                  onPress={() => {
                    update({
                      vehicleId: vehicle.vehicle_id,
                      odometer: draft.odometer || String(vehicle.odometer_miles ?? ""),
                    });
                    setVehicleMenuOpen(false);
                  }}
                  style={styles.vehicleOption}
                >
                  <Text style={sharedStyles.bodyStrong}>Unit {vehicle.unit_number}</Text>
                  <Text style={sharedStyles.muted}>{vehicle.status.replaceAll("_", " ")}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={sharedStyles.label}>Inspection type — required</Text>
          <View style={styles.segmented}>
            {([
              ["PRE_TRIP", "Pre-trip"],
              ["POST_TRIP", "Post-trip"],
              ["MID_ROUTE", "Mid-route"],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => update({ inspectionType: value })}
                style={[styles.segment, draft.inspectionType === value && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, draft.inspectionType === value && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={sharedStyles.label}>Current mileage — required</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(odometer) => update({ odometer })}
            placeholder="Enter current mileage"
            style={sharedStyles.input}
            value={draft.odometer}
          />
        </Card>
        {error ? <Text style={sharedStyles.danger}>{error}</Text> : null}
        <PrimaryButton label="Continue inspection" onPress={continueFromStart} />
      </Screen>
    );
  }

  if (stage === "defect" && defectItem) {
    const [, itemKey, label] = defectItem;
    const requiresPhoto = requiredFleetEvidenceKeys.has(itemKey);
    return (
      <Screen>
        <Pressable onPress={() => setStage("checklist")}><Text style={styles.back}>‹ Checklist</Text></Pressable>
        <AppHeader
          companyName={props.companyName}
          onSettings={props.onSettings}
          subtitle="Pre-trip inspection"
          title="Vehicle Inspection"
        />
        <Text style={sharedStyles.muted}>Route {props.routeName} · {selectedVehicle ? `Unit ${selectedVehicle.unit_number}` : "Selected vehicle"} · Current mileage</Text>
        <Text style={sharedStyles.eyebrow}>INSPECTION PROGRESS</Text>
        <View style={styles.progressTrack}><View style={[styles.progress, { width: `${completed / fleetInspectionItems.length * 100}%` }]} /></View>
        <Card outlined>
          <Text style={sharedStyles.h3}>{label}</Text>
          <View style={styles.resultRow}>
            {(["PASS", "DEFECT", "NOT_APPLICABLE"] as InspectionResult[]).map((result) => (
              <Pressable
                key={result}
                onPress={() => {
                  if (result === "DEFECT") answer(itemKey, result);
                  else {
                    update({ results: { ...draft.results, [itemKey]: result } });
                    setStage("checklist");
                  }
                }}
                style={[styles.resultButton, draft.results[itemKey] === result && (result === "DEFECT" ? styles.resultDefect : styles.resultSelected)]}
              >
                <Text style={[styles.resultText, draft.results[itemKey] === result && (result === "DEFECT" ? styles.resultDefectText : styles.resultSelectedText)]}>{resultLabel(result)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={sharedStyles.label}>Defect notes — required</Text>
          <TextInput
            multiline
            onChangeText={(value) => update({ notes: { ...draft.notes, [itemKey]: value } })}
            placeholder="Describe the defect"
            style={[sharedStyles.input, styles.multiline]}
            textAlignVertical="top"
            value={draft.notes[itemKey] ?? ""}
          />
          <Text style={sharedStyles.label}>{requiresPhoto ? "Photo — required" : "Photo — optional"}</Text>
          <EvidenceControls
            attached={evidenceForItem(draft, itemKey).length}
            busy={busy}
            onCamera={() => void captureEvidence(itemKey, "camera")}
            onLibrary={() => void captureEvidence(itemKey, "library")}
          />
        </Card>
        {error ? <Text style={sharedStyles.danger}>{error}</Text> : null}
        <PrimaryButton
          disabled={!draft.notes[itemKey]?.trim() || (requiresPhoto && evidenceForItem(draft, itemKey).length === 0)}
          label="Continue checklist"
          onPress={() => setStage("checklist")}
        />
      </Screen>
    );
  }

  if (stage === "review") {
    const defects = fleetInspectionItems.filter(([, key]) => draft.results[key] === "DEFECT");
    return (
      <>
      <Screen>
        <Pressable onPress={() => setStage("checklist")}><Text style={styles.back}>‹ Checklist</Text></Pressable>
        <AppHeader
          companyName={props.companyName}
          onSettings={props.onSettings}
          subtitle="Review inspection"
          title="Vehicle Inspection"
        />
        <Text style={sharedStyles.muted}>{draft.inspectionType === "PRE_TRIP" ? "Pre-trip" : draft.inspectionType === "POST_TRIP" ? "Post-trip" : "Mid-route"} · Route {props.routeName} · {selectedVehicle ? `Unit ${selectedVehicle.unit_number}` : "Selected vehicle"} · {draft.odometer} miles</Text>
        <Card>
          <Text style={sharedStyles.h3}>Inspection summary</Text>
          <Text style={sharedStyles.bodyStrong}>{completed} of {fleetInspectionItems.length} items completed</Text>
          <Text style={defectCount > 0 ? sharedStyles.danger : sharedStyles.muted}>{defectCount} defect{defectCount === 1 ? "" : "s"} reported</Text>
        </Card>
        {defects.map(([, key, label]) => (
          <Card key={key} outlined>
            <Text style={sharedStyles.h3}>{label}</Text>
            <Text style={sharedStyles.danger}>Defect reported</Text>
            <Text style={sharedStyles.muted}>Defect notes recorded</Text>
            <Text style={sharedStyles.muted}>{evidenceForItem(draft, key).length > 0 ? "Photo attached" : "No photo attached — optional"}</Text>
          </Card>
        ))}
        <Card>
          <Text style={sharedStyles.h2}>Safe to operate?</Text>
          <ChoiceButton
            active={draft.safeToOperate === true}
            label="Yes — vehicle is safe to operate"
            onPress={() => update({ safeToOperate: true })}
          />
          <ChoiceButton
            active={draft.safeToOperate === false}
            danger
            label="No — place vehicle out of service"
            onPress={() => update({ safeToOperate: false })}
          />
        </Card>
        <Card>
          <Text style={sharedStyles.label}>Driver notes — optional</Text>
          <TextInput
            multiline
            onChangeText={(driverNotes) => update({ driverNotes })}
            placeholder="Add any final notes"
            style={[sharedStyles.input, styles.multiline]}
            textAlignVertical="top"
            value={draft.driverNotes}
          />
        </Card>
        {error ? <Text style={sharedStyles.danger}>{error}</Text> : null}
        <PrimaryButton disabled={busy} label={busy ? "Submitting…" : "Submit inspection"} onPress={() => setIntentOpen(true)} />
      </Screen>
      {intentOpen ? (
        <IntentVerificationModal
          actionLabel="inspection submission"
          busy={busy}
          onCancel={() => setIntentOpen(false)}
          onConfirm={() => {
            setIntentOpen(false);
            void submit();
          }}
          visible
        />
      ) : null}
      </>
    );
  }

  return (
    <Screen>
      <Pressable onPress={() => setStage("start")}><Text style={styles.back}>‹ Inspection setup</Text></Pressable>
      <AppHeader
        companyName={props.companyName}
        onSettings={props.onSettings}
        subtitle="Pre-trip inspection"
        title="Vehicle Inspection"
      />
      <Text style={sharedStyles.muted}>Route {props.routeName} · {selectedVehicle ? `Unit ${selectedVehicle.unit_number}` : "Selected vehicle"} · {draft.odometer} miles</Text>
      <View style={styles.progressHeader}>
        <Text style={sharedStyles.bodyStrong}>Inspection progress</Text>
        <Text style={sharedStyles.bodyStrong}>{completed} / {fleetInspectionItems.length}</Text>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progress, { width: `${completed / fleetInspectionItems.length * 100}%` }]} /></View>
      {sections.map((section) => (
        <View key={section} style={styles.section}>
          <Text style={sharedStyles.h3}>{section.replaceAll("_", " ")}</Text>
          {fleetInspectionItems.filter(([itemSection]) => itemSection === section).map(([, key, label]) => {
            const requiresPhoto = requiredFleetEvidenceKeys.has(key);
            return (
              <Card key={key} outlined>
                <Text style={sharedStyles.bodyStrong}>{label}</Text>
                {requiresPhoto ? <Text style={styles.required}>Required daily photo · all lights on</Text> : null}
                <View style={styles.resultRow}>
                  {(["PASS", "DEFECT", "NOT_APPLICABLE"] as InspectionResult[]).map((result) => (
                    <Pressable
                      key={result}
                      onPress={() => answer(key, result)}
                      style={[styles.resultButton, draft.results[key] === result && (result === "DEFECT" ? styles.resultDefect : styles.resultSelected)]}
                    >
                      <Text style={[styles.resultText, draft.results[key] === result && (result === "DEFECT" ? styles.resultDefectText : styles.resultSelectedText)]}>{resultLabel(result)}</Text>
                    </Pressable>
                  ))}
                </View>
                {requiresPhoto ? (
                  <EvidenceControls
                    attached={evidenceForItem(draft, key).length}
                    busy={busy}
                    onCamera={() => void captureEvidence(key, "camera")}
                    onLibrary={() => void captureEvidence(key, "library")}
                  />
                ) : null}
              </Card>
            );
          })}
        </View>
      ))}
      {error ? <Text style={sharedStyles.danger}>{error}</Text> : null}
      <PrimaryButton
        disabled={completed !== fleetInspectionItems.length}
        label="Review inspection"
        onPress={openReview}
      />
    </Screen>
  );
}

function EvidenceControls(props: {
  attached: number;
  busy: boolean;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  return (
    <View style={styles.evidenceBlock}>
      <View style={styles.evidenceRow}>
        <Pressable disabled={props.busy} onPress={props.onCamera} style={styles.evidenceButton}>
          <Text style={styles.evidenceButtonText}>Take photo</Text>
        </Pressable>
        <Pressable disabled={props.busy} onPress={props.onLibrary} style={styles.evidenceButton}>
          <Text style={styles.evidenceButtonText}>Attach photo</Text>
        </Pressable>
      </View>
      {props.attached > 0 ? <Text style={sharedStyles.muted}>✓ Photo attached</Text> : null}
    </View>
  );
}

function ChoiceButton(props: { active: boolean; danger?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.choice,
        props.active && (props.danger ? styles.choiceDanger : styles.choiceActive),
      ]}
    >
      <Text style={[styles.choiceText, props.active && (props.danger ? styles.choiceDangerText : styles.choiceActiveText)]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 15, fontWeight: "700", paddingVertical: 5 },
  selectField: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.white, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chevron: { color: colors.primary, fontSize: 18 },
  vehicleMenu: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 8 },
  vehicleOption: { padding: 12, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  segmented: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 7 },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  segmentText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  segmentTextActive: { color: colors.primary },
  progressHeader: { flexDirection: "row", justifyContent: "space-between" },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: colors.palePrimary, overflow: "hidden" },
  progress: { height: 7, backgroundColor: colors.primary },
  section: { gap: 9 },
  required: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  resultRow: { flexDirection: "row", gap: 8 },
  resultButton: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  resultSelected: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  resultDefect: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  resultText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  resultSelectedText: { color: colors.primary },
  resultDefectText: { color: colors.danger },
  multiline: { minHeight: 84, paddingTop: 12 },
  evidenceBlock: { gap: 7 },
  evidenceRow: { flexDirection: "row", gap: 8 },
  evidenceButton: { flex: 1, minHeight: 40, borderColor: colors.border, borderWidth: 1, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  evidenceButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  choice: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, paddingHorizontal: 8 },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.palePrimary },
  choiceDanger: { borderColor: colors.danger, backgroundColor: colors.paleDanger },
  choiceText: { color: colors.ink, fontSize: 14, fontWeight: "700", textAlign: "center" },
  choiceActiveText: { color: colors.primary },
  choiceDangerText: { color: colors.danger },
  confirmationRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  checkCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  check: { color: colors.white, fontSize: 25, fontWeight: "800" },
  confirmationCopy: { flex: 1, gap: 5 },
});
