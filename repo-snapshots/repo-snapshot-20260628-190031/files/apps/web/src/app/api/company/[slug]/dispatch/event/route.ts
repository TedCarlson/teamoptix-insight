import { NextRequest } from "next/server";
import { recordDispatchEvent } from "@/features/dispatch/server/recordDispatchEvent.server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = await req.json();

  return recordDispatchEvent(slug, body);
}
