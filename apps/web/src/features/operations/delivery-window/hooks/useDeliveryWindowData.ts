"use client";

import { useEffect, useState } from "react";
import type { DispatchRoute } from "@/features/dispatch/lib/dispatchSupport";

export function useDeliveryWindowData(slug: string, serviceDate: string) {
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const routesRes = await fetch(`/api/company/${slug}/routes`, {
          credentials: "include",
          cache: "no-store",
        });

        const routesData = await routesRes.json();

        if (!active) return;

        if (!routesRes.ok) {
          setRoutes([]);
          setError(routesData?.error ?? "Failed to load routes.");
          return;
        }

        setRoutes(routesData?.routes ?? []);
      } catch (err) {
        if (!active) return;
        setRoutes([]);
        setError(err instanceof Error ? err.message : "Failed to load delivery window data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && serviceDate) load();

    return () => {
      active = false;
    };
  }, [slug, serviceDate]);

  return { routes, loading, error };
}
