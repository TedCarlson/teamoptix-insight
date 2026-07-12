import { NextResponse } from "next/server";

import {
  beginCompanyGoLive,
  CustomerActivationError,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const snapshot = await beginCompanyGoLive(slug);

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
            : "Unexpected Go Live request error.",
        code: "unexpected_go_live_error",
      },
      { status: 500 }
    );
  }
}
