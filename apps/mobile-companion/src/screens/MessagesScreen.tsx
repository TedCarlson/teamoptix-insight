import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DriverMessage } from "../domain/mobile";
import { colors } from "../theme";
import { AppHeader, Card, PrimaryButton, Screen, sharedStyles } from "../components/ui";

type MessagesScreenProps = {
  companyName: string;
  messages: DriverMessage[];
  selectedMessage: DriverMessage | null;
  busy: boolean;
  notice: string | null;
  onSettings: () => void;
  onSelect: (message: DriverMessage | null) => void;
  onAcknowledge: (message: DriverMessage) => void;
};

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MessagesScreen(props: MessagesScreenProps) {
  if (props.selectedMessage) {
    const message = props.selectedMessage;
    return (
      <Screen>
        <Pressable onPress={() => props.onSelect(null)} style={styles.back}>
          <Text style={styles.backText}>‹ Messages</Text>
        </Pressable>
        <AppHeader companyName={props.companyName} onSettings={props.onSettings} title="Message" />
        <Text style={sharedStyles.h1}>{message.title}</Text>
        <Text style={sharedStyles.muted}>{formatDate(message.published_at)}</Text>
        <Card outlined>
          <Text style={sharedStyles.body}>{message.body}</Text>
        </Card>
        {message.requires_ack ? (
          message.acknowledged ? (
            <Card tone="primary">
              <Text style={sharedStyles.bodyStrong}>Acknowledged</Text>
              <Text style={sharedStyles.muted}>
                {message.acknowledged_at
                  ? `Recorded ${formatDate(message.acknowledged_at)}`
                  : "Saved on this device and waiting to synchronize."}
              </Text>
            </Card>
          ) : (
            <Card>
              <Text style={sharedStyles.h3}>Acknowledgment required</Text>
              <Text style={sharedStyles.muted}>
                Selecting the button confirms that you have read this message.
              </Text>
              <PrimaryButton
                disabled={props.busy}
                label={props.busy ? "Saving…" : "Read & acknowledge"}
                onPress={() => props.onAcknowledge(message)}
              />
            </Card>
          )
        ) : null}
        {props.notice ? <Text style={sharedStyles.muted}>{props.notice}</Text> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader companyName={props.companyName} onSettings={props.onSettings} title="Messages" />
      <Text style={sharedStyles.h2}>Inbox</Text>
      {props.messages.length === 0 ? (
        <Card>
          <Text style={sharedStyles.bodyStrong}>No messages</Text>
          <Text style={sharedStyles.muted}>Company messages will appear here.</Text>
        </Card>
      ) : (
        props.messages.map((message) => (
          <Pressable
            accessibilityRole="button"
            key={message.id}
            onPress={() => props.onSelect(message)}
          >
            <Card outlined>
              <View style={styles.messageHeader}>
                <Text style={[sharedStyles.h3, styles.messageTitle]}>{message.title}</Text>
                {message.requires_ack && !message.acknowledged ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>ACTION</Text></View>
                ) : null}
              </View>
              <Text numberOfLines={2} style={sharedStyles.muted}>{message.body}</Text>
              <View style={styles.messageFooter}>
                <Text style={styles.date}>{formatDate(message.published_at)}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", paddingVertical: 6 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  messageHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  messageTitle: { flex: 1 },
  badge: { alignSelf: "flex-start", backgroundColor: colors.paleDanger, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10 },
  badgeText: { color: colors.danger, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  messageFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  date: { color: colors.muted, fontSize: 12 },
  chevron: { color: colors.primary, fontSize: 22 },
});
