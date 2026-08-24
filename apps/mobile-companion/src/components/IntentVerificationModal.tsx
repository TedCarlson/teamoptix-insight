import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { IntentConfirmation } from "../outbox/types";
import { colors } from "../theme";
import { sharedStyles } from "./ui";

type IntentVerificationModalProps = {
  actionLabel: string;
  detail?: string;
  busy?: boolean;
  visible: boolean;
  onCancel: () => void;
  onConfirm: (confirmation: IntentConfirmation) => void;
};

function challenge() {
  const correct = Math.floor(100 + Math.random() * 900);
  const choices = new Set([correct]);
  while (choices.size < 3) choices.add(Math.floor(100 + Math.random() * 900));
  return {
    correct: String(correct),
    choices: Array.from(choices).map(String).sort(() => Math.random() - 0.5),
  };
}

export function IntentVerificationModal(props: IntentVerificationModalProps) {
  const intent = useMemo(challenge, []);

  return (
    <Modal
      animationType="fade"
      onRequestClose={props.onCancel}
      transparent
      visible={props.visible}
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text style={sharedStyles.eyebrow}>CONFIRM {props.actionLabel.toUpperCase()}</Text>
          <Text style={sharedStyles.h1}>Select {intent.correct}</Text>
          {props.detail ? <Text style={sharedStyles.bodyStrong}>{props.detail}</Text> : null}
          <Text style={sharedStyles.muted}>Select the matching number to continue.</Text>
          <View style={styles.choices}>
            {intent.choices.map((choice) => (
              <Pressable
                accessibilityRole="button"
                disabled={props.busy}
                key={choice}
                onPress={() => {
                  if (choice !== intent.correct) return props.onCancel();
                  props.onConfirm({
                    method: "MATCH_CODE",
                    confirmed_at: new Date().toISOString(),
                    client: "INSIGHT_MOBILE_COMPANION",
                  });
                }}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Text style={styles.choiceText}>{choice}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable disabled={props.busy} onPress={props.onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(21,34,54,0.42)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  choices: { flexDirection: "row", gap: 10, marginTop: 8 },
  choice: {
    flex: 1,
    minHeight: 58,
    borderColor: colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  cancel: { alignItems: "center", padding: 12 },
  cancelText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.55 },
});
