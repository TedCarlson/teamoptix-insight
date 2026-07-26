import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAutomationAccess } from "@/features/automation/server/automation.repository";
import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.allowed || !access.userId) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.status }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const debugCandidates =
      req.nextUrl.searchParams.get("debug_candidates") === "true" ||
      String(form.get("debug_candidates") ?? "").trim() === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("user_profile")
      .select("profile_id")
      .eq("auth_user_id", access.userId)
      .maybeSingle();

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await ingestDswWorkbook({
      supabase: createSupabaseServiceRoleClient(),
      slug,
      buffer,
      filename: file.name,
      fileSize: file.size,
      uploadedByAuthUserId: access.userId,
      uploadedByProfileId: profile?.profile_id ?? null,
      debugCandidates,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DSW upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
