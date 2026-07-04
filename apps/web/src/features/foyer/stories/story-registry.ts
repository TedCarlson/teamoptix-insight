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
  {
    id: "timekeeping",
    title: "Time Keeping Foundation",
    concernKeys: ["time keeping", "timekeeping", "hours", "attendance", "clock"],
    elevatorPitch:
      "Insight treats time as the starting point for trust. Attendance, activity, and payroll can stay connected so leaders are not rebuilding the truth at the end of the week.",
    invitation: "Would it help to see how time becomes payroll context?",
  },
  {
    id: "planning",
    title: "Planning Readiness",
    concernKeys: ["planning", "tomorrow", "forecast", "readiness", "staffing"],
    elevatorPitch:
      "Insight helps tomorrow become visible before today is finished. Planning signals show where volume, staffing, and route demand may need attention.",
    invitation: "Would it help to see how Insight prepares leaders for tomorrow?",
  },
  {
    id: "leadership",
    title: "Leadership Alignment",
    concernKeys: ["leaders", "leadership", "manager", "supervisor", "organized"],
    elevatorPitch:
      "Insight gives leaders one operational picture instead of separate notebooks, spreadsheets, and text threads. The goal is a team that sees the same work at the same time.",
    invitation: "Would it help to see how Insight keeps leadership aligned?",
  },
];
