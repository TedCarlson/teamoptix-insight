export const fleetInspectionItems = [
  ["CAB", "service_brakes", "Service brakes"], ["CAB", "parking_brake", "Parking brake"],
  ["CAB", "steering", "Steering mechanism"], ["CAB", "horn", "Horn"], ["CAB", "seat_belt", "Seat belt"],
  ["VISIBILITY", "lights", "Lights and reflectors"], ["VISIBILITY", "wipers", "Windshield and wipers"], ["VISIBILITY", "mirrors", "Mirrors and cameras"],
  ["RUNNING_GEAR", "tires", "Tires, tread, pressure, and sidewalls"], ["RUNNING_GEAR", "wheels", "Wheels, rims, lugs, and hubs"],
  ["BODY", "doors", "Cab and cargo doors/latches"], ["BODY", "steps", "Steps and grab handles"], ["BODY", "leaks", "Visible fluid or exhaust leaks"],
  ["BODY", "exterior_front", "Front exterior and lights"], ["BODY", "exterior_rear", "Rear exterior and lights"],
  ["BODY", "exterior_driver", "Driver-side exterior and lights"], ["BODY", "exterior_passenger", "Passenger-side exterior and lights"],
  ["EMERGENCY", "equipment", "Fire extinguisher and warning triangles"], ["DOCUMENTS", "documents", "Registration, insurance, and inspection documents"],
] as const;

export const requiredFleetEvidenceKeys = new Set([
  "exterior_front",
  "exterior_rear",
  "exterior_driver",
  "exterior_passenger",
]);
