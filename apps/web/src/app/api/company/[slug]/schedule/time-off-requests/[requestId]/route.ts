import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; requestId: string }>;
};

type ReviewPayload = {
  decision?: "APPROVED" | "DENIED";
  manager_note?: string | null;
};

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, requestId } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = (await req.json()) as ReviewPayload;

    if (body.decision !== "APPROVED" && body.decision !== "DENIED") {
      return NextResponse.json(
        { error: "decision must be APPROVED or DENIED." },
        { status: 400 }
      );
    }

    const managerNote = cleanNote(body.manager_note);
    const { data, error } = await sb.rpc("review_driver_time_off_request", {
      p_company_slug: slug,
      p_request_id: requestId,
      p_decision: body.decision,
      p_manager_note: managerNote,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, step: "review_driver_time_off_request" },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to review time off request.",
      },
      { status: 500 }
    );
  }
}
