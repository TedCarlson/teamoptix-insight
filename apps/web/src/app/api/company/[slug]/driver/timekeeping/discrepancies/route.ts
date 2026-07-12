import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  cleanTimekeepingOversightMode,
  deriveMissingClockOutDiscrepancies,
  isDriverCorrectionMode,
} from "@/features/driver/timekeeping/discrepancies";

export const runtime = "nodejs";

type AccessMembership = {
  company_slug?: string | null;
};

type AccessContext = {
  profile_id?: string | null;
  person_id?: string | null;
  memberships?: AccessMembership[] | null;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  service_date: string;
  occurred_at: string;
  roster_member_id: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function lookbackStart(days: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const serviceDate = req.nextUrl.searchParams.get("serviceDate") || todayIsoDate();
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  const typedAccess = access as AccessContext | null;
  const membership = typedAccess?.memberships?.find((item) => item.company_slug === slug);

  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data: config, error: configError } = await supabase.rpc("get_company_operations_config", {
    p_company_slug: slug,
  });

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  const oversightMode = cleanTimekeepingOversightMode(
    (config as { timekeeping_oversight_mode?: unknown } | null)?.timekeeping_oversight_mode
  );

  if (!isDriverCorrectionMode(oversightMode)) {
    return NextResponse.json({
      ok: true,
      serviceDate,
      oversightMode,
      blocking: false,
      discrepancies: [],
    });
  }

  const query = supabase
    .from("driver_activity_event_v")
    .select("id, event_type, service_date, occurred_at, roster_member_id")
    .eq("company_id", company.id)
    .gte("service_date", lookbackStart(21))
    .lt("service_date", serviceDate)
    .order("service_date", { ascending: true })
    .order("occurred_at", { ascending: true });

  const scopedQuery = typedAccess?.profile_id
    ? query.eq("profile_id", typedAccess.profile_id)
    : query;

  const { data: events, error: eventsError } = await scopedQuery;

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const discrepancies = deriveMissingClockOutDiscrepancies(
    (events ?? []) as ActivityEvent[],
    serviceDate
  );

  return NextResponse.json({
    ok: true,
    serviceDate,
    oversightMode,
    blocking: oversightMode === "blocking" && discrepancies.length > 0,
    discrepancies,
  });
}
