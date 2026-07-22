import { NextResponse } from "next/server";
import { readIntakeContract } from "@/features/intake/server/intake.repository";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await readIntakeContract(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load intake configuration." }, { status: 500 }); }
}
