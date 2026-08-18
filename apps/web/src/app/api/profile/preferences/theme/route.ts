import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const supportedPreferences = new Set(["system", "light", "dark"]);

export async function PATCH(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { preference?: unknown };
  const preference = typeof body.preference === "string" ? body.preference.trim().toLowerCase() : "";

  if (!supportedPreferences.has(preference)) {
    return NextResponse.json(
      { error: "Theme preference must be system, light, or dark." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("set_profile_theme_preference", {
    p_preference: preference,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { preference: data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
