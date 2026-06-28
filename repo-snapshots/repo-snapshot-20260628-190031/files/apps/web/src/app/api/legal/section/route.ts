import { NextRequest, NextResponse } from "next/server";
import {
  getSection,
  getNotes,
  getHistory
} from "@/features/legal/server/legal.repository";

export async function GET(req: NextRequest) {

  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "missing id" },
      { status: 400 }
    );
  }

  const section = await getSection(id);
  const notes = await getNotes(id);
  const history = await getHistory(id);

  return NextResponse.json({
    section,
    notes,
    history
  });
}
