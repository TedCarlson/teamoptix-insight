import { NextResponse } from "next/server";
import { loadMasterServiceAgreement } from "@/features/legal/server/msa";

export async function GET() {
  try {
    const data = await loadMasterServiceAgreement();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "unknown error",
        stack: e?.stack,
      },
      { status: 500 }
    );
  }
}
