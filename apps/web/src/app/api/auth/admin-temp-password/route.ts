import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function randomTempPassword() {
  return `Insight-${crypto.randomUUID().slice(0, 8)}!`;
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("profile_id, is_platform_owner")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !profile?.is_platform_owner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await req.json();
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password =
      typeof body?.password === "string" && body.password.length >= 8
        ? body.password
        : randomTempPassword();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const { data: users, error: listError } = await admin.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const target = users.users.find(
      (item) => item.email?.toLowerCase() === email
    );

    if (!target) {
      return NextResponse.json(
        { error: "Auth user not found. Have the user click the invite/sign-in once first, then retry." },
        { status: 404 }
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      target.id,
      {
        password,
        email_confirm: true,
      }
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      email,
      temporary_password: password,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to set temporary password.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
