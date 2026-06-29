import { useState } from "react";

export type DispatchWorkspaceData = {
  scheduleRows: any[];
  routes: any[];
  rosterRows: any[];
  dispatchDay: any | null;
  dispatchEvents: any[];
  eventTypes: any[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  droPlanRows: any[];
  dswRows: any[];
  droPlanSourceFrame: string | null;
  routeSortKey: string;
  refreshKey: number;
};

export function useDispatchWorkspaceData() {
  const [scheduleRows] = useState<any[]>([]);
  const [routes] = useState<any[]>([]);
  const [rosterRows] = useState<any[]>([]);
  const [dispatchDay] = useState<any | null>(null);
  const [dispatchEvents] = useState<any[]>([]);
  const [eventTypes] = useState<any[]>([]);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [lastUpdatedAt] = useState<string | null>(null);
  const [droPlanRows] = useState<any[]>([]);
  const [dswRows] = useState<any[]>([]);
  const [droPlanSourceFrame] = useState<string | null>(null);
  const [routeSortKey] = useState("route_name");
  const [refreshKey] = useState(0);

  return {
    scheduleRows,
    routes,
    rosterRows,
    dispatchDay,
    dispatchEvents,
    eventTypes,
    loading,
    error,
    lastUpdatedAt,
    droPlanRows,
    dswRows,
    droPlanSourceFrame,
    routeSortKey,
    refreshKey,
  } satisfies DispatchWorkspaceData;
}
