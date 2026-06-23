import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      automation_type: "FCC",
      status: "DISABLED",
      message: "FCC automation is temporarily disabled while DSW is being ported to Browserbase/Puppeteer.",
    },
    { status: 503 }
  );
}
