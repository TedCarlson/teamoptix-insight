import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as XLSX from "xlsx";
import { DSW_PACKAGE_STATUS_HEADERS } from "./packageStatus.parse";
import { ingestDswPackageStatusWorkbook } from "./packageStatus.ingest";

const TRACKING_ID = "0874740659370";
const DESTINATION = "REDACTED TEST DESTINATION";
const ORIGINAL_ENV = {
  hmac: process.env.TRACKING_REFERENCE_HMAC_KEY,
  version: process.env.TRACKING_REFERENCE_HMAC_VERSION,
  encryption: process.env.TRACKING_TRANSIENT_ENCRYPTION_KEY,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function workbookBuffer() {
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      "FedEx - TEST: 249/3249 - 20260727",
      "Package Level Detail Table",
      "Generated - 2026-07-27 20:28:23 UTC",
    ],
    [],
    [...DSW_PACKAGE_STATUS_HEADERS],
    [
      "1",
      "BPV 03",
      "0426",
      "309747",
      "TEST SERVICE PROVIDER",
      "426-7512 2026-07-27 01:59:38.0",
      TRACKING_ID,
      DESTINATION,
      "247092",
      "27",
      "7",
      "07/27/2026 09:03",
    ],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Package Detail");
  return XLSX.write(workbook, { type: "buffer", bookType: "xls" });
}

function fakeSupabase() {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "00000000-0000-4000-8000-000000000001" },
              error: null,
            }),
          }),
        }),
      }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return {
          data: {
            snapshot_id: "00000000-0000-4000-8000-000000000002",
            inserted_row_count: 1,
            updated_row_count: 0,
            deleted_row_count: 0,
          },
          error: null,
        };
      },
    },
  };
}

describe("ingestDswPackageStatusWorkbook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T16:00:00Z"));
    process.env.TRACKING_REFERENCE_HMAC_KEY =
      "synthetic-test-reference-key";
    process.env.TRACKING_REFERENCE_HMAC_VERSION = "v1";
    process.env.TRACKING_TRANSIENT_ENCRYPTION_KEY =
      Buffer.alloc(32, 11).toString("base64");
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnvironment(
      "TRACKING_REFERENCE_HMAC_KEY",
      ORIGINAL_ENV.hmac
    );
    restoreEnvironment(
      "TRACKING_REFERENCE_HMAC_VERSION",
      ORIGINAL_ENV.version
    );
    restoreEnvironment(
      "TRACKING_TRANSIENT_ENCRYPTION_KEY",
      ORIGINAL_ENV.encryption
    );
  });

  it("sends only protected package identity to the import RPC", async () => {
    const supabase = fakeSupabase();
    const result = await ingestDswPackageStatusWorkbook({
      supabase: supabase.client,
      slug: "synthetic-company",
      buffer: workbookBuffer(),
      filename: "PackageLevelDetails.xls",
      artifact: {
        id: "00000000-0000-4000-8000-000000000003",
        service_date: "2026-07-27",
        runner_artifact_json: {
          artifact_key: "DSW_ALL_STATUS_CODE_PACKAGES",
          service_date_raw: "2026-07-27",
          contract_number: "C1234567",
          expected_package_count: 1,
        },
      },
    });

    expect(supabase.rpcCalls).toHaveLength(1);
    expect(supabase.rpcCalls[0].name).toBe(
      "import_operations_dsw_package_status"
    );
    expect(supabase.rpcCalls[0].args.p_snapshot_kind).toBe("LIVE");
    const serializedRows = JSON.stringify(
      supabase.rpcCalls[0].args.p_rows
    );
    expect(serializedRows).not.toContain(TRACKING_ID);
    expect(serializedRows).not.toContain(DESTINATION);
    expect(serializedRows).toMatch(/v1_[a-f0-9]{64}/);
    expect(result.batch_id).toBeNull();
    expect(result.snapshot_id).toBe(
      "00000000-0000-4000-8000-000000000002"
    );
  });

  it("fails closed when the Runner date disagrees with the workbook", async () => {
    const supabase = fakeSupabase();
    await expect(
      ingestDswPackageStatusWorkbook({
        supabase: supabase.client,
        slug: "synthetic-company",
        buffer: workbookBuffer(),
        filename: "PackageLevelDetails.xls",
        artifact: {
          id: "00000000-0000-4000-8000-000000000003",
          service_date: "2026-07-27",
          runner_artifact_json: {
            artifact_key: "DSW_ALL_STATUS_CODE_PACKAGES",
            service_date_raw: "2026-07-26",
            contract_number: "C1234567",
            expected_package_count: 1,
          },
        },
      })
    ).rejects.toThrow("does not match its Runner metadata");
    expect(supabase.rpcCalls).toHaveLength(0);
  });
});
