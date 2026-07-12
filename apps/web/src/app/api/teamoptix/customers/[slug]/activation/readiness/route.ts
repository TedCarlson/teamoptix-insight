import { NextResponse } from "next/server";

import {
  CustomerActivationError,
  updateManualActivationReadiness,
  type ActivationReadinessKey,
  type ActivationReadinessStatus,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

export const runtime = "nodejs";

const READINESS_KEYS = new Set<ActivationReadinessKey>([
  "commercial_ready",
  "implementation_payment_ready",
  "contract_ready",
  "workspace_ready",
  "credentials_ready",
  "automation_ready",
  "training_ready",
  "customer_approval_ready",
]);

const READINESS_STATUSES = new Set<ActivationReadinessStatus>([
  "incomplete",
  "ready",
  "not_applicable",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await request.json();

    if (!READINESS_KEYS.has(body.readiness_key)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid readiness key.",
          code: "invalid_readiness_key",
        },
        { status: 400 }
      );
    }

    if (!READINESS_STATUSES.has(body.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid readiness status.",
          code: "invalid_readiness_status",
        },
        { status: 400 }
      );
    }

    const snapshot = await updateManualActivationReadiness({
      slug,
      readiness_key: body.readiness_key,
      status: body.status,
      source_basis:
        typeof body.source_basis === "string"
          ? body.source_basis
          : null,
      blocking_reason:
        typeof body.blocking_reason === "string"
          ? body.blocking_reason
          : null,
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
            : "Unexpected readiness update error.",
        code: "unexpected_readiness_error",
      },
      { status: 500 }
    );
  }
}
