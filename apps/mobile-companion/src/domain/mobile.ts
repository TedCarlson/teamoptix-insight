import type {
  InspectionItemPayload,
  InspectionResult,
  LocalInspectionEvidence,
} from "../outbox/types";

export const fleetInspectionItems = [
  ["CAB", "service_brakes", "Service brakes"],
  ["CAB", "parking_brake", "Parking brake"],
  ["CAB", "steering", "Steering mechanism"],
  ["CAB", "horn", "Horn"],
  ["CAB", "seat_belt", "Seat belt"],
  ["VISIBILITY", "lights", "Lights and reflectors"],
  ["VISIBILITY", "wipers", "Windshield and wipers"],
  ["VISIBILITY", "mirrors", "Mirrors and cameras"],
  ["RUNNING_GEAR", "tires", "Tires, tread, pressure, and sidewalls"],
  ["RUNNING_GEAR", "wheels", "Wheels, rims, lugs, and hubs"],
  ["BODY", "doors", "Cab and cargo doors/latches"],
  ["BODY", "steps", "Steps and grab handles"],
  ["BODY", "leaks", "Visible fluid or exhaust leaks"],
  ["BODY", "exterior_front", "Front exterior and lights"],
  ["BODY", "exterior_rear", "Rear exterior and lights"],
  ["BODY", "exterior_driver", "Driver-side exterior and lights"],
  ["BODY", "exterior_passenger", "Passenger-side exterior and lights"],
  ["EMERGENCY", "equipment", "Fire extinguisher and warning triangles"],
  ["DOCUMENTS", "documents", "Registration, insurance, and inspection documents"],
] as const;

export const requiredFleetEvidenceKeys = new Set<string>([
  "exterior_front",
  "exterior_rear",
  "exterior_driver",
  "exterior_passenger",
]);

export type DriverMessage = {
  id: string;
  title: string;
  body: string;
  requires_ack: boolean;
  published_at: string | null;
  acknowledged_at: string | null;
  acknowledged: boolean;
};

export type ScheduleBaseline = {
  preset_id: string | null;
  rotation_mode: string | null;
  anchor_date: string | null;
  effective_start: string | null;
  rotation_works_s: boolean;
  rotation_works_u: boolean;
  rotation_works_m: boolean;
  rotation_works_t: boolean;
  rotation_works_w: boolean;
  rotation_works_h: boolean;
  rotation_works_f: boolean;
  default_route_s: string | null;
  default_route_u: string | null;
  default_route_m: string | null;
  default_route_t: string | null;
  default_route_w: string | null;
  default_route_h: string | null;
  default_route_f: string | null;
};

export type SchedulePreset = {
  works_s: boolean;
  works_u: boolean;
  works_m: boolean;
  works_t: boolean;
  works_w: boolean;
  works_h: boolean;
  works_f: boolean;
};

export type ScheduleDayFact = {
  service_date: string;
  planned_on: boolean;
  route_name: string | null;
  source_kind: string;
};

export type DriverSchedule = {
  baseline: ScheduleBaseline | null;
  preset: SchedulePreset | null;
  facts: ScheduleDayFact[];
};

export type TimeOffRequestStatus = "PENDING" | "APPROVED" | "DENIED" | "WITHDRAWN";

export type DriverTimeOffRequest = {
  id: string;
  device_submission_id?: string | null;
  requested_dates: string[];
  start_date: string;
  end_date: string;
  day_count: number;
  status: TimeOffRequestStatus;
  request_note: string | null;
  manager_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  updated_at: string;
};

export type FleetVehicle = {
  vehicle_id: string;
  unit_number: string;
  fedex_vehicle_id: string | null;
  vehicle_class_key: string | null;
  vehicle_type: string;
  status: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  plate_number: string | null;
  primary_route: string | null;
  odometer_miles: number | null;
  open_defect_count: number;
};

export type InspectionDraft = {
  vehicleId: string;
  inspectionType: "PRE_TRIP" | "POST_TRIP" | "MID_ROUTE";
  odometer: string;
  results: Record<string, InspectionResult>;
  notes: Record<string, string>;
  evidence: LocalInspectionEvidence[];
  safeToOperate: boolean | null;
  driverNotes: string;
};

const daySuffixes = ["u", "m", "t", "w", "h", "f", "s"] as const;

export function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function scheduleForDate(schedule: DriverSchedule | null, date: Date) {
  const fact = schedule?.facts.find((row) => row.service_date === isoDate(date));
  if (fact) {
    return {
      scheduled: fact.planned_on,
      route: fact.planned_on ? fact.route_name ?? "ON" : "OFF",
      source: fact.source_kind,
    };
  }

  const baseline = schedule?.baseline;
  if (!baseline) return { scheduled: false, route: "OFF", source: "NONE" };
  const suffix = daySuffixes[date.getDay()];
  const route = baseline[`default_route_${suffix}`];
  const rotationWorks = baseline[`rotation_works_${suffix}`];
  const presetWorks = schedule?.preset?.[`works_${suffix}`] ?? false;
  const scheduled = Boolean(rotationWorks || presetWorks);
  return {
    scheduled,
    route: scheduled ? route?.trim() || "ON" : "OFF",
    source: "BASELINE",
  };
}

export function normalizeTimeOffDates(dates: string[]) {
  return Array.from(new Set(dates)).sort();
}

export function timeOffRangeDates(dates: string[]) {
  const normalized = normalizeTimeOffDates(dates);
  if (normalized.length < 2) return normalized;
  const [startYear, startMonth, startDay] = normalized[0].split("-").map(Number);
  const [endYear, endMonth, endDay] = normalized[normalized.length - 1].split("-").map(Number);
  const current = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  const range: string[] = [];
  while (current <= end) {
    range.push(isoDate(current));
    current.setDate(current.getDate() + 1);
  }
  return range;
}

export function timeOffEligibilityError(dates: string[], today = new Date()) {
  const normalized = normalizeTimeOffDates(dates);
  if (normalized.length === 0) return "Select at least one day.";
  if (normalized.length > 15) return "Select no more than 15 days.";
  const earliest = new Date(`${normalized[0]}T12:00:00`);
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const earliestDay = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
  const noticeDays = Math.round((earliestDay.getTime() - localToday.getTime()) / 86_400_000);
  if (noticeDays < 10) {
    return "Requests require at least 10 days notice. Contact leadership for a near-term change.";
  }
  return null;
}

export function inspectionCompletedCount(draft: InspectionDraft) {
  return fleetInspectionItems.filter(([, key]) => draft.results[key]).length;
}

export function evidenceForItem(draft: InspectionDraft, itemKey: string) {
  return draft.evidence.filter((item) => item.itemKey === itemKey);
}

export function inspectionValidationError(draft: InspectionDraft) {
  if (!draft.vehicleId) return "Select the vehicle.";
  if (!/^\d+$/.test(draft.odometer) || Number(draft.odometer) < 0) {
    return "Enter the current mileage.";
  }
  const unanswered = fleetInspectionItems.find(([, key]) => !draft.results[key]);
  if (unanswered) return `Answer ${unanswered[2].toLowerCase()}.`;
  const missingNotes = fleetInspectionItems.find(
    ([, key]) =>
      draft.results[key] === "DEFECT" && !draft.notes[key]?.trim(),
  );
  if (missingNotes) return `Add notes for ${missingNotes[2].toLowerCase()}.`;
  const missingPhoto = fleetInspectionItems.find(
    ([, key]) =>
      requiredFleetEvidenceKeys.has(key) && evidenceForItem(draft, key).length === 0,
  );
  if (missingPhoto) {
    return `Capture the required ${missingPhoto[2].toLowerCase()} photo.`;
  }
  if (draft.safeToOperate === null) return "Select whether the vehicle is safe to operate.";
  return null;
}

export function inspectionItemsPayload(draft: InspectionDraft): InspectionItemPayload[] {
  return fleetInspectionItems.map(([section, key, label]) => ({
    section_key: section,
    item_key: key,
    item_label: label,
    result: draft.results[key],
    notes: draft.notes[key] ?? "",
    media_paths: [],
  }));
}

export function emptyInspectionDraft(): InspectionDraft {
  return {
    vehicleId: "",
    inspectionType: "PRE_TRIP",
    odometer: "",
    results: {},
    notes: {},
    evidence: [],
    safeToOperate: null,
    driverNotes: "",
  };
}
