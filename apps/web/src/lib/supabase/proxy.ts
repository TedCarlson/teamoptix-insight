import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Do not make the whole application unavailable when deployment
  // configuration is incomplete. Authenticated routes will still fail closed.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  // This validation also refreshes an expired session and writes the rotated
  // cookies to both the current request and the browser response.
  try {
    await supabase.auth.getClaims();
  } catch {
    // A temporary Auth outage must not turn every application request into a
    // proxy failure. Protected endpoints still validate access independently.
  }

  return response;
}
