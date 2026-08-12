import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getOrCreateFedExAutomationProfile,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyBySlug(supabase, slug);

    if (resolved.error || !resolved.company) {
      return NextResponse.json(
        { error: resolved.error ?? "Company not found." },
        { status: 404 }
      );
    }

    const result = await getOrCreateFedExAutomationProfile(
      supabase,
      resolved.company.id
    );

    if (result.error || !result.profile) {
      return NextResponse.json(
        { error: result.error ?? "Failed to load automation profile." },
        { status: 500 }
      );
    }

    const { data: scheduleData, error: scheduleError } =
      await createSupabaseServiceRoleClient().rpc(
        "get_operations_runner_schedule",
        { p_company_slug: slug }
      );
    const schedules = Array.isArray(scheduleData)
      ? scheduleData
      : scheduleData
        ? [scheduleData]
        : [];
    const schedule = scheduleError ? null : schedules[0] ?? null;
    const runnerState = String(schedule?.runner_state ?? "").toUpperCase();
    const collectionHealth =
      runnerState === "ERROR"
        ? "ACTION_REQUIRED"
        : schedule?.collection_enabled === false
          ? "DISABLED"
          : Number(schedule?.applied_version ?? 0) <
              Number(schedule?.config_version ?? 0)
            ? "WARNING"
            : result.profile.status;

    return NextResponse.json(
      {
        provider_key: result.profile.provider_key,
        status: result.profile.status,
        profile_id: result.profile.id,
        company_id: resolved.company.id,
        updated_at: result.profile.updated_at,
        collection_health: collectionHealth,
        runner_state: schedule?.runner_state ?? null,
        runner_last_seen_at: schedule?.runner_last_seen_at ?? null,
        runner_last_error: schedule?.runner_last_error ?? null,
        runner_config_version: schedule?.config_version ?? null,
        runner_applied_version: schedule?.applied_version ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load automation status.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
