import { NextRequest, NextResponse } from "next/server";
import { getDispatchRequestContext } from "@/features/dispatch/server/resolveDispatchCompany.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type BlackoutBody = {
  action?: unknown;
  dates?: unknown;
  message?: unknown;
};

type AccessContext = {
  profile_id?: string | null;
};

const DEFAULT_BLACKOUT_MESSAGE =
  "This date is part of a blackout period. If you have a persistent need for time off, please contact your leadership team directly.";

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanDates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isIsoDate))).sort().slice(0, 371);
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const startDate = req.nextUrl.searchParams.get("start_date");
    const endDate = req.nextUrl.searchParams.get("end_date");

    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      return NextResponse.json(
        { error: "A valid start_date and end_date are required.", rows: [] },
        { status: 400 }
      );
    }

    const ctx = await getDispatchRequestContext(slug);
    if ("error" in ctx) return ctx.error;

    const { data, error } = await ctx.supabase.rpc("operations_blackout_dates", {
      p_company_slug: slug,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ rows: Array.isArray(data) ? data : [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load blackout dates.",
        rows: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = (await req.json()) as BlackoutBody;
    const action = typeof body.action === "string" ? body.action.toUpperCase() : "";
    const dates = cleanDates(body.dates);
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : DEFAULT_BLACKOUT_MESSAGE;

    if (action !== "SET" && action !== "REMOVE") {
      return NextResponse.json(
        { error: "Blackout action must be SET or REMOVE." },
        { status: 400 }
      );
    }
    if (dates.length < 1) {
      return NextResponse.json(
        { error: "Select at least one blackout date." },
        { status: 400 }
      );
    }
    if (message.length > 300) {
      return NextResponse.json(
        { error: "Blackout guidance is limited to 300 characters." },
        { status: 400 }
      );
    }

    const ctx = await getDispatchRequestContext(slug);
    if ("error" in ctx) return ctx.error;
    const profileId = (ctx.access as AccessContext | null)?.profile_id ?? null;

    const { data, error } = await ctx.supabase.rpc(
      "set_operations_blackout_dates",
      {
        p_company_id: ctx.company.id,
        p_dates: dates,
        p_action: action,
        p_message: message,
        p_created_by_profile_id: profileId,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message, step: "set_operations_blackout_dates" },
        { status: 400 }
      );
    }

    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update blackout dates.",
      },
      { status: 500 }
    );
  }
}
