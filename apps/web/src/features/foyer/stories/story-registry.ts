export type FoyerStory = {
  id: string;
  title: string;
  concernKeys: string[];
  elevatorPitch: string;
  invitation: string;
};

export const foyerStories: FoyerStory[] = [
  {
    id: "payroll",
    title: "Payroll Confidence",
    concernKeys: ["payroll", "time keeping", "threshold", "pay"],
    elevatorPitch:
      "Insight helps payroll become traceable. Every number can point back to the operational records that produced it instead of living in disconnected spreadsheets.",
    invitation: "Would it help to see how Insight approaches payroll?",
  },
  {
    id: "dispatch",
    title: "Morning Dispatch",
    concernKeys: ["dispatch", "call out", "routes", "morning"],
    elevatorPitch:
      "Insight gives leaders a clearer morning picture: who is available, what changed, and where the day is already at risk before trucks leave the building.",
    invitation: "Would it help to see the dispatch workflow?",
  },
  {
    id: "onboarding",
    title: "Onboarding and Roster Management",
    concernKeys: ["onboarding", "roster", "hiring", "workforce"],
    elevatorPitch:
      "Insight follows people from candidate to active worker so the same information does not have to be rebuilt across disconnected tools.",
    invitation: "Would it help to see the workforce path?",
  },
];
