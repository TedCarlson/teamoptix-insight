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
});
