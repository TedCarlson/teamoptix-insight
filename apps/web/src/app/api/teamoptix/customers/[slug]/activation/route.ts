import { NextResponse } from "next/server";

import {
  CustomerActivationError,
  getCompanyActivationSnapshot,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const snapshot = await getCompanyActivationSnapshot(slug);

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

    const message =
      error instanceof Error
        ? error.message
        : "Unexpected customer activation error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
        code: "unexpected_activation_error",
      },
      { status: 500 }
    );
  }
}
