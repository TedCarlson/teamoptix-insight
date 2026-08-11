import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

import {
  assertTenantBatch,
  pointDisposition,
  recoverPendingBatch,
  retryDelayMs,
  type PersistedBatchRecord,
} from "./protocol";
import type {
  BatchAcknowledgment,
  BreadcrumbBatchPayload,
  BreadcrumbPoint,
  LocalSession,
  InspectionSubmissionPayload,
  LocalInspectionEvidence,
  MobileOutboxCounts,
  OutboxCounts,
  PendingBatch,
  PendingInspectionSubmission,
  PendingMessageAcknowledgment,
  PendingTimeOffAction,
  TimeOffSubmissionPayload,
} from "./types";

const SCHEMA_VERSION = 3;
const MAX_BATCH_SIZE = 100;
const keyPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f-]{36}$/i;

type SessionRow = {
  session_id: string;
  tenant_key: string;
  company_slug: string;
  device_started_at: string;
  device_ended_at: string | null;
  sync_state: "PENDING" | "ACKNOWLEDGED";
  last_error: string | null;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function databaseKey(userId: string) {
  const storageKey = `insight.outbox.key.${userId}`;
  const existing = await SecureStore.getItemAsync(storageKey);
  if (existing) {
    if (!keyPattern.test(existing)) throw new Error("Invalid outbox encryption key.");
    return existing;
  }

  const created = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(storageKey, created, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return created;
}

function mapSession(row: SessionRow): LocalSession {
  return {
    sessionId: row.session_id,
    tenantKey: row.tenant_key,
    companySlug: row.company_slug,
    deviceStartedAt: row.device_started_at,
    deviceEndedAt: row.device_ended_at,
    syncState: row.sync_state,
    lastError: row.last_error,
  };
}

export class EdgeOutbox {
  private constructor(
    private readonly db: SQLite.SQLiteDatabase,
    private readonly databaseName: string,
    private readonly encryptionKey: string,
    readonly userId: string,
  ) {}

  static async open(userId: string) {
    if (!uuidPattern.test(userId)) throw new Error("Invalid authenticated user id.");
    const key = await databaseKey(userId);
    const databaseName = `insight-outbox-${userId}.db`;
    const db = await SQLite.openDatabaseAsync(databaseName);

    // SQLCipher must be keyed before any other database access. Expo Go does not
    // contain SQLCipher, so the cipher-version check intentionally blocks it.
    await db.execAsync(`PRAGMA key = '${key}';`);
    const cipher = await db.getFirstAsync<{ cipher_version: string }>(
      "PRAGMA cipher_version;",
    );
    if (!cipher?.cipher_version) {
      await db.closeAsync();
      throw new Error(
        "Encrypted outbox unavailable. Use the Insight development client, not Expo Go.",
      );
    }

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS outbox_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tracking_session_local (
        session_id TEXT PRIMARY KEY NOT NULL,
        tenant_key TEXT NOT NULL,
        company_slug TEXT NOT NULL,
        device_started_at TEXT NOT NULL,
        device_ended_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (sync_state IN ('PENDING', 'ACKNOWLEDGED')),
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_user
        ON tracking_session_local((1))
        WHERE device_ended_at IS NULL;
      CREATE TABLE IF NOT EXISTS breadcrumb_point_outbox (
        point_id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES tracking_session_local(session_id),
        tenant_key TEXT NOT NULL,
        device_captured_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy_meters REAL,
        capture_method TEXT NOT NULL
          CHECK (capture_method IN ('FOREGROUND_GPS', 'SYNTHETIC_TEST')),
        state TEXT NOT NULL DEFAULT 'QUEUED'
          CHECK (state IN ('QUEUED', 'SEALED', 'ACKNOWLEDGED', 'REJECTED')),
        batch_id TEXT,
        rejection_code TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS breadcrumb_point_queue_idx
        ON breadcrumb_point_outbox(tenant_key, session_id, state, device_captured_at);
      CREATE TABLE IF NOT EXISTS breadcrumb_batch_outbox (
        batch_id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES tracking_session_local(session_id),
        tenant_key TEXT NOT NULL,
        device_created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (state IN ('PENDING', 'ACKNOWLEDGED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        acknowledgment_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS breadcrumb_batch_pending_idx
        ON breadcrumb_batch_outbox(tenant_key, state, next_attempt_at);
      CREATE TABLE IF NOT EXISTS inspection_draft_local (
        tenant_key TEXT PRIMARY KEY NOT NULL,
        draft_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inspection_submission_outbox (
        submission_id TEXT PRIMARY KEY NOT NULL,
        tenant_key TEXT NOT NULL,
        company_slug TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (state IN ('PENDING', 'ACKNOWLEDGED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        server_inspection_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS inspection_submission_pending_idx
        ON inspection_submission_outbox(tenant_key, state, next_attempt_at);
      CREATE TABLE IF NOT EXISTS message_ack_outbox (
        tenant_key TEXT NOT NULL,
        message_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        queued_at TEXT NOT NULL,
        last_error TEXT,
        PRIMARY KEY (tenant_key, message_id)
      );
      CREATE TABLE IF NOT EXISTS time_off_action_outbox (
        action_id TEXT PRIMARY KEY NOT NULL,
        tenant_key TEXT NOT NULL,
        company_slug TEXT NOT NULL,
        roster_member_id TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK (action_type IN ('SUBMIT', 'WITHDRAW')),
        request_id TEXT,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (state IN ('PENDING', 'ACKNOWLEDGED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        server_request_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS time_off_action_pending_idx
        ON time_off_action_outbox(tenant_key, state, next_attempt_at);
      CREATE TABLE IF NOT EXISTS mobile_surface_cache (
        tenant_key TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_key, cache_key)
      );
    `);
    await db.runAsync(
      "INSERT OR REPLACE INTO outbox_meta(key, value) VALUES ('schema_version', ?)",
      String(SCHEMA_VERSION),
    );
    return new EdgeOutbox(db, databaseName, key, userId);
  }

  private async withEncryptedTransaction(
    task: (transaction: SQLite.SQLiteDatabase) => Promise<void>,
  ) {
    // Expo's withExclusiveTransactionAsync opens a hidden second connection.
    // SQLCipher keys are connection-specific, so that helper sees encrypted
    // bytes as "not a database". Open and key our own isolated connection
    // before beginning the transaction instead.
    const transaction = await SQLite.openDatabaseAsync(
      this.databaseName,
      { useNewConnection: true },
    );
    let began = false;
    try {
      await transaction.execAsync(`PRAGMA key = '${this.encryptionKey}';`);
      const cipher = await transaction.getFirstAsync<{ cipher_version: string }>(
        "PRAGMA cipher_version;",
      );
      if (!cipher?.cipher_version) {
        throw new Error("Encrypted outbox transaction is unavailable.");
      }
      await transaction.execAsync("PRAGMA foreign_keys = ON;");
      await transaction.execAsync("BEGIN IMMEDIATE;");
      began = true;
      await task(transaction);
      await transaction.execAsync("COMMIT;");
      began = false;
    } catch (error) {
      if (began) {
        await transaction.execAsync("ROLLBACK;");
      }
      throw error;
    } finally {
      await transaction.closeAsync();
    }
  }

  async close() {
    await this.db.closeAsync();
  }

  async startSession(tenantKey: string, companySlug: string) {
    const now = new Date().toISOString();
    const existing = await this.openSession(tenantKey);
    if (existing) return existing;

    const sessionId = Crypto.randomUUID();
    await this.db.runAsync(
      `INSERT INTO tracking_session_local (
        session_id, tenant_key, company_slug, device_started_at,
        device_ended_at, sync_state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, 'PENDING', ?, ?)`,
      sessionId,
      tenantKey,
      companySlug,
      now,
      now,
      now,
    );
    return (await this.session(tenantKey, sessionId))!;
  }

  async stopSession(tenantKey: string, sessionId: string) {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE tracking_session_local
       SET device_ended_at = COALESCE(device_ended_at, ?),
           sync_state = 'PENDING', updated_at = ?
       WHERE tenant_key = ? AND session_id = ?`,
      now,
      now,
      tenantKey,
      sessionId,
    );
    return this.session(tenantKey, sessionId);
  }

  async openSession(tenantKey: string) {
    const row = await this.db.getFirstAsync<SessionRow>(
      `SELECT session_id, tenant_key, company_slug, device_started_at,
              device_ended_at, sync_state, last_error
       FROM tracking_session_local
       WHERE tenant_key = ? AND device_ended_at IS NULL
       ORDER BY device_started_at DESC LIMIT 1`,
      tenantKey,
    );
    return row ? mapSession(row) : null;
  }

  async session(tenantKey: string, sessionId: string) {
    const row = await this.db.getFirstAsync<SessionRow>(
      `SELECT session_id, tenant_key, company_slug, device_started_at,
              device_ended_at, sync_state, last_error
       FROM tracking_session_local WHERE tenant_key = ? AND session_id = ?`,
      tenantKey,
      sessionId,
    );
    return row ? mapSession(row) : null;
  }

  async pendingSessions(tenantKey: string) {
    const rows = await this.db.getAllAsync<SessionRow>(
      `SELECT session_id, tenant_key, company_slug, device_started_at,
              device_ended_at, sync_state, last_error
       FROM tracking_session_local
       WHERE tenant_key = ? AND sync_state = 'PENDING'
       ORDER BY device_started_at`,
      tenantKey,
    );
    return rows.map(mapSession);
  }

  async markSessionAcknowledged(tenantKey: string, sessionId: string) {
    await this.db.runAsync(
      `UPDATE tracking_session_local
       SET sync_state = 'ACKNOWLEDGED', last_error = NULL, updated_at = ?
       WHERE tenant_key = ? AND session_id = ?`,
      new Date().toISOString(),
      tenantKey,
      sessionId,
    );
  }

  async markSessionFailed(tenantKey: string, sessionId: string, message: string) {
    await this.db.runAsync(
      `UPDATE tracking_session_local SET last_error = ?, updated_at = ?
       WHERE tenant_key = ? AND session_id = ?`,
      message,
      new Date().toISOString(),
      tenantKey,
      sessionId,
    );
  }

  async enqueuePoint(point: BreadcrumbPoint) {
    if (point.tenantKey.length === 0) throw new Error("Tenant key is required.");
    const session = await this.session(point.tenantKey, point.sessionId);
    if (!session || session.deviceEndedAt) {
      throw new Error("Points may only be captured during an open duty session.");
    }
    await this.db.runAsync(
      `INSERT INTO breadcrumb_point_outbox (
        point_id, session_id, tenant_key, device_captured_at, latitude,
        longitude, accuracy_meters, capture_method, state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?)`,
      point.pointId,
      point.sessionId,
      point.tenantKey,
      point.deviceCapturedAt,
      point.latitude,
      point.longitude,
      point.accuracyMeters,
      point.captureMethod,
      new Date().toISOString(),
    );
  }

  async sealNextBatch(
    tenantKey: string,
    sessionId: string,
  ): Promise<PendingBatch | null> {
    let sealed: PendingBatch | null = null;
    await this.withEncryptedTransaction(async (transaction) => {
      const points = await transaction.getAllAsync<{
        point_id: string;
        device_captured_at: string;
        latitude: number;
        longitude: number;
        accuracy_meters: number | null;
        capture_method: BreadcrumbPoint["captureMethod"];
      }>(
        `SELECT point_id, device_captured_at, latitude, longitude,
                accuracy_meters, capture_method
         FROM breadcrumb_point_outbox
         WHERE tenant_key = ? AND session_id = ? AND state = 'QUEUED'
         ORDER BY device_captured_at, point_id LIMIT ?`,
        tenantKey,
        sessionId,
        MAX_BATCH_SIZE,
      );
      if (points.length === 0) return;

      const batchId = Crypto.randomUUID();
      const now = new Date().toISOString();
      const payload: BreadcrumbBatchPayload = {
        batch_id: batchId,
        device_created_at: now,
        points: points.map((point) => ({
          point_id: point.point_id,
          device_captured_at: point.device_captured_at,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy_meters: point.accuracy_meters,
          capture_method: point.capture_method,
        })),
      };

      await transaction.runAsync(
        `INSERT INTO breadcrumb_batch_outbox (
          batch_id, session_id, tenant_key, device_created_at, payload_json,
          state, next_attempt_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        batchId,
        sessionId,
        tenantKey,
        now,
        JSON.stringify(payload),
        now,
        now,
        now,
      );

      const placeholders = points.map(() => "?").join(",");
      await transaction.runAsync(
        `UPDATE breadcrumb_point_outbox
         SET state = 'SEALED', batch_id = ?
         WHERE tenant_key = ? AND point_id IN (${placeholders})`,
        batchId,
        tenantKey,
        ...points.map((point) => point.point_id),
      );
      sealed = {
        batchId,
        sessionId,
        tenantKey,
        payload,
        attemptCount: 0,
        nextAttemptAt: now,
      };
    });
    return sealed;
  }

  async pendingBatches(tenantKey: string) {
    const rows = await this.db.getAllAsync<PersistedBatchRecord>(
      `SELECT batch_id, session_id, tenant_key, payload_json,
              attempt_count, next_attempt_at
       FROM breadcrumb_batch_outbox
       WHERE tenant_key = ? AND state = 'PENDING' AND next_attempt_at <= ?
       ORDER BY device_created_at`,
      tenantKey,
      new Date().toISOString(),
    );
    return rows.map(recoverPendingBatch);
  }

  async applyAcknowledgment(
    tenantKey: string,
    batch: PendingBatch,
    acknowledgment: BatchAcknowledgment,
  ) {
    assertTenantBatch(tenantKey, batch.tenantKey, batch.payload);
    await this.withEncryptedTransaction(async (transaction) => {
      for (const point of batch.payload.points) {
        const disposition = pointDisposition(acknowledgment, point.point_id);
        if (disposition === "PENDING") {
          throw new Error(`Acknowledgment omitted point ${point.point_id}.`);
        }
        const rejection = acknowledgment.rejected.find(
          (item) => item.point_id === point.point_id,
        );
        await transaction.runAsync(
          `UPDATE breadcrumb_point_outbox
           SET state = ?, rejection_code = ?
           WHERE tenant_key = ? AND batch_id = ? AND point_id = ?`,
          disposition,
          rejection?.code ?? null,
          tenantKey,
          batch.batchId,
          point.point_id,
        );
      }
      await transaction.runAsync(
        `UPDATE breadcrumb_batch_outbox
         SET state = 'ACKNOWLEDGED', acknowledgment_json = ?,
             last_error = NULL, updated_at = ?
         WHERE tenant_key = ? AND batch_id = ?`,
        JSON.stringify(acknowledgment),
        new Date().toISOString(),
        tenantKey,
        batch.batchId,
      );
    });
  }

  async markBatchFailed(tenantKey: string, batch: PendingBatch, message: string) {
    assertTenantBatch(tenantKey, batch.tenantKey, batch.payload);
    const attempts = batch.attemptCount + 1;
    const next = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
    await this.db.runAsync(
      `UPDATE breadcrumb_batch_outbox
       SET attempt_count = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
       WHERE tenant_key = ? AND batch_id = ?`,
      attempts,
      next,
      message,
      new Date().toISOString(),
      tenantKey,
      batch.batchId,
    );
  }

  async counts(tenantKey: string): Promise<OutboxCounts> {
    const row = await this.db.getFirstAsync<{
      queued: number;
      pending_batches: number;
      rejected: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM breadcrumb_point_outbox
          WHERE tenant_key = ? AND state IN ('QUEUED', 'SEALED')) AS queued,
        (SELECT COUNT(*) FROM breadcrumb_batch_outbox
          WHERE tenant_key = ? AND state = 'PENDING') AS pending_batches,
        (SELECT COUNT(*) FROM breadcrumb_point_outbox
          WHERE tenant_key = ? AND state = 'REJECTED') AS rejected`,
      tenantKey,
      tenantKey,
      tenantKey,
    );
    return {
      queued: row?.queued ?? 0,
      pendingBatches: row?.pending_batches ?? 0,
      rejected: row?.rejected ?? 0,
    };
  }

  async recentRejectionCodes(tenantKey: string) {
    const rows = await this.db.getAllAsync<{ rejection_code: string | null }>(
      `SELECT rejection_code
       FROM breadcrumb_point_outbox
       WHERE tenant_key = ? AND state = 'REJECTED'
       ORDER BY created_at DESC LIMIT 5`,
      tenantKey,
    );
    return Array.from(
      new Set(
        rows
          .map((row) => row.rejection_code)
          .filter((code): code is string => Boolean(code)),
      ),
    );
  }

  async saveInspectionDraft(tenantKey: string, draft: unknown) {
    await this.db.runAsync(
      `INSERT INTO inspection_draft_local(tenant_key, draft_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(tenant_key) DO UPDATE SET
         draft_json = excluded.draft_json,
         updated_at = excluded.updated_at`,
      tenantKey,
      JSON.stringify(draft),
      new Date().toISOString(),
    );
  }

  async inspectionDraft<T>(tenantKey: string): Promise<T | null> {
    const row = await this.db.getFirstAsync<{ draft_json: string }>(
      "SELECT draft_json FROM inspection_draft_local WHERE tenant_key = ?",
      tenantKey,
    );
    return row ? (JSON.parse(row.draft_json) as T) : null;
  }

  async clearInspectionDraft(tenantKey: string) {
    await this.db.runAsync(
      "DELETE FROM inspection_draft_local WHERE tenant_key = ?",
      tenantKey,
    );
  }

  async enqueueInspectionSubmission(
    tenantKey: string,
    companySlug: string,
    payload: InspectionSubmissionPayload,
    evidence: LocalInspectionEvidence[],
  ) {
    const submissionId = Crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO inspection_submission_outbox(
        submission_id, tenant_key, company_slug, payload_json, evidence_json,
        state, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      submissionId,
      tenantKey,
      companySlug,
      JSON.stringify(payload),
      JSON.stringify(evidence),
      now,
      now,
      now,
    );
    return submissionId;
  }

  async pendingInspectionSubmissions(tenantKey: string) {
    const rows = await this.db.getAllAsync<{
      submission_id: string;
      tenant_key: string;
      company_slug: string;
      payload_json: string;
      evidence_json: string;
      attempt_count: number;
      next_attempt_at: string;
    }>(
      `SELECT submission_id, tenant_key, company_slug, payload_json,
              evidence_json, attempt_count, next_attempt_at
       FROM inspection_submission_outbox
       WHERE tenant_key = ? AND state = 'PENDING' AND next_attempt_at <= ?
       ORDER BY created_at`,
      tenantKey,
      new Date().toISOString(),
    );
    return rows.map((row): PendingInspectionSubmission => ({
      submissionId: row.submission_id,
      tenantKey: row.tenant_key,
      companySlug: row.company_slug,
      payload: JSON.parse(row.payload_json) as InspectionSubmissionPayload,
      evidence: JSON.parse(row.evidence_json) as LocalInspectionEvidence[],
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at,
    }));
  }

  async markInspectionAcknowledged(
    tenantKey: string,
    submissionId: string,
    serverInspectionId: string,
  ) {
    await this.db.runAsync(
      `UPDATE inspection_submission_outbox
       SET state = 'ACKNOWLEDGED', server_inspection_id = ?, last_error = NULL,
           updated_at = ?
       WHERE tenant_key = ? AND submission_id = ?`,
      serverInspectionId,
      new Date().toISOString(),
      tenantKey,
      submissionId,
    );
  }

  async markInspectionFailed(
    submission: PendingInspectionSubmission,
    error: string,
  ) {
    const attempts = submission.attemptCount + 1;
    const next = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
    await this.db.runAsync(
      `UPDATE inspection_submission_outbox
       SET attempt_count = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
       WHERE tenant_key = ? AND submission_id = ?`,
      attempts,
      next,
      error,
      new Date().toISOString(),
      submission.tenantKey,
      submission.submissionId,
    );
  }

  async enqueueMessageAcknowledgment(
    tenantKey: string,
    messageId: string,
    profileId: string,
  ) {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO message_ack_outbox(
        tenant_key, message_id, profile_id, queued_at, last_error
      ) VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(tenant_key, message_id) DO UPDATE SET
        profile_id = excluded.profile_id,
        queued_at = excluded.queued_at,
        last_error = NULL`,
      tenantKey,
      messageId,
      profileId,
      now,
    );
  }

  async pendingMessageAcknowledgments(tenantKey: string) {
    const rows = await this.db.getAllAsync<{
      tenant_key: string;
      message_id: string;
      profile_id: string;
      queued_at: string;
    }>(
      `SELECT tenant_key, message_id, profile_id, queued_at
       FROM message_ack_outbox WHERE tenant_key = ? ORDER BY queued_at`,
      tenantKey,
    );
    return rows.map((row): PendingMessageAcknowledgment => ({
      tenantKey: row.tenant_key,
      messageId: row.message_id,
      profileId: row.profile_id,
      queuedAt: row.queued_at,
    }));
  }

  async markMessageAcknowledged(tenantKey: string, messageId: string) {
    await this.db.runAsync(
      "DELETE FROM message_ack_outbox WHERE tenant_key = ? AND message_id = ?",
      tenantKey,
      messageId,
    );
  }

  async markMessageAcknowledgmentFailed(
    tenantKey: string,
    messageId: string,
    error: string,
  ) {
    await this.db.runAsync(
      `UPDATE message_ack_outbox SET last_error = ?
       WHERE tenant_key = ? AND message_id = ?`,
      error,
      tenantKey,
      messageId,
    );
  }

  async enqueueTimeOffSubmission(
    tenantKey: string,
    companySlug: string,
    rosterMemberId: string,
    payload: TimeOffSubmissionPayload,
  ) {
    const actionId = Crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO time_off_action_outbox(
        action_id, tenant_key, company_slug, roster_member_id, action_type,
        request_id, payload_json, state, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'SUBMIT', NULL, ?, 'PENDING', ?, ?, ?)`,
      actionId,
      tenantKey,
      companySlug,
      rosterMemberId,
      JSON.stringify(payload),
      now,
      now,
      now,
    );
    return actionId;
  }

  async enqueueTimeOffWithdrawal(
    tenantKey: string,
    companySlug: string,
    rosterMemberId: string,
    requestId: string,
    intentConfirmation: TimeOffSubmissionPayload["intent_confirmation"],
  ) {
    const actionId = Crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO time_off_action_outbox(
        action_id, tenant_key, company_slug, roster_member_id, action_type,
        request_id, payload_json, state, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'WITHDRAW', ?, ?, 'PENDING', ?, ?, ?)`,
      actionId,
      tenantKey,
      companySlug,
      rosterMemberId,
      requestId,
      JSON.stringify({ intent_confirmation: intentConfirmation }),
      now,
      now,
      now,
    );
    return actionId;
  }

  async pendingTimeOffActions(tenantKey: string) {
    const rows = await this.db.getAllAsync<{
      action_id: string;
      tenant_key: string;
      company_slug: string;
      roster_member_id: string;
      action_type: "SUBMIT" | "WITHDRAW";
      request_id: string | null;
      payload_json: string;
      attempt_count: number;
      created_at: string;
      next_attempt_at: string;
    }>(
      `SELECT action_id, tenant_key, company_slug, roster_member_id,
              action_type, request_id, payload_json, attempt_count, created_at,
              next_attempt_at
       FROM time_off_action_outbox
       WHERE tenant_key = ? AND state = 'PENDING' AND next_attempt_at <= ?
       ORDER BY created_at`,
      tenantKey,
      new Date().toISOString(),
    );
    return rows.map((row): PendingTimeOffAction => ({
      actionId: row.action_id,
      tenantKey: row.tenant_key,
      companySlug: row.company_slug,
      rosterMemberId: row.roster_member_id,
      actionType: row.action_type,
      requestId: row.request_id,
      payload: JSON.parse(row.payload_json) as PendingTimeOffAction["payload"],
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      nextAttemptAt: row.next_attempt_at,
    }));
  }

  async allPendingTimeOffActions(tenantKey: string) {
    const rows = await this.db.getAllAsync<{
      action_id: string;
      tenant_key: string;
      company_slug: string;
      roster_member_id: string;
      action_type: "SUBMIT" | "WITHDRAW";
      request_id: string | null;
      payload_json: string;
      attempt_count: number;
      created_at: string;
      next_attempt_at: string;
    }>(
      `SELECT action_id, tenant_key, company_slug, roster_member_id,
              action_type, request_id, payload_json, attempt_count, created_at,
              next_attempt_at
       FROM time_off_action_outbox
       WHERE tenant_key = ? AND state = 'PENDING'
       ORDER BY created_at`,
      tenantKey,
    );
    return rows.map((row): PendingTimeOffAction => ({
      actionId: row.action_id,
      tenantKey: row.tenant_key,
      companySlug: row.company_slug,
      rosterMemberId: row.roster_member_id,
      actionType: row.action_type,
      requestId: row.request_id,
      payload: JSON.parse(row.payload_json) as PendingTimeOffAction["payload"],
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      nextAttemptAt: row.next_attempt_at,
    }));
  }

  async markTimeOffActionAcknowledged(
    tenantKey: string,
    actionId: string,
    serverRequestId: string,
  ) {
    await this.db.runAsync(
      `UPDATE time_off_action_outbox
       SET state = 'ACKNOWLEDGED', server_request_id = ?, last_error = NULL,
           updated_at = ?
       WHERE tenant_key = ? AND action_id = ?`,
      serverRequestId,
      new Date().toISOString(),
      tenantKey,
      actionId,
    );
  }

  async markTimeOffActionFailed(action: PendingTimeOffAction, error: string) {
    const attempts = action.attemptCount + 1;
    const next = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
    await this.db.runAsync(
      `UPDATE time_off_action_outbox
       SET attempt_count = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
       WHERE tenant_key = ? AND action_id = ?`,
      attempts,
      next,
      error,
      new Date().toISOString(),
      action.tenantKey,
      action.actionId,
    );
  }

  async setCachedSurface(tenantKey: string, cacheKey: string, value: unknown) {
    await this.db.runAsync(
      `INSERT INTO mobile_surface_cache(tenant_key, cache_key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tenant_key, cache_key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
      tenantKey,
      cacheKey,
      JSON.stringify(value),
      new Date().toISOString(),
    );
  }

  async cachedSurface<T>(tenantKey: string, cacheKey: string): Promise<T | null> {
    const row = await this.db.getFirstAsync<{ value_json: string }>(
      `SELECT value_json FROM mobile_surface_cache
       WHERE tenant_key = ? AND cache_key = ?`,
      tenantKey,
      cacheKey,
    );
    return row ? (JSON.parse(row.value_json) as T) : null;
  }

  async mobileCounts(tenantKey: string): Promise<MobileOutboxCounts> {
    const breadcrumb = await this.counts(tenantKey);
    const row = await this.db.getFirstAsync<{
      inspections: number;
      acknowledgments: number;
      time_off_actions: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM inspection_submission_outbox
         WHERE tenant_key = ? AND state = 'PENDING') AS inspections,
        (SELECT COUNT(*) FROM message_ack_outbox
         WHERE tenant_key = ?) AS acknowledgments,
        (SELECT COUNT(*) FROM time_off_action_outbox
         WHERE tenant_key = ? AND state = 'PENDING') AS time_off_actions`,
      tenantKey,
      tenantKey,
      tenantKey,
    );
    const pendingInspections = row?.inspections ?? 0;
    const pendingAcknowledgments = row?.acknowledgments ?? 0;
    const pendingTimeOffActions = row?.time_off_actions ?? 0;
    return {
      ...breadcrumb,
      pendingInspections,
      pendingAcknowledgments,
      pendingTimeOffActions,
      totalPending:
        breadcrumb.queued +
        breadcrumb.pendingBatches +
        pendingInspections +
        pendingAcknowledgments +
        pendingTimeOffActions,
    };
  }
}
