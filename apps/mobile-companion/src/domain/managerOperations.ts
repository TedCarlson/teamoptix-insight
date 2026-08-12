export type ManagerRouteEvidenceItem = {
  id: string;
  kind: "delivery" | "pickup";
  sequence: number;
  title: string;
  subtitle: string;
  address: string;
  window: string;
  packageCount: number;
  expectedPackageCount: number | null;
  status: "complete" | "open" | "attention";
  tags: string[];
};

export type ManagerRouteEvidenceSummary = {
  deliveryStops: number;
  completedStops: number;
  packages: number;
  pickups: number;
  express: number;
  attention: number;
  severity: string | null;
  status: string | null;
  asOf: string | null;
};

export type ManagerRouteEvidenceSnapshot = {
  serviceDate: string;
  routeKey: string;
  timeZone: string;
  summary: ManagerRouteEvidenceSummary;
  items: ManagerRouteEvidenceItem[];
};

export type ManagerDeliveryActionCode = "DELIVERY_NOTE" | "DRIVER_ASSIST";

export type ManagerDeliveryActionDraft = {
  code: ManagerDeliveryActionCode;
  note: string;
  assistingRouteId: string | null;
  receivingRouteId: string | null;
  stopCount: string;
};

export function validateManagerDeliveryAction(draft: ManagerDeliveryActionDraft) {
  if (draft.code === "DELIVERY_NOTE") {
    return draft.note.trim() ? null : "Add delivery context.";
  }
  if (!draft.assistingRouteId) return "Choose the assisting route.";
  if (!draft.receivingRouteId) return "Choose the route receiving assistance.";
  if (draft.assistingRouteId === draft.receivingRouteId) return "Assisting and receiving routes must be different.";
  const stopCount = Number(draft.stopCount);
  if (!Number.isInteger(stopCount) || stopCount < 1) return "Enter the number of stops transferred.";
  return null;
}
