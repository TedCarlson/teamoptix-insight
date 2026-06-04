import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safePath(value: string | null) {
  if (!value) return "/profile";
  if (!value.startsWith("/")) return "/profile";
  if (value.startsWith("//")) return "/profile";
  return value;
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const code = req.nextUrl.searchParams.get("code");
  const next = safePath(req.nextUrl.searchParams.get("next"));
  const setPassword = req.nextUrl.searchParams.get("setPassword") === "1";

  const appBaseUrl =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    req.nextUrl.origin;

  const base = appBaseUrl.replace(/\/$/, "");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const url = new URL("/sign-in", base);
      url.searchParams.set("error", error.message);
      url.searchParams.set("returnTo", next);
      return NextResponse.redirect(url);
    }
  }

  const destination = setPassword
    ? `/set-password?returnTo=${encodeURIComponent(next)}`
    : next;

  return NextResponse.redirect(new URL(destination, base));
}
