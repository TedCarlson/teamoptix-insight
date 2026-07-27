import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  OPERATIONS_RUNNER_KEY,
  pushOperationsRunnerSchedule,
} from "@/features/automation/server/runner-control";

export const runtime = "nodejs";

type AccessContext = {
  is_platform_owner?: boolean;
  memberships?: Array<{
    company_slug?: string;
    membership_status?: string;
  }>;
};

async function resolveScheduleAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  slug: string
) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      ),
      isPlatformOwner: false,
    };
  }

  const { data: access, error: accessError } =
    await supabase.rpc("access_context");

  if (accessError) {
    return {
      error: NextResponse.json(
        { error: accessError.message },
        { status: 500 }
      ),
      isPlatformOwner: false,
    };
  }

  const typedAccess = access as AccessContext | null;
  const isPlatformOwner = Boolean(typedAccess?.is_platform_owner);

  const hasCompanyAccess =
    isPlatformOwner ||
    Boolean(
      typedAccess?.memberships?.some(
        (membership) =>
          membership.company_slug === slug &&
          membership.membership_status === "active"
      )
    );

  if (!hasCompanyAccess) {
    return {
      error: NextResponse.json(
        { error: "Forbidden." },
        { status: 403 }
      ),
      isPlatformOwner,
    };
  }

  return {
    error: null,
    isPlatformOwner,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const access = await resolveScheduleAccess(supabase, slug);

    if (access.error) {
      return access.error;
    }

    if (!access.isPlatformOwner) {
      return NextResponse.json(
        { error: "Automation schedules are managed by Team Optix." },
        { status: 403 }
      );
    }

    const { data, error } = await createSupabaseServiceRoleClient().rpc(
      "get_operations_runner_schedule",
      { p_company_slug: slug }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message, row: null },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];

    return NextResponse.json({
      row: rows[0] ?? null,
      can_manage: true,
      runner_key: OPERATIONS_RUNNER_KEY,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load schedule.",
        row: null,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const access = await resolveScheduleAccess(supabase, slug);

    if (access.error) {
      return access.error;
    }

    if (!access.isPlatformOwner) {
      return NextResponse.json(
        {
          error:
            "Automation schedules are managed by Team Optix.",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc(
      "save_operations_runner_schedule",
      {
        p_company_slug: slug,
        p_runner_key: OPERATIONS_RUNNER_KEY,
        p_timezone: body.timezone ?? "America/New_York",
        p_collection_enabled: Boolean(body.collection_enabled),
        p_previous_day_close_enabled: Boolean(
          body.previous_day_close_enabled
        ),
        p_previous_day_close_time:
          body.previous_day_close_time ?? "03:00",
        p_operations_pulse_enabled: Boolean(
          body.operations_pulse_enabled
        ),
        p_operations_pulse_start_time:
          body.operations_pulse_start_time ?? "07:30",
        p_operations_pulse_end_time:
          body.operations_pulse_end_time ?? "19:30",
        p_report_config_json: body.report_config_json ?? {
          previous_day_close: ["DSW"],
          operations_pulse: [
            "DSW",
            "FCC",
            "DELIVERY_MANIFEST",
            "PICKUP_MANIFEST",
          ],
          operating_weekdays: [1, 2, 3, 4, 5, 6],
          operating_date_overrides: {},
        },
        p_recovery_config_json:
          body.recovery_config_json ?? { enabled: false },
        p_historical_config_json:
          body.historical_config_json ?? { enabled: false },
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    let runnerSync: {
      status: "APPLIED" | "PENDING";
      error?: string;
    } = { status: "PENDING" };
    let row = data;

    try {
      await pushOperationsRunnerSchedule(service);

      const { data: refreshed } = await service.rpc(
        "get_operations_runner_schedule",
        { p_company_slug: slug }
      );
      const refreshedRows = Array.isArray(refreshed)
        ? refreshed
        : refreshed
          ? [refreshed]
          : [];
      row = refreshedRows[0] ?? data;
      runnerSync = { status: "APPLIED" };
    } catch (runnerError) {
      runnerSync = {
        status: "PENDING",
        error:
          runnerError instanceof Error
            ? runnerError.message
            : "Runner did not acknowledge the schedule.",
      };
    }

    return NextResponse.json({
      row,
      runner_sync: runnerSync,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save schedule.",
      },
      { status: 500 }
    );
  }
}
