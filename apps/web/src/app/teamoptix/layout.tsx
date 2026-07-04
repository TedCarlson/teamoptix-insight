import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamOptixLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: access } = await supabase
    .from("user_access_context_v")
    .select("is_platform_owner")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!access?.is_platform_owner) {
    redirect("/");
  }

  return children;
}
