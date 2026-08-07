import { describe, expect, it, vi } from "vitest";
import { ingestDroPackageDetailWorkbook } from "./dro.ingest";

function resolvedChain(value: unknown) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    lte: () => chain,
    or: () => chain,
    order: () => chain,
    single: async () => value,
    then: (resolve: (result: unknown) => unknown) => resolve(value),
  };
  return chain;
}

describe("ingestDroPackageDetailWorkbook", () => {
  it("stages the runner Package Detail CSV as an AM DRO report", async () => {
    const csv = [
      '"SERVICE AREA","WA NAME","WA #","ROUTE TYPE","CAPACITY","TIME","DISTANCE","TOTAL STOPS","TIME CRITICAL","MISSED TIME CRT.","Delivery - STOPS","Delivery - PKGS.","Delivery - CUBE","Pickup - STOPS"',
      '"309747","BPV 02","0477","REG","184 / 250","7.22","138.05","83","14","0","79","132","183.51","4"',
    ].join("\n");
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_active_company_contract_config") {
        return {
          data: [
            {
              id: "contract-1",
              contract_number: "contract",
              terminal_identity: "249",
              service_area: "309747",
            },
          ],
          error: null,
        };
      }
      if (name === "stage_operations_dro_report") {
        return { data: { batch_id: "batch-1" }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "companies") {
          return resolvedChain({
            data: { id: "company-1" },
            error: null,
          });
        }
        if (table === "route_baseline") {
          return resolvedChain({
            data: [
              {
                id: "route-1",
                route_name: "BPV 02",
                current_wa_num: "0477",
              },
            ],
            error: null,
          });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc,
    };

    const result = await ingestDroPackageDetailWorkbook({
      supabase,
      slug: "beacon-point-ventures",
      buffer: Buffer.from(csv),
      filename: "package_detail.csv",
      artifact: {
        service_date: "2026-07-31",
        size_bytes: Buffer.byteLength(csv),
        runner_artifact_json: { artifact_key: "DRO_PACKAGE_DETAIL" },
      },
    });

    expect(result).toMatchObject({
      batch_id: "batch-1",
      report_family_key: "DRO",
      report_shape_key: "DRO_AM_ROUTE_READINESS",
      inserted_row_count: 1,
      matched_route_count: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      "get_active_company_contract_config",
      {
        p_company_slug: "beacon-point-ventures",
        p_service_date: "2026-07-31",
      }
    );
    expect(rpc).toHaveBeenCalledWith(
      "stage_operations_dro_report",
      expect.objectContaining({
        p_service_date: "2026-07-31",
        p_report_frame: "AM",
        p_source_filename: "package_detail.csv",
        p_route_row_count: 1,
        p_rows: [
          expect.objectContaining({
            source_wa_number: "477",
            normalized_row_json: expect.objectContaining({
              lp_stops: 83,
              lp_packages: 132,
              route_baseline_id: "route-1",
              route_match_method: "WA_NUMBER",
            }),
          }),
        ],
      })
    );
  });
});
