import { validateManagerFleetWorkOrder, validateManagerFleetWorkOrderStatus } from "./managerFleet";

describe("manager Fleet authority", () => {
  it("requires a vehicle and title before creating work", () => {
    expect(validateManagerFleetWorkOrder({ vehicleId: "", defectId: null, title: "", scope: "", priority: "ROUTINE" })).toMatch(/vehicle/i);
    expect(validateManagerFleetWorkOrder({ vehicleId: "v", defectId: null, title: "", scope: "", priority: "ROUTINE" })).toMatch(/title/i);
    expect(validateManagerFleetWorkOrder({ vehicleId: "v", defectId: null, title: "Repair brake", scope: "", priority: "URGENT" })).toBeNull();
  });

  it("limits native work-order transitions to the shared lifecycle", () => {
    expect(validateManagerFleetWorkOrderStatus("IN_PROGRESS")).toBeNull();
    expect(validateManagerFleetWorkOrderStatus("COMPLETED")).toBeNull();
    expect(validateManagerFleetWorkOrderStatus("UNKNOWN")).toMatch(/supported/i);
  });
});
