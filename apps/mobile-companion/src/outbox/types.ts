export type CaptureMethod = "FOREGROUND_GPS" | "SYNTHETIC_TEST";

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
