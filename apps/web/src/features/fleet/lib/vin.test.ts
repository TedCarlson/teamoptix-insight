import { describe, expect, it } from "vitest";
import { normalizeVin, parseGvwrRange, suggestedFleetVehicleType, validateVin } from "./vin";

describe("Fleet VIN intake", () => {
  it("normalizes and validates a complete VIN", () => {
    expect(normalizeVin("1ftbw1xg8mka12345")).toBe("1FTBW1XG8MKA12345");
    expect(validateVin("1FTBW1XG8MKA12345").valid).toBe(true);
  });

  it("rejects incomplete VINs and forbidden characters", () => {
    expect(validateVin("123").valid).toBe(false);
    expect(validateVin("1FTBW1XG8MKA12O45").valid).toBe(false);
  });

  it("extracts a provisional GVWR range", () => {
    expect(parseGvwrRange("Class 2H: 9,001 - 10,000 lb")).toEqual({ from: 9001, to: 10000 });
  });

  it("maps decoded descriptions conservatively", () => {
    expect(suggestedFleetVehicleType("Truck", "Step Van")).toBe("STEP_VAN");
    expect(suggestedFleetVehicleType("Incomplete Vehicle", "Cutaway")).toBe("CUTAWAY");
    expect(suggestedFleetVehicleType("Truck", "Pickup")).toBe("OTHER");
  });
});
