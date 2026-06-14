"use client";

import { useMemo } from "react";
import { DeliveryWindowSnapshot } from "@/features/dispatch/surfaces/DeliveryWindowSnapshot";
import { useDeliveryWindowData } from "./hooks/useDeliveryWindowData";
import { cleanRouteKey, type DispatchRoute } from "@/features/dispatch/lib/dispatchSupport";
import { DroPlanRow } from "@/features/dispatch/lib/droPlanSignals";

type Props = {
  slug: string;
  serviceDate: string;
  routes?: DispatchRoute[];
  droPlanRows?: DroPlanRow[];
  routeLabelForDisplay: (route: DispatchRoute) => string;
};

export default function DeliveryWindowPage({
  slug,
  serviceDate,
  routeLabelForDisplay,
}: Props) {

  const { routes, droPlanRows, loading } =
    useDeliveryWindowData(slug, serviceDate);

  const displayedRoutes = useMemo(() => routes, [routes]);

  if (loading) {
    return (
      <main className="workspace-shell">
        <section className="workspace-main" style={{ paddingTop: 0 }}>
          <p style={{ padding: 12, color: "#64748b" }}>
            Loading delivery window...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0 }}>
        <DeliveryWindowSnapshot
          slug={slug}
          serviceDate={serviceDate}
          routes={displayedRoutes}
          routeLabelForDisplay={routeLabelForDisplay}
        />
      </section>
    </main>
  );
}
