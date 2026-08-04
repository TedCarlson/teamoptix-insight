import { NextResponse } from "next/server";
import { verifyTurnstileDetailed } from "@/lib/security/turnstile";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.consent) return NextResponse.json({ error: "Consent is required." }, { status: 400 });

    if (process.env.TURNSTILE_REQUIRED === "true") {
      const token = clean(body.captchaToken);
      if (!token) return NextResponse.json({ error: "Security verification is required." }, { status: 400 });
      const remoteIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const verification = await verifyTurnstileDetailed(token, remoteIp);
      if (!verification.success) return NextResponse.json({ error: "Security verification failed. Please try again." }, { status: 403 });
    }

    const session = await getSupabaseServerClient();
    const { data: auth } = await session.auth.getUser();
    let profileId: string | null = null;
    if (auth.user?.id) {
      await session.rpc("ensure_access_context");
      const { data: profile } = await session.from("profiles").select("id,email").eq("auth_user_id", auth.user.id).maybeSingle();
      if (profile && clean(body.email).toLowerCase() === String(profile.email).toLowerCase()) profileId = profile.id;
    }

    const { data, error } = await createSupabaseServiceRoleClient().rpc("submit_candidate_foyer_application", {
      p_company_slug: clean(body.companySlug) || null,
      p_entry_code: clean(body.entryCode) || null,
      p_profile_id: profileId,
      p_email: clean(body.email),
      p_first_name: clean(body.firstName),
      p_last_name: clean(body.lastName),
      p_phone: clean(body.phone) || null,
      p_role_interest: clean(body.roleInterest) || null,
      p_location_interest: clean(body.locationInterest) || null,
      p_assignment_key: clean(body.assignmentKey) || null,
      p_work_history: clean(body.workHistory) || null,
      p_interview_slot_id: clean(body.interviewSlotId) || null,
      p_timezone: clean(body.timezone) || "America/New_York",
    });

    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate submission failed." }, { status: 500 });
  }
}
