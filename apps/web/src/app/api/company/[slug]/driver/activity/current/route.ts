import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function deriveState(events: ActivityEvent[]) {
  const latest = events[0] ?? null;
  const openClockIn = events.find((event) => event.event_type === "CLOCK_IN") ?? null;
  const latestClockOut = events.find((event) => event.event_type === "CLOCK_OUT") ?? null;

  if (!openClockIn) {
    return {
      state: "CLOCKED_OUT",
      latest,
      lastClockIn: null,
      lastClockOut: latestClockOut,
    };
  }

  if (latestClockOut && new Date(latestClockOut.occurred_at) > new Date(openClockIn.occurred_at)) {
    return {
      state: "CLOCKED_OUT",
      latest,
      lastClockIn: openClockIn,
      lastClockOut: latestClockOut,
    };
  }

  return {
    state: "CLOCKED_IN",
    latest,
    lastClockIn: openClockIn,
    lastClockOut: latestClockOut,
  };
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

  const query = supabase
    .from("driver_activity_event_v")
    .select("id, event_type, service_date, occurred_at")
    .eq("company_id", company.id)
    .eq("service_date", serviceDate)
    .order("occurred_at", { ascending: false })
    .limit(20);

  const scopedQuery = typedAccess?.profile_id
    ? query.eq("profile_id", typedAccess.profile_id)
    : query;

  const { data: events, error: eventsError } = await scopedQuery;

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const state = deriveState((events ?? []) as ActivityEvent[]);

  return NextResponse.json({
    ok: true,
    serviceDate,
    state: state.state,
    latest: state.latest,
    lastClockIn: state.lastClockIn,
    lastClockOut: state.lastClockOut,
    events: events ?? [],
  });
}
