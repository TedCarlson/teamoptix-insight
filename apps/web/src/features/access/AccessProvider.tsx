"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Membership = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  relationship_type: string;
  membership_status: string;
  title: string | null;
};

type AccessState = {
  loading: boolean;
  auth_user_id?: string;
  profile_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  mobile_phone?: string | null;
  profile_status?: string;
  is_platform_owner?: boolean;
  memberships: Membership[];
};

const AccessCtx = createContext<AccessState>({
  loading: true,
  memberships: [],
});

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessState>({
    loading: true,
    memberships: [],
  });

  async function loadAccess() {
    try {
      const res = await fetch("/api/access-context", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json();

      if (!data) {
        setState({
          loading: false,
          memberships: [],
        });
        return;
      }

      setState({
        loading: false,
        auth_user_id: data.auth_user_id,
        profile_id: data.profile_id,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        display_name: data.display_name,
        mobile_phone: data.mobile_phone ?? null,
        profile_status: data.profile_status,
        is_platform_owner: Boolean(data.is_platform_owner),
        memberships: Array.isArray(data.memberships) ? data.memberships : [],
      });
    } catch (err) {
      console.error("access context load failed", err);

      setState({
        loading: false,
        memberships: [],
      });
    }
  }

  useEffect(() => {
    async function init() {
      await loadAccess();
    }

    init();

    const supabase = getSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAccess();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <AccessCtx.Provider value={state}>{children}</AccessCtx.Provider>;
}

export function useAccess() {
  return useContext(AccessCtx);
}
