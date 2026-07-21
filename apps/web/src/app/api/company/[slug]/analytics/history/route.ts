import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type ContractConfig = {
  id: string;
  contract_number: string | null;
  terminal_identity: string | null;
  service_area: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  status: string | null;
};

type HistoryRow = {
  service_date?: string | null;
  [key: string]: unknown;
};

type MonthRange = {
  start_date: string;
  end_date: string;
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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function minDate(left: string, right: string): string {
  return left <= right ? left : right;
}

function contractOperatingYear(
  contract: ContractConfig,
  today: string
): number {
  const effectiveEnd =
    contract.effective_end_date &&
    contract.effective_end_date < today
      ? contract.effective_end_date
      : today;

  return Number(effectiveEnd.slice(0, 4));
}

function buildMonthRanges(
  startDate: string,
  endDate: string
): MonthRange[] {
  const ranges: MonthRange[] = [];

  let cursor = parseIsoDate(startDate);
  const finalDate = parseIsoDate(endDate);

  while (cursor <= finalDate) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();

    const monthStart = new Date(
      Date.UTC(year, month, 1, 12, 0, 0)
    );

    const monthEnd = new Date(
      Date.UTC(year, month + 1, 0, 12, 0, 0)
    );

    const rangeStart =
      isoDate(monthStart) < startDate
        ? startDate
        : isoDate(monthStart);

    const rangeEnd =
      isoDate(monthEnd) > endDate
        ? endDate
        : isoDate(monthEnd);

    ranges.push({
      start_date: rangeStart,
      end_date: rangeEnd,
    });

    cursor = new Date(
      Date.UTC(year, month + 1, 1, 12, 0, 0)
    );
  }

  return ranges;
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
    const requestedOperatingYear = integer(yearParam);

    if (
      yearParam !== null &&
      (
        requestedOperatingYear === null ||
        requestedOperatingYear < 2020 ||
        requestedOperatingYear > 2100
      )
    ) {
      return NextResponse.json(
        {
          error: "A valid contract operating year is required.",
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
    ) as unknown as ContractConfig[];

    const contracts = contractRows.filter(
      (row) =>
        Boolean(row.id && row.effective_start_date)
    );

    const availableContracts = contracts
      .filter(
        (contract) =>
          contract.effective_start_date <= today
      )
      .map((contract) => {
        const operatingYear = contractOperatingYear(
          contract,
          today
        );

        const effectiveEnd = minDate(
          contract.effective_end_date ?? today,
          today
        );

        return {
          operating_year: operatingYear,
          contract_id: contract.id,
          contract_number: contract.contract_number,
          terminal_identity: contract.terminal_identity,
          service_area: contract.service_area,
          effective_start_date:
            contract.effective_start_date,
          effective_end_date: effectiveEnd,
          status: contract.status,
        };
      })
      .sort(
        (left, right) =>
          right.operating_year -
            left.operating_year ||
          right.effective_start_date.localeCompare(
            left.effective_start_date
          )
      );

    if (requestedOperatingYear === null) {
      return NextResponse.json(
        {
          available_years: availableContracts,
          metadata: null,
          rows: [],
        },
        { status: 200 }
      );
    }

    const contract = contracts.find(
      (candidate) =>
        contractOperatingYear(candidate, today) ===
        requestedOperatingYear
    );

    if (!contract) {
      return NextResponse.json(
        {
          error:
            `No contract period was found for operating year ` +
            `${requestedOperatingYear}.`,
          available_years: availableContracts,
          metadata: null,
          rows: [],
        },
        { status: 404 }
      );
    }

    const startDate = contract.effective_start_date;
    const endDate = minDate(
      contract.effective_end_date ?? today,
      today
    );

    if (startDate > endDate) {
      return NextResponse.json(
        {
          error:
            "The selected contract period has no elapsed operating dates.",
          available_years: availableContracts,
          metadata: null,
          rows: [],
        },
        { status: 400 }
      );
    }

    const monthRanges = buildMonthRanges(
      startDate,
      endDate
    );

    const collectedRows: HistoryRow[] = [];
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
    }

    const rows =
      deduplicateHistoryRows(collectedRows);

    const throughServiceDate =
      rows.length > 0
        ? String(
            rows.at(-1)?.service_date ?? ""
          ).slice(0, 10) || null
        : null;

    return NextResponse.json(
      {
        available_years: availableContracts,
        contract: {
          id: contract.id,
          contract_number:
            contract.contract_number,
          terminal_identity:
            contract.terminal_identity,
          service_area: contract.service_area,
          status: contract.status,
          effective_start_date: startDate,
          effective_end_date: endDate,
          operating_year: requestedOperatingYear,
        },
        metadata: {
          requested_year: requestedOperatingYear,
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
            rows.length,
          month_blocks: monthBlocks,
        },
        rows,
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
