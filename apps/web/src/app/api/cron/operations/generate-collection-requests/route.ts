import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const GOVERNED_COMPANY_SLUGS = new Set([
  "beacon-point-ventures",
]);

const BLOCKING_REQUEST_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
];

const EXISTING_SWEEP_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
  "COMPLETE",
];

function newYorkTodayIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addIsoDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function historicalSweepWindow() {
  const today = newYorkTodayIso();

  return {
    serviceDateStart: addIsoDays(today, -2),
    serviceDateEnd: addIsoDays(today, -1),
  };
}

function buildHistoricalSweepPayload() {
  return {
    source: "teamoptix_automation",
    preset: "daily_historical_sweep",
    intent: "historical_backfill",
    request_origin: "teamoptix_governed_daily_sweep",
    collect_scope: "dsw_only",
    control_level: "platform_managed",
    customer_language: "Daily Historical Sweep",
    runner_goal: "protect_recent_operational_history",
    targets: [
      {
        key: "DSW_DAILY_SERVICE",
        label: "DSW · Daily Service Worksheet",
        artifact_key: "DSW",
        report_family_key: "DSW",
        runner_section: "DAILY_SERVICE",
        expected_filename_match: ["daily service worksheet"],
      },
    ],
  };
}

async function companyHasBlockingRequest(
  supabase: any,
  companyId: string
) {
  const { data, error } = await supabase
    .from("operations_collection_request_v")
    .select("id")
    .eq("company_id", companyId)
    .in("request_status", BLOCKING_REQUEST_STATUSES)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) && data.length > 0;
}

async function companyHasMatchingSweep(params: {
  supabase: any;
  companyId: string;
  serviceDateStart: string;
  serviceDateEnd: string;
}) {
  const {
    supabase,
    companyId,
    serviceDateStart,
    serviceDateEnd,
  } = params;

  const { data, error } = await supabase
    .from("operations_collection_request_v")
    .select("id, request_status")
    .eq("company_id", companyId)
    .eq("request_type", "HISTORICAL_BACKFILL")
    .eq("service_date_start", serviceDateStart)
    .eq("service_date_end", serviceDateEnd)
    .in("request_status", EXISTING_SWEEP_STATUSES)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) && data.length > 0;
}

export async function GET() {
  const startedAt = Date.now();
  const supabase = createSupabaseServiceRoleClient();
  const { serviceDateStart, serviceDateEnd } =
    historicalSweepWindow();

  const governedSlugs = Array.from(GOVERNED_COMPANY_SLUGS);

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .in("company_slug", governedSlugs);

  if (companyError) {
    return NextResponse.json(
      {
        ok: false,
        error: companyError.message,
      },
      { status: 500 }
    );
  }

  const results: Array<Record<string, unknown>> = [];
  const companyRows = Array.isArray(companies) ? companies : [];

  for (const company of companyRows) {
    const companyId = String(company?.id ?? "");
    const companySlug = String(company?.company_slug ?? "");

    if (!companyId || !companySlug) {
      continue;
    }

    try {
      const matchingSweepExists = await companyHasMatchingSweep({
        supabase,
        companyId,
        serviceDateStart,
        serviceDateEnd,
      });

      if (matchingSweepExists) {
        results.push({
          company_slug: companySlug,
          status: "skipped",
          reason: "matching historical sweep already exists",
          service_date_start: serviceDateStart,
          service_date_end: serviceDateEnd,
        });
        continue;
      }

      if (await companyHasBlockingRequest(supabase, companyId)) {
        results.push({
          company_slug: companySlug,
          status: "skipped",
          reason: "active collection request exists",
        });
        continue;
      }

      const { data: requestData, error: requestError } =
        await supabase.rpc(
          "create_operations_collection_request",
          {
            p_company_slug: companySlug,
            p_request_type: "HISTORICAL_BACKFILL",
            p_service_date: null,
            p_service_date_start: serviceDateStart,
            p_service_date_end: serviceDateEnd,
            p_requested_reports: ["DSW"],
            p_priority: 60,
            p_request_payload: buildHistoricalSweepPayload(),
          }
        );

      if (requestError) {
        results.push({
          company_slug: companySlug,
          status: "error",
          error: requestError.message,
        });
        continue;
      }

      results.push({
        company_slug: companySlug,
        status: "created",
        request_id: requestData?.id,
        request_type: "HISTORICAL_BACKFILL",
        service_date_start: serviceDateStart,
        service_date_end: serviceDateEnd,
        requested_reports: ["DSW"],
      });
    } catch (error) {
      results.push({
        company_slug: companySlug,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  for (const companySlug of governedSlugs) {
    if (
      !companyRows.some(
        (company) => company?.company_slug === companySlug
      )
    ) {
      results.push({
        company_slug: companySlug,
        status: "error",
        error: "Governed company was not found.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    governance: "teamoptix",
    request_type: "HISTORICAL_BACKFILL",
    service_date_start: serviceDateStart,
    service_date_end: serviceDateEnd,
    requested_reports: ["DSW"],
    generated: results,
    elapsed_ms: Date.now() - startedAt,
  });
}
