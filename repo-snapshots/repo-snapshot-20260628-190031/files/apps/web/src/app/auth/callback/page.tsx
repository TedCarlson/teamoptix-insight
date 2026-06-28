"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function safePath(value: string | null) {
  if (!value) return "/profile";
  if (!value.startsWith("/")) return "/profile";
  if (value.startsWith("//")) return "/profile";
  return value;
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Preparing secure session…");

  const next = useMemo(() => {
    return safePath(searchParams.get("next"));
  }, [searchParams]);

  const setPassword = searchParams.get("setPassword") === "1";

  useEffect(() => {
    let active = true;

    async function waitForSession() {
      const supabase = getSupabaseBrowserClient();
      const code = searchParams.get("code");

      if (code) {
        setMessage("Completing sign-in…");

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          if (!active) return;
          router.replace(
            `/sign-in?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(next)}`
          );
          return;
        }
      }

      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash
      );

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        setMessage("Securing recovery session…");

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          if (!active) return;
          router.replace(
            `/sign-in?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(next)}`
          );
          return;
        }

        window.history.replaceState(
          null,
          "",
          `/auth/callback?setPassword=${setPassword ? "1" : "0"}&next=${encodeURIComponent(next)}`
        );
      }

      setMessage("Finalizing secure session…");

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { data } = await supabase.auth.getSession();

        if (!active) return;

        if (data.session) {
          const destination = setPassword
            ? `/set-password?returnTo=${encodeURIComponent(next)}`
            : next;

          router.replace(destination);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      router.replace(
        `/sign-in?error=${encodeURIComponent(
          "Secure session was not established. Please request a fresh password setup link."
        )}&returnTo=${encodeURIComponent(next)}`
      );
    }

    void waitForSession();

    return () => {
      active = false;
    };
  }, [next, router, searchParams, setPassword]);

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">Auth</p>
        <h1>{message}</h1>
        <p className="lede">Please wait while Insight completes your secure sign-in.</p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <section className="panel">
            <p className="eyebrow">Auth</p>
            <h1>Loading secure session…</h1>
          </section>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
