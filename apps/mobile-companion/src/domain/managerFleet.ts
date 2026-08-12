export type ManagerFleetVehicle = {
  id: string;
  unitNumber: string;
  status: string;
  description: string;
  vehicleClass: string | null;
  route: string | null;
  driverName: string | null;
  odometerMiles: number | null;
  lastInspectedAt: string | null;
  openDefectCount: number;
  openWorkOrderCount: number;
  gvwrLbs: number | null;
  gvwrStatus: string;
  federalWeightBand: string;
};

export type ManagerFleetDefect = {
  id: string;
  vehicleId: string;
  unitNumber: string;
  summary: string;
  description: string | null;
  severity: string;
  status: string;
  reportedAt: string;
  safeToOperate: boolean | null;
};

export type ManagerFleetWorkOrder = {
  id: string;
  vehicleId: string;
  unitNumber: string;
  number: number;
  title: string;
  scope: string | null;
  priority: string;
  status: string;
  mechanicName: string | null;
  openedAt: string;
  totalCost: number;
};

export type ManagerFleetInspection = {
  id: string;
  vehicleId: string;
  unitNumber: string;
  driverName: string | null;
  inspectionType: string;
  status: string;
  startedAt: string;
  defectCount: number;
  safeToOperate: boolean | null;
};

export type ManagerFleetSnapshot = {
  totalVehicles: number;
  dispatchReady: number;
  spareVehicles: number;
  unavailable: number;
  openDefects: number;
  openWorkOrders: number;
  verifiedGvwr: number;
  missingGvwr: number;
  vehicles: ManagerFleetVehicle[];
  defects: ManagerFleetDefect[];
  workOrders: ManagerFleetWorkOrder[];
  inspections: ManagerFleetInspection[];
};

export type ManagerFleetWorkOrderDraft = {
  vehicleId: string;
  defectId: string | null;
  title: string;
  scope: string;
  priority: "ROUTINE" | "DUE_SOON" | "URGENT" | "OUT_OF_SERVICE" | "ROADSIDE";
};

export function validateManagerFleetWorkOrder(draft: ManagerFleetWorkOrderDraft) {
  if (!draft.vehicleId) return "Choose a vehicle.";
  if (!draft.title.trim()) return "Enter the work scope title.";
  return null;
}

export function validateManagerFleetWorkOrderStatus(status: string) {
  return ["IN_PROGRESS", "WAITING_PARTS", "WAITING_VENDOR", "COMPLETED", "CANCELLED"].includes(status)
    ? null
    : "Choose a supported work-order action.";
}
