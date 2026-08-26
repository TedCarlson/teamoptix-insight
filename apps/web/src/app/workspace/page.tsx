import { redirect } from "next/navigation";
import { resolveWorkspaceEntry } from "@/features/access/workspaceEntry";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function WorkspaceEntryPage() {
  const supabase = await getSupabaseServerClient();
  const { data: userResult } = await supabase.auth.getUser();

  if (!userResult.user) redirect("/sign-in?returnTo=%2Fworkspace");

  const { error: ensureError } = await supabase.rpc("ensure_access_context");
  if (ensureError) redirect("/profile");

  const { data: access, error } = await supabase.rpc("access_context");
  if (error) redirect("/profile");
  redirect(resolveWorkspaceEntry(access));
}
