export type DemoPerspective =
  | "platform_admin"
  | "director"
  | "company_manager"
  | "company_supervisor"
  | "bp_owner"
  | "bp_supervisor"
  | "technician";

export type DemoPersonStatus =
  | "active"
  | "inactive"
  | "onboarding"
  | "onboarding_closed";

export type DemoAssignmentStatus = "active" | "inactive" | "pending" | "archived";

export type DemoSeatType =
  | "FIELD"
  | "LEADERSHIP"
  | "SUPPORT"
  | "TRAVEL"
  | "DROP_BURY"
  | "TRAINING"
  | "FMLA";

export type DemoAppAccessStatus =
  | "missing_email"
  | "invite_available"
  | "invited_pending"
  | "active"
  | "profile_mismatch";

export type DemoFuseStatus =
  | "Started"
  | "DT Pass/Pending BG"
  | "Pending D&B"
  | "Pending DT/BG Pass"
  | "Drug & Background Sent"
  | "Badge/Creds Submitted"
  | "Ready for Badge/Creds"
  | "Consent Forms Pending Return"
  | "Not Hiring"
  | "Not Qualified"
  | "Terminated";

export type DemoMetricBand =
  | "EXCEEDS"
  | "MEETS"
  | "NEEDS_IMPROVEMENT"
  | "MISSES"
  | "NO_DATA";

export type DemoMetricDefinition = {
  key: string;
  label: string;
  customerLabel: string;
  direction: "HIGHER" | "LOWER";
};

export type DemoMetricValue = {
  key: string;
  value: number | null;
  band: DemoMetricBand;
};

export type DemoAssignment = {
  id: string;
  pcOrg: string;
  positionTitle: string;
  office: string;
  affiliation: string;
  reportsToName: string | null;
  startDate: string;
  endDate: string | null;
  seatType: DemoSeatType;
  status: DemoAssignmentStatus;
  isPrimary: boolean;
  isIncomplete: boolean;
};

export type DemoPerson = {
  id: string;
  fullName: string;
  legalName: string;
  preferredName: string;
  status: DemoPersonStatus;
  techId: string;
  fuseEmployeeId: string;
  ntLogin: string;
  csgId: string;
  mobile: string;
  email: string;
  companyId: string;
  companyName: string;
  prospectingAffiliation: string;
  onboardingOrg: string;
  fuseStatus: DemoFuseStatus | null;
  onboardingDate: string | null;
  daysInPipeline: number | null;
  assignment: DemoAssignment;
  activeAssignmentCount: number;
  itgAssigned: boolean;
  appAccessStatus: DemoAppAccessStatus;
  enteredBy: "ITG" | "Contractor" | "Legacy unknown";
  updatedAt: string;
  jobsDisplay: string;
  metricValues: DemoMetricValue[];
};

export type DemoCompany = {
  id: string;
  name: string;
  shortName: string;
  relationship: "Prime" | "Contractor";
  status: "Active" | "Invited";
};

export const ITF_DEMO_PERSPECTIVES: Array<{ value: DemoPerspective; label: string }> = [
  { value: "platform_admin", label: "Platform administrator (current)" },
  { value: "director", label: "ITG Director" },
  { value: "company_manager", label: "ITG Company Manager" },
  { value: "company_supervisor", label: "ITG Company Supervisor" },
  { value: "bp_owner", label: "Service Provider Owner" },
  { value: "bp_supervisor", label: "Service Provider Supervisor" },
  { value: "technician", label: "Technician" },
];

export const ITF_DEMO_METRICS: DemoMetricDefinition[] = [
  { key: "tnps_score", label: "tNPS", customerLabel: "tNPS", direction: "HIGHER" },
  { key: "ftr_rate", label: "FTR %", customerLabel: "FTR %", direction: "HIGHER" },
  { key: "tool_usage_rate", label: "Tool Usage %", customerLabel: "Tool Usage %", direction: "HIGHER" },
  { key: "contact_48hr_rate", label: "48Hr Contact", customerLabel: "48Hr Contact", direction: "LOWER" },
  { key: "pht_pure_pass_rate", label: "Pure Pass %", customerLabel: "Pure Pass %", direction: "HIGHER" },
  { key: "met_rate", label: "MET %", customerLabel: "MET %", direction: "HIGHER" },
  { key: "repeat_rate", label: "Repeat %", customerLabel: "Repeat %", direction: "LOWER" },
  { key: "rework_rate", label: "Rework %", customerLabel: "Rework %", direction: "LOWER" },
  { key: "soi_rate", label: "SOI %", customerLabel: "SOI %", direction: "HIGHER" },
];

export const ITG_DEMO_COMPANIES: DemoCompany[] = [
  { id: "itg", name: "Integrated Tech Group", shortName: "ITG", relationship: "Prime", status: "Active" },
  { id: "skyline", name: "Skyline Fiber Services", shortName: "Skyline", relationship: "Contractor", status: "Active" },
  { id: "fieldpath", name: "FieldPath Communications", shortName: "FieldPath", relationship: "Contractor", status: "Active" },
  { id: "signalworks", name: "SignalWorks LLC", shortName: "SignalWorks", relationship: "Contractor", status: "Invited" },
];

const metricBands: Record<string, { meets: number; exceeds: number; lower?: boolean }> = {
  tnps_score: { meets: 55, exceeds: 70 },
  ftr_rate: { meets: 85, exceeds: 92 },
  tool_usage_rate: { meets: 80, exceeds: 92 },
  contact_48hr_rate: { meets: 12, exceeds: 6, lower: true },
  pht_pure_pass_rate: { meets: 85, exceeds: 94 },
  met_rate: { meets: 90, exceeds: 96 },
  repeat_rate: { meets: 8, exceeds: 4, lower: true },
  rework_rate: { meets: 6, exceeds: 3, lower: true },
  soi_rate: { meets: 85, exceeds: 93 },
};

function buildMetrics(values: number[]): DemoMetricValue[] {
  return ITF_DEMO_METRICS.map((metric, index) => {
    const value = values[index] ?? null;
    if (value == null) return { key: metric.key, value: null, band: "NO_DATA" };
    const thresholds = metricBands[metric.key];
    const band: DemoMetricBand = thresholds.lower
      ? value <= thresholds.exceeds
        ? "EXCEEDS"
        : value <= thresholds.meets
          ? "MEETS"
          : value <= thresholds.meets * 1.5
            ? "NEEDS_IMPROVEMENT"
            : "MISSES"
      : value >= thresholds.exceeds
        ? "EXCEEDS"
        : value >= thresholds.meets
          ? "MEETS"
          : value >= thresholds.meets * 0.8
            ? "NEEDS_IMPROVEMENT"
            : "MISSES";
    return { key: metric.key, value, band };
  });
}

export const ITG_DEMO_PEOPLE: DemoPerson[] = [
  {
    id: "demo-1001",
    fullName: "Marcus Reed",
    legalName: "Marcus Allen Reed",
    preferredName: "Marcus",
    status: "active",
    techId: "T-41021",
    fuseEmployeeId: "F-91842",
    ntLogin: "MREED21",
    csgId: "CSG-6018",
    mobile: "(555) 010-1101",
    email: "marcus.reed@example.test",
    companyId: "skyline",
    companyName: "Skyline Fiber Services",
    prospectingAffiliation: "Skyline Fiber Services",
    onboardingOrg: "PC 101 · North Metro",
    fuseStatus: null,
    onboardingDate: null,
    daysInPipeline: null,
    assignment: { id: "seat-1001", pcOrg: "PC 101 · North Metro", positionTitle: "Technician", office: "North Metro", affiliation: "Skyline Fiber Services", reportsToName: "Jordan Ellis", startDate: "2026-04-06", endDate: null, seatType: "FIELD", status: "active", isPrimary: true, isIncomplete: false },
    activeAssignmentCount: 1,
    itgAssigned: true,
    appAccessStatus: "active",
    enteredBy: "Contractor",
    updatedAt: "Aug 14, 2026",
    jobsDisplay: "34 jobs · 24 installs · 7 TCs · 3 SROs",
    metricValues: buildMetrics([72, 93.2, 94.4, 4.8, 95.1, 96.3, 3.9, 2.7, 94.6]),
  },
  {
    id: "demo-1002",
    fullName: "Alana Brooks",
    legalName: "Alana Marie Brooks",
    preferredName: "Alana",
    status: "onboarding",
    techId: "",
    fuseEmployeeId: "F-92107",
    ntLogin: "",
    csgId: "",
    mobile: "(555) 010-1102",
    email: "alana.brooks@example.test",
    companyId: "skyline",
    companyName: "Skyline Fiber Services",
    prospectingAffiliation: "Skyline Fiber Services",
    onboardingOrg: "PC 101 · North Metro",
    fuseStatus: "Badge/Creds Submitted",
    onboardingDate: "2026-08-04",
    daysInPipeline: 11,
    assignment: { id: "seat-1002", pcOrg: "PC 101 · North Metro", positionTitle: "Technician", office: "North Metro", affiliation: "Skyline Fiber Services", reportsToName: null, startDate: "2026-08-18", endDate: null, seatType: "TRAINING", status: "pending", isPrimary: true, isIncomplete: true },
    activeAssignmentCount: 0,
    itgAssigned: true,
    appAccessStatus: "invited_pending",
    enteredBy: "ITG",
    updatedAt: "Aug 15, 2026",
    jobsDisplay: "No production jobs",
    metricValues: buildMetrics([]),
  },
  {
    id: "demo-1003",
    fullName: "Devon Kim",
    legalName: "Devon Kim",
    preferredName: "Devon",
    status: "active",
    techId: "",
    fuseEmployeeId: "",
    ntLogin: "DKIM",
    csgId: "",
    mobile: "(555) 010-1103",
    email: "devon.kim@example.test",
    companyId: "skyline",
    companyName: "Skyline Fiber Services",
    prospectingAffiliation: "Skyline Fiber Services",
    onboardingOrg: "PC 101 · North Metro",
    fuseStatus: null,
    onboardingDate: null,
    daysInPipeline: null,
    assignment: { id: "seat-1003", pcOrg: "Skyline Internal", positionTitle: "Warehouse Coordinator", office: "Skyline Operations", affiliation: "Skyline Fiber Services", reportsToName: "Carmen Diaz", startDate: "2025-11-03", endDate: null, seatType: "SUPPORT", status: "active", isPrimary: true, isIncomplete: false },
    activeAssignmentCount: 1,
    itgAssigned: false,
    appAccessStatus: "active",
    enteredBy: "Contractor",
    updatedAt: "Aug 10, 2026",
    jobsDisplay: "Not a production seat",
    metricValues: buildMetrics([]),
  },
  {
    id: "demo-1004",
    fullName: "Priya Shah",
    legalName: "Priya N. Shah",
    preferredName: "Priya",
    status: "active",
    techId: "T-41108",
    fuseEmployeeId: "F-91988",
    ntLogin: "PSHAH08",
    csgId: "CSG-6077",
    mobile: "(555) 010-1104",
    email: "priya.shah@example.test",
    companyId: "skyline",
    companyName: "Skyline Fiber Services",
    prospectingAffiliation: "Skyline Fiber Services",
    onboardingOrg: "PC 207 · East Region",
    fuseStatus: null,
    onboardingDate: null,
    daysInPipeline: null,
    assignment: { id: "seat-1004", pcOrg: "Other Client · East Region", positionTitle: "Technician", office: "East Region", affiliation: "Skyline Fiber Services", reportsToName: "Carmen Diaz", startDate: "2026-02-09", endDate: null, seatType: "FIELD", status: "active", isPrimary: true, isIncomplete: false },
    activeAssignmentCount: 1,
    itgAssigned: false,
    appAccessStatus: "active",
    enteredBy: "Contractor",
    updatedAt: "Aug 12, 2026",
    jobsDisplay: "Private other-client production",
    metricValues: buildMetrics([65, 88.4, 90.1, 8.1, 91.2, 94.6, 6.4, 4.2, 89.9]),
  },
  {
    id: "demo-2001",
    fullName: "Luis Ortega",
    legalName: "Luis Miguel Ortega",
    preferredName: "Luis",
    status: "active",
    techId: "T-52014",
    fuseEmployeeId: "F-92241",
    ntLogin: "LORTEGA14",
    csgId: "CSG-7102",
    mobile: "(555) 010-2201",
    email: "luis.ortega@example.test",
    companyId: "fieldpath",
    companyName: "FieldPath Communications",
    prospectingAffiliation: "FieldPath Communications",
    onboardingOrg: "PC 205 · South Market",
    fuseStatus: null,
    onboardingDate: null,
    daysInPipeline: null,
    assignment: { id: "seat-2001", pcOrg: "PC 205 · South Market", positionTitle: "Technician", office: "South Market", affiliation: "FieldPath Communications", reportsToName: "Nina Patel", startDate: "2026-03-16", endDate: null, seatType: "FIELD", status: "active", isPrimary: true, isIncomplete: false },
    activeAssignmentCount: 1,
    itgAssigned: true,
    appAccessStatus: "active",
    enteredBy: "Contractor",
    updatedAt: "Aug 13, 2026",
    jobsDisplay: "29 jobs · 19 installs · 8 TCs · 2 SROs",
    metricValues: buildMetrics([61, 86.5, 82.2, 10.7, 88.9, 92.1, 7.8, 5.1, 87.4]),
  },
  {
    id: "demo-2002",
    fullName: "Renee Foster",
    legalName: "Renee A. Foster",
    preferredName: "Renee",
    status: "onboarding",
    techId: "",
    fuseEmployeeId: "F-92403",
    ntLogin: "",
    csgId: "",
    mobile: "(555) 010-2202",
    email: "renee.foster@example.test",
    companyId: "fieldpath",
    companyName: "FieldPath Communications",
    prospectingAffiliation: "FieldPath Communications",
    onboardingOrg: "PC 205 · South Market",
    fuseStatus: "Drug & Background Sent",
    onboardingDate: "2026-08-12",
    daysInPipeline: 3,
    assignment: { id: "seat-2002", pcOrg: "PC 205 · South Market", positionTitle: "Technician", office: "", affiliation: "FieldPath Communications", reportsToName: null, startDate: "2026-08-25", endDate: null, seatType: "TRAINING", status: "pending", isPrimary: true, isIncomplete: true },
    activeAssignmentCount: 0,
    itgAssigned: true,
    appAccessStatus: "invite_available",
    enteredBy: "ITG",
    updatedAt: "Aug 15, 2026",
    jobsDisplay: "No production jobs",
    metricValues: buildMetrics([]),
  },
  {
    id: "demo-2003",
    fullName: "Jon Bell",
    legalName: "Jonathan Bell",
    preferredName: "Jon",
    status: "inactive",
    techId: "T-51904",
    fuseEmployeeId: "F-90022",
    ntLogin: "JBELL04",
    csgId: "CSG-6994",
    mobile: "(555) 010-2203",
    email: "jon.bell@example.test",
    companyId: "fieldpath",
    companyName: "FieldPath Communications",
    prospectingAffiliation: "FieldPath Communications",
    onboardingOrg: "PC 205 · South Market",
    fuseStatus: "Terminated",
    onboardingDate: "2025-10-20",
    daysInPipeline: null,
    assignment: { id: "seat-2003", pcOrg: "PC 205 · South Market", positionTitle: "Supervisor", office: "South Market", affiliation: "FieldPath Communications", reportsToName: "Nina Patel", startDate: "2025-11-03", endDate: "2026-07-28", seatType: "LEADERSHIP", status: "inactive", isPrimary: true, isIncomplete: false },
    activeAssignmentCount: 0,
    itgAssigned: false,
    appAccessStatus: "active",
    enteredBy: "Legacy unknown",
    updatedAt: "Jul 28, 2026",
    jobsDisplay: "No current production",
    metricValues: buildMetrics([58, 84.2, 79.8, 14.2, 82.1, 88.7, 9.8, 6.9, 83.4]),
  },
];

export const ITF_PERSON_STATUSES: DemoPersonStatus[] = [
  "active",
  "inactive",
  "onboarding",
  "onboarding_closed",
];

export const ITF_SEAT_TYPES: Array<{ value: DemoSeatType; label: string }> = [
  { value: "FIELD", label: "Field" },
  { value: "LEADERSHIP", label: "Leadership" },
  { value: "SUPPORT", label: "Support" },
  { value: "TRAVEL", label: "Travel Tech" },
  { value: "DROP_BURY", label: "Drop Bury" },
  { value: "TRAINING", label: "Training" },
  { value: "FMLA", label: "FMLA" },
];

export const ITF_FUSE_STATUSES: DemoFuseStatus[] = [
  "Started",
  "DT Pass/Pending BG",
  "Pending D&B",
  "Pending DT/BG Pass",
  "Drug & Background Sent",
  "Badge/Creds Submitted",
  "Ready for Badge/Creds",
  "Consent Forms Pending Return",
  "Not Hiring",
  "Not Qualified",
  "Terminated",
];
