"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const TERMINAL_STATUSES = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

export default function CollectionAutoRefresh({
  active,
  requestId,
}: {
  active: boolean;
  requestId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const supabase = getSupabaseBrowserClient();
    let refreshed = false;
    const channel = supabase
      .channel(`collection-terminal:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "core",
          table: "operations_collection_request",
          filter: `id=eq.${requestId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const status = String(payload.new.request_status ?? "").toUpperCase();
          if (refreshed || !TERMINAL_STATUSES.has(status)) return;
          refreshed = true;
          void supabase.removeChannel(channel);
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, requestId, router]);

  return null;
}
