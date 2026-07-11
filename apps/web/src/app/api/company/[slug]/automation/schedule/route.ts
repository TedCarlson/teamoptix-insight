import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    const { data, error } = await supabase.rpc(
      "get_operations_automation_schedule_config",
      { p_company_slug: slug }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load schedule.",
        rows: [],
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

    const { data, error } = await supabase.rpc(
      "save_operations_automation_schedule_config_with_window",
      {
        p_company_slug: slug,
        p_automation_type: body.automation_type,
        p_is_enabled: Boolean(body.is_enabled),
        p_cadence_minutes: Number(body.cadence_minutes),
        p_window_preset: body.window_preset,
        p_start_time: body.start_time,
        p_end_time: body.end_time,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ row: data });
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
