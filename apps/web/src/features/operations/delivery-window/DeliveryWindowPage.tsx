"use client";

import { useState } from "react";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import { DeliveryWindowSnapshot } from "@/features/dispatch/surfaces/DeliveryWindowSnapshot";
import type { DispatchRoute } from "@/features/dispatch/lib/dispatchSupport";
import { useDeliveryWindowData } from "./hooks/useDeliveryWindowData";

type Props = {
  slug: string;
  serviceDate: string;
};

function routeLabelForDisplay(route: DispatchRoute) {
  const wa = route.current_wa_num ? `WA ${route.current_wa_num}` : null;
  const name = route.route_name ?? route.route_key;
  return [name, wa].filter(Boolean).join(" · ");
}

export default function DeliveryWindowPage({ slug, serviceDate }: Props) {
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(new Date().toISOString());

  const { routes, loading, error } = useDeliveryWindowData(slug, serviceDate);
  function refreshWorkspace() {
    setLastUpdatedAt(new Date().toISOString());
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 12 }}>
        <OperationsWorkspaceToolbar
          lastUpdatedAt={lastUpdatedAt}
          onRefresh={refreshWorkspace}
          onUpload={() => setUploadOverlayOpen(true)}
        />

        {error ? (
          <section className="panel" style={{ marginTop: 12, padding: 12, color: "#991b1b", fontWeight: 800 }}>
            {error}
          </section>
        ) : null}

        {loading ? (
          <section className="panel" style={{ marginTop: 12, padding: 12, color: "#64748b", fontWeight: 800 }}>
            Loading delivery window...
          </section>
        ) : (
          <DeliveryWindowSnapshot
            slug={slug}
            serviceDate={serviceDate}
            routes={routes}
            routeLabelForDisplay={routeLabelForDisplay}
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
