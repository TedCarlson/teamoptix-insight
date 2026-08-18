"use client";

import { useEffect, useMemo, useState } from "react";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader } from "@/features/ui/workspace";
import {
  ITF_DEMO_METRICS,
  ITF_DEMO_PERSPECTIVES,
  ITF_FUSE_STATUSES,
  ITF_PERSON_STATUSES,
  ITF_SEAT_TYPES,
  ITG_DEMO_COMPANIES,
  ITG_DEMO_PEOPLE,
  type DemoFuseStatus,
  type DemoMetricBand,
  type DemoPerson,
  type DemoPersonStatus,
  type DemoPerspective,
  type DemoSeatType,
} from "./itgDemoData";
import styles from "./itg-product-studio.module.css";

type StudioPage = "home" | "metrics" | "people" | "workforce" | "operations" | "reports";
type ReportAudience = "client" | "internal";
type MetricsProfile = "NSR" | "SMART";
type MetricsRange = "FM" | "PREVIOUS" | "3FM" | "12FM";
type OperationModuleId = "booking" | "dispatch" | "route_lock" | "field_log";
type OperationAccess = "manage" | "self" | "grant" | "unavailable";
type UploadDestinationId = "auto" | "metrics" | "route_lock_check_in" | "route_lock_shift_validation";
type DemoMessage = {
  id: string;
  title: string;
  body: string;
  visibility: "all" | "drivers" | "leadership";
  requires_ack: boolean;
  published_at: string;
  acknowledged: boolean;
};

type UploadInspection = {
  sheetName: string;
  headerRow: number;
  rowCount: number;
  detectedTarget: Exclude<UploadDestinationId, "auto"> | null;
  headers: string[];
};

const pageLabels: Array<{ id: StudioPage; label: string }> = [
  { id: "home", label: "Home" },
  { id: "metrics", label: "Metrics" },
  { id: "people", label: "People" },
  { id: "workforce", label: "Workforce" },
  { id: "operations", label: "Operations" },
  { id: "reports", label: "Reports" },
];

const operationModules: Array<{
  id: OperationModuleId;
  label: string;
  eyebrow: string;
  description: string;
  destinations: string[];
}> = [
  {
    id: "booking",
    label: "Booking & Schedule",
    eyebrow: "Plan the workforce",
    description: "Baseline schedule, booking view, and the technician's personal schedule in one planning area.",
    destinations: ["Baseline Schedule", "Booking View", "Technician Schedule"],
  },
  {
    id: "dispatch",
    label: "Dispatch",
    eyebrow: "Operate today",
    description: "The current dispatch console and its established operational event types.",
    destinations: ["CALL_OUT", "ADD_IN", "BP_LOW", "INCIDENT", "NOTE", "TECH_MOVE"],
  },
  {
    id: "route_lock",
    label: "Route Lock",
    eyebrow: "Control capacity",
    description: "Quota, planned schedule, built validation, actual check-in, reporting, exceptions, and setup.",
    destinations: ["Lock Summary", "Lock Report", "OTA", "Tech Route History", "Exceptions", "Shift Validations", "Check-In Uploads", "Manage Quota", "Manage Routes"],
  },
  {
    id: "field_log",
    label: "Field Log",
    eyebrow: "Capture and resolve",
    description: "Submission, review, cases, tNPS, audit, technician follow-up, and supporting evidence.",
    destinations: ["Snapshot", "New Field Log", "My Work", "Review Queue", "New Drop Packets", "Case Management", "tNPS Records", "Audit Queue"],
  },
];

const ITF_DEMO_MESSAGES: DemoMessage[] = [
  {
    id: "message-1",
    title: "North Metro safety call",
    body: "All assigned technicians should join the 7:30 AM safety call before first dispatch.",
    visibility: "all",
    requires_ack: true,
    published_at: "2026-08-15T12:15:00.000Z",
    acknowledged: false,
  },
  {
    id: "message-2",
    title: "Updated repeat-work focus",
    body: "Review the current Repeat and Rework signals with your supervisor before accepting an assist.",
    visibility: "drivers",
    requires_ack: true,
    published_at: "2026-08-14T19:45:00.000Z",
    acknowledged: false,
  },
  {
    id: "message-3",
    title: "Contractor onboarding review",
    body: "Leadership review is scheduled for the open FUSE and incomplete-assignment exceptions.",
    visibility: "leadership",
    requires_ack: false,
    published_at: "2026-08-14T14:00:00.000Z",
    acknowledged: false,
  },
];

const uploadDestinations: Array<{
  id: Exclude<UploadDestinationId, "auto">;
  label: string;
  allocation: string;
  mappings: string[];
}> = [
  {
    id: "metrics",
    label: "Metrics scorecard",
    allocation: "Metrics · staged scorecard batch",
    mappings: ["TechId → reported_tech_id", "Metric columns → raw_payload", "Selected date → metric_date", "Fiscal calendar → fiscal_end_date"],
  },
  {
    id: "route_lock_check_in",
    label: "Route Lock check-in",
    allocation: "Operations · Route Lock · Check-In",
    mappings: ["Tech # → tech_id", "Job # → job_num", "CP Date → cp_date", "Work Order Number → work_order_number"],
  },
  {
    id: "route_lock_shift_validation",
    label: "Route Lock shift validation",
    allocation: "Operations · Route Lock · Shift Validation",
    mappings: ["Tech # → tech_num", "Shift Date → shift_date", "Shift Type → shift_type", "Work Units → work_units"],
  },
];

const CONTRACTOR_PERSPECTIVES = new Set<DemoPerspective>(["bp_owner", "bp_supervisor"]);

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function sourceLabel(person: DemoPerson) {
  if (person.enteredBy === "Legacy unknown") return "Legacy source unknown";
  return person.enteredBy === "ITG" ? "ITG added" : "Contractor added";
}

function bandLabel(band: DemoMetricBand) {
  if (band === "EXCEEDS") return "Exceeds";
  if (band === "MEETS") return "Meets";
  if (band === "NEEDS_IMPROVEMENT") return "Needs Improvement";
  if (band === "MISSES") return "Misses";
  return "No Data";
}

function metricSignalClass(band: DemoMetricBand) {
  if (band === "EXCEEDS" || band === "MEETS") return styles.signalReady;
  if (band === "NEEDS_IMPROVEMENT") return styles.signalProgress;
  if (band === "MISSES") return styles.signalBlocked;
  return styles.signalMuted;
}

function statusSignalClass(person: DemoPerson) {
  if (person.assignment.isIncomplete) return styles.signalBlocked;
  if (person.status === "onboarding" || person.assignment.status === "pending") return styles.signalProgress;
  if (person.status === "active" && person.assignment.status === "active") return styles.signalReady;
  return styles.signalMuted;
}

function formatMetric(metricKey: string, value: number | null) {
  if (value == null) return "—";
  return metricKey.includes("tnps") ? Math.round(value).toString() : `${value.toFixed(1)}%`;
}

function metricFor(person: DemoPerson, key: string) {
  return person.metricValues.find((metric) => metric.key === key) ?? { key, value: null, band: "NO_DATA" as DemoMetricBand };
}

function aggregateMetric(people: DemoPerson[], key: string) {
  const values = people.map((person) => metricFor(person, key).value).filter((value): value is number => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scopePeople(people: DemoPerson[], perspective: DemoPerspective, contractorId: string) {
  if (perspective === "platform_admin") return people;
  if (perspective === "technician") return people.filter((person) => person.id === "demo-1001");
  if (CONTRACTOR_PERSPECTIVES.has(perspective)) return people.filter((person) => person.companyId === contractorId);
  if (perspective === "company_supervisor") return people.filter((person) => person.itgAssigned && person.assignment.pcOrg.includes("North Metro"));
  return people.filter((person) => person.itgAssigned);
}

function operationAccess(perspective: DemoPerspective, module: OperationModuleId): OperationAccess {
  if (perspective === "technician") {
    return module === "booking" || module === "field_log" ? "self" : "unavailable";
  }
  if (module === "route_lock" && perspective !== "platform_admin") return "grant";
  return "manage";
}

function operationAccessLabel(access: OperationAccess) {
  if (access === "manage") return "Available";
  if (access === "self") return "My authorized view";
  if (access === "grant") return "Route Lock grant";
  return "Not in role scope";
}

function normalizeUploadHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectUploadTarget(rows: unknown[][]) {
  for (let index = 0; index < Math.min(rows.length, 14); index += 1) {
    const headers = (rows[index] ?? []).map((value) => String(value ?? "").trim());
    const normalized = new Set(headers.map(normalizeUploadHeader).filter(Boolean));
    const has = (...keys: string[]) => keys.every((key) => normalized.has(normalizeUploadHeader(key)));

    if (has("Tech #", "Shift Date", "Shift Type")) {
      return { target: "route_lock_shift_validation" as const, headerRow: index, headers };
    }
    if (has("Tech #", "Job #", "CP Date")) {
      return { target: "route_lock_check_in" as const, headerRow: index, headers };
    }
    if (normalized.has("techid")) {
      return { target: "metrics" as const, headerRow: index, headers };
    }
  }

  return { target: null, headerRow: 0, headers: (rows[0] ?? []).map((value) => String(value ?? "").trim()) };
}

async function inspectUploadFile(file: File): Promise<UploadInspection> {
  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet was found in this source file.");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (!rows.length) throw new Error("The first worksheet is empty.");
  const detected = detectUploadTarget(rows);
  const rowCount = rows.slice(detected.headerRow + 1).filter((row) => row.some((value) => String(value ?? "").trim())).length;
  return { sheetName, headerRow: detected.headerRow + 1, rowCount, detectedTarget: detected.target, headers: detected.headers.filter(Boolean) };
}

function blankPerson(companyId: string, enteredBy: "ITG" | "Contractor"): DemoPerson {
  const company = ITG_DEMO_COMPANIES.find((item) => item.id === companyId) ?? ITG_DEMO_COMPANIES[1];
  return {
    id: `draft-${Date.now()}`,
    fullName: "",
    legalName: "",
    preferredName: "",
    status: "onboarding",
    techId: "",
    fuseEmployeeId: "",
    ntLogin: "",
    csgId: "",
    mobile: "",
    email: "",
    companyId: company.id,
    companyName: company.name,
    prospectingAffiliation: company.name,
    onboardingOrg: "PC 101 · North Metro",
    fuseStatus: "Started",
    onboardingDate: "2026-08-15",
    daysInPipeline: 0,
    assignment: {
      id: `seat-${Date.now()}`,
      pcOrg: "PC 101 · North Metro",
      positionTitle: "Technician",
      office: "",
      affiliation: company.name,
      reportsToName: null,
      startDate: "2026-08-15",
      endDate: null,
      seatType: "TRAINING",
      status: "pending",
      isPrimary: true,
      isIncomplete: true,
    },
    activeAssignmentCount: 0,
    itgAssigned: enteredBy === "ITG",
    appAccessStatus: "invite_available",
    enteredBy,
    updatedAt: "Just now",
    jobsDisplay: "No production jobs",
    metricValues: ITF_DEMO_METRICS.map((metric) => ({ key: metric.key, value: null, band: "NO_DATA" })),
  };
}

export default function ItgProductStudio() {
  const [page, setPage] = useState<StudioPage>("home");
  const [perspective, setPerspective] = useState<DemoPerspective>("platform_admin");
  const [contractorId, setContractorId] = useState("skyline");
  const [people, setPeople] = useState<DemoPerson[]>(ITG_DEMO_PEOPLE);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DemoPersonStatus | "All">("All");
  const [ispId, setIspId] = useState("all");
  const [reportAudience, setReportAudience] = useState<ReportAudience>("client");
  const [metricsProfile, setMetricsProfile] = useState<MetricsProfile>("NSR");
  const [metricsRange, setMetricsRange] = useState<MetricsRange>("FM");
  const [editor, setEditor] = useState<DemoPerson | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [messages, setMessages] = useState<DemoMessage[]>(ITF_DEMO_MESSAGES);
  const [uploadOpen, setUploadOpen] = useState(false);

  const contractors = ITG_DEMO_COMPANIES.filter((company) => company.relationship === "Contractor");
  const canManageRecords = perspective !== "technician";
  const scopedPeople = useMemo(() => scopePeople(people, perspective, contractorId), [contractorId, people, perspective]);

  const contractorRoster = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const isRosterOwner = CONTRACTOR_PERSPECTIVES.has(perspective);
    return people.filter((person) => {
      if (perspective === "technician" && person.id !== "demo-1001") return false;
      if (perspective !== "technician" && person.companyId !== contractorId) return false;
      if (!isRosterOwner && perspective !== "platform_admin" && !person.itgAssigned) return false;
      if (status !== "All" && person.status !== status) return false;
      if (!needle) return true;
      return `${person.fullName} ${person.techId} ${person.fuseEmployeeId} ${person.assignment.positionTitle} ${person.email}`.toLowerCase().includes(needle);
    });
  }, [contractorId, people, perspective, query, status]);

  const itgWorkforce = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopedPeople.filter((person) => {
      if (!person.itgAssigned) return false;
      if (ispId !== "all" && person.companyId !== ispId) return false;
      if (status !== "All" && person.status !== status) return false;
      if (!needle) return true;
      return `${person.fullName} ${person.techId} ${person.assignment.positionTitle} ${person.companyName} ${person.assignment.office}`.toLowerCase().includes(needle);
    });
  }, [ispId, query, scopedPeople, status]);

  const metricPeople = scopedPeople.filter((person) => person.itgAssigned && person.techId && person.metricValues.some((metric) => metric.value != null));

  function openPerson(person: DemoPerson, create = false) {
    setEditor({ ...person, assignment: { ...person.assignment }, metricValues: person.metricValues.map((metric) => ({ ...metric })) });
    setIsNew(create);
    setNotice(null);
  }

  function savePerson() {
    if (!editor || !editor.fullName.trim()) return;
    const company = ITG_DEMO_COMPANIES.find((item) => item.id === editor.companyId);
    const saved = {
      ...editor,
      companyName: company?.name ?? editor.companyName,
      prospectingAffiliation: company?.name ?? editor.prospectingAffiliation,
      assignment: { ...editor.assignment, affiliation: company?.name ?? editor.assignment.affiliation },
      updatedAt: "Just now",
    };
    setPeople((current) => isNew ? [saved, ...current] : current.map((person) => person.id === saved.id ? saved : person));
    setEditor(null);
    setNotice("Demo change saved in this browser session only.");
  }

  function resetDemo() {
    setPeople(ITG_DEMO_PEOPLE);
    setMessages(ITF_DEMO_MESSAGES);
    setQuery("");
    setStatus("All");
    setIspId("all");
    setNotice("Demo data reset. No database records were changed.");
  }

  function acknowledgeMessage(messageId: string) {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, acknowledged: true } : message));
    setNotice("Message acknowledged in this browser-session demo.");
  }

  function moveTo(nextPage: StudioPage, nextPerspective = perspective) {
    setPage(nextPage);
    setPerspective(nextPerspective);
    setQuery("");
    setStatus("All");
  }

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className={`workspace-main ${styles.studio}`}>
          <WorkspaceHeader
            eyebrow="TeamOptix · Products · Review studio"
            title="Insight — Telecom Fulfillment"
            description="The next interface for the working telecom fulfillment product, using its established People, Workforce, onboarding, and Metrics contracts."
            action={<div className={styles.headerActions}><button className={styles.uploadButton} type="button" onClick={() => setUploadOpen(true)}>Upload source</button><button className={styles.resetButton} type="button" onClick={resetDemo}>Reset demo</button></div>}
          />

          <section className={styles.safetyBar} aria-label="Demo safety status">
            <span className={styles.safetyDot} aria-hidden="true" />
            <strong>ITF review environment</strong>
            <span>Fictional values · donor-authentic fields · browser-session changes · no database writes</span>
          </section>

          <div className={styles.toolbar}>
            <nav className={styles.pageTabs} aria-label="Insight Telecom Fulfillment review pages">
              {pageLabels.map((item) => (
                <button className={page === item.id ? styles.tabActive : styles.tab} key={item.id} type="button" onClick={() => setPage(item.id)}>{item.label}</button>
              ))}
            </nav>

            <label className={styles.perspectivePicker}>
              <span>Preview access as</span>
              <select value={perspective} onChange={(event) => setPerspective(event.target.value as DemoPerspective)}>
                {ITF_DEMO_PERSPECTIVES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          {notice ? <div className={styles.notice}>{notice}</div> : null}

          {page === "home" ? <HomePage perspective={perspective} people={scopedPeople} metricPeople={metricPeople} messages={messages} onAcknowledge={acknowledgeMessage} onOpen={moveTo} /> : null}
          {page === "metrics" ? <MetricsPage perspective={perspective} people={metricPeople} profile={metricsProfile} range={metricsRange} onProfileChange={setMetricsProfile} onRangeChange={setMetricsRange} onOpenPerson={(person) => openPerson(person)} /> : null}
          {page === "people" ? <PeoplePage perspective={perspective} canManage={canManageRecords} contractorId={contractorId} contractors={contractors} roster={contractorRoster} query={query} status={status} onContractorChange={setContractorId} onQueryChange={setQuery} onStatusChange={setStatus} onOpenPerson={(person) => openPerson(person)} onAdd={() => openPerson(blankPerson(contractorId, CONTRACTOR_PERSPECTIVES.has(perspective) ? "Contractor" : "ITG"), true)} /> : null}
          {page === "workforce" ? <WorkforcePage perspective={perspective} canManage={canManageRecords} contractors={contractors} people={itgWorkforce} ispId={ispId} query={query} status={status} onIspChange={setIspId} onQueryChange={setQuery} onStatusChange={setStatus} onOpenPerson={(person) => openPerson(person)} onAdd={() => openPerson(blankPerson(ispId === "all" ? contractors[0].id : ispId, "ITG"), true)} /> : null}
          {page === "operations" ? <OperationsPage perspective={perspective} people={scopedPeople.filter((person) => person.itgAssigned)} /> : null}
          {page === "reports" ? <ReportsPage audience={reportAudience} people={scopedPeople.filter((person) => person.itgAssigned)} onAudienceChange={setReportAudience} /> : null}
        </section>
      </main>

      {editor ? <PersonOverlay person={editor} isNew={isNew} canEdit={canManageRecords} contractors={contractors} onChange={setEditor} onClose={() => setEditor(null)} onSave={savePerson} /> : null}
      {uploadOpen ? <UniversalUploadOverlay onClose={() => setUploadOpen(false)} /> : null}
    </TeamOptixShell>
  );
}

function HomePage(props: { perspective: DemoPerspective; people: DemoPerson[]; metricPeople: DemoPerson[]; messages: DemoMessage[]; onAcknowledge: (messageId: string) => void; onOpen: (page: StudioPage, perspective?: DemoPerspective) => void }) {
  const perspectiveLabel = ITF_DEMO_PERSPECTIVES.find((item) => item.value === props.perspective)?.label ?? "ITF user";
  const assigned = props.people.filter((person) => person.itgAssigned);
  const onboarding = assigned.filter((person) => person.status === "onboarding");
  const incomplete = assigned.filter((person) => person.assignment.isIncomplete);
  const missingAccess = assigned.filter((person) => person.appAccessStatus !== "active");
  const keyMetrics = ["tnps_score", "ftr_rate", "repeat_rate", "rework_rate"];

  return (
    <div className={styles.stack}>
      <section className={styles.homeHero}>
        <div>
          <p className={styles.eyebrow}>Insight — Telecom Fulfillment</p>
          <h2>{perspectiveLabel} home</h2>
          <p>PC 101 · North Metro <span>•</span> NSR <span>•</span> Current fiscal month</p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" onClick={() => props.onOpen("metrics")}>Open Metrics</button>
          <button type="button" onClick={() => props.onOpen("workforce")}>Open Workforce</button>
          <button type="button" onClick={() => props.onOpen("operations")}>Open Operations</button>
        </div>
      </section>

      <section className={styles.metricCards} aria-label="Current metric snapshot">
        {keyMetrics.map((key) => {
          const definition = ITF_DEMO_METRICS.find((metric) => metric.key === key)!;
          const value = aggregateMetric(props.metricPeople, key);
          return <article key={key}><span>{definition.label}</span><strong>{formatMetric(key, value)}</strong><small>{value == null ? "No eligible data" : `${props.metricPeople.length} eligible technician${props.metricPeople.length === 1 ? "" : "s"}`}</small></article>;
        })}
      </section>

      <section className={styles.homeGrid}>
        <article className={styles.surface}>
          <header className={styles.surfaceHeader}><div><p className={styles.eyebrow}>Work requiring attention</p><h2>Today</h2><p>Exceptions generated from the donor’s existing person, onboarding, assignment, and app-access states.</p></div></header>
          <div className={styles.attentionList}>
            <button type="button" onClick={() => props.onOpen("people")}><span className={styles.signalProgress}>{onboarding.length}</span><span><strong>Onboarding records</strong><small>FUSE pipeline status and onboarding org are available</small></span><b>Review →</b></button>
            <button type="button" onClick={() => props.onOpen("workforce")}><span className={styles.signalBlocked}>{incomplete.length}</span><span><strong>Incomplete assignments</strong><small>Office, position, Tech ID, or reports-to is missing</small></span><b>Resolve →</b></button>
            <button type="button" onClick={() => props.onOpen("workforce")}><span className={styles.signalProgress}>{missingAccess.length}</span><span><strong>App access not active</strong><small>Missing email, invite available, or invitation pending</small></span><b>Open →</b></button>
          </div>
        </article>

        <article className={styles.surface}>
          <header className={styles.surfaceHeader}><div><p className={styles.eyebrow}>Authorized scope</p><h2>Workforce</h2><p>The same page structure; the signed-in role changes only the permitted rows and actions.</p></div></header>
          <div className={styles.workforceMix}>
            {ITF_SEAT_TYPES.slice(0, 5).map((seat) => <div key={seat.value}><span>{seat.label}</span><strong>{assigned.filter((person) => person.assignment.seatType === seat.value).length}</strong></div>)}
          </div>
          <div className={styles.homeFoot}><span>{assigned.length} {assigned.length === 1 ? "person" : "people"} in scope</span><button type="button" onClick={() => props.onOpen("workforce")}>Review workforce →</button></div>
        </article>
      </section>

      <MessagesPanel perspective={props.perspective} messages={props.messages} onAcknowledge={props.onAcknowledge} />

      <section className={styles.foundationNote}>
        <strong>Page one contract</strong>
        <span>Context first → metric signal → exceptions → next action. Navigation stays the same across user classes; authorization changes the scope, detail, and actions.</span>
      </section>
    </div>
  );
}

function MessagesPanel(props: { perspective: DemoPerspective; messages: DemoMessage[]; onAcknowledge: (messageId: string) => void }) {
  const messages = props.messages.filter((message) => {
    if (props.perspective === "platform_admin") return true;
    if (props.perspective === "technician") return message.visibility === "all" || message.visibility === "drivers";
    return message.visibility === "all" || message.visibility === "leadership";
  });
  const unread = messages.filter((message) => message.requires_ack && !message.acknowledged).length;
  return (
    <section className={styles.surface}>
      <header className={styles.surfaceHeader}><div><p className={styles.eyebrow}>Company messages</p><h2>Messages</h2><p>Published broadcasts, role-targeted reminders, and required acknowledgment are visible directly on Home.</p></div><span className={unread ? styles.messageCount : styles.accessReady}>{unread ? `${unread} need acknowledgment` : "Caught up"}</span></header>
      <div className={styles.messageList}>
        {messages.map((message) => (
          <article className={message.acknowledged ? styles.messageAcknowledged : ""} key={message.id}>
            <div className={styles.messageMeta}><span>{message.visibility === "drivers" ? "Technician message" : message.visibility === "leadership" ? "Leadership message" : "Company message"}</span><time dateTime={message.published_at}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(message.published_at))}</time></div>
            <h3>{message.title}</h3>
            <p>{message.body}</p>
            <footer><span>{message.requires_ack ? message.acknowledged ? "Acknowledged" : "Acknowledgment required" : "For awareness"}</span>{message.requires_ack && !message.acknowledged ? <button type="button" onClick={() => props.onAcknowledge(message.id)}>Read & acknowledge</button> : null}</footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetricsPage(props: { perspective: DemoPerspective; people: DemoPerson[]; profile: MetricsProfile; range: MetricsRange; onProfileChange: (value: MetricsProfile) => void; onRangeChange: (value: MetricsRange) => void; onOpenPerson: (person: DemoPerson) => void }) {
  return (
    <section className={styles.surface}>
      <header className={styles.surfaceHeader}>
        <div><p className={styles.eyebrow}>Primary product surface</p><h2>Metrics</h2><p>Configured scorecard fields, range controls, bands, ranking, work mix, and authorized drill-down from the donor product.</p></div>
      </header>
      <div className={styles.filters}>
        <label><span>Metric profile</span><select value={props.profile} onChange={(event) => props.onProfileChange(event.target.value as MetricsProfile)}><option value="NSR">NSR</option><option value="SMART">SMART</option></select></label>
        <label><span>Range</span><select value={props.range} onChange={(event) => props.onRangeChange(event.target.value as MetricsRange)}><option value="FM">Current fiscal month</option><option value="PREVIOUS">Previous fiscal month</option><option value="3FM">3 fiscal months</option><option value="12FM">12 fiscal months</option></select></label>
        <label><span>Authorized scope</span><input value={`${ITF_DEMO_PERSPECTIVES.find((item) => item.value === props.perspective)?.label ?? "User"} · ${props.people.length} technician${props.people.length === 1 ? "" : "s"}`} readOnly /></label>
      </div>
      <section className={styles.metricCards}>
        {ITF_DEMO_METRICS.map((definition) => <article key={definition.key}><span>{definition.label}</span><strong>{formatMetric(definition.key, aggregateMetric(props.people, definition.key))}</strong><small>{definition.direction === "HIGHER" ? "Higher is favorable" : "Lower is favorable"}</small></article>)}
      </section>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Technician</th><th>ISP</th><th>Jobs</th>{ITF_DEMO_METRICS.map((metric) => <th key={metric.key}>{metric.label}</th>)}<th><span className={styles.srOnly}>Open</span></th></tr></thead>
          <tbody>
            {props.people.map((person, index) => <tr key={person.id}><td><button className={styles.personButton} type="button" onClick={() => props.onOpenPerson(person)}><span>{index + 1}</span><span><strong>{person.fullName}</strong><small>{person.techId}</small></span></button></td><td><strong>{person.companyName}</strong></td><td><span className={styles.cellDetail}>{person.jobsDisplay}</span></td>{ITF_DEMO_METRICS.map((definition) => { const metric = metricFor(person, definition.key); return <td key={definition.key}><span className={`${styles.metricValue} ${metricSignalClass(metric.band)}`} title={bandLabel(metric.band)}>{formatMetric(definition.key, metric.value)}</span></td>; })}<td><button className={styles.rowAction} type="button" onClick={() => props.onOpenPerson(person)} aria-label={`Open ${person.fullName}`}>→</button></td></tr>)}
            {!props.people.length ? <tr><td className={styles.empty} colSpan={13}>No metric-eligible technicians in this authorized scope.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type PeoplePageProps = { perspective: DemoPerspective; canManage: boolean; contractorId: string; contractors: typeof ITG_DEMO_COMPANIES; roster: DemoPerson[]; query: string; status: DemoPersonStatus | "All"; onContractorChange: (value: string) => void; onQueryChange: (value: string) => void; onStatusChange: (value: DemoPersonStatus | "All") => void; onOpenPerson: (person: DemoPerson) => void; onAdd: () => void };

function PeoplePage(props: PeoplePageProps) {
  const company = props.contractors.find((item) => item.id === props.contractorId) ?? props.contractors[0];
  const canSeeCompleteRoster = CONTRACTOR_PERSPECTIVES.has(props.perspective) || props.perspective === "platform_admin";
  return (
    <section className={styles.surface}>
      <header className={styles.surfaceHeader}><div><p className={styles.eyebrow}>Company-owned identity inventory</p><h2>People</h2><p>The donor’s identity, telecom identifiers, onboarding ownership, contact, and assignment count in one roster surface.</p></div>{props.canManage ? <button className={styles.primaryButton} type="button" onClick={props.onAdd}>Add person</button> : null}</header>
      {!canSeeCompleteRoster ? <div className={styles.scopeWarning}><strong>Private company rows are excluded.</strong><span>This perspective receives only its authorized engagement/self projection. The contractor’s complete roster remains private.</span></div> : null}
      <div className={styles.filters}>
        <label><span>Roster company</span><select value={props.contractorId} onChange={(event) => props.onContractorChange(event.target.value)}>{props.contractors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Search</span><input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="Name, Tech ID, FUSE ID, position, or email" /></label>
        <label><span>Person status</span><select value={props.status} onChange={(event) => props.onStatusChange(event.target.value as DemoPersonStatus | "All")}><option>All</option>{ITF_PERSON_STATUSES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
      </div>
      <div className={styles.summaryStrip}><div><strong>{props.roster.length}</strong><span>Shown</span></div><div><strong>{props.roster.filter((person) => person.status === "onboarding").length}</strong><span>Onboarding</span></div><div><strong>{props.roster.filter((person) => person.activeAssignmentCount > 0).length}</strong><span>Active assignments</span></div><p><strong>{company.shortName} owns its rows.</strong> ITG access comes from the assignment scope, not from global roster visibility.</p></div>
      <PeopleTable people={props.roster} mode="people" onOpen={props.onOpenPerson} />
    </section>
  );
}

type WorkforcePageProps = { perspective: DemoPerspective; canManage: boolean; contractors: typeof ITG_DEMO_COMPANIES; people: DemoPerson[]; ispId: string; query: string; status: DemoPersonStatus | "All"; onIspChange: (value: string) => void; onQueryChange: (value: string) => void; onStatusChange: (value: DemoPersonStatus | "All") => void; onOpenPerson: (person: DemoPerson) => void; onAdd: () => void };

function WorkforcePage(props: WorkforcePageProps) {
  return (
    <section className={styles.surface}>
      <header className={styles.surfaceHeader}><div><p className={styles.eyebrow}>Assignment-based operating view</p><h2>Workforce</h2><p>Only people explicitly assigned to the authorized telecom fulfillment scope, using the donor’s seat and assignment fields.</p></div>{props.canManage ? <button className={styles.primaryButton} type="button" onClick={props.onAdd}>Add on behalf of ISP</button> : null}</header>
      <div className={styles.filters}>
        <label><span>ISP / affiliation</span><select value={props.ispId} onChange={(event) => props.onIspChange(event.target.value)}><option value="all">All authorized ISPs</option>{props.contractors.filter((item) => item.status === "Active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Search</span><input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="Name, Tech ID, position, office, or ISP" /></label>
        <label><span>Person status</span><select value={props.status} onChange={(event) => props.onStatusChange(event.target.value as DemoPersonStatus | "All")}><option>All</option>{ITF_PERSON_STATUSES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
      </div>
      <div className={styles.summaryStrip}><div><strong>{props.people.length}</strong><span>In authorized scope</span></div><div><strong>{props.people.filter((person) => person.assignment.seatType === "FIELD").length}</strong><span>Field seats</span></div><div><strong>{props.people.filter((person) => person.assignment.isIncomplete).length}</strong><span>Incomplete</span></div><p><strong>Affiliation is the ISP selector.</strong> Source is an added ITF provenance requirement, distinct from donor assignment fields.</p></div>
      <PeopleTable people={props.people} mode="workforce" onOpen={props.onOpenPerson} />
    </section>
  );
}

function PeopleTable(props: { people: DemoPerson[]; mode: "people" | "workforce"; onOpen: (person: DemoPerson) => void }) {
  return (
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Person</th>{props.mode === "workforce" ? <th>ISP</th> : null}<th>Tech ID</th>{props.mode === "people" ? <th>FUSE ID</th> : null}<th>Status</th><th>{props.mode === "people" ? "FUSE onboarding" : "Seat / position"}</th>{props.mode === "workforce" ? <><th>Office</th><th>Reports to</th></> : null}<th>App access</th><th>Source</th><th><span className={styles.srOnly}>Open</span></th></tr></thead>
      <tbody>
        {props.people.map((person) => <tr key={person.id}><td><button className={styles.personButton} type="button" onClick={() => props.onOpen(person)}><span>{initials(person.fullName)}</span><span><strong>{person.fullName}</strong><small>{person.email || "No email"}</small></span></button></td>{props.mode === "workforce" ? <td><strong>{person.companyName}</strong></td> : null}<td>{person.techId || "—"}</td>{props.mode === "people" ? <td>{person.fuseEmployeeId || "—"}</td> : null}<td><span className={`${styles.signal} ${statusSignalClass(person)}`}>{titleCase(person.status)}</span></td><td>{props.mode === "people" ? <><strong>{person.fuseStatus ?? "—"}</strong>{person.daysInPipeline != null ? <small className={styles.cellDetail}>{person.daysInPipeline} days in pipeline</small> : null}</> : <><strong>{ITF_SEAT_TYPES.find((seat) => seat.value === person.assignment.seatType)?.label}</strong><small className={styles.cellDetail}>{person.assignment.positionTitle}</small></>}</td>{props.mode === "workforce" ? <><td>{person.assignment.office || "Missing"}</td><td>{person.assignment.reportsToName || "Missing"}</td></> : null}<td><span className={styles.lifecycle}>{titleCase(person.appAccessStatus)}</span></td><td><span className={styles.source}>{sourceLabel(person)}</span></td><td><button className={styles.rowAction} type="button" onClick={() => props.onOpen(person)} aria-label={`Open ${person.fullName}`}>→</button></td></tr>)}
        {!props.people.length ? <tr><td className={styles.empty} colSpan={props.mode === "workforce" ? 10 : 9}>No people match this authorized view.</td></tr> : null}
      </tbody>
    </table></div>
  );
}

function OperationsPage(props: { perspective: DemoPerspective; people: DemoPerson[] }) {
  const availableModules = operationModules.filter((module) => operationAccess(props.perspective, module.id) !== "unavailable");
  const [selectedId, setSelectedId] = useState<OperationModuleId>(availableModules[0]?.id ?? "booking");
  const effectiveSelectedId = operationAccess(props.perspective, selectedId) === "unavailable" ? availableModules[0]?.id ?? "booking" : selectedId;
  const selected = operationModules.find((module) => module.id === effectiveSelectedId) ?? availableModules[0] ?? operationModules[0];
  const selectedAccess = operationAccess(props.perspective, selected.id);
  const assigned = props.people.filter((person) => person.assignment.status === "active");
  const fieldSeats = assigned.filter((person) => person.assignment.seatType === "FIELD");
  const incomplete = props.people.filter((person) => person.assignment.isIncomplete);

  const signals: Record<OperationModuleId, Array<{ label: string; value: string; detail: string }>> = {
    booking: [
      { label: "Assigned", value: String(assigned.length), detail: "active assignment status" },
      { label: "Field seats", value: String(fieldSeats.length), detail: "FIELD seat type" },
      { label: "Needs resolution", value: String(incomplete.length), detail: "incomplete assignment" },
    ],
    dispatch: [
      { label: "Call-outs", value: "2", detail: "CALL_OUT" },
      { label: "Add-ins", value: "1", detail: "ADD_IN" },
      { label: "Open incident", value: "1", detail: "INCIDENT" },
    ],
    route_lock: [
      { label: "Quota routes", value: "18", detail: "quota_routes" },
      { label: "Lock eligible", value: "16", detail: "planned and eligible" },
      { label: "Route gap", value: "2", detail: "exception exposure" },
    ],
    field_log: [
      { label: "Review queue", value: "3", detail: "submitted records" },
      { label: "Open cases", value: "2", detail: "case management" },
      { label: "Follow-up", value: "1", detail: "technician action" },
    ],
  };

  return (
    <div className={styles.stack}>
      <section className={styles.surface}>
        <header className={styles.surfaceHeader}>
          <div><p className={styles.eyebrow}>One operating destination</p><h2>Operations</h2><p>Booking, Dispatch, Route Lock, and Field Log stay intact as working modules without competing for the primary navigation.</p></div>
          <span className={styles.scopeBadge}>{ITF_DEMO_PERSPECTIVES.find((item) => item.value === props.perspective)?.label} scope</span>
        </header>
        <div className={styles.operationModules}>
          {operationModules.map((module) => {
            const access = operationAccess(props.perspective, module.id);
            const unavailable = access === "unavailable";
            return (
              <button
                className={`${styles.operationModule} ${selected.id === module.id ? styles.operationModuleActive : ""} ${unavailable ? styles.operationModuleUnavailable : ""}`}
                key={module.id}
                type="button"
                disabled={unavailable}
                onClick={() => setSelectedId(module.id)}
              >
                <span>{module.eyebrow}</span>
                <strong>{module.label}</strong>
                <small>{module.description}</small>
                <b>{operationAccessLabel(access)}</b>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.operationWorkspace}>
        <header>
          <div><p className={styles.eyebrow}>Fictional operational snapshot</p><h2>{selected.label}</h2><p>{selected.description}</p></div>
          <span className={selectedAccess === "grant" ? styles.accessGrant : styles.accessReady}>{operationAccessLabel(selectedAccess)}</span>
        </header>
        <div className={styles.operationSignals}>
          {signals[selected.id].map((signal) => <article key={signal.label}><span>{signal.label}</span><strong>{signal.value}</strong><small>{signal.detail}</small></article>)}
        </div>
        <div className={styles.operationBody}>
          <div>
            <p className={styles.eyebrow}>Module destinations</p>
            <div className={styles.destinationList}>{selected.destinations.map((destination) => <span key={destination}>{destination}</span>)}</div>
          </div>
          <aside>
            <strong>{selected.id === "route_lock" ? "Quota → planned schedule → built validation → actual check-in" : "One module, one working context"}</strong>
            <p>{selectedAccess === "grant" ? "The page remains part of Operations, but its data and actions open only when the Route Lock grant is present." : "The signed-in role determines available records, detail, and actions. The primary product navigation remains stable."}</p>
          </aside>
        </div>
      </section>

      <section className={styles.foundationNote}><strong>Structural decision</strong><span>Operations is a capability family, not a replacement for the donor modules. Each proven workflow can be migrated independently behind this single entry.</span></section>
    </div>
  );
}

function ReportsPage(props: { audience: ReportAudience; people: DemoPerson[]; onAudienceChange: (value: ReportAudience) => void }) {
  const groups = ITG_DEMO_COMPANIES.filter((company) => company.relationship === "Contractor" && props.people.some((person) => person.companyId === company.id));
  return (
    <section className={styles.surface}>
      <header className={styles.surfaceHeader}><div><p className={styles.eyebrow}>Secured report projections</p><h2>Metrics by ISP</h2><p>The same configured KPI family, deliberately projected for either a client audience or ITG’s internal operating audience.</p></div><div className={styles.audienceToggle} aria-label="Report audience"><button className={props.audience === "client" ? styles.audienceActive : ""} type="button" onClick={() => props.onAudienceChange("client")}>Client report</button><button className={props.audience === "internal" ? styles.audienceActive : ""} type="button" onClick={() => props.onAudienceChange("internal")}>ITG internal</button></div></header>
      <div className={styles.reportBanner}><span>{props.audience === "client" ? "Client-safe projection" : "Internal operating projection"}</span><strong>{props.audience === "client" ? "Configured customer labels and aggregate values; no contact, app-access, or source detail" : "Authorized technician detail, exceptions, and provenance"}</strong></div>
      <div className={styles.reportGroups}>
        {groups.map((company) => { const members = props.people.filter((person) => person.companyId === company.id); const eligible = members.filter((person) => person.metricValues.some((metric) => metric.value != null)); return <article className={styles.reportGroup} key={company.id}><header><div><span>{company.shortName.slice(0, 2).toUpperCase()}</span><div><h3>{company.name}</h3><p>{members.length} assigned · {eligible.length} metric eligible</p></div></div><strong>{formatMetric("ftr_rate", aggregateMetric(eligible, "ftr_rate"))} FTR</strong></header><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{props.audience === "client" ? "ISP group" : "Technician"}</th>{ITF_DEMO_METRICS.slice(0, 6).map((metric) => <th key={metric.key}>{metric.customerLabel}</th>)}{props.audience === "internal" ? <><th>App access</th><th>Source</th></> : null}</tr></thead><tbody>{props.audience === "client" ? <tr><td><strong>{company.name}</strong></td>{ITF_DEMO_METRICS.slice(0, 6).map((metric) => <td key={metric.key}>{formatMetric(metric.key, aggregateMetric(eligible, metric.key))}</td>)}</tr> : eligible.map((person) => <tr key={person.id}><td><strong>{person.fullName}</strong><small className={styles.cellDetail}>{person.techId}</small></td>{ITF_DEMO_METRICS.slice(0, 6).map((definition) => { const metric = metricFor(person, definition.key); return <td key={definition.key}><span className={`${styles.metricValue} ${metricSignalClass(metric.band)}`}>{formatMetric(definition.key, metric.value)}</span></td>; })}<td>{titleCase(person.appAccessStatus)}</td><td>{sourceLabel(person)}</td></tr>)}</tbody></table></div></article>; })}
      </div>
    </section>
  );
}

function UniversalUploadOverlay(props: { onClose: () => void }) {
  const [target, setTarget] = useState<UploadDestinationId>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<UploadInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { onClose } = props;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  async function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setInspection(null);
    setError(null);
    if (!nextFile) return;
    setBusy(true);
    try {
      setInspection(await inspectUploadFile(nextFile));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The source file could not be inspected.");
    } finally {
      setBusy(false);
    }
  }

  function loadSafeSample() {
    const csv = [
      "Tech #,Job #,CP Date,Work Order Number,Job Type,Job Units",
      "1001,88001,08/15/2026,WO-501,INSTALL,4",
      "1002,88002,08/15/2026,WO-502,REPAIR,2",
    ].join("\n");
    void selectFile(new File([csv], "north-metro-check-in-demo.csv", { type: "text/csv" }));
  }

  const resolvedTarget = target === "auto" ? inspection?.detectedTarget ?? null : target;
  const destination = uploadDestinations.find((item) => item.id === resolvedTarget) ?? null;

  return (
    <div className={styles.overlayBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`${styles.overlay} ${styles.uploadOverlay}`} role="dialog" aria-modal="true" aria-labelledby="itf-upload-title">
        <header className={styles.overlayHeader}><div><p className={styles.eyebrow}>Universal product seam</p><h2 id="itf-upload-title">Upload a source file</h2><p>One doorway inspects the source, selects a registered parser, normalizes its fields, and prepares allocation to the authorized product destination.</p></div><button type="button" onClick={onClose} aria-label="Close upload overlay">×</button></header>
        <div className={styles.overlayBody}>
          <section className={styles.uploadContract}><strong>Safe review behavior</strong><span>The browser reads this file only to prove inspection and allocation. It is not transmitted, stored, or written to a database.</span></section>
          <div className={styles.uploadSetup}>
            <label><span>Requested destination</span><select value={target} onChange={(event) => setTarget(event.target.value as UploadDestinationId)}><option value="auto">Detect from source structure</option>{uploadDestinations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button className={styles.sampleUploadButton} type="button" onClick={loadSafeSample}>Try donor-shaped check-in sample</button></label>
            <label className={styles.dropZone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files?.[0] ?? null); }}><strong>{busy ? "Inspecting source…" : file ? file.name : "Choose or drop a source file"}</strong><span>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · ${file.type || "workbook"}` : "XLSX, XLS, or CSV · source remains in this browser"}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} /></label>
          </div>
          {error ? <div className={styles.uploadError}>{error}</div> : null}
          <section className={styles.uploadPipeline}>
            <article className={file ? styles.uploadStageReady : ""}><span>1</span><div><strong>Read source</strong><small>{file ? file.name : "Waiting for a source file"}</small></div></article>
            <article className={inspection ? styles.uploadStageReady : ""}><span>2</span><div><strong>Parse structure</strong><small>{inspection ? `${inspection.sheetName} · header row ${inspection.headerRow} · ${inspection.rowCount} source rows` : "Workbook and header inspection"}</small></div></article>
            <article className={destination ? styles.uploadStageReady : ""}><span>3</span><div><strong>Normalize fields</strong><small>{destination ? destination.mappings.join(" · ") : inspection ? "Choose a destination; the source shape is not recognized yet" : "Destination parser controls the mapping"}</small></div></article>
            <article className={destination ? styles.uploadStageReady : ""}><span>4</span><div><strong>Allocate target</strong><small>{destination ? destination.allocation : "No allocation selected"}</small></div></article>
          </section>
          {inspection ? <section className={styles.inspectionDetail}><div><p className={styles.eyebrow}>Inspection result</p><h3>{destination?.label ?? "Unrecognized source structure"}</h3><p>{inspection.headers.slice(0, 10).join(" · ") || "No header labels detected"}</p></div><span>{target !== "auto" && inspection.detectedTarget && inspection.detectedTarget !== target ? "Operator override" : inspection.detectedTarget ? "Structure detected" : "Destination required"}</span></section> : null}
        </div>
        <footer className={styles.overlayFooter}><p>Production conversion will preserve artifact lineage and require an authorized confirmation before normalized facts are allocated.</p><div>{file ? <button type="button" onClick={() => void selectFile(null)}>Clear source</button> : null}<button className={styles.primaryButton} type="button" onClick={onClose}>Close preview</button></div></footer>
      </section>
    </div>
  );
}

function PersonOverlay(props: { person: DemoPerson; isNew: boolean; canEdit: boolean; contractors: typeof ITG_DEMO_COMPANIES; onChange: (person: DemoPerson) => void; onClose: () => void; onSave: () => void }) {
  const person = props.person;
  const { onClose } = props;
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; window.addEventListener("keydown", onKeyDown); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); }; }, [onClose]);
  function patch(next: Partial<DemoPerson>) { props.onChange({ ...person, ...next }); }
  function patchAssignment(next: Partial<DemoPerson["assignment"]>) { props.onChange({ ...person, assignment: { ...person.assignment, ...next } }); }
  return (
    <div className={styles.overlayBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="itf-person-overlay-title">
        <header className={styles.overlayHeader}><div><p className={styles.eyebrow}>{props.isNew ? "New demo person" : "Person and workforce record"}</p><h2 id="itf-person-overlay-title">{person.fullName || "Add a person"}</h2><p>{person.enteredBy === "ITG" ? "ITG is acting on behalf of the roster-owning contractor." : `${person.companyName} owns this roster record.`}</p></div><button type="button" onClick={props.onClose} aria-label="Close person overlay">×</button></header>
        <div className={styles.overlayBody}>
          <section className={styles.nextAction}><span>Record state</span><div><strong>{person.assignment.isIncomplete ? "Assignment is incomplete" : person.fuseStatus ? `FUSE: ${person.fuseStatus}` : "No current onboarding exception"}</strong><small>Person status, FUSE status, and assignment completeness remain distinct donor signals.</small></div></section>
          {!props.canEdit ? <div className={styles.readOnlyNotice}>Technician access is read-only. The record uses the same overlay without management actions.</div> : null}
          <fieldset className={styles.formGrid} disabled={!props.canEdit}>
            <section><header><span>1</span><div><h3>Identity</h3><p>Core person record</p></div></header><label><span>Full name</span><input value={person.fullName} onChange={(event) => patch({ fullName: event.target.value })} /></label><label><span>Legal name</span><input value={person.legalName} onChange={(event) => patch({ legalName: event.target.value })} /></label><label><span>Preferred name</span><input value={person.preferredName} onChange={(event) => patch({ preferredName: event.target.value })} /></label><label><span>Person status</span><select value={person.status} onChange={(event) => patch({ status: event.target.value as DemoPersonStatus })}>{ITF_PERSON_STATUSES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label></section>
            <section><header><span>2</span><div><h3>Telecom identifiers and contact</h3><p>Existing donor identity fields</p></div></header><div className={styles.twoColumnFields}><label><span>Tech ID</span><input value={person.techId} onChange={(event) => patch({ techId: event.target.value })} /></label><label><span>FUSE employee ID</span><input value={person.fuseEmployeeId} onChange={(event) => patch({ fuseEmployeeId: event.target.value })} /></label><label><span>NT login</span><input value={person.ntLogin} onChange={(event) => patch({ ntLogin: event.target.value })} /></label><label><span>CSG ID</span><input value={person.csgId} onChange={(event) => patch({ csgId: event.target.value })} /></label></div><label><span>Mobile</span><input value={person.mobile} onChange={(event) => patch({ mobile: event.target.value })} /></label><label><span>Email</span><input value={person.email} onChange={(event) => patch({ email: event.target.value })} /></label></section>
            <section><header><span>3</span><div><h3>Onboarding</h3><p>Ownership and FUSE pipeline</p></div></header><label><span>Prospecting affiliation</span><select value={person.companyId} onChange={(event) => { const company = props.contractors.find((item) => item.id === event.target.value); patch({ companyId: event.target.value, companyName: company?.name ?? person.companyName, prospectingAffiliation: company?.name ?? person.prospectingAffiliation }); }}>{props.contractors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Onboarding org</span><input value={person.onboardingOrg} onChange={(event) => patch({ onboardingOrg: event.target.value })} /></label><label><span>FUSE status</span><select value={person.fuseStatus ?? ""} onChange={(event) => patch({ fuseStatus: (event.target.value || null) as DemoFuseStatus | null })}><option value="">No current FUSE status</option>{ITF_FUSE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Onboarding date</span><input type="date" value={person.onboardingDate ?? ""} onChange={(event) => patch({ onboardingDate: event.target.value || null })} /></label></section>
            <section><header><span>4</span><div><h3>Workforce assignment</h3><p>Seat and operating scope</p></div></header><div className={styles.twoColumnFields}><label><span>Seat</span><select value={person.assignment.seatType} onChange={(event) => patchAssignment({ seatType: event.target.value as DemoSeatType })}>{ITF_SEAT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Position</span><input value={person.assignment.positionTitle} onChange={(event) => patchAssignment({ positionTitle: event.target.value })} /></label><label><span>Office</span><input value={person.assignment.office} onChange={(event) => patchAssignment({ office: event.target.value, isIncomplete: !event.target.value || !person.techId || !person.assignment.reportsToName })} /></label><label><span>Reports to</span><input value={person.assignment.reportsToName ?? ""} onChange={(event) => patchAssignment({ reportsToName: event.target.value || null, isIncomplete: !person.assignment.office || !person.techId || !event.target.value })} /></label><label><span>Start date</span><input type="date" value={person.assignment.startDate} onChange={(event) => patchAssignment({ startDate: event.target.value })} /></label><label><span>End date</span><input type="date" value={person.assignment.endDate ?? ""} onChange={(event) => patchAssignment({ endDate: event.target.value || null })} /></label></div><label className={styles.checkRow}><input type="checkbox" checked={person.itgAssigned} onChange={(event) => patch({ itgAssigned: event.target.checked })} /><span><strong>Assigned to this ITG engagement</strong><small>This explicit assignment is what makes the worker visible in ITG Workforce.</small></span></label></section>
            <section><header><span>5</span><div><h3>Access and provenance</h3><p>Current access plus new source signal</p></div></header><dl className={styles.historyList}><div><dt>Roster owner</dt><dd>{person.companyName}</dd></div><div><dt>Assignment status</dt><dd>{titleCase(person.assignment.status)}</dd></div><div><dt>App access</dt><dd>{titleCase(person.appAccessStatus)}</dd></div><div><dt>Entry source</dt><dd>{sourceLabel(person)}</dd></div><div><dt>Last changed</dt><dd>{person.updatedAt}</dd></div></dl></section>
          </fieldset>
        </div>
        <footer className={styles.overlayFooter}><p>{props.canEdit ? "Saving changes only this browser-session fixture. No donor or Team Optix database row is written." : "This role may inspect its own record but cannot change the roster or assignment."}</p><div><button type="button" onClick={props.onClose}>{props.canEdit ? "Cancel" : "Close"}</button>{props.canEdit ? <button className={styles.primaryButton} type="button" onClick={props.onSave} disabled={!person.fullName.trim()}>Save demo change</button> : null}</div></footer>
      </section>
    </div>
  );
}
