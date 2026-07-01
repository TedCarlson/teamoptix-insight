"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { DriverBottomNav } from "@/features/driver/shell/DriverBottomNav";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type DriverMobileShellProps = {
  slug: string;
  children: ReactNode;
};

export function DriverMobileShell({ slug, children }: DriverMobileShellProps) {
  const access = useAccess();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);


  const companyName =
    access.memberships.find((item) => item.company_slug === slug)?.company_name ||
    access.memberships[0]?.company_name ||
    (access.loading ? "Loading workspace" : "Workspace");

  async function handleSignOut() {
    try {
      setSigningOut(true);
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/sign-in");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="driver-mobile-shell">
      <header className="driver-mobile-topbar">
        <div className="driver-mobile-brand">
          <span>TEAMOPTIX Insight</span>
          <strong>{companyName}</strong>
        </div>

        <button
          type="button"
          className="driver-mobile-signout"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>

      <section className="driver-mobile-content">{children}</section>

      <DriverBottomNav slug={slug} />
    </main>
  );
}
