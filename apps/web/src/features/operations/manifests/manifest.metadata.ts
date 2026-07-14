import { ManifestSheetRows, cellText } from "./manifest.table";

export type ManifestMetadata = {
  page: string;
  service_date: string;
  service_area: string;
  work_area: string;
  ic_isp: string;
  driver: string;
  user_type: string;
  vehicle_number: string;
  vehicle_type: string;
  export_generated_at: string;
  disclaimer: string;
  raw: Record<string, string>;
};

const METADATA_KEY_ALIASES: Record<string, keyof ManifestMetadata> = {
  page: "page",
  date: "service_date",
  "sa#": "service_area",
  "wa#": "work_area",
  "ic/isp": "ic_isp",
  driver: "driver",
  "user type": "user_type",
  "vehicle #": "vehicle_number",
  "vehicle type": "vehicle_type",
  vehicletype: "vehicle_type",
  "export generated": "export_generated_at",
  disclaimer: "disclaimer",
};

function normalizeMetadataKey(value: unknown) {
  return cellText(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseManifestMetadata(rows: ManifestSheetRows): ManifestMetadata {
  const raw: Record<string, string> = {};

  const metadata: ManifestMetadata = {
    page: "",
    service_date: "",
    service_area: "",
    work_area: "",
    ic_isp: "",
    driver: "",
    user_type: "",
    vehicle_number: "",
    vehicle_type: "",
    export_generated_at: "",
    disclaimer: "",
    raw,
  };

  for (const row of rows) {
    const key = cellText(row[0]);
    if (!key) continue;

    const value = cellText(row[1]);
    raw[key] = value;

    const mappedKey = METADATA_KEY_ALIASES[normalizeMetadataKey(key)];
    if (mappedKey && mappedKey !== "raw") {
      metadata[mappedKey] = value;
    }
  }

  return metadata;
}
