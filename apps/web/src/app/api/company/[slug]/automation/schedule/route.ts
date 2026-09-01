import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  loadAssignedOperationsRunnerSchedule,
  resolveAssignedOperationsRunnerKey,
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

    const service = createSupabaseServiceRoleClient();
    const { runnerKey, schedule } =
      await loadAssignedOperationsRunnerSchedule(service, slug);

    return NextResponse.json({
      row: schedule,
      can_manage: true,
      runner_key: runnerKey,
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
    const incomingReportConfig =
      body.report_config_json && typeof body.report_config_json === "object"
        ? body.report_config_json
        : {};
    const incomingRunGate =
      incomingReportConfig.run_gate &&
      typeof incomingReportConfig.run_gate === "object"
        ? incomingReportConfig.run_gate
        : {};
    const incomingRouteCloseout =
      incomingReportConfig.route_closeout &&
      typeof incomingReportConfig.route_closeout === "object"
        ? incomingReportConfig.route_closeout
        : {};
    const incomingDroAm =
      incomingReportConfig.dro_am &&
      typeof incomingReportConfig.dro_am === "object"
        ? incomingReportConfig.dro_am
        : {};
    const requiredRouteCloseoutReports = [
      "FCC",
      "DELIVERY_MANIFEST",
      "PICKUP_MANIFEST",
      "ROUTE_GPX",
    ];
    const routeCloseoutReports = Array.from(
      new Set([
        ...(Array.isArray(incomingRouteCloseout.reports)
          ? incomingRouteCloseout.reports.map((value: unknown) =>
              String(value).toUpperCase()
            )
          : []),
        ...requiredRouteCloseoutReports,
      ])
    );
    const gateAuthority = String(
      incomingRunGate.authority ?? "MANUAL"
    ).toUpperCase();

    if (gateAuthority !== "MANUAL") {
      return NextResponse.json(
        {
          error:
            "Billing and payment authority is prepared but not active. Keep Manual authority selected until payment-state reconciliation is deployed.",
        },
        { status: 409 }
      );
    }

    const manualState =
      String(incomingRunGate.manual_state ?? "").toUpperCase() === "ACTIVE" ||
      (incomingRunGate.manual_state == null && Boolean(body.collection_enabled))
        ? "ACTIVE"
        : "INACTIVE";
    const boundedInteger = (
      value: unknown,
      fallback: number,
      minimum: number,
      maximum: number
    ) => {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? Math.max(minimum, Math.min(Math.trunc(parsed), maximum))
        : fallback;
    };
    const reportConfig = {
      previous_day_close: ["DSW"],
      dro_am: {
        start_time: "04:00",
        reports: ["DRO"],
        ...incomingDroAm,
        enabled: incomingDroAm.enabled === true,
      },
      operations_pulse: [
        "DSW",
        "FCC",
        "DELIVERY_MANIFEST",
        "PICKUP_MANIFEST",
      ],
      operating_weekdays: [1, 2, 3, 4, 5, 6],
      operating_date_overrides: {},
      ...incomingReportConfig,
      operations_pulse_interval_minutes: boundedInteger(
        incomingReportConfig.operations_pulse_interval_minutes,
        60,
        15,
        1440
      ),
      route_closeout: {
        start_time: "19:30",
        end_time: "23:50",
        final_sweep_start_time: "23:30",
        retained_gpx_recovery_start_time: "03:10",
        ...incomingRouteCloseout,
        enabled: incomingRouteCloseout.enabled === true,
        target_poll_interval_minutes: boundedInteger(
          incomingRouteCloseout.target_poll_interval_minutes,
          15,
          5,
          120
        ),
        fcc_interval_minutes: boundedInteger(
          incomingRouteCloseout.fcc_interval_minutes,
          15,
          15,
          120
        ),
        dsw_interval_minutes: boundedInteger(
          incomingRouteCloseout.dsw_interval_minutes,
          30,
          30,
          240
        ),
        route_batch_size: boundedInteger(
          incomingRouteCloseout.route_batch_size,
          3,
          1,
          6
        ),
        previous_day_recovery_enabled:
          incomingRouteCloseout.previous_day_recovery_enabled === true,
        previous_day_recovery_max_batches: boundedInteger(
          incomingRouteCloseout.previous_day_recovery_max_batches,
          2,
          1,
          4
        ),
        retained_gpx_recovery_enabled:
          incomingRouteCloseout.retained_gpx_recovery_enabled === true,
        retained_gpx_recovery_max_batches: boundedInteger(
          incomingRouteCloseout.retained_gpx_recovery_max_batches,
          2,
          1,
          4
        ),
        retained_gpx_recovery_interval_minutes: boundedInteger(
          incomingRouteCloseout.retained_gpx_recovery_interval_minutes,
          120,
          60,
          1440
        ),
        reports: routeCloseoutReports,
      },
      run_gate: {
        authority: "MANUAL",
        manual_state: manualState,
      },
    };

    const service = createSupabaseServiceRoleClient();
    const runnerKey = await resolveAssignedOperationsRunnerKey(service, slug);
    const { data, error } = await service.rpc(
      "save_operations_runner_schedule",
      {
        p_company_slug: slug,
        p_runner_key: runnerKey,
        p_timezone: body.timezone ?? "America/New_York",
        p_collection_enabled: manualState === "ACTIVE",
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
        p_report_config_json: reportConfig,
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

    return NextResponse.json({
      row: data,
      runner_sync: {
        status: "PENDING",
        message: "The assigned runner will apply this schedule on its next private poll.",
      },
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
