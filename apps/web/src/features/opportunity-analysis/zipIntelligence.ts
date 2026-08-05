export type ZipIntelligenceReference = {
  zip_code: string;
  preferred_city: string | null;
  state_code: string | null;
  classification: string | null;
  population: number | string | null;
  land_area_sqmi: number | string | null;
  population_density_per_sqmi: number | string | null;
  business_establishments: number | string | null;
  business_employment: number | string | null;
  establishments_per_sqmi: number | string | null;
  employees_per_sqmi: number | string | null;
  ruca_primary_code: number | string | null;
  ruca_secondary_code: number | string | null;
  ruca_category: string | null;
  rurality_factor: number | string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  coordinate_source: string | null;
  coordinate_method: string | null;
};

export function zipNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function straightLineMiles(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const from = radians(fromLatitude);
  const to = radians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from) * Math.cos(to) * Math.sin(longitudeDelta / 2) ** 2;

  return 3958.7613 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function summarizeResidentialTerritory(rows: ZipIntelligenceReference[]) {
  const residential = rows.filter(
    (row) => row.classification === "STANDARD" && zipNumber(row.population) > 0,
  );
  const population = residential.reduce((sum, row) => sum + zipNumber(row.population), 0);
  const landArea = residential.reduce((sum, row) => sum + zipNumber(row.land_area_sqmi), 0);
  const ruralityRows = residential.filter((row) => row.rurality_factor !== null);
  const ruralityPopulation = ruralityRows.reduce(
    (sum, row) => sum + zipNumber(row.population),
    0,
  );

  return {
    population,
    residentialDensity: landArea > 0 ? population / landArea : null,
    establishments: rows.reduce(
      (sum, row) => sum + zipNumber(row.business_establishments),
      0,
    ),
    employment: rows.reduce(
      (sum, row) => sum + zipNumber(row.business_employment),
      0,
    ),
    ruralityFactor:
      ruralityPopulation > 0
        ? ruralityRows.reduce(
            (sum, row) =>
              sum + zipNumber(row.rurality_factor) * zipNumber(row.population),
            0,
          ) / ruralityPopulation
        : null,
    ruralityCoverage: ruralityRows.length,
  };
}
