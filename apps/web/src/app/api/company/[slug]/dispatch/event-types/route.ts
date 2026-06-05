import { getDispatchEventTypes } from "@/features/dispatch/server/getDispatchEventTypes.server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  return getDispatchEventTypes(slug);
}
