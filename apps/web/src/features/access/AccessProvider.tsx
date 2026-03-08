"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Membership = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  relationship_type: string;
  membership_status: string;
  title: string | null;
};

type AccessContext = {
  loading: boolean;
  auth_user_id?: string;
  profile_id?: string;
  email?: string;
  display_name?: string;
  is_platform_owner?: boolean;
  memberships?: Membership[];
};

const AccessCtx = createContext<AccessContext>({ loading: true });

export function AccessProvider(props: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessContext>({ loading: true });

  useEffect(() => {
    async function loadAccess() {
      try {
        const res = await fetch("/api/access-context");
        const data = await res.json();

        setState({
          loading: false,
          ...data
        });
      } catch (err) {
        console.error("access context load failed", err);
        setState({ loading: false });
      }
    }

    loadAccess();
  }, []);

  return <AccessCtx.Provider value={state}>{props.children}</AccessCtx.Provider>;
}

export function useAccess() {
  return useContext(AccessCtx);
}
