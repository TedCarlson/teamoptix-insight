import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      automation_type: "OPERATIONS_REFRESH",
      status: "DISABLED",
      message: "Automated Update Ops is disabled on Vercel. Manual report upload remains the active production path.",
      steps: {
        dsw: { ok: false, status: 503, duration_ms: 0, result: { message: "DSW automation disabled." } },
        fcc: { ok: false, status: 503, duration_ms: 0, result: { message: "FCC automation disabled." } },
      },
    },
    { status: 503 }
  );
}
