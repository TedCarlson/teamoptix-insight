import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalizeRequired(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeOptional(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      session_id?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      display_name?: unknown;
      mobile_phone?: unknown;
    };

    const first_name = normalizeRequired(body.first_name);
    const last_name = normalizeRequired(body.last_name);
    const display_name = normalizeOptional(body.display_name);
    const mobile_phone = normalizeOptional(body.mobile_phone);
    const session_id = normalizeOptional(body.session_id);

    const email =
      typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json(
        { error: "Authenticated user email is missing." },
        { status: 400 }
      );
    }

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 }
      );
    }

    const { data: profileId, error: profileError } = await supabase.rpc("save_profile_setup", {
      p_auth_user_id: user.id,
      p_email: email,
      p_first_name: first_name,
      p_last_name: last_name,
      p_display_name: display_name,
      p_mobile_phone: mobile_phone,
    });

    if (profileError || !profileId) {
      return NextResponse.json(
        { error: profileError?.message ?? "Failed to save profile." },
        { status: 500 }
      );
    }

    if (session_id) {
      await supabase
        .from("onboarding_step_progress")
        .upsert(
          {
            session_id,
            step_key: "profile",
            completed: true,
            completed_at: new Date().toISOString(),
          },
          {
            onConflict: "session_id,step_key",
          }
        );
    }

    return NextResponse.json(
      {
        success: true,
        profile_id: profileId,
        email,
        first_name,
        last_name,
        display_name,
        mobile_phone,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save profile setup.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
