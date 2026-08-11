import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

import { EdgeOutbox } from "./database";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "after-first-unlock",
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn(),
  randomUUID: jest.fn(() => "22222222-2222-4222-8222-222222222222"),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const key = "a".repeat(64);

function databaseMock(overrides: Record<string, unknown> = {}) {
  return {
    closeAsync: jest.fn(async () => undefined),
    execAsync: jest.fn(async () => undefined),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async (sql: string) =>
      sql.includes("cipher_version") ? { cipher_version: "4.6.1" } : null,
    ),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
    ...overrides,
  };
}

describe("EdgeOutbox encrypted transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(key);
  });

  it("keys the isolated connection before sealing a batch", async () => {
    const main = databaseMock();
    const transaction = databaseMock({
      getAllAsync: jest.fn(async () => [
        {
          point_id: "33333333-3333-4333-8333-333333333333",
          device_captured_at: "2026-08-09T23:43:00.000Z",
          latitude: 39.9526,
          longitude: -75.1652,
          accuracy_meters: null,
          capture_method: "SYNTHETIC_TEST",
        },
      ]),
    });
    jest
      .mocked(SQLite.openDatabaseAsync)
      .mockResolvedValueOnce(main as never)
      .mockResolvedValueOnce(transaction as never);

    const outbox = await EdgeOutbox.open(userId);
    const sealed = await outbox.sealNextBatch(
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    );

    expect(SQLite.openDatabaseAsync).toHaveBeenNthCalledWith(
      2,
      `insight-outbox-${userId}.db`,
      { useNewConnection: true },
    );
    expect(transaction.execAsync).toHaveBeenNthCalledWith(
      1,
      `PRAGMA key = '${key}';`,
    );
    expect(transaction.getFirstAsync).toHaveBeenCalledWith(
      "PRAGMA cipher_version;",
    );
    expect(transaction.execAsync).toHaveBeenCalledWith("BEGIN IMMEDIATE;");
    expect(transaction.execAsync).toHaveBeenCalledWith("COMMIT;");
    expect(transaction.closeAsync).toHaveBeenCalledTimes(1);
    expect(sealed?.payload.points).toHaveLength(1);
  });

  it("queues a device observation even when its fix predates the duty envelope", async () => {
    const main = databaseMock({
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes("cipher_version")) return { cipher_version: "4.6.1" };
        if (sql.includes("FROM tracking_session_local")) {
          return {
            session_id: "55555555-5555-4555-8555-555555555555",
            tenant_key: "44444444-4444-4444-8444-444444444444",
            company_slug: "beacon-point-ventures",
            device_started_at: "2026-08-11T13:48:00.000Z",
            device_ended_at: null,
            sync_state: "PENDING",
            last_error: null,
          };
        }
        return null;
      }),
    });
    jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(main as never);

    const outbox = await EdgeOutbox.open(userId);
    await expect(outbox.enqueuePoint({
      pointId: "33333333-3333-4333-8333-333333333333",
      sessionId: "55555555-5555-4555-8555-555555555555",
      tenantKey: "44444444-4444-4444-8444-444444444444",
      deviceCapturedAt: "2026-08-11T13:47:59.000Z",
      latitude: 39.9526,
      longitude: -75.1652,
      accuracyMeters: 10,
      captureMethod: "FOREGROUND_GPS",
    })).resolves.toBeUndefined();

    expect(main.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO breadcrumb_point_outbox"),
      "33333333-3333-4333-8333-333333333333",
      "55555555-5555-4555-8555-555555555555",
      "44444444-4444-4444-8444-444444444444",
      "2026-08-11T13:47:59.000Z",
      39.9526,
      -75.1652,
      10,
      "FOREGROUND_GPS",
      expect.any(String),
    );
  });

  it("queues a time-off request with a device id and intent evidence", async () => {
    const main = databaseMock();
    jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(main as never);

    const outbox = await EdgeOutbox.open(userId);
    await expect(outbox.enqueueTimeOffSubmission(
      "tenant-key",
      "beacon-point-ventures",
      "33333333-3333-4333-8333-333333333333",
      {
        requested_dates: ["2026-08-21", "2026-08-28"],
        request_note: "Family event",
        intent_confirmation: {
          method: "MATCH_CODE",
          confirmed_at: "2026-08-11T14:00:00.000Z",
          client: "INSIGHT_MOBILE_COMPANION",
        },
      },
    )).resolves.toBe("22222222-2222-4222-8222-222222222222");

    expect(main.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO time_off_action_outbox"),
      "22222222-2222-4222-8222-222222222222",
      "tenant-key",
      "beacon-point-ventures",
      "33333333-3333-4333-8333-333333333333",
      expect.stringContaining('"method":"MATCH_CODE"'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });
});
