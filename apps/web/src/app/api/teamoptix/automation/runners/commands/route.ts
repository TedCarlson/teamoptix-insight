import { NextRequest, NextResponse } from "next/server";
import { parseRunnerCommandRequest } from "@/features/automation/runnerFleetControl";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AccessContext = {
  is_platform_owner?: boolean;
};

function commandErrorStatus(code: string | undefined) {
  if (code === "42501") return 403;
  if (["23503", "23505", "40001", "55000"].includes(code ?? "")) {
    return 409;
  }
  if (code === "22023") return 400;
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: access, error: accessError } = await supabase.rpc(
      "access_context"
    );
    if (accessError) {
      return NextResponse.json(
        { error: accessError.message },
        { status: 500 }
      );
    }
    if (!(access as AccessContext | null)?.is_platform_owner) {
      return NextResponse.json(
        { error: "Only Team Optix platform owners can control runners." },
        { status: 403 }
      );
    }

    const parsed = parseRunnerCommandRequest(
      await request.json().catch(() => null)
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const command = parsed.value;
    const idempotencyKey = command.idempotencyKey ?? crypto.randomUUID();
    const { data: commandId, error: commandError } = await supabase.rpc(
      "request_operations_runner_command",
      {
        p_company_slug: command.companySlug,
        p_runner_id: command.runnerId,
        p_assignment_id: command.assignmentId,
        p_command_type: command.commandType,
        p_expected_assignment_version: command.expectedAssignmentVersion,
        p_expected_config_version: command.expectedConfigVersion,
        p_reason: command.reason,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (commandError || !commandId) {
      return NextResponse.json(
        {
          error:
            commandError?.message ?? "The runner command was not recorded.",
        },
        { status: commandErrorStatus(commandError?.code) }
      );
    }

    const { data: recordedCommand, error: readError } =
      await createSupabaseServiceRoleClient()
        .from("operations_runner_command_v")
        .select(
          "id,idempotency_key,runner_key,runner_display_name,assignment_id,company_slug,company_name,terminal_code,terminal_name,command_type,command_state,reason,expires_at,created_at"
        )
        .eq("id", String(commandId))
        .single();

    if (readError || !recordedCommand) {
      return NextResponse.json(
        {
          error:
            readError?.message ??
            "The command was recorded but its acknowledgement could not be loaded.",
          command_id: String(commandId),
          idempotency_key: idempotencyKey,
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      { command: recordedCommand },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The runner command could not be recorded.",
      },
      { status: 500 }
    );
  }
}
