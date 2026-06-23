import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      automation_type: "FCC",
      status: "DISABLED",
      message: "Browser automation is disabled on Vercel. Use manual report upload until the worker automation path is enabled.",
    },
    { status: 503 }
  );
}
