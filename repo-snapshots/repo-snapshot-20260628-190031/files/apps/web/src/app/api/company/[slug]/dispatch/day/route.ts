import { NextRequest } from "next/server";
import { getOrCreateDispatchDay } from "@/features/dispatch/server/getOrCreateDispatchDay.server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const dispatchDate =
    req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  return getOrCreateDispatchDay(slug, dispatchDate);
}
