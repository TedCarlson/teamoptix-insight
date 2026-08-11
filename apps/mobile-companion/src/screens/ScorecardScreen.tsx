import { Text } from "react-native";

import { AppHeader, Card, Screen, sharedStyles } from "../components/ui";

export function ScorecardScreen(props: { companyName: string; onSettings: () => void }) {
  return (
    <Screen>
      <AppHeader companyName={props.companyName} onSettings={props.onSettings} title="Scorecard" />
      <Card>
        <Text style={sharedStyles.h2}>Scorecard coming soon</Text>
        <Text style={sharedStyles.muted}>
          Performance score, rank, trends, attendance, and delivery history will live here.
        </Text>
      </Card>
    </Screen>
  );
}
