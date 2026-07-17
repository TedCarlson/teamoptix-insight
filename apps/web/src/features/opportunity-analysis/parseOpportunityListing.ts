export type OpportunityListing = {
  station: string | null;
  opportunityNumber: string | null;
  opportunityType: string;
  location: string | null;
  availableOpportunities: number | null;
  submittedZips: string[];
  uniqueZips: string[];
  duplicateZips: string[];
  weeklyMileage: number | null;
  weeklyDeliveryStops: number | null;
  weeklyDeliveryPackages: number | null;
  weeklyPickupStops: number | null;
  weeklyPickupPackages: number | null;
  weeklyDispatchMin: number | null;
  weeklyDispatchMax: number | null;
  negotiationStartDate: string | null;
  contractStartDate: string | null;
  warnings: string[];
};

function escaped(label: string) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineAfter(text: string, label: string) {
  const match = text.match(new RegExp(`^${escaped(label)}\\s*\\n\\s*([^\\n]+)`, "im"));
  return match?.[1]?.trim() || null;
}

function inlineValue(text: string, label: string) {
  const match = text.match(new RegExp(`^${escaped(label)}\\s*:?\\s*([^\\n]+)`, "im"));
  return match?.[1]?.trim() || null;
}

function numberValue(text: string, label: string) {
  const raw = inlineValue(text, label);
  if (!raw) return null;
  const value = Number(raw.replaceAll(",", "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(value) ? value : null;
}

function isoDate(raw: string | null) {
  const match = raw?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseOpportunityListing(source: string): OpportunityListing {
  const text = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  const station = text.match(/^Station\s+(.+?)\s+-\s+Contracted Service Area\s*$/im)?.[1]?.trim() || null;
  const opportunityNumber = lineAfter(text, "Opportunity Number");
  const rawType = lineAfter(text, "Type");
  const location = lineAfter(text, "Location");
  const zipBlock = text.match(/Full Zips:\s*([\s\S]*?)(?=\n\s*Average weekly mileage\s*:)/i)?.[1] || "";
  const submittedZips = zipBlock.match(/\b\d{5}\b/g) ?? [];
  const counts = new Map<string, number>();
  submittedZips.forEach((zip) => counts.set(zip, (counts.get(zip) ?? 0) + 1));
  const uniqueZips = Array.from(counts.keys());
  const duplicateZips = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([zip]) => zip);
  const dispatchRaw = inlineValue(text, "Estimated weekly dispatch vehicles");
  const dispatchMatch = dispatchRaw?.match(/(\d+)\s*[-–—]\s*(\d+)/);

  const result: OpportunityListing = {
    station,
    opportunityNumber,
    opportunityType: /pickup\s+and\s+delivery/i.test(rawType ?? "") ? "P&D Last Mile" : rawType || "P&D Last Mile",
    location,
    availableOpportunities: numberValue(text, "Available Opportunities"),
    submittedZips,
    uniqueZips,
    duplicateZips,
    weeklyMileage: numberValue(text, "Average weekly mileage"),
    weeklyDeliveryStops: numberValue(text, "Average weekly delivery stops"),
    weeklyDeliveryPackages: numberValue(text, "Average weekly delivery packages"),
    weeklyPickupStops: numberValue(text, "Average weekly pickup stops"),
    weeklyPickupPackages: numberValue(text, "Average weekly pickup packages"),
    weeklyDispatchMin: dispatchMatch ? Number(dispatchMatch[1]) : null,
    weeklyDispatchMax: dispatchMatch ? Number(dispatchMatch[2]) : null,
    negotiationStartDate: isoDate(inlineValue(text, "Tentative Negotiation Start Date")),
    contractStartDate: isoDate(inlineValue(text, "Tentative Contract Start Date")),
    warnings: [],
  };

  const required: Array<[string, unknown]> = [
    ["station", result.station], ["opportunity number", result.opportunityNumber], ["location", result.location],
    ["ZIP Codes", result.uniqueZips.length ? result.uniqueZips : null], ["weekly mileage", result.weeklyMileage],
    ["delivery stops", result.weeklyDeliveryStops], ["delivery packages", result.weeklyDeliveryPackages],
    ["pickup stops", result.weeklyPickupStops], ["pickup packages", result.weeklyPickupPackages],
    ["dispatch range", result.weeklyDispatchMin !== null && result.weeklyDispatchMax !== null ? true : null],
  ];
  required.forEach(([label, value]) => { if (value === null) result.warnings.push(`Missing ${label}.`); });
  if (duplicateZips.length) result.warnings.push(`Duplicate ZIP ${duplicateZips.join(", ")} was retained in the source and counted once in analysis.`);
  if (result.weeklyDispatchMin !== null && result.weeklyDispatchMax !== null && result.weeklyDispatchMin > result.weeklyDispatchMax) {
    result.warnings.push("Dispatch range minimum is greater than its maximum.");
  }
  return result;
}

