export function normalizeVin(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validateVin(value: string) {
  const vin = normalizeVin(value);
  if (vin.length !== 17) return { vin, valid: false, error: "VIN must contain exactly 17 characters." };
  if (/[IOQ]/.test(vin)) return { vin, valid: false, error: "VIN cannot contain I, O, or Q." };
  return { vin, valid: true, error: "" };
}

export function parseGvwrRange(value: string | null | undefined) {
  if (!value) return { from: null, to: null };
  const numbers = [...value.matchAll(/\d[\d,]*/g)]
    .map((match) => Number(match[0].replaceAll(",", "")))
    .filter((number) => Number.isFinite(number) && number >= 1_000);
  return { from: numbers[0] ?? null, to: numbers[1] ?? numbers[0] ?? null };
}

export function suggestedFleetVehicleType(vehicleType: string, bodyClass: string) {
  const combined = `${vehicleType} ${bodyClass}`.toLowerCase();
  if (combined.includes("step van")) return "STEP_VAN";
  if (combined.includes("cutaway") || combined.includes("incomplete")) return "CUTAWAY";
  if (combined.includes("cargo van") || combined.includes("van")) return "CARGO_VAN";
  if (combined.includes("box") || combined.includes("straight truck")) return "BOX_TRUCK";
  return "OTHER";
}
