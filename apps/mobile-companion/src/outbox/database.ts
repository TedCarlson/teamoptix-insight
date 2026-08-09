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
  OutboxCounts,
  PendingBatch,
} from "./types";

const SCHEMA_VERSION = 1;
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
    readonly userId: string,
  ) {}

  static async open(userId: string) {
    if (!uuidPattern.test(userId)) throw new Error("Invalid authenticated user id.");
    const key = await databaseKey(userId);
    const db = await SQLite.openDatabaseAsync(`insight-outbox-${userId}.db`);

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
    `);
    await db.runAsync(
      "INSERT OR REPLACE INTO outbox_meta(key, value) VALUES ('schema_version', ?)",
      String(SCHEMA_VERSION),
    );
    return new EdgeOutbox(db, userId);
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

  async sealNextBatch(tenantKey: string, sessionId: string) {
    let sealed: PendingBatch | null = null;
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
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
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
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
}
