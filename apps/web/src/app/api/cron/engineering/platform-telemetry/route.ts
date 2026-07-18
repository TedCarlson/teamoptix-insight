import { NextRequest, NextResponse } from "next/server";
import { collectPlatformTelemetry } from "@/features/teamoptix/engineering/platformTelemetry.server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, checks: await collectPlatformTelemetry() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Telemetry collection failed." }, { status: 500 });
  }
}
