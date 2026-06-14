"use client";

import { useEffect, useState } from "react";
import {
  type DispatchRoute,
} from "@/features/dispatch/lib/dispatchSupport";
import { DroPlanRow } from "@/features/dispatch/lib/droPlanSignals";

export function useDeliveryWindowData(slug: string, serviceDate: string) {
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [droPlanRows, setDroPlanRows] = useState<DroPlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);

        const droPlanServiceDate = serviceDate;

        const [routesRes, droPlanRes] = await Promise.all([
          fetch(`/api/company/${slug}/routes`, { credentials: "include" }),
          fetch(`/api/company/${slug}/operations/reports/dro-plan?date=${droPlanServiceDate}&frame=PM`, {
            credentials: "include",
          }),
        ]);

        const [routesData, droPlanData] = await Promise.all([
          routesRes.json(),
          droPlanRes.json(),
        ]);

        if (!active) return;

        setRoutes(routesData?.routes ?? []);
        setDroPlanRows(droPlanData?.rows ?? []);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) load();

    return () => {
      active = false;
    };
  }, [slug, serviceDate]);

  return {
    routes,
    droPlanRows,
    loading,
  };
}
