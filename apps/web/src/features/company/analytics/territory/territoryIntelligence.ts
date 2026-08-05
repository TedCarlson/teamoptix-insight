import {
  straightLineMiles,
  summarizeResidentialTerritory,
  zipNumber,
  type ZipIntelligenceReference,
} from "@/features/opportunity-analysis/zipIntelligence";

export type TerritoryRow = ZipIntelligenceReference & {
  first_seen: string;
  last_seen: string;
  operating_days: number | string;
  routes_observed: number | string;
  delivery_stops: number | string;
  delivery_packages: number | string;
  pickup_stops: number | string;
  pickup_packages_expected: number | string;
  pickup_packages_actual: number | string;
  reference_matched: boolean;
  terminal_distance_miles: number | string | null;
};

export type TerritoryCoverage = {
  requested_start: string;
  requested_end: string;
  manifest_start: string | null;
  manifest_end: string | null;
  manifest_days: number | string;
  source_records: number | string;
  records_with_zip: number | string;
  records_without_zip: number | string;
  delivery_stops: number | string;
  delivery_packages: number | string;
  pickup_stops: number | string;
  pickup_packages_expected: number | string;
  pickup_packages_actual: number | string;
};

export type TerritoryPayload = {
  terminal: {
    terminal_id: string | null;
    terminal_code: string | null;
    terminal_name: string | null;
    submitted_address: string | null;
    matched_address: string | null;
    latitude: number | null;
    longitude: number | null;
    geocode_source: string | null;
    geocode_status: "VERIFIED" | "MATCHED" | "ZIP_CENTROID" | "UNRESOLVED" | "NOT_CONFIGURED";
  };
  coverage: TerritoryCoverage;
  rows: TerritoryRow[];
  error?: string;
};

export type TerritoryBand = {
  key: string;
  label: string;
  zipCount: number;
  workload: number;
  workloadShare: number;
  packages: number;
};

export type TerritoryOutlier = {
  row: TerritoryRow;
  coreDistanceMiles: number;
  workloadShare: number;
};

export function territoryWorkload(row: TerritoryRow): number {
  return zipNumber(row.delivery_stops) + zipNumber(row.pickup_stops);
}

function splitGeographicOutliers(rows: TerritoryRow[]): {
  coreRows: TerritoryRow[];
  outlierRows: TerritoryOutlier[];
} {
  const mappable = rows.filter(
    (row) => row.latitude !== null && row.longitude !== null,
  );
  const totalWorkload = rows.reduce((sum, row) => sum + territoryWorkload(row), 0);
  const coordinateWeight = mappable.reduce(
    (sum, row) => sum + Math.max(territoryWorkload(row), 1),
    0,
  );

  if (mappable.length < 3 || coordinateWeight === 0 || totalWorkload === 0) {
    return { coreRows: rows, outlierRows: [] };
  }

  const centerLatitude = mappable.reduce(
    (sum, row) => sum + zipNumber(row.latitude) * Math.max(territoryWorkload(row), 1),
    0,
  ) / coordinateWeight;
  const centerLongitude = mappable.reduce(
    (sum, row) => sum + zipNumber(row.longitude) * Math.max(territoryWorkload(row), 1),
    0,
  ) / coordinateWeight;
  const distances = mappable
    .map((row) => straightLineMiles(
      centerLatitude,
      centerLongitude,
      zipNumber(row.latitude),
      zipNumber(row.longitude),
    ))
    .sort((left, right) => left - right);
  const middle = Math.floor(distances.length / 2);
  const medianDistance = distances.length % 2
    ? distances[middle]
    : (distances[middle - 1] + distances[middle]) / 2;
  const distanceThreshold = Math.max(150, medianDistance * 6);
  const outlierByZip = new Map<string, TerritoryOutlier>();

  for (const row of mappable) {
    const workloadShare = territoryWorkload(row) / totalWorkload;
    const coreDistanceMiles = straightLineMiles(
      centerLatitude,
      centerLongitude,
      zipNumber(row.latitude),
      zipNumber(row.longitude),
    );
    if (coreDistanceMiles > distanceThreshold && workloadShare < 0.01) {
      outlierByZip.set(row.zip_code, { row, coreDistanceMiles, workloadShare });
    }
  }

  return {
    coreRows: rows.filter((row) => !outlierByZip.has(row.zip_code)),
    outlierRows: [...outlierByZip.values()].sort(
      (left, right) => right.coreDistanceMiles - left.coreDistanceMiles,
    ),
  };
}

function bands(
  rows: TerritoryRow[],
  keyFor: (row: TerritoryRow) => string,
  labels: Record<string, string>,
  order: string[],
): TerritoryBand[] {
  const totalWorkload = rows.reduce((sum, row) => sum + territoryWorkload(row), 0);
  const grouped = new Map<string, { zipCount: number; workload: number; packages: number }>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = grouped.get(key) ?? { zipCount: 0, workload: 0, packages: 0 };
    current.zipCount += 1;
    current.workload += territoryWorkload(row);
    current.packages += zipNumber(row.delivery_packages);
    grouped.set(key, current);
  }
  return order.map((key) => {
    const value = grouped.get(key) ?? { zipCount: 0, workload: 0, packages: 0 };
    return {
      key,
      label: labels[key] ?? key,
      ...value,
      workloadShare: totalWorkload > 0 ? value.workload / totalWorkload : 0,
    };
  });
}

export function buildTerritoryModel(rows: TerritoryRow[]) {
  const known = [...rows].sort((left, right) => territoryWorkload(right) - territoryWorkload(left));
  const { coreRows, outlierRows } = splitGeographicOutliers(known);
  const totalWorkload = known.reduce((sum, row) => sum + territoryWorkload(row), 0);
  const coreWorkload = coreRows.reduce((sum, row) => sum + territoryWorkload(row), 0);
  const weightedDistanceRows = coreRows.filter(
    (row) => row.terminal_distance_miles !== null && territoryWorkload(row) > 0,
  );
  const weightedDistanceWorkload = weightedDistanceRows.reduce(
    (sum, row) => sum + territoryWorkload(row),
    0,
  );
  const ruralityRows = coreRows.filter(
    (row) => row.rurality_factor !== null && territoryWorkload(row) > 0,
  );
  const ruralityWorkload = ruralityRows.reduce(
    (sum, row) => sum + territoryWorkload(row),
    0,
  );

  const composition = bands(
    coreRows,
    (row) => row.ruca_category ?? "UNKNOWN",
    {
      METROPOLITAN: "Metropolitan",
      MICROPOLITAN: "Micropolitan",
      SMALL_TOWN: "Small town",
      RURAL: "Rural",
      UNKNOWN: "Unclassified",
    },
    ["METROPOLITAN", "MICROPOLITAN", "SMALL_TOWN", "RURAL", "UNKNOWN"],
  );

  const distance = bands(
    coreRows,
    (row) => {
      if (row.terminal_distance_miles === null) return "UNKNOWN";
      const miles = zipNumber(row.terminal_distance_miles);
      if (miles < 10) return "UNDER_10";
      if (miles < 25) return "10_25";
      if (miles < 50) return "25_50";
      return "50_PLUS";
    },
    {
      UNDER_10: "Under 10 mi",
      "10_25": "10–25 mi",
      "25_50": "25–50 mi",
      "50_PLUS": "50+ mi",
      UNKNOWN: "Unresolved",
    },
    ["UNDER_10", "10_25", "25_50", "50_PLUS", "UNKNOWN"],
  );

  const expansionMap = new Map<string, { zipCount: number; workload: number }>();
  for (const row of coreRows) {
    const month = row.first_seen.slice(0, 7);
    const current = expansionMap.get(month) ?? { zipCount: 0, workload: 0 };
    current.zipCount += 1;
    current.workload += territoryWorkload(row);
    expansionMap.set(month, current);
  }

  return {
    rows: coreRows,
    allRows: known,
    mapRows: coreRows.filter((row) => row.latitude !== null && row.longitude !== null),
    outlierRows,
    zipCount: known.length,
    coreZipCount: coreRows.length,
    mappedZipCount: known.filter((row) => row.reference_matched).length,
    totalWorkload,
    coreWorkload,
    deliveryStops: known.reduce((sum, row) => sum + zipNumber(row.delivery_stops), 0),
    deliveryPackages: known.reduce((sum, row) => sum + zipNumber(row.delivery_packages), 0),
    pickupStops: known.reduce((sum, row) => sum + zipNumber(row.pickup_stops), 0),
    weightedDistance:
      weightedDistanceWorkload > 0
        ? weightedDistanceRows.reduce(
            (sum, row) =>
              sum + zipNumber(row.terminal_distance_miles) * territoryWorkload(row),
            0,
          ) / weightedDistanceWorkload
        : null,
    workloadRurality:
      ruralityWorkload > 0
        ? ruralityRows.reduce(
            (sum, row) => sum + zipNumber(row.rurality_factor) * territoryWorkload(row),
            0,
          ) / ruralityWorkload
        : null,
    dominantZip: coreRows[0] ?? null,
    composition,
    distance,
    expansion: [...expansionMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, value]) => ({ month, ...value })),
    residential: summarizeResidentialTerritory(coreRows),
  };
}
