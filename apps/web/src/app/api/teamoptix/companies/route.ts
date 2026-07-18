import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: access } = await supabase.rpc("access_context");
  if (!access?.is_platform_owner) {
    return NextResponse.json({ error: "Platform owner access required" }, { status: 403 });
  }

  return NextResponse.json({ companies: await getGovernedCompanies() });
}
