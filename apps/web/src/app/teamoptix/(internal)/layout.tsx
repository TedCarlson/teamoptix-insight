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

  if (!user?.id) {
    redirect("/sign-in");
  }

  await supabase.rpc("ensure_access_context");

  const { data: access } = await supabase.rpc("access_context");

  if (!access?.is_platform_owner) {
    redirect("/");
  }

  return children;
}
