export type ExploreMoment = {
  title: string;
  angle: number;
  icon: string;
};

export const exploreMoments: ExploreMoment[] = [
  { title: "Planning", angle: 0, icon: "calendar" },
  { title: "Dispatch", angle: 40, icon: "route" },
  { title: "Service", angle: 80, icon: "service" },
  { title: "Payroll", angle: 120, icon: "payroll" },
  { title: "Time Keeping", angle: 160, icon: "time" },
  { title: "Analysis", angle: 200, icon: "analysis" },
  { title: "Hiring", angle: 240, icon: "hiring" },
  { title: "Roster", angle: 280, icon: "roster" },
  { title: "Scheduling", angle: 320, icon: "schedule" },
];
