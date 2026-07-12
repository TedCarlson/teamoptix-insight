import { NextResponse } from "next/server";

import {
  CustomerActivationError,
  updateManualActivationReadiness,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const snapshot = await updateManualActivationReadiness({
      slug,
      readiness_key: "customer_approval_ready",
      status: "ready",
      source_basis:
        "Customer authorized Team Optix from the company billing workspace to proceed toward Go Live subscription activation.",
      blocking_reason: null,
    });

    return NextResponse.json({
      ok: true,
      snapshot,
    });
  } catch (error) {
    if (error instanceof CustomerActivationError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: error.code,
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected customer Go Live approval error.",
        code: "unexpected_customer_go_live_approval_error",
      },
      { status: 500 }
    );
  }
}
