import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: company, error: companyError } = await supabase.from("companies").select("id").eq("company_slug", slug).single();
  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 400 });
  const [slots, interviews, leadership, owner] = await Promise.all([
    supabase.from("candidate_interview_slots_v").select("*").eq("company_id", company.id).order("starts_at"),
    supabase.from("candidate_interviews_v").select("*").eq("company_id", company.id).order("starts_at", { nullsFirst: false }),
    supabase.rpc("get_company_leadership_config", { p_company_slug: slug }),
    supabase.rpc("get_candidate_interview_owner", { p_company_slug: slug }),
  ]);
  const error = slots.error || interviews.error || leadership.error || owner.error;
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ slots: slots.data ?? [], interviews: interviews.data ?? [], leadership: leadership.data ?? null, owner: owner.data ?? null });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await request.json();
  const supabase = await getSupabaseServerClient();

  if (body.mode === "baseline") {
    const { data, error } = await supabase.rpc("create_candidate_interview_slots", {
      p_company_slug: slug,
      p_slots: Array.isArray(body.slots) ? body.slots : [],
      p_timezone: body.timezone || "America/New_York",
      p_meeting_provider: body.meetingProvider || "insight",
      p_meeting_url: body.meetingUrl || null,
    });

    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json(data);
  }

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(startsAt.getTime() + Math.max(15, Number(body.durationMinutes) || 30) * 60_000);
  const { data, error } = await supabase.rpc("create_candidate_interview_slot", {
    p_company_slug: slug,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_timezone: body.timezone || "America/New_York",
    p_meeting_provider: body.meetingProvider || "insight",
    p_meeting_url: body.meetingUrl || null,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
