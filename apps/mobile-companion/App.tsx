import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getSupabaseClient,
  loadAccessMemberships,
  type AccessMembership,
} from "./src/lib/supabase";
import { EdgeOutbox } from "./src/outbox/database";
import type { LocalSession, OutboxCounts } from "./src/outbox/types";
import { syncOutbox } from "./src/sync/syncOutbox";
import {
  captureForegroundPoint,
  captureSyntheticPoint,
} from "./src/tracking/location";

const EMPTY_COUNTS: OutboxCounts = {
  queued: 0,
  pendingBatches: 0,
  rejected: 0,
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.secondary && styles.buttonSecondary,
        (pressed || props.disabled) && styles.buttonDimmed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          props.secondary && styles.buttonSecondaryText,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function SignInScreen(props: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const result = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error("Sign-in did not return a session.");
      props.onSignedIn(result.data.session);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>INSIGHT</Text>
      <Text style={styles.title}>Mobile Companion</Text>
      <Text style={styles.lead}>Use your existing Insight account.</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="name@company.com"
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
      <Button
        disabled={busy || !email.trim() || !password}
        label={busy ? "Signing in…" : "Sign in"}
        onPress={signIn}
      />

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Insight remains the authority</Text>
        <Text style={styles.noteText}>
          Your company and roster access come from your existing Insight profile.
        </Text>
      </View>
      <Text style={styles.footnote}>
        Your first sign-in requires connectivity. After that, duty points can be
        held securely on this device and synchronized later.
      </Text>
    </ScrollView>
  );
}

function DutyScreen(props: {
  session: Session;
  onSignedOut: () => void;
}) {
  const [outbox, setOutbox] = useState<EdgeOutbox | null>(null);
  const [memberships, setMemberships] = useState<AccessMembership[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [dutySession, setDutySession] = useState<LocalSession | null>(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [status, setStatus] = useState("Preparing secure outbox…");
  const [busy, setBusy] = useState(false);

  const membership = useMemo(
    () => memberships.find((item) => item.company_id === selectedCompanyId) ?? null,
    [memberships, selectedCompanyId],
  );

  const refresh = useCallback(
    async (nextOutbox: EdgeOutbox, tenantKey: string) => {
      const [open, nextCounts] = await Promise.all([
        nextOutbox.openSession(tenantKey),
        nextOutbox.counts(tenantKey),
      ]);
      setDutySession(open);
      setCounts(nextCounts);
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let opened: EdgeOutbox | null = null;
    (async () => {
      try {
        opened = await EdgeOutbox.open(props.session.user.id);
        const access = await loadAccessMemberships();
        const resumed = (
          await Promise.all(
            access.map((item) => opened!.openSession(item.company_id)),
          )
        ).find((item) => item !== null);
        if (disposed) return;
        setOutbox(opened);
        setMemberships(access);
        setSelectedCompanyId(resumed?.tenantKey ?? access[0]?.company_id ?? null);
        setStatus(
          access.length > 0
            ? resumed
              ? "Recovered the open duty session from the encrypted outbox."
              : "Ready. Tracking starts only when you choose Start duty."
            : "No active company membership is available.",
        );
      } catch (caught) {
        if (!disposed) setStatus(message(caught));
      }
    })();
    return () => {
      disposed = true;
      void opened?.close();
    };
  }, [props.session.user.id]);

  useEffect(() => {
    if (!outbox || !selectedCompanyId) return;
    void refresh(outbox, selectedCompanyId).catch((caught) =>
      setStatus(message(caught)),
    );
  }, [outbox, refresh, selectedCompanyId]);

  async function run(action: () => Promise<void>) {
    if (!outbox || !membership) return;
    setBusy(true);
    try {
      await action();
      await refresh(outbox, membership.company_id);
    } catch (caught) {
      setStatus(message(caught));
    } finally {
      setBusy(false);
    }
  }

  function startDuty() {
    void run(async () => {
      const started = await outbox!.startSession(
        membership!.company_id,
        membership!.company_slug,
      );
      setDutySession(started);
      setStatus("Duty session started. No point is captured automatically.");
    });
  }

  function stopDuty() {
    if (!dutySession) return;
    void run(async () => {
      await outbox!.sealNextBatch(membership!.company_id, dutySession.sessionId);
      await outbox!.stopSession(membership!.company_id, dutySession.sessionId);
      setDutySession(null);
      setStatus("Duty session stopped. Evidence remains queued until acknowledged.");
    });
  }

  function capture(realLocation: boolean) {
    if (!dutySession) return;
    void run(async () => {
      const point = realLocation
        ? await captureForegroundPoint(dutySession.sessionId, membership!.company_id)
        : captureSyntheticPoint(dutySession.sessionId, membership!.company_id);
      await outbox!.enqueuePoint(point);
      setStatus(
        realLocation
          ? "Foreground point saved to the encrypted outbox."
          : "Synthetic development point saved to the encrypted outbox.",
      );
    });
  }

  function synchronize() {
    void run(async () => {
      if (dutySession) {
        await outbox!.sealNextBatch(membership!.company_id, dutySession.sessionId);
      }
      const summary = await syncOutbox(outbox!, membership!.company_id);
      if (!summary.online) {
        setStatus("Offline. Nothing was removed; the outbox will be ready later.");
      } else if (summary.error) {
        setStatus(`Sync paused safely: ${summary.error}`);
      } else {
        setStatus(
          `Acknowledged ${summary.sessionsAcknowledged} session(s) and ${summary.batchesAcknowledged} batch(es).`,
        );
      }
    });
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    props.onSignedOut();
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.brand}>INSIGHT</Text>
      <Text style={styles.title}>Duty & outbox</Text>
      <Text style={styles.lead}>
        {props.session.user.email ?? "Authenticated Insight user"}
      </Text>

      {memberships.length > 1 ? (
        <View style={styles.companyList}>
          {memberships.map((item) => (
            <Pressable
              disabled={Boolean(dutySession)}
              key={item.company_id}
              onPress={() => setSelectedCompanyId(item.company_id)}
              style={[
                styles.companyChoice,
                item.company_id === selectedCompanyId && styles.companyChoiceActive,
              ]}
            >
              <Text>{item.company_name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.statusCard}>
        <Text style={styles.noteTitle}>{membership?.company_name ?? "No company"}</Text>
        <Text style={styles.statusHeadline}>
          {dutySession ? "Duty tracking is active" : "Duty tracking is off"}
        </Text>
        <Text style={styles.noteText}>{status}</Text>
      </View>

      {dutySession ? (
        <>
          <Button
            disabled={busy}
            label="Capture foreground point"
            onPress={() => capture(true)}
          />
          {__DEV__ ? (
            <Button
              disabled={busy}
              label="Add synthetic test point"
              onPress={() => capture(false)}
              secondary
            />
          ) : null}
          <Button disabled={busy} label="Stop duty" onPress={stopDuty} secondary />
        </>
      ) : (
        <Button
          disabled={busy || !membership}
          label="Start duty"
          onPress={startDuty}
        />
      )}

      <View style={styles.outboxRow}>
        <View><Text style={styles.metric}>{counts.queued}</Text><Text>Queued</Text></View>
        <View><Text style={styles.metric}>{counts.pendingBatches}</Text><Text>Batches</Text></View>
        <View><Text style={styles.metric}>{counts.rejected}</Text><Text>Rejected</Text></View>
      </View>
      <Button
        disabled={busy || !membership || !outbox}
        label={busy ? "Working…" : "Synchronize now"}
        onPress={synchronize}
        secondary
      />

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Observation only</Text>
        <Text style={styles.noteText}>
          Device evidence does not automatically establish payroll, vehicle,
          carrier, or delivery truth. Background location is not enabled.
        </Text>
      </View>
      <Pressable onPress={signOut}><Text style={styles.signOut}>Sign out</Text></Pressable>
    </ScrollView>
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
      setConfigurationError(message(caught));
      setSession(null);
      return undefined;
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {configurationError ? (
        <View style={styles.page}>
          <Text style={styles.title}>Configuration needed</Text>
          <Text style={styles.error}>{configurationError}</Text>
          <Text style={styles.noteText}>Copy .env.example to .env and add the existing Insight values.</Text>
        </View>
      ) : session === undefined ? (
        <View style={styles.loading}><ActivityIndicator /></View>
      ) : session ? (
        <DutyScreen session={session} onSignedOut={() => setSession(null)} />
      ) : (
        <SignInScreen onSignedIn={setSession} />
      )}
    </SafeAreaView>
  );
}

const colors = {
  ink: "#152236",
  muted: "#5C6778",
  border: "#CAD1DB",
  panel: "#F3F6F9",
  primary: "#146C94",
  danger: "#A13434",
  white: "#FFFFFF",
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  page: { flexGrow: 1, padding: 24, gap: 12, backgroundColor: colors.white },
  brand: { color: colors.primary, fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "700" },
  lead: { color: colors.muted, fontSize: 16, marginBottom: 18 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600", marginTop: 4 },
  input: { height: 52, borderColor: colors.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  passwordRow: { height: 52, borderColor: colors.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, fontSize: 16 },
  show: { color: colors.primary, fontWeight: "700", padding: 8 },
  button: { minHeight: 52, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: colors.white, borderColor: colors.primary, borderWidth: 1 },
  buttonDimmed: { opacity: 0.55 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  buttonSecondaryText: { color: colors.primary },
  note: { backgroundColor: colors.panel, borderRadius: 12, padding: 16, marginTop: 8, gap: 6 },
  noteTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  noteText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  footnote: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14 },
  statusCard: { backgroundColor: colors.panel, borderRadius: 12, padding: 18, gap: 7 },
  statusHeadline: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  outboxRow: { flexDirection: "row", justifyContent: "space-around", borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 6 },
  metric: { color: colors.ink, fontSize: 24, fontWeight: "700", textAlign: "center" },
  companyList: { gap: 8 },
  companyChoice: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12 },
  companyChoiceActive: { borderColor: colors.primary, backgroundColor: colors.panel },
  signOut: { color: colors.primary, fontWeight: "700", textAlign: "center", padding: 14 },
});
