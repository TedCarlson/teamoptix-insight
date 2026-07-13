import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LegalTaskRow = {
  id: string;
  status: string | null;
  document_title: string | null;
  version_label: string | null;
  blocking_reason: string | null;
  released_at: string | null;
  customer_accepted_at: string | null;
};

function isOpenStatus(status: string | null | undefined) {
  return status !== "EXECUTED_AND_VAULTED" && status !== "CANCELLED";
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
          tasks: [],
          open_count: 0,
          customer_action_count: 0,
          teamoptix_action_count: 0,
        },
        { status: 401 }
      );
    }

    const { data: access, error: accessError } = await supabase.rpc("access_context");

    if (accessError) {
      return NextResponse.json(
        {
          error: accessError.message,
          tasks: [],
          open_count: 0,
          customer_action_count: 0,
          teamoptix_action_count: 0,
        },
        { status: 500 }
      );
    }

    const membership = Array.isArray(access?.memberships)
      ? access.memberships.find(
          (item: { company_slug?: string | null }) => item.company_slug === slug
        ) ?? null
      : null;

    const canRead =
      Boolean(access?.is_platform_owner) ||
      (membership?.relationship_type === "admin" &&
        membership?.membership_status === "active");

    if (!canRead) {
      return NextResponse.json(
        {
          error: "You do not have permission to view legal tasks for this company.",
          tasks: [],
          open_count: 0,
          customer_action_count: 0,
          teamoptix_action_count: 0,
        },
        { status: 403 }
      );
    }

    const { data: tasks, error } = await supabase
      .from("legal_customer_legal_task_v")
      .select(
        [
          "id",
          "status",
          "document_title",
          "version_label",
          "blocking_reason",
          "released_at",
          "customer_accepted_at",
          "created_at",
          "company_slug",
        ].join(", ")
      )
      .eq("company_slug", slug)
      .order("released_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          tasks: [],
          open_count: 0,
          customer_action_count: 0,
          teamoptix_action_count: 0,
        },
        { status: 500 }
      );
    }

    const rows = ((tasks ?? []) as unknown as LegalTaskRow[]).filter((task) =>
      isOpenStatus(task.status)
    );

    return NextResponse.json(
      {
        tasks: rows,
        open_count: rows.length,
        customer_action_count: rows.filter(
          (task) => task.status === "READY_FOR_CUSTOMER_REVIEW"
        ).length,
        teamoptix_action_count: rows.filter(
          (task) => task.status === "CUSTOMER_ACCEPTED"
        ).length,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load legal tasks.";

    return NextResponse.json(
      {
        error: message,
        tasks: [],
        open_count: 0,
        customer_action_count: 0,
        teamoptix_action_count: 0,
      },
      { status: 500 }
    );
  }
}
