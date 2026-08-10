import { NextResponse } from "next/server";
import {
  activePendingMemberships,
  pendingInviteHref,
} from "@/features/onboarding/lib/pendingInvite";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user?.id || !user.email || userError) {
      return NextResponse.json(
        { pending_invite: null },
        { status: 401, headers: noStoreHeaders }
      );
    }

    const { data: access, error: accessError } = await supabase.rpc("access_context");

    if (accessError) {
      return NextResponse.json(
        { error: accessError.message, pending_invite: null },
        { status: 500, headers: noStoreHeaders }
      );
    }

    const pendingMemberships = activePendingMemberships(access?.memberships);

    const pendingCompanyIds = pendingMemberships
      .map((membership) => membership.company_id)
      .filter((companyId): companyId is string => Boolean(companyId));

    if (pendingCompanyIds.length === 0) {
      return NextResponse.json(
        { pending_invite: null },
        { status: 200, headers: noStoreHeaders }
      );
    }

    const { data: invites, error: inviteError } = await admin
      .from("hiring_invite_token")
      .select("token, company_id, expires_at, created_at")
      .eq("email", user.email.trim().toLowerCase())
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .in("company_id", pendingCompanyIds)
      .order("created_at", { ascending: false })
      .limit(10);

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message, pending_invite: null },
        { status: 500, headers: noStoreHeaders }
      );
    }

    const invite = invites?.find((row) =>
      pendingCompanyIds.includes(String(row.company_id))
    );

    if (!invite?.token) {
      return NextResponse.json(
        { pending_invite: null },
        { status: 200, headers: noStoreHeaders }
      );
    }

    const membership = pendingMemberships.find(
      (row) => row.company_id === String(invite.company_id)
    );

    const { data: session } = await admin
      .from("onboarding_session")
      .select("id, status, auth_user_id")
      .eq("invite_token", invite.token)
      .eq("auth_user_id", user.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const href = pendingInviteHref(invite.token, session?.id);

    return NextResponse.json(
      {
        pending_invite: {
          company_id: String(invite.company_id),
          company_name: membership?.company_name ?? "Company workspace",
          company_slug: membership?.company_slug ?? null,
          expires_at: String(invite.expires_at),
          href,
        },
      },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load pending invitation.";

    return NextResponse.json(
      { error: message, pending_invite: null },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
