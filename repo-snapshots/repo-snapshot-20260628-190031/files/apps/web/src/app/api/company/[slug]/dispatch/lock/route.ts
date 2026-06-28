import { NextRequest } from "next/server";
import { lockDispatchDay } from "@/features/dispatch/server/lockDispatchDay.server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = await req.json();

  return lockDispatchDay(slug, body);
}
