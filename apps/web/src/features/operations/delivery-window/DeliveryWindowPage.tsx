"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import { DeliveryWindowSnapshot } from "@/features/dispatch/surfaces/DeliveryWindowSnapshot";
import type { DispatchRoute } from "@/features/dispatch/lib/dispatchSupport";
import ServiceDateSlicer from "./components/ServiceDateSlicer";
import { useDeliveryWindowData } from "./hooks/useDeliveryWindowData";

type Props = {
  slug: string;
  serviceDate: string;
};

type RouteSortKey = "route_name" | "current_wa_num";

function routeLabelForDisplay(route: DispatchRoute, routeSortKey: RouteSortKey) {
  const routeName = route.route_name?.trim() ?? "";
  const workArea = route.current_wa_num?.trim() ?? "";

  if (routeSortKey === "current_wa_num") {
    return [workArea, routeName].filter(Boolean).join(" · ") || route.route_key;
  }

  return [routeName, workArea].filter(Boolean).join(" · ") || route.route_key;
}

function sortRoutes(routes: DispatchRoute[], routeSortKey: RouteSortKey) {
  return [...routes].sort((a, b) => {
    const valueA =
      routeSortKey === "current_wa_num"
        ? a.current_wa_num || a.route_name || a.route_key
        : a.route_name || a.current_wa_num || a.route_key;

    const valueB =
      routeSortKey === "current_wa_num"
        ? b.current_wa_num || b.route_name || b.route_key
        : b.route_name || b.current_wa_num || b.route_key;

    return valueA.localeCompare(valueB, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export default function DeliveryWindowPage({ slug, serviceDate }: Props) {
  const router = useRouter();
  const [selectedServiceDate, setSelectedServiceDate] = useState(serviceDate);
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [routeSortKey, setRouteSortKey] = useState<RouteSortKey>("route_name");

  const { routes, loading, error } = useDeliveryWindowData(
    slug,
    selectedServiceDate,
    refreshKey
  );

  useEffect(() => {
    setSelectedServiceDate(serviceDate);
  }, [serviceDate]);

  useEffect(() => {
    let active = true;

    async function loadOperationsConfig() {
      try {
        const res = await fetch(`/api/company/${slug}/config/operations`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!active || !res.ok) return;

        setRouteSortKey(
          data?.config?.route_sort_key === "current_wa_num"
            ? "current_wa_num"
            : "route_name"
        );
      } catch {
        if (active) setRouteSortKey("route_name");
      }
    }

    if (slug) void loadOperationsConfig();

    return () => {
      active = false;
    };
  }, [slug, refreshKey]);

  const sortedRoutes = useMemo(
    () => sortRoutes(routes, routeSortKey),
    [routes, routeSortKey]
  );
  function refreshWorkspace() {
    setRefreshKey((current) => current + 1);
  }

  function openDispatchAction(action: "actions" | "attendance") {
    router.push(`/company/${slug}/operations/dispatch?action=${action}`);
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 12 }}>
        <ServiceDateSlicer
          slug={slug}
          value={selectedServiceDate}
          maximum={serviceDate}
          onChange={setSelectedServiceDate}
        />

        {error ? (
          <section className="panel" style={{ marginTop: 12, padding: 12, color: "#991b1b", fontWeight: 800 }}>
            {error}
          </section>
        ) : null}

        {loading ? (
          <section className="panel" style={{ marginTop: 12, padding: 12, color: "#64748b", fontWeight: 800 }}>
            Loading service...
          </section>
        ) : (
          <DeliveryWindowSnapshot
            key={`${selectedServiceDate}-${refreshKey}`}
            slug={slug}
            serviceDate={selectedServiceDate}
            routes={sortedRoutes}
            routeLabelForDisplay={(route) => routeLabelForDisplay(route, routeSortKey)}
            onRefresh={refreshWorkspace}
            onUploadReport={() => setUploadOverlayOpen(true)}
            onActions={() => openDispatchAction("actions")}
            onAttendance={() => openDispatchAction("attendance")}
          />
        )}
      </section>

      <OperationsReportUploadOverlay
        open={uploadOverlayOpen}
        onClose={(shouldRefresh) => {
          setUploadOverlayOpen(false);
          if (shouldRefresh) refreshWorkspace();
        }}
      />
    </main>
  );
}
