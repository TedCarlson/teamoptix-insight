"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  canAccessPersistentOperationsSurface,
  persistentOperationsSurface,
  type PersistentOperationsAccess,
  type PersistentOperationsSurface,
} from "./operationsWorkspaceRoute";

const OperationsWorkspacePage = dynamic(
  () => import("./OperationsWorkspacePage")
);
const DispatchPage = dynamic(
  () => import("@/features/dispatch/pages/DispatchPage")
);
const DeliveryWindowPage = dynamic(
  () => import("@/features/operations/delivery-window/DeliveryWindowPage")
);
const PlanningPage = dynamic(
  () =>
    import(
      "@/features/operations-intelligence/pages/OperationsIntelligencePage"
    )
);

type Props = {
  access: PersistentOperationsAccess;
  children: ReactNode;
  serviceDate: string;
  slug: string;
};

export default function OperationsWorkspace({
  access,
  children,
  serviceDate,
  slug,
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const activeSurface = persistentOperationsSurface(pathname, slug);
  const activeSurfaceAllowed = canAccessPersistentOperationsSurface(
    activeSurface,
    access
  );
  const [visitedSurfaces, setVisitedSurfaces] = useState<
    Set<PersistentOperationsSurface>
  >(() => new Set(activeSurface ? [activeSurface] : []));

  useEffect(() => {
    if (activeSurface && !activeSurfaceAllowed) {
      router.replace(`/company/${slug}/workspace`);
    }
  }, [activeSurface, activeSurfaceAllowed, router, slug]);

  useEffect(() => {
    if (!activeSurface || visitedSurfaces.has(activeSurface)) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setVisitedSurfaces((current) => {
        if (current.has(activeSurface)) return current;
        const next = new Set(current);
        next.add(activeSurface);
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [activeSurface, visitedSurfaces]);

  if (!activeSurfaceAllowed) return null;

  const shouldMount = (surface: PersistentOperationsSurface) =>
    access[surface] && (activeSurface === surface || visitedSurfaces.has(surface));

  return (
    <div className="operations-theme-scope">
      {shouldMount("operations") ? (
        <div hidden={activeSurface !== "operations"}>
          <OperationsWorkspacePage
            active={activeSurface === "operations"}
            slug={slug}
            serviceDate={serviceDate}
          />
        </div>
      ) : null}

      {shouldMount("dispatch") ? (
        <div hidden={activeSurface !== "dispatch"}>
          <DispatchPage slug={slug} serviceDate={serviceDate} />
        </div>
      ) : null}

      {shouldMount("service") ? (
        <div hidden={activeSurface !== "service"}>
          <DeliveryWindowPage slug={slug} serviceDate={serviceDate} />
        </div>
      ) : null}

      {shouldMount("planning") ? (
        <div hidden={activeSurface !== "planning"}>
          <PlanningPage slug={slug} todayDate={serviceDate} />
        </div>
      ) : null}

      {activeSurface ? null : children}
    </div>
  );
}
