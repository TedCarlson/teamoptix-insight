import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildAnalyticsCalendarSegments,
  isAnalyticsComparisonMode,
  isAnalyticsRangePreset,
  resolveAnalyticsContext,
  type AnalyticsContractPeriod,
} from "@/features/company/analytics/analyticsContext";
import { buildMonthRanges } from "@/features/company/analytics/historyRanges";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type HistoryRow = {
  service_date?: string | null;
  [key: string]: unknown;
};

type PickupReliabilityRow = {
  service_date?: string | null;
  actual_pickup_stops?: number | string | null;
  early_pickups?: number | string | null;
  late_pickups?: number | string | null;
  potential_missed_pickups?: number | string | null;
  pickup_reliability_complete?: boolean | null;
};

function integer(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function isoDateInNewYork(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function sortHistoryRows(rows: HistoryRow[]): HistoryRow[] {
  return [...rows].sort((left, right) =>
    String(left.service_date ?? "").localeCompare(
      String(right.service_date ?? "")
    )
  );
}

function deduplicateHistoryRows(
  rows: HistoryRow[]
): HistoryRow[] {
  const byServiceDate = new Map<string, HistoryRow>();

  for (const row of rows) {
    const serviceDate = String(
      row.service_date ?? ""
    ).slice(0, 10);

    if (!serviceDate) {
      continue;
    }

    byServiceDate.set(serviceDate, row);
  }

  return sortHistoryRows([...byServiceDate.values()]);
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;
    const url = new URL(req.url);

    const yearParam = url.searchParams.get("year");
    const requestedCalendarYear = integer(yearParam);
    const presetParam = url.searchParams.get("preset");
    const comparisonParam = url.searchParams.get("compare");
    const contractIdParam = url.searchParams.get("contractId");
    const targetParam = url.searchParams.get("target") ?? "primary";

    if (
      yearParam !== null &&
      (
        requestedCalendarYear === null ||
        requestedCalendarYear < 2020 ||
        requestedCalendarYear > 2100
      )
    ) {
      return NextResponse.json(
        {
          error: "A valid analytics calendar year is required.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    if (
      presetParam !== null &&
      !isAnalyticsRangePreset(presetParam)
    ) {
      return NextResponse.json(
        {
          error: "A valid analytics range preset is required.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    if (
      comparisonParam !== null &&
      !isAnalyticsComparisonMode(comparisonParam)
    ) {
      return NextResponse.json(
        {
          error: "A valid analytics comparison mode is required.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    if (
      contractIdParam !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        contractIdParam
      )
    ) {
      return NextResponse.json(
        {
          error: "A valid contract lock is required.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    if (targetParam !== "primary" && targetParam !== "comparison") {
      return NextResponse.json(
        {
          error: "A valid analytics payload target is required.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } =
      await supabase
        .from("companies")
        .select("id")
        .eq("company_slug", slug)
        .single();

    if (companyError || !company) {
      return NextResponse.json(
        {
          error: "Company not found.",
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 404 }
      );
    }

    const {
      data: contractData,
      error: contractError,
    } = await supabase
      .from("company_contract_config")
      .select(
        "id, contract_number, terminal_identity, service_area, effective_start_date, effective_end_date, status"
      )
      .eq("company_id", company.id)
      .order("effective_start_date", {
        ascending: false,
      });

    if (contractError) {
      return NextResponse.json(
        {
          error: contractError.message,
          available_years: [],
          metadata: null,
          rows: [],
        },
        { status: 500 }
      );
    }

    const today = isoDateInNewYork();

    const contractRows = (
      Array.isArray(contractData)
        ? contractData
        : []
    ) as unknown as AnalyticsContractPeriod[];

    const contracts = contractRows.filter(
      (row) =>
        Boolean(row.id && row.effective_start_date)
    );

    const availableContracts = buildAnalyticsCalendarSegments(
      contracts.filter(
        (contract) => contract.effective_start_date <= today
      ),
      today
    )
      .map((segment) => ({
        calendar_year: segment.calendar_year,
        operating_year: segment.calendar_year,
        contract_id: segment.id,
        contract_number: segment.contract_number,
        terminal_identity: segment.terminal_identity,
        service_area: segment.service_area,
        effective_start_date: segment.effective_start_date,
        effective_end_date: segment.effective_end_date,
        segment_start_date: segment.segment_start_date,
        segment_end_date: segment.segment_end_date,
        status: segment.status,
      }))
      .sort(
        (left, right) =>
          right.calendar_year - left.calendar_year ||
          right.segment_start_date.localeCompare(
            left.segment_start_date
          ) ||
          left.contract_id.localeCompare(right.contract_id)
      );

    if (requestedCalendarYear === null) {
      return NextResponse.json(
        {
          available_years: availableContracts,
          metadata: null,
          rows: [],
        },
        { status: 200 }
      );
    }

    const resolvedContext = resolveAnalyticsContext({
      calendarYear: requestedCalendarYear,
      preset: isAnalyticsRangePreset(presetParam)
        ? presetParam
        : "calendar_year",
      comparisonMode: isAnalyticsComparisonMode(comparisonParam)
        ? comparisonParam
        : "none",
      contractId: contractIdParam,
      contracts,
      today,
    });

    if (!resolvedContext) {
      return NextResponse.json(
        {
          error:
            `No elapsed contract-attributed range was found for calendar year ` +
            `${requestedCalendarYear}.`,
          available_years: availableContracts,
          metadata: null,
          rows: [],
        },
        { status: 404 }
      );
    }

    const requestedRange =
      targetParam === "comparison"
        ? resolvedContext.comparison
        : resolvedContext.primary;

    if (!requestedRange) {
      return NextResponse.json(
        {
          error:
            "The selected comparison has no contract-attributed operating dates.",
          available_years: availableContracts,
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    const startDate = requestedRange.start_date;
    const endDate = requestedRange.end_date;
    const selectedContract = resolvedContext.contract_id
      ? contracts.find(
          (contract) => contract.id === resolvedContext.contract_id
        ) ?? null
      : null;
    const contributingContracts = availableContracts.filter(
      (segment) =>
        segment.segment_start_date <= endDate &&
        segment.segment_end_date >= startDate &&
        (!resolvedContext.contract_id ||
          segment.contract_id === resolvedContext.contract_id)
    );

    const monthRanges = buildMonthRanges(
      startDate,
      endDate
    );

    const collectedRows: HistoryRow[] = [];
    const collectedPickupReliabilityRows: PickupReliabilityRow[] = [];
    let pickupReliabilityUnavailable = false;
    const monthBlocks: Array<{
      start_date: string;
      end_date: string;
      finalized_operating_day_count: number;
    }> = [];

    /*
     * Deliberately sequential.
     *
     * Each RPC request retrieves no more than one calendar month
     * of canonical FINAL DSW history. Interpretation does not occur
     * in this route.
     */
    for (const range of monthRanges) {
      const { data, error } = await supabase.rpc(
        "get_company_operations_history",
        {
          p_company_id: company.id,
          p_start_date: range.start_date,
          p_end_date: range.end_date,
        }
      );

      if (error) {
        const status =
          error.code === "42501"
            ? 403
            : error.code === "22023"
              ? 400
              : 500;

        return NextResponse.json(
          {
            error:
              `Failed to load FINAL DSW block ` +
              `${range.start_date} through ` +
              `${range.end_date}: ${error.message}`,
            available_years: availableContracts,
            metadata: null,
            rows: [],
          },
          { status }
        );
      }

      const rows = Array.isArray(data)
        ? (data as HistoryRow[])
        : [];

      collectedRows.push(...rows);

      monthBlocks.push({
        start_date: range.start_date,
        end_date: range.end_date,
        finalized_operating_day_count:
          deduplicateHistoryRows(rows).length,
      });

      if (!pickupReliabilityUnavailable) {
        const {
          data: pickupReliabilityData,
          error: pickupReliabilityError,
        } = await supabase.rpc(
          "get_company_pickup_reliability_history",
          {
            p_company_id: company.id,
            p_start_date: range.start_date,
            p_end_date: range.end_date,
          }
        );

        pickupReliabilityUnavailable =
          pickupReliabilityError?.code === "PGRST202" ||
          pickupReliabilityError?.code === "42883";

        if (pickupReliabilityError && !pickupReliabilityUnavailable) {
          const status =
            pickupReliabilityError.code === "42501"
              ? 403
              : pickupReliabilityError.code === "22023"
                ? 400
                : 500;

          return NextResponse.json(
            {
              error:
                `Failed to load pickup reliability block ` +
                `${range.start_date} through ${range.end_date}: ` +
                pickupReliabilityError.message,
              available_years: availableContracts,
              metadata: null,
              rows: [],
            },
            { status }
          );
        }

        if (Array.isArray(pickupReliabilityData)) {
          collectedPickupReliabilityRows.push(
            ...(pickupReliabilityData as PickupReliabilityRow[])
          );
        }
      }
    }

    const rows =
      deduplicateHistoryRows(collectedRows);

    const pickupReliabilityByDate = new Map(
      collectedPickupReliabilityRows.map((row) => [
        String(row.service_date ?? "").slice(0, 10),
        row,
      ])
    );

    const enrichedRows = rows.map((row) => ({
      ...row,
      ...(pickupReliabilityByDate.get(
        String(row.service_date ?? "").slice(0, 10)
      ) ?? {}),
    }));

    const throughServiceDate =
      enrichedRows.length > 0
        ? String(
            enrichedRows.at(-1)?.service_date ?? ""
          ).slice(0, 10) || null
        : null;

    return NextResponse.json(
      {
        available_years: availableContracts,
        contract: selectedContract
          ? {
              id: selectedContract.id,
              contract_number: selectedContract.contract_number,
              terminal_identity: selectedContract.terminal_identity,
              service_area: selectedContract.service_area,
              status: selectedContract.status,
              effective_start_date:
                selectedContract.effective_start_date,
              effective_end_date:
                selectedContract.effective_end_date,
            }
          : null,
        metadata: {
          requested_year: requestedCalendarYear,
          calendar_year: requestedCalendarYear,
          preset: resolvedContext.preset,
          comparison_mode: resolvedContext.comparison_mode,
          payload_target: targetParam,
          contract_id: resolvedContext.contract_id,
          contributing_contracts: contributingContracts,
          primary_range: resolvedContext.primary,
          comparison_range: resolvedContext.comparison,
          start_date: startDate,
          end_date: endDate,
          generated_at: new Date().toISOString(),
          through_service_date: throughServiceDate,
          source_family: "DSW",
          snapshot_kind: "FINAL",
          payload_grain: "OPERATING_DAY",
          retrieval_strategy:
            "SEQUENTIAL_CALENDAR_MONTH_BLOCKS",
          requested_month_count:
            monthBlocks.length,
          finalized_operating_day_count:
            enrichedRows.length,
          pickup_reliability_available:
            !pickupReliabilityUnavailable,
          month_blocks: monthBlocks,
        },
        rows: enrichedRows,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load the contract FINAL DSW payload.",
        available_years: [],
        metadata: null,
        rows: [],
      },
      { status: 500 }
    );
  }
}
