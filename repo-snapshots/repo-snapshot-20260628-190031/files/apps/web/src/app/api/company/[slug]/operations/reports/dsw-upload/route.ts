import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cellText } from "@/features/operations/reports/dsw/dsw.parse";
import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: auth, error: userError } = await supabase.auth.getUser();
    if (userError || !auth.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const requestedDate = cellText(form.get("service_date"));
    const debugCandidates =
      req.nextUrl.searchParams.get("debug_candidates") === "true" ||
      cellText(form.get("debug_candidates")) === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("user_profile")
      .select("profile_id")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await ingestDswWorkbook({
      supabase,
      slug,
      buffer,
      filename: file.name,
      fileSize: file.size,
      requestedDate,
      uploadedByAuthUserId: auth.user.id,
      uploadedByProfileId: profile?.profile_id ?? null,
      debugCandidates,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DSW upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
