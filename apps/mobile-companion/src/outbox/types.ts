export type CaptureMethod = "FOREGROUND_GPS" | "BACKGROUND_GPS" | "SYNTHETIC_TEST";

export type LocalSession = {
  sessionId: string;
  tenantKey: string;
  companySlug: string;
  deviceStartedAt: string;
  deviceEndedAt: string | null;
  syncState: "PENDING" | "ACKNOWLEDGED";
  lastError: string | null;
};

export type BreadcrumbPoint = {
  pointId: string;
  sessionId: string;
  tenantKey: string;
  deviceCapturedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  captureMethod: CaptureMethod;
};

export type BreadcrumbBatchPayload = {
  batch_id: string;
  device_created_at: string;
  points: Array<{
    point_id: string;
    device_captured_at: string;
    latitude: number;
    longitude: number;
    accuracy_meters: number | null;
    capture_method: CaptureMethod;
  }>;
};

export type PendingBatch = {
  batchId: string;
  sessionId: string;
  tenantKey: string;
  payload: BreadcrumbBatchPayload;
  attemptCount: number;
  nextAttemptAt: string;
};

export type RejectedPoint = {
  point_id: string | null;
  code: string;
  retryable: boolean;
};

export type BatchAcknowledgment = {
  ok: true;
  batch_id: string;
  batch_status: "ACKNOWLEDGED" | "PARTIAL" | "REJECTED";
  duplicate_batch: boolean;
  accepted_point_ids: string[];
  duplicate_point_ids: string[];
  rejected: RejectedPoint[];
  server_received_at: string;
};

export type OutboxCounts = {
  queued: number;
  pendingBatches: number;
  rejected: number;
};

export type InspectionResult = "PASS" | "DEFECT" | "NOT_APPLICABLE";

export type InspectionItemPayload = {
  section_key: string;
  item_key: string;
  item_label: string;
  result: InspectionResult;
  notes: string;
  media_paths: string[];
};

export type LocalInspectionEvidence = {
  itemKey: string;
  base64: string;
  contentType: "image/jpeg";
  sizeBytes: number;
  sha256: string;
};

export type InspectionSubmissionPayload = {
  vehicle_id: string;
  inspection_type: "PRE_TRIP" | "POST_TRIP" | "MID_ROUTE";
  odometer_miles: number;
  safe_to_operate: boolean;
  driver_notes: string;
  route_name: string;
  items: InspectionItemPayload[];
};

export type PendingInspectionSubmission = {
  submissionId: string;
  tenantKey: string;
  companySlug: string;
  payload: InspectionSubmissionPayload;
  evidence: LocalInspectionEvidence[];
  attemptCount: number;
  nextAttemptAt: string;
};

export type PendingMessageAcknowledgment = {
  messageId: string;
  tenantKey: string;
  profileId: string;
  queuedAt: string;
};

export type IntentConfirmation = {
  method: "MATCH_CODE";
  confirmed_at: string;
  client: "INSIGHT_MOBILE_COMPANION";
};

export type TimeOffSubmissionPayload = {
  requested_dates: string[];
  request_note: string;
  intent_confirmation: IntentConfirmation;
};

export type PendingTimeOffAction = {
  actionId: string;
  tenantKey: string;
  companySlug: string;
  rosterMemberId: string;
  actionType: "SUBMIT" | "WITHDRAW";
  requestId: string | null;
  payload: TimeOffSubmissionPayload | { intent_confirmation: IntentConfirmation };
  attemptCount: number;
  createdAt: string;
  nextAttemptAt: string;
};

export type MobileOutboxCounts = OutboxCounts & {
  pendingInspections: number;
  pendingAcknowledgments: number;
  pendingTimeOffActions: number;
  totalPending: number;
};
