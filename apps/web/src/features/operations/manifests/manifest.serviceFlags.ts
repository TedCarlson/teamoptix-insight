export type ManifestServiceFlags = {
  is_express: boolean;
  is_residential: boolean;
  is_signature: boolean;
  is_hazmat: boolean;
  is_collection: boolean;
};

export function deriveManifestServiceFlags(premSvcRaw: string | null | undefined): ManifestServiceFlags {
  const normalized = String(premSvcRaw ?? "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const tokens = normalized.split(" ").filter(Boolean);
  const compact = tokens.join("");

  return {
    is_express: tokens.includes("EXP") || compact.includes("EXP"),
    is_residential: tokens.includes("RES") || compact.includes("RES"),
    is_signature: compact.includes("DSIGN") || compact.includes("SIGN"),
    is_hazmat: tokens.includes("HAZ") || compact.includes("HAZ"),
    is_collection: tokens.includes("COLL") || compact.includes("COLL"),
  };
}
