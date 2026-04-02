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

    const { data: existing, error: existingError } = await supabase
      .schema("core")
      .from("profiles")
      .select("id, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    let profileId: string | null = existing?.id ?? null;

    if (profileId) {
      const { error: updateError } = await supabase
        .schema("core")
        .from("profiles")
        .update({
          email,
          first_name,
          last_name,
          display_name,
          mobile_phone,
          profile_status: "active",
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .schema("core")
        .from("profiles")
        .insert({
          auth_user_id: user.id,
          email,
          first_name,
          last_name,
          display_name,
          mobile_phone,
          profile_status: "active",
          last_active_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          { error: insertError?.message ?? "Failed to create profile." },
          { status: 500 }
        );
      }

      profileId = inserted.id;
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
