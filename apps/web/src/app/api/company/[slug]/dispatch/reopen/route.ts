import { NextRequest } from "next/server";
import { reopenDispatchDay } from "@/features/dispatch/server/reopenDispatchDay.server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = await req.json();

  return reopenDispatchDay(slug, body);
}
